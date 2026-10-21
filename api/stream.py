"""The stream desk: games running through the console's stream chain, and the
streams they go out on.

This is the control plane over one tool, `stream` in the console repository
(nes-shell's example of that name): a cartridge and a bench script played on
the model, every frame encoded to the composite signal, decoded on the GPU
with the CRT stage, and handed to ffmpeg as H.264 and AAC, to a file or to an
RTMP ingest. The tool does the work; this module starts it, watches it, stops
it, and keeps a note of what happened, so a page can drive it and a test can
hold it.

## What is deliberately small

- **One run at a time.** The chain is one GPU and one encoder, and two runs
  would share them and both fall behind the wall clock. A second start while
  one is running is a 409 that names the running one.
- **The games are the list.** A run names a cartridge by id and the ids are
  the `.nes` files the site already serves, so nothing this desk can be asked
  to play is a cartridge the site may not show. The ROM rule is kept by
  construction, not by a flag a request could forget.
- **No key is ever read back.** The ingest keys live in the service's
  environment, go to the child's environment and nowhere else; the outputs
  route says whether each is there, as a boolean; and every line of log that
  leaves here passes through a filter that cuts the values out, on top of the
  tool's own filter. The test suite plants a key and a log line that echoes
  it, and asserts the line comes back without it.
- **Progress is read, not reported.** The tool writes a line every ten
  seconds of console time and one at the end; the desk parses those out of
  the log on every status request rather than keeping a channel open. A
  status is therefore never ahead of the log.

## Where things are

Three environment variables, each with a default that is right on the box:

- `TM_STREAM_BIN`: the tool's binary. Default: the sibling console checkout's
  release build of the example.
- `TM_STREAM_ROMS`: directories holding the games, `os.pathsep` separated.
  Default: the site's served cartridges and the e2e fixture's test cart.
- `TM_STREAM_HOME`: where runs keep their script, log, markers and file.
  Default: /var/tmp/tm-stream. One directory per run, named by the run id.

A run that this process started is watched through its Popen handle. One found
on disk from an earlier process is listed as `lost` unless its record says it
had already ended, because a pid alone cannot say whether the process at it is
still the one that was started.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import signal
import sqlite3
import subprocess
import threading
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

import admin
from models import (
    NewMarker,
    NewStreamRun,
    StreamGame,
    StreamGames,
    StreamLog,
    StreamMarker,
    StreamMarkers,
    StreamOutputs,
    StreamRun,
    StreamRuns,
)

router = APIRouter(prefix="/v1/stream", tags=["stream"])

ROOT = Path(__file__).resolve().parent.parent

# The console's frame period, from the same numbers the tool uses: the master
# clock is 6 x 39,375,000 / 11 Hz, a dot is four master cycles, a frame is
# 341 x 262 dots. 1 / 60.0988 s. test_stream.py pins the rate, because the
# first version of this line was six times too long and every test still
# passed: a test written from the constant cannot see the constant.
FRAME_S = 341 * 262 * 4 * 11 / (6 * 39_375_000)

# The keys the child may need and the names they go in under. Named once so the
# outputs route, the child environment and the log filter cannot disagree about
# what a secret is.
SECRETS = {
    "youtube": ("YOUTUBE_STREAM_KEY",),
    "rtmp": ("RTMP_URL", "RTMP_KEY"),
}

# What the tool prints. A progress line every 600 frames, a paced suffix on
# live runs, and the closing line with ffmpeg's verdict.
PROGRESS = re.compile(r"^# (\d+) of (\d+) frames, ([\d.]+) s(?:, worst lag (\d+) ms, (\d+) frames late)?")
CLOSING = re.compile(r"^# (\d+) frames \(([\d.]+) s of console time\) in ([\d.]+) s, ffmpeg (ok|FAILED)")
PACED = re.compile(r"^# paced: worst lag (\d+) ms, (\d+) of (\d+) frames more than a frame late")

STOP_GRACE_S = 3.0
LOG_TAIL = 60


# ---------------------------------------------------------------------------
# Where things are
# ---------------------------------------------------------------------------


def bin_path() -> Path:
    return Path(os.environ.get("TM_STREAM_BIN") or ROOT.parent / "nes" / "target" / "release" / "examples" / "stream")


def rom_dirs() -> list[Path]:
    given = os.environ.get("TM_STREAM_ROMS")
    if given:
        return [Path(p) for p in given.split(os.pathsep) if p]
    return [ROOT / "web" / "public" / "nes", ROOT / "web" / "e2e" / "fixtures"]


def home() -> Path:
    return Path(os.environ.get("TM_STREAM_HOME") or "/var/tmp/tm-stream")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Games and outputs
# ---------------------------------------------------------------------------


def games() -> dict[str, Path]:
    """The cartridges the desk may run, by id: the first of a name wins."""
    found: dict[str, Path] = {}
    for d in rom_dirs():
        if not d.is_dir():
            continue
        for p in sorted(d.glob("*.nes")):
            found.setdefault(p.stem, p)
    return dict(sorted(found.items()))


def configured(output: str) -> bool:
    if output == "file":
        return True
    return all(os.environ.get(name, "").strip() for name in SECRETS.get(output, ()))


def secret_values() -> list[str]:
    """Every configured secret's value, longest first, for the log filter."""
    values = [os.environ.get(name, "").strip() for names in SECRETS.values() for name in names]
    return sorted((v for v in values if v), key=len, reverse=True)


def scrub(text: str) -> str:
    for v in secret_values():
        text = text.replace(v, "[key]")
    return text


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


@dataclasses.dataclass
class Run:
    id: str
    game: str
    output: str
    seconds: int
    pace: bool
    started_at: str
    state: str = "running"
    ended_at: Optional[str] = None
    exit_code: Optional[int] = None
    pid: Optional[int] = None
    proc: Optional[subprocess.Popen] = dataclasses.field(default=None, repr=False, compare=False)

    @property
    def dir(self) -> Path:
        return home() / self.id

    def record(self) -> dict:
        # By name, not dataclasses.asdict: that deep-copies every field and a
        # Popen handle cannot be copied.
        return {f.name: getattr(self, f.name) for f in dataclasses.fields(self) if f.name != "proc"}

    def save(self) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / "run.json").write_text(json.dumps(self.record(), indent=1))


RUNS: dict[str, Run] = {}
LOCK = threading.Lock()


def _load_from_disk() -> None:
    """Runs an earlier process left behind, listed so a page can still read
    their logs. Not re-watched: a pid is not a handle."""
    h = home()
    if not h.is_dir():
        return
    for rec in h.glob("*/run.json"):
        try:
            d = json.loads(rec.read_text())
            run = Run(**{k: d[k] for k in ("id", "game", "output", "seconds", "pace", "started_at", "state", "ended_at", "exit_code", "pid")})
        except (ValueError, KeyError, TypeError):
            continue
        if run.id in RUNS:
            continue
        if run.state == "running":
            run.state = "lost"
            run.ended_at = run.ended_at or now()
            run.save()
        RUNS[run.id] = run


def _reap(run: Run) -> None:
    """Notice an exit. Called under LOCK."""
    if run.proc is None or run.state != "running":
        return
    code = run.proc.poll()
    if code is None:
        return
    run.exit_code = code
    run.ended_at = now()
    run.state = "done" if code == 0 else "failed"
    run.save()


def _running() -> Optional[Run]:
    for run in RUNS.values():
        _reap(run)
        if run.state == "running":
            return run
    return None


def _log_lines(run: Run) -> list[str]:
    p = run.dir / "stream.log"
    if not p.is_file():
        return []
    return scrub(p.read_text(errors="replace")).splitlines()


def _markers(run: Run) -> list[StreamMarker]:
    p = run.dir / "markers.jsonl"
    if not p.is_file():
        return []
    out = []
    for line in p.read_text().splitlines():
        if line.strip():
            out.append(StreamMarker(**json.loads(line)))
    return out


def _file(run: Run) -> Path:
    return run.dir / "out.mp4"


def _view(run: Run) -> StreamRun:
    """The run as the API shows it, with progress read out of its log."""
    sent, wanted, elapsed = 0, round(run.seconds / FRAME_S), 0.0
    worst: Optional[float] = None
    late: Optional[int] = None
    ffmpeg_ok: Optional[bool] = None
    for line in _log_lines(run):
        m = PROGRESS.match(line)
        if m:
            sent, wanted, elapsed = int(m[1]), int(m[2]), float(m[3])
            if m[4] is not None:
                worst, late = float(m[4]), int(m[5])
            continue
        m = PACED.match(line)
        if m:
            worst, late = float(m[1]), int(m[2])
            continue
        m = CLOSING.match(line)
        if m:
            sent, elapsed, ffmpeg_ok = int(m[1]), float(m[3]), m[4] == "ok"
    return StreamRun(
        id=run.id,
        game=run.game,
        output=run.output,
        seconds=run.seconds,
        pace=run.pace,
        state=run.state,
        started_at=run.started_at,
        ended_at=run.ended_at,
        exit_code=run.exit_code,
        frames_sent=sent,
        frames_wanted=wanted,
        elapsed_s=elapsed,
        worst_lag_ms=worst,
        frames_late=late,
        ffmpeg_ok=ffmpeg_ok,
        file_ready=run.output == "file" and run.state == "done" and _file(run).is_file(),
        markers=len(_markers(run)),
    )


def _get(run_id: str) -> Run:
    with LOCK:
        _load_from_disk()
        run = RUNS.get(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"no run with id {run_id!r}")
        _reap(run)
        return run


def stop_all() -> None:
    """Every run this process started, stopped. For tests and for shutdown."""
    with LOCK:
        for run in list(RUNS.values()):
            if run.proc is not None and run.state == "running":
                _stop(run)
        RUNS.clear()


def _stop(run: Run) -> None:
    """SIGTERM to the process group (the tool and its ffmpeg), SIGKILL after
    the grace. Called under LOCK."""
    assert run.proc is not None
    try:
        os.killpg(run.proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        run.proc.wait(timeout=STOP_GRACE_S)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(run.proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        run.proc.wait()
    run.exit_code = run.proc.returncode
    run.ended_at = now()
    run.state = "stopped"
    run.save()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get(
    "/games",
    response_model=StreamGames,
    summary="The games the desk may run",
    description="The family's own cartridges, the ones the site serves. A run names one of these ids and no other image can be asked for.",
)
def list_games(_: sqlite3.Row = Depends(admin.require_dev)) -> StreamGames:
    out = []
    for name, p in games().items():
        data = p.read_bytes()
        out.append(StreamGame(id=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
    return StreamGames(games=out)


@router.get(
    "/outputs",
    response_model=StreamOutputs,
    summary="Which outputs are configured, as booleans",
    description="Whether each ingest's key is in the service's environment, and whether the tool's binary is where it should be. Never the values.",
)
def list_outputs(_: sqlite3.Row = Depends(admin.require_dev)) -> StreamOutputs:
    return StreamOutputs(file=True, rtmp=configured("rtmp"), youtube=configured("youtube"), runner=bin_path().is_file())


@router.get(
    "/runs",
    response_model=StreamRuns,
    summary="Every run, newest first",
    description="Runs this process started and runs an earlier one left on disk. Progress is read from each run's log as it stands now.",
)
def list_runs(_: sqlite3.Row = Depends(admin.require_dev)) -> StreamRuns:
    with LOCK:
        _load_from_disk()
        for run in RUNS.values():
            _reap(run)
        runs = sorted(RUNS.values(), key=lambda r: r.started_at, reverse=True)
        return StreamRuns(runs=[_view(r) for r in runs])


@router.post(
    "/runs",
    response_model=StreamRun,
    status_code=status.HTTP_201_CREATED,
    summary="Start a run",
    description=(
        "Start the game through the chain to the output. 404 for a game not on the list, "
        "409 while another run is running or when the output's key is not configured, "
        "503 when the tool's binary is missing."
    ),
)
def start_run(body: NewStreamRun, _: sqlite3.Row = Depends(admin.require_admin)) -> StreamRun:
    rom = games().get(body.game)
    if rom is None:
        raise HTTPException(status_code=404, detail=f"no game with id {body.game!r}; GET /v1/stream/games lists them")
    if not configured(body.output):
        names = " and ".join(SECRETS[body.output])
        raise HTTPException(status_code=409, detail=f"output {body.output!r} is not configured: {names} must be in the service's environment")
    binary = bin_path()
    if not binary.is_file():
        raise HTTPException(status_code=503, detail="the stream tool is not built; TM_STREAM_BIN names where it should be")
    with LOCK:
        _load_from_disk()
        running = _running()
        if running is not None:
            raise HTTPException(status_code=409, detail=f"run {running.id} is running; the chain takes one at a time")
        run = Run(
            id=secrets.token_hex(4),
            game=body.game,
            output=body.output,
            seconds=body.seconds,
            pace=body.pace,
            started_at=now(),
        )
        run.dir.mkdir(parents=True, exist_ok=True)
        script = run.dir / "script.txt"
        script.write_text(body.script)
        out_arg = str(_file(run)) if body.output == "file" else body.output
        env = dict(os.environ)
        if body.pace:
            env["PACE"] = "1"
        log = open(run.dir / "stream.log", "ab")
        try:
            run.proc = subprocess.Popen(
                [str(binary), str(rom), str(script), str(body.seconds), out_arg],
                stdout=log,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                cwd=str(run.dir),
                env=env,
                start_new_session=True,
            )
        finally:
            log.close()
        run.pid = run.proc.pid
        run.save()
        RUNS[run.id] = run
        return _view(run)


@router.get(
    "/runs/{run_id}",
    response_model=StreamRun,
    summary="One run as it stands",
    description="The run with its progress read from its log now. 404 for an id this service has no record of.",
)
def get_run(run_id: str, _: sqlite3.Row = Depends(admin.require_dev)) -> StreamRun:
    return _view(_get(run_id))


@router.post(
    "/runs/{run_id}/stop",
    response_model=StreamRun,
    summary="Stop a run",
    description="SIGTERM to the tool and its ffmpeg together, SIGKILL after three seconds. A run that has already ended is returned as it is.",
)
def stop_run(run_id: str, _: sqlite3.Row = Depends(admin.require_admin)) -> StreamRun:
    run = _get(run_id)
    with LOCK:
        if run.state == "running" and run.proc is not None:
            _stop(run)
    return _view(run)


@router.get(
    "/runs/{run_id}/log",
    response_model=StreamLog,
    summary="The tail of a run's log",
    description=f"The last {LOG_TAIL} lines of the tool's output, every configured key cut out of them.",
)
def get_log(run_id: str, _: sqlite3.Row = Depends(admin.require_dev)) -> StreamLog:
    run = _get(run_id)
    return StreamLog(run=run.id, lines=_log_lines(run)[-LOG_TAIL:])


@router.get(
    "/runs/{run_id}/markers",
    response_model=StreamMarkers,
    summary="A run's markers",
    description="Every marker placed on the run, oldest first, each with the frame it was placed at.",
)
def get_markers(run_id: str, _: sqlite3.Row = Depends(admin.require_dev)) -> StreamMarkers:
    run = _get(run_id)
    return StreamMarkers(run=run.id, markers=_markers(run))


@router.post(
    "/runs/{run_id}/markers",
    response_model=StreamMarker,
    status_code=status.HTTP_201_CREATED,
    summary="Place a marker on a run",
    description="A note stamped with the run's frame count as the log last reported it. What the wire spec's marker channel will carry; kept beside the run until then.",
)
def add_marker(run_id: str, body: NewMarker, _: sqlite3.Row = Depends(admin.require_admin)) -> StreamMarker:
    run = _get(run_id)
    marker = StreamMarker(frame=_view(run).frames_sent, at=now(), text=body.text)
    with LOCK:
        with open(run.dir / "markers.jsonl", "a") as f:
            f.write(json.dumps(marker.model_dump()) + "\n")
    return marker


@router.get(
    "/runs/{run_id}/file",
    summary="The MP4 a file run wrote",
    description="404 until the run is done. A family cartridge's picture, nothing else can have been run.",
    response_class=FileResponse,
)
def get_file(run_id: str, _: sqlite3.Row = Depends(admin.require_dev)) -> FileResponse:
    run = _get(run_id)
    if not _view(run).file_ready:
        raise HTTPException(status_code=404, detail="no file: the run is not a finished file run")
    return FileResponse(str(_file(run)), media_type="video/mp4", filename=f"{run.game}-{run.id}.mp4")
