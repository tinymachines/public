#!/usr/bin/env python3
"""Board ntsc-crt: run its own scanner at a pinned commit, then record.

The /ntsc page states numbers about the ntsc-crt project. Numbers on this
site are slots filled from a published file, and this is the only thing
that writes that file (data/ntsc.json). The rule is the registry's: the
thing that publishes must not be the thing that claims, so nothing here is
copied from the repository's prose on trust. The repository ships its own
harness, tools/check-self-counts.py, which re-derives the exact rationals,
re-runs the transcription gate, re-parses the data files, runs the cargo
suite and the MUTATE=1 run, and holds every documented claim to those fresh
measurements. This script runs that harness in the checkout beside this
repository, refuses a dirty tree, requires the full run (REQUIRE_ALL=1, no
skipped rows), and only when it exits green extracts the page's figures
with the commit they were measured at.

    python3 scripts/board-ntsc.py --board [--repo PATH]
    python3 scripts/board-ntsc.py --wasm  [--repo PATH]

`--wasm` builds the bench's bundle: a fresh clone of the checkout into a
temp directory, checked out at the BOARDED commit (data/ntsc.json must
exist and --board must have run first), `wasm-pack build --target web
--release`, and the two shipped files copied into web/public/ntsc/wasm/
with their sha256s recorded in the same data file. A clone rather than the
checkout itself, so the build can never read an uncommitted edit, and the
roof may commit this bundle because ntsc-crt is MIT throughout: it embeds
no die data, and the LGPL oracle is a native test rig outside the wasm
dependency graph (NOTICE.md there; docs/public-handoff.md).

The extraction regexes are anchored to lines the scanner itself verifies;
when the shape moves, this fails loudly rather than recording a guess. The
frame rates are not extracted at all: they are recomputed here, exactly,
with fractions, from the same geometry the scanner recomputes them from.

Unlike the 6502 engine there is no deploy gate and no served-release
indirection: phase 1 ships nothing built from the checkout, only this
record, so a stale record is a page a reader can date (boarded_on, commit)
rather than a deploy to refuse. The day a wasm bundle boards, the gate
question is reopened.

No host-specific detail is recorded: the repo path is resolved at run time
and only the public remote URL and the commit go into the record.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECORD = ROOT / "data" / "ntsc.json"


def run(cmd: list[str], cwd: Path, **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, **kw)


def fail(msg: str) -> None:
    print(f"board-ntsc: {msg}", file=sys.stderr)
    sys.exit(1)


def extract(text: str, pattern: str, where: str) -> str:
    """One anchored capture, or a loud refusal. A regex that stops matching
    means the source moved out from under this script, and the answer to
    that is never a silently absent figure."""
    m = re.search(pattern, text)
    if not m:
        fail(f"{where}: pattern {pattern!r} found nothing; the source moved, fix the anchor")
    return m.group(1)


def build_wasm(repo: Path) -> int:
    """Build the bench bundle from a fresh clone at the boarded commit and
    record it beside the boarding. The clone means the build can never read
    an uncommitted edit in the checkout; the boarded commit means the bundle
    and the record describe the same tree."""
    import hashlib
    import os
    import shutil
    import tempfile

    if not RECORD.is_file():
        fail("data/ntsc.json does not exist; run --board first")
    record = json.loads(RECORD.read_text())
    commit = record["commit"]

    dest = ROOT / "web" / "public" / "ntsc" / "wasm"
    env = {**os.environ, "PATH": f"{Path.home()}/.cargo/bin:{os.environ['PATH']}"}
    with tempfile.TemporaryDirectory(prefix="ntsc-wasm-") as tmp:
        clone = Path(tmp) / "ntsc-crt"
        for cmd in (
            ["git", "clone", "-q", str(repo), str(clone)],
            ["git", "-C", str(clone), "checkout", "-q", commit],
        ):
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode != 0:
                fail(f"{' '.join(cmd)}: {r.stderr.strip()}")
        # The tag is provenance for a reader; the commit is the pin. Record
        # whichever tags point at the boarded commit in the source repo.
        tags = run(["git", "tag", "--points-at", commit], repo).stdout.split()
        print(f"board-ntsc: building the bundle at {commit[:7]}"
              f"{' (' + ', '.join(tags) + ')' if tags else ''}...")
        # simd128, explicitly and recorded: the repository's perf report
        # (ntsc-crt docs/perf-report.md, 2026-09-02) measured the flag at
        # 1.5x on the notch rung once the convolutions vectorized, and
        # every browser since early 2023 (Chrome 91, Firefox 89, Safari
        # 16.4) instantiates it. The flag lives here rather than in an
        # ambient RUSTFLAGS so the bundle's provenance names it.
        wasm_flags = "-C target-feature=+simd128"
        r = subprocess.run(
            ["wasm-pack", "build", "crates/ntsc-wasm", "--target", "web", "--release"],
            cwd=clone, capture_output=True, text=True,
            env={**env, "RUSTFLAGS": wasm_flags},
        )
        if r.returncode != 0:
            fail(f"wasm-pack failed:\n{r.stderr[-2000:]}")
        pkg = clone / "crates" / "ntsc-wasm" / "pkg"
        dest.mkdir(parents=True, exist_ok=True)
        files = {}
        for name in ("ntsc_wasm.js", "ntsc_wasm_bg.wasm"):
            src = pkg / name
            if not src.is_file():
                fail(f"the build produced no {name}; wasm-pack's layout moved")
            shutil.copy2(src, dest / name)
            files[name] = {
                "sha256": hashlib.sha256(src.read_bytes()).hexdigest(),
                "bytes": src.stat().st_size,
            }
        tool = subprocess.run(["wasm-pack", "--version"], capture_output=True,
                              text=True, env=env).stdout.strip()
        rustc = subprocess.run(["rustc", "--version"], capture_output=True,
                               text=True, env=env).stdout.strip()

    record["bundle"] = {
        "note": "Built by scripts/board-ntsc.py --wasm from a fresh clone at the "
                "boarded commit; the files in web/public/ntsc/wasm/ must hash to "
                "these values.",
        "commit": commit,
        "tags": tags,
        "built_on": dt.date.today().isoformat(),
        "built_with": f"{tool}; {rustc}; RUSTFLAGS {wasm_flags}",
        "files": files,
    }
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    shipped = ", ".join(f"{n} ({v['bytes']} bytes)" for n, v in files.items())
    print(f"board-ntsc: bundle recorded: {shipped}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", action="store_true", help="measure and write data/ntsc.json")
    ap.add_argument("--wasm", action="store_true",
                    help="build the bench bundle at the boarded commit and record it")
    ap.add_argument("--repo", type=Path, default=ROOT.parent / "ntsc-crt")
    args = ap.parse_args()
    if args.wasm and not args.board:
        return build_wasm(args.repo.resolve())
    if not args.board:
        ap.print_help()
        return 2

    repo: Path = args.repo.resolve()
    if not (repo / "tools" / "check-self-counts.py").is_file():
        fail(f"{repo} is not an ntsc-crt checkout (no tools/check-self-counts.py)")

    dirty = run(["git", "status", "--porcelain"], repo).stdout.strip()
    if dirty:
        fail(f"the checkout at {repo} is dirty; a measurement of an unnamed state "
             f"cannot be recorded:\n{dirty}")
    commit = run(["git", "rev-parse", "HEAD"], repo).stdout.strip()
    remote = run(["git", "remote", "get-url", "origin"], repo).stdout.strip()
    remote = re.sub(r"\.git$", "", remote)

    # The repository's own harness, in full: the suite and the MUTATE run are
    # the slow rows, and REQUIRE_ALL turns any skip into a failure. Its stdout
    # is shown, because its FAIL lines are the diagnosis when it refuses.
    print(f"board-ntsc: running the scanner at {commit[:7]} (full suite + MUTATE, minutes)...")
    import os
    scan = run([sys.executable, "tools/check-self-counts.py"], repo,
               env={**os.environ, "REQUIRE_ALL": "1"})
    print(scan.stdout, end="")
    if scan.returncode != 0:
        fail("the scanner refused; nothing recorded")
    verdict = extract(scan.stdout, r"(\d+) claims verified, 0 failures, 0 skipped$",
                      "scanner verdict")

    # Figures the scanner measured this run, read from where it holds them.
    readme = (repo / "README.md").read_text()
    tests_green = int(extract(readme, r"#\s*(\d+) tests", "README test total"))
    mutate_red = int(extract(readme, r"must go red:\s*(\d+) tests", "README MUTATE total"))
    crates = len(re.findall(r'"crates/([a-z0-9-]+)"', (repo / "Cargo.toml").read_text()))
    m0 = (repo / "docs" / "m0-report.md").read_text()
    gate_values = int(extract(m0, r"(\d+) numeric values, 0\s+disagreements", "gate count"))
    blargg_sha = extract((repo / "tools" / "fetch-oracle.sh").read_text(),
                         r'SHA256="([0-9a-f]{64})"', "blargg pin")
    smpte_sha = extract((repo / "data" / "broadcast-timing.toml").read_text(),
                        r'sha256 = "([0-9a-f]{64})"', "ST 170M pin")

    # Stamped best-of-3 timings from the M2 run: quoted with their stamp, per
    # the scanner's own rule that re-running a recorded best-of-N here would
    # replace a measurement with a noisier one.
    m2 = (repo / "docs" / "m2-report.md").read_text()
    # The shipped bundle is the simd128 build, so the recorded figures are
    # the perf report's simd128 rows, at the LOW end of the spread over
    # fresh processes: the conservative number is the honest one to print.
    perf = (repo / "docs" / "perf-report.md").read_text()
    fps_notch = float(extract(
        perf, r"\| NES notch, wasm \+simd128 \| [0-9.]+ \| ([0-9.]+) to", "simd notch fps"))
    fps_comb3 = float(extract(
        perf, r"\| NES comb3, wasm \+simd128 \| [0-9.]+ \| ([0-9.]+) to", "simd comb3 fps"))

    # The real-console session (the M4 report's second addendum). These are
    # stamped measurements like the fps rows: the captures are gitignored
    # bench data a fresh clone cannot re-derive, so the figures are read
    # from the report's own sentences by anchored capture, and the stamp
    # names the run. The line-geometry ppm is recomputed exactly below and
    # cross-checked against the report's claim, because it can be.
    m4 = re.sub(r"\s+", " ", (repo / "docs" / "m4-report.md").read_text())
    rc_luma = extract(m4, r"luma within (0\.\d+), hue within", "real-capture luma")
    rc_hue = extract(m4, r"hue within (0\.\d+) degrees", "real-capture hue")
    m_sat = re.search(r"saturation (\d+) percent HOT \((0\.\d+) vs (0\.\d+)\)", m4)
    if not m_sat:
        fail("real-capture saturation not found in the M4 addendum")
    rc_ppm = extract(m4, r"the same records measure (-\d+ to -\d+) ppm", "real-capture ppm range")
    if "Five captures" not in m4:
        fail("the M4 addendum no longer says how many captures were banked")
    if "125 MSa/s" not in m4:
        fail("the M4 addendum no longer states the capture rate")

    # The rates, recomputed exactly rather than extracted: the one place this
    # script measures instead of reading, because it can.
    fsc = Fraction(315_000_000, 88)
    grid = 12 * fsc
    rates = {
        "nes_full_hz": f"{float(grid / 714_736):.5f}",
        "nes_short_hz": f"{float(grid / 714_728):.5f}",
        "nes_pair_hz": f"{float(2 * grid / (714_736 + 714_728)):.5f}",
        "broadcast_field_hz": f"{float(2 * grid / 1_433_250):.5f}",
    }
    if rates["nes_pair_hz"][:7] != "60.0988":
        fail(f"the recomputed pair rate {rates['nes_pair_hz']} lost the famous figure")
    # A broadcast line is 227.5 subcarrier cycles (2730 grid samples); a NES
    # line is 227 and a third (2728). Decoding one as the other biases the
    # measured sample rate by exactly 2 parts in 2730.
    line_bias_ppm = f"{2 / 2730 * 1e6:.0f}"
    if f"{line_bias_ppm} ppm" not in m4:
        fail(f"the recomputed line bias {line_bias_ppm} ppm is not the report's own figure")
    real_capture = {
        "stamp": "m4-report second addendum, 2026-09-02: five captures from a "
                 "front-loader NES (SMB/Duck Hunt) at 125 MSa/s on a DS1054Z, "
                 "scored by examples/score-real-region.rs at the boarded commit",
        "captures": 5,
        "msa_per_s": 125,
        "luma_delta": rc_luma,
        "hue_delta_deg": rc_hue,
        "sat_hot_pct": int(m_sat.group(1)),
        "sat_real": m_sat.group(2),
        "sat_synth": m_sat.group(3),
        "rate_ppm_range": rc_ppm,
        "broadcast_line_bias_ppm": line_bias_ppm,
        "nes_line_grid": 341 * 8,
        "broadcast_line_grid": int(Fraction(455, 2) * 12),
    }

    record = {
        "note": "Written only by scripts/board-ntsc.py --board. Every figure was "
                "verified by running the repository's own scanner (full suite and "
                "MUTATE run) at this commit; the rates are recomputed here exactly.",
        "boarded_on": dt.date.today().isoformat(),
        "repo": remote,
        "commit": commit,
        "claims_verified": int(verdict),
        "tests_green": tests_green,
        "mutate_red": mutate_red,
        "crates": crates,
        "transcription_gate_values": gate_values,
        "blargg_zip_sha256": blargg_sha,
        "st170m_zip_sha256": smpte_sha,
        "wasm_fps": {"notch": fps_notch, "comb3": fps_comb3, "stamp": "perf-report run 2026-09-02, wasm+simd128 (the shipped bundle), node v24, Ryzen 5 5600X, low end of the spread over three fresh processes"},
        "rates": rates,
        "real_capture": real_capture,
    }
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    print(f"board-ntsc: recorded {commit[:7]}: {tests_green} tests green, "
          f"{mutate_red} MUTATE reds, {verdict} claims verified -> {RECORD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
