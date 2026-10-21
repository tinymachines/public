"""The stream desk, held with a fake tool.

The real tool needs a GPU, ffmpeg and a cartridge; none of that belongs in a
test of the control plane. So every test here points TM_STREAM_BIN at a shell
script that behaves the way the tool is documented to: it prints the progress
line, the closing line and ffmpeg's verdict, refuses a live output with the
real exit status, and dies on SIGTERM. What is under test is everything around
it: the list of games, the one-at-a-time rule, the key rule, the parsing of
progress, stopping, markers, and that no key ever leaves.

The sabotage is the fake itself: it echoes the planted key into the log on
purpose, and the test that reads the log back asserts the key is gone. That
test fails without the filter in stream.py, which is the proof it is a test.
"""

from __future__ import annotations

import os
import stat
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import keys as keys_mod
import stream
import db
from app import app

FAKE = r"""#!/bin/bash
# The stream tool, as far as the desk can tell: rom script seconds out.
rom="$1"; script="$2"; secs="$3"; out="$4"
trap 'echo "# stopped" >&2; exit 143' TERM
if [ "$out" = youtube ]; then
  [ -z "$YOUTUBE_STREAM_KEY" ] && { echo "YOUTUBE_STREAM_KEY in the environment" >&2; exit 101; }
  # SABOTAGE: the real tool never prints the key; this one does, so the
  # desk's own filter is what the log test holds.
  echo "ffmpeg: rtmp://a.rtmp.youtube.com/live2/$YOUTUBE_STREAM_KEY: Input/output error" >&2
  exit 1
fi
if [ "$out" = rtmp ]; then
  [ -z "$RTMP_URL$RTMP_KEY" ] && { echo "RTMP_URL in the environment" >&2; exit 101; }
  echo "ffmpeg: $RTMP_URL$RTMP_KEY refused" >&2
  exit 1
fi
wanted=$((secs * 60))
echo "# script $(wc -l < "$script") lines, rom $(basename "$rom")" >&2
echo "# 600 of $wanted frames, 10.0 s${PACE:+, worst lag 7 ms, 2 frames late}" >&2
if [ -n "$FAKE_HOLD" ]; then sleep "$FAKE_HOLD"; fi
echo "# ms per frame: console 6.7 | encode 4.1 | gpu 3.3, read-back 2.4, convert 2.9, hand-off 0.1" >&2
echo "# $wanted frames ($secs.0 s of console time) in 1.0 s, ffmpeg ok" >&2
echo fake-mp4 > "$out"
exit 0
"""


@pytest.fixture
def desk(tmp_path: Path, monkeypatch):
    """A fake tool, one fake game, a run home, and a clean run table."""
    binary = tmp_path / "stream"
    binary.write_text(FAKE)
    binary.chmod(binary.stat().st_mode | stat.S_IXUSR)
    roms = tmp_path / "roms"
    roms.mkdir()
    (roms / "bars.nes").write_bytes(b"NES\x1a" + bytes(12) + bytes(16384))
    (roms / "cal.nes").write_bytes(b"NES\x1a" + bytes(12) + bytes(32768))
    home = tmp_path / "home"
    monkeypatch.setenv("TM_STREAM_BIN", str(binary))
    monkeypatch.setenv("TM_STREAM_ROMS", str(roms))
    monkeypatch.setenv("TM_STREAM_HOME", str(home))
    for name in ("YOUTUBE_STREAM_KEY", "RTMP_URL", "RTMP_KEY", "FAKE_HOLD", "PACE"):
        monkeypatch.delenv(name, raising=False)
    stream.stop_all()
    yield {"binary": binary, "roms": roms, "home": home}
    stream.stop_all()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_key(client) -> str:
    conn = db.connect()
    key, _ = keys_mod.mint(conn, scope="admin", note="test")
    conn.close()
    return key


@pytest.fixture
def dev_key(client) -> str:
    conn = db.connect()
    key, _ = keys_mod.mint(conn, scope="dev", note="test")
    conn.close()
    return key


def auth(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


def wait_until(client, key: str, run_id: str, state: str, timeout: float = 5.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/v1/stream/runs/{run_id}", headers=auth(key)).json()
        if r["state"] == state:
            return r
        time.sleep(0.05)
    raise AssertionError(f"run {run_id} never reached {state!r}; last: {r}")


def test_the_frame_period_is_the_consoles():
    """The published rendering-on frame rate, 60.0988 Hz, not a figure that
    happens to agree with the rest of this file."""
    assert abs(1 / stream.FRAME_S - 60.0988) < 0.001
    assert round(10 / stream.FRAME_S) == 601


# ---------------------------------------------------------------------------
# Who may ask
# ---------------------------------------------------------------------------


def test_reads_need_a_key_and_writes_need_admin(client, desk, dev_key):
    assert client.get("/v1/stream/games").status_code == 401
    assert client.get("/v1/stream/runs").status_code == 401
    assert client.get("/v1/stream/games", headers=auth(dev_key)).status_code == 200
    r = client.post("/v1/stream/runs", json={"game": "bars", "output": "file", "seconds": 1}, headers=auth(dev_key))
    assert r.status_code == 403, r.text
    assert client.get("/v1/stream/runs", headers=auth(dev_key)).json() == {"runs": []}


# ---------------------------------------------------------------------------
# Games and outputs
# ---------------------------------------------------------------------------


def test_the_games_are_the_served_cartridges_and_nothing_else(client, desk, dev_key, admin_key):
    games = client.get("/v1/stream/games", headers=auth(dev_key)).json()["games"]
    assert [g["id"] for g in games] == ["bars", "cal"]
    assert games[0]["bytes"] == 16 + 16384
    assert len(games[0]["sha256"]) == 64
    # A cartridge not on the list cannot be asked for, however it is named.
    for name in ("mario", "../mario", "/tmp/mario.nes", "bars.nes"):
        r = client.post("/v1/stream/runs", json={"game": name, "output": "file", "seconds": 1}, headers=auth(admin_key))
        assert r.status_code == 404, (name, r.text)


def test_outputs_say_whether_not_what(client, desk, dev_key, monkeypatch):
    o = client.get("/v1/stream/outputs", headers=auth(dev_key)).json()
    assert o == {"file": True, "rtmp": False, "youtube": False, "runner": True}
    monkeypatch.setenv("YOUTUBE_STREAM_KEY", "abcd-efgh-ijkl-mnop-qrst")
    monkeypatch.setenv("RTMP_URL", "rtmps://x.example/live/")
    monkeypatch.setenv("RTMP_KEY", "zzzz-yyyy")
    o = client.get("/v1/stream/outputs", headers=auth(dev_key)).json()
    assert o["youtube"] is True and o["rtmp"] is True
    assert "abcd" not in client.get("/v1/stream/outputs", headers=auth(dev_key)).text
    monkeypatch.setenv("TM_STREAM_BIN", str(desk["binary"]) + ".missing")
    assert client.get("/v1/stream/outputs", headers=auth(dev_key)).json()["runner"] is False


# ---------------------------------------------------------------------------
# A run, start to finish
# ---------------------------------------------------------------------------


def test_a_file_run_starts_reports_progress_and_finishes(client, desk, admin_key, dev_key):
    r = client.post("/v1/stream/runs", json={"game": "bars", "output": "file", "seconds": 2, "script": "WAIT 1 S\n"}, headers=auth(admin_key))
    assert r.status_code == 201, r.text
    run = r.json()
    assert run["state"] in ("running", "done")
    assert run["game"] == "bars" and run["output"] == "file" and run["seconds"] == 2
    assert run["frames_wanted"] == round(2 / stream.FRAME_S)
    done = wait_until(client, dev_key, run["id"], "done")
    assert done["exit_code"] == 0
    assert done["ffmpeg_ok"] is True
    assert done["frames_sent"] == 120
    assert done["file_ready"] is True
    assert done["ended_at"] is not None
    # The script reached the tool as written.
    log = client.get(f"/v1/stream/runs/{run['id']}/log", headers=auth(dev_key)).json()["lines"]
    assert "# script 1 lines, rom bars.nes" in log
    # The file comes back as video.
    f = client.get(f"/v1/stream/runs/{run['id']}/file", headers=auth(dev_key))
    assert f.status_code == 200 and f.headers["content-type"].startswith("video/mp4")
    assert f.content == b"fake-mp4\n"
    # And the list has it, newest first.
    listed = client.get("/v1/stream/runs", headers=auth(dev_key)).json()["runs"]
    assert [x["id"] for x in listed] == [run["id"]]


def test_one_run_at_a_time(client, desk, admin_key, dev_key, monkeypatch):
    monkeypatch.setenv("FAKE_HOLD", "5")
    first = client.post("/v1/stream/runs", json={"game": "bars", "output": "file", "seconds": 1}, headers=auth(admin_key)).json()
    r = client.post("/v1/stream/runs", json={"game": "cal", "output": "file", "seconds": 1}, headers=auth(admin_key))
    assert r.status_code == 409 and first["id"] in r.json()["detail"]
    stopped = client.post(f"/v1/stream/runs/{first['id']}/stop", headers=auth(admin_key)).json()
    assert stopped["state"] == "stopped" and stopped["ended_at"] is not None
    assert stopped["file_ready"] is False
    assert client.get(f"/v1/stream/runs/{first['id']}/file", headers=auth(dev_key)).status_code == 404
    # The chain is free again.
    r = client.post("/v1/stream/runs", json={"game": "cal", "output": "file", "seconds": 1}, headers=auth(admin_key))
    assert r.status_code == 201, r.text
    # Stopping a run that already ended changes nothing.
    again = client.post(f"/v1/stream/runs/{first['id']}/stop", headers=auth(admin_key)).json()
    assert again["state"] == "stopped" and again["ended_at"] == stopped["ended_at"]


def test_a_paced_run_reports_its_lag(client, desk, admin_key, dev_key):
    run = client.post("/v1/stream/runs", json={"game": "bars", "output": "file", "seconds": 1, "pace": True}, headers=auth(admin_key)).json()
    done = wait_until(client, dev_key, run["id"], "done")
    assert done["pace"] is True
    assert done["worst_lag_ms"] == 7.0 and done["frames_late"] == 2


def test_a_missing_tool_is_a_503_not_a_failed_run(client, desk, admin_key, dev_key, monkeypatch):
    monkeypatch.setenv("TM_STREAM_BIN", str(desk["binary"]) + ".missing")
    r = client.post("/v1/stream/runs", json={"game": "bars", "output": "file", "seconds": 1}, headers=auth(admin_key))
    assert r.status_code == 503
    assert client.get("/v1/stream/runs", headers=auth(dev_key)).json()["runs"] == []


def test_the_body_is_held(client, desk, admin_key):
    for body in (
        {"game": "bars", "output": "file", "seconds": 0},
        {"game": "bars", "output": "file", "seconds": 7201},
        {"game": "bars", "output": "dvd", "seconds": 1},
        {"game": "bars", "seconds": 1},
    ):
        assert client.post("/v1/stream/runs", json=body, headers=auth(admin_key)).status_code == 422, body


# ---------------------------------------------------------------------------
# Live outputs and the key rule
# ---------------------------------------------------------------------------


def test_a_live_output_without_its_key_is_refused_before_anything_runs(client, desk, admin_key, dev_key):
    for output in ("youtube", "rtmp"):
        r = client.post("/v1/stream/runs", json={"game": "bars", "output": output, "seconds": 1}, headers=auth(admin_key))
        assert r.status_code == 409, r.text
        assert "not configured" in r.json()["detail"]
    assert client.get("/v1/stream/runs", headers=auth(dev_key)).json()["runs"] == []


def test_no_key_leaves_in_any_answer_even_when_the_tool_prints_it(client, desk, admin_key, dev_key, monkeypatch):
    key = "abcd-efgh-ijkl-mnop-qrst"
    monkeypatch.setenv("YOUTUBE_STREAM_KEY", key)
    run = client.post("/v1/stream/runs", json={"game": "bars", "output": "youtube", "seconds": 1}, headers=auth(admin_key)).json()
    failed = wait_until(client, dev_key, run["id"], "failed")
    assert failed["exit_code"] == 1
    # The fake printed the key into the log on purpose. It must not come out.
    raw = (desk["home"] / run["id"] / "stream.log").read_text()
    assert key in raw, "the sabotage did not fire; this test would pass on nothing"
    log = client.get(f"/v1/stream/runs/{run['id']}/log", headers=auth(dev_key))
    assert key not in log.text
    assert any("Input/output error" in line and "[key]" in line for line in log.json()["lines"])
    for path in ("/v1/stream/runs", f"/v1/stream/runs/{run['id']}", "/v1/stream/outputs"):
        assert key not in client.get(path, headers=auth(dev_key)).text, path
    # The same for the RTMP pair, which is two values.
    monkeypatch.setenv("RTMP_URL", "rtmps://ingest.example/live/")
    monkeypatch.setenv("RTMP_KEY", "wxyz-0123")
    run = client.post("/v1/stream/runs", json={"game": "bars", "output": "rtmp", "seconds": 1}, headers=auth(admin_key)).json()
    wait_until(client, dev_key, run["id"], "failed")
    text = client.get(f"/v1/stream/runs/{run['id']}/log", headers=auth(dev_key)).text
    assert "wxyz-0123" not in text and "ingest.example" not in text


# ---------------------------------------------------------------------------
# Markers
# ---------------------------------------------------------------------------


def test_markers_are_stamped_with_the_frame_and_kept_in_order(client, desk, admin_key, dev_key, monkeypatch):
    monkeypatch.setenv("FAKE_HOLD", "5")
    run = client.post("/v1/stream/runs", json={"game": "bars", "output": "file", "seconds": 20}, headers=auth(admin_key)).json()
    # The fake's first progress line says 600 frames; wait for it to land.
    deadline = time.time() + 5
    while time.time() < deadline and client.get(f"/v1/stream/runs/{run['id']}", headers=auth(dev_key)).json()["frames_sent"] < 600:
        time.sleep(0.05)
    assert client.post(f"/v1/stream/runs/{run['id']}/markers", json={"text": "level 1-1 starts"}, headers=auth(dev_key)).status_code == 403
    m = client.post(f"/v1/stream/runs/{run['id']}/markers", json={"text": "level 1-1 starts"}, headers=auth(admin_key))
    assert m.status_code == 201, m.text
    assert m.json()["frame"] == 600 and m.json()["text"] == "level 1-1 starts"
    client.post(f"/v1/stream/runs/{run['id']}/markers", json={"text": "reset"}, headers=auth(admin_key))
    got = client.get(f"/v1/stream/runs/{run['id']}/markers", headers=auth(dev_key)).json()
    assert [x["text"] for x in got["markers"]] == ["level 1-1 starts", "reset"]
    assert client.get(f"/v1/stream/runs/{run['id']}", headers=auth(dev_key)).json()["markers"] == 2
    assert client.post(f"/v1/stream/runs/{run['id']}/markers", json={"text": ""}, headers=auth(admin_key)).status_code == 422
    assert client.post("/v1/stream/runs/00000000/markers", json={"text": "x"}, headers=auth(admin_key)).status_code == 404


# ---------------------------------------------------------------------------
# What an earlier process left behind
# ---------------------------------------------------------------------------


def test_a_run_from_an_earlier_process_is_listed_as_lost_not_running(client, desk, admin_key, dev_key, monkeypatch):
    monkeypatch.setenv("FAKE_HOLD", "5")
    run = client.post("/v1/stream/runs", json={"game": "bars", "output": "file", "seconds": 1}, headers=auth(admin_key)).json()
    # The process is forgotten, as a restart forgets it; its record stays.
    stream.stop_all()
    (desk["home"] / run["id"] / "run.json").write_text(
        (desk["home"] / run["id"] / "run.json").read_text().replace('"state": "stopped"', '"state": "running"')
    )
    listed = client.get("/v1/stream/runs", headers=auth(dev_key)).json()["runs"]
    assert [x["id"] for x in listed] == [run["id"]]
    assert listed[0]["state"] == "lost"
    # And it does not hold the chain.
    r = client.post("/v1/stream/runs", json={"game": "cal", "output": "file", "seconds": 1}, headers=auth(admin_key))
    assert r.status_code == 201, r.text
