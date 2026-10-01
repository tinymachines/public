#!/usr/bin/env python3
"""The routines behind a crawl's coverage: every script the crawl kept
(the path to each moment that found new code) traced from power-on with
the console repo's `script-trace`, each trace read by the flow crate's
`report`, and the reports laid over the listing together with the
crawl's own coverage.

  python3 tools/paths.py ROM.nes CRAWL_DIR OUT.lst [--nes ../../../nes] [--jobs N]

CRAWL_DIR is what `crawl` wrote (scripts/NNNN.txt, crawl.json). Each
trace is hundreds of megabytes, or more for a deep path, and never
touches the disk: the console writes it into a named pipe and the flow
reads it from there as it comes. The reports stay in CRAWL_DIR/reports/. Counts in the listing add across paths, and paths
share their way in, so a routine every path ran through counts once per
path: the counts say "over these paths", not "in one play".
"""
import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.exit(f"{' '.join(str(c) for c in cmd)}\n{r.stderr[-2000:]}")
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rom")
    ap.add_argument("crawl_dir")
    ap.add_argument("out")
    ap.add_argument("--nes", default=str(HERE.parents[2] / "nes"))
    ap.add_argument("--jobs", type=int, default=2)
    a = ap.parse_args()
    nes = Path(a.nes)
    trace_bin = nes / "target/release/examples/script-trace"
    report_bin = HERE.parent / "flow/target/release/examples/report"
    listing_bin = HERE / "target/release/listing"
    for b in (trace_bin, report_bin, listing_bin):
        if not b.exists():
            sys.exit(f"{b} is not built")
    rom = Path(a.rom)
    prg_len = int.from_bytes(rom.read_bytes()[4:5], "little") * 16384
    crawl = Path(a.crawl_dir)
    scripts = sorted((crawl / "scripts").glob("*.txt"))
    if not scripts:
        sys.exit(f"no scripts under {crawl}/scripts")
    reports = crawl / "reports"
    reports.mkdir(exist_ok=True)

    def one(script: Path):
        out = reports / (script.stem + ".json")
        if out.exists():
            return out
        frames = next(int(l.split()[2]) for l in script.read_text().splitlines() if l.startswith("# frames "))
        trace = reports / (script.stem + ".trace")
        part = reports / (script.stem + ".part")
        if trace.exists():
            trace.unlink()
        os.mkfifo(trace)
        try:
            writer = subprocess.Popen([trace_bin, rom, script, str(frames), trace], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
            run([report_bin, trace, str(prg_len), part])
            err = writer.communicate()[1]
            if writer.returncode != 0:
                sys.exit(f"script-trace {script}\n{err[-2000:]}")
        finally:
            trace.unlink()
        # Whole or not at all: a report cut short would read as a short run.
        part.rename(out)
        return out

    with ThreadPoolExecutor(max_workers=a.jobs) as ex:
        done = list(ex.map(one, scripts))
    inputs = [crawl / "crawl.json"] + done
    lst = run([listing_bin, "from", rom] + inputs).stdout
    Path(a.out).write_text(lst)
    run([listing_bin, "check", a.out, rom])
    # The count comes from the listing, the one copy of the fact: a
    # routine the walk already knew as a JSR target keeps that kind.
    kinds = {}
    for line in lst.splitlines():
        if line.startswith(";; @routine ") and " by=run" in line:
            k = line.split(" kind=")[1].split()[0]
            kinds[k] = kinds.get(k, 0) + 1
    print(f"{len(scripts)} paths traced; {sum(kinds.values())} routines entered across them ({', '.join(f'{v} {k}' for k, v in sorted(kinds.items()))}); {a.out} assembles to {rom.name}")


if __name__ == "__main__":
    main()
