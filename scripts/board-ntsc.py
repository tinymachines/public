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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", action="store_true", help="measure and write data/ntsc.json")
    ap.add_argument("--repo", type=Path, default=ROOT.parent / "ntsc-crt")
    args = ap.parse_args()
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
    fps_notch = float(extract(m2, r"\| NES notch, wasm \(node v24\) \| ([0-9.]+) \|", "wasm notch fps"))
    fps_comb3 = float(extract(m2, r"\| NES comb3, wasm \| ([0-9.]+) \|", "wasm comb3 fps"))

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
        "wasm_fps": {"notch": fps_notch, "comb3": fps_comb3, "stamp": "M2 run, node v24, Ryzen 5 5600X, best of 3"},
        "rates": rates,
    }
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    print(f"board-ntsc: recorded {commit[:7]}: {tests_green} tests green, "
          f"{mutate_red} MUTATE reds, {verdict} claims verified -> {RECORD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
