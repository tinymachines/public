#!/usr/bin/env python3
"""One dump's autopsy, first cut: crawl it, trace every path the crawl
kept, fold them all onto the listing with the matchers, and say what
came out as shape (counts, never bytes). The listing itself stays in
OUTDIR, which for a commercial dump is somewhere no repository sees.

    python3 tools/autopsy.py ROM.nes OUTDIR [--steps N] [--nes DIR] [--jobs N]

Writes OUTDIR/crawl/ (the crawl), OUTDIR/listing.lst, OUTDIR/summary.json
and prints the summary as one line. Needs the console repository's
crawl and script-trace examples built in release, flow's report example
and this crate's binary (tools/paths.py says how).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rom")
    ap.add_argument("out")
    ap.add_argument("--steps", type=int, default=400)
    ap.add_argument("--nes", default=str(HERE.parents[3] / "nes"))
    ap.add_argument("--jobs", type=int, default=2)
    a = ap.parse_args()
    rom = Path(a.rom).resolve()
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    nes = Path(a.nes).resolve()
    crawl_bin = nes / "target/release/examples/crawl"
    if not crawl_bin.exists():
        sys.exit(f"{crawl_bin} is not built: cargo build --release -p nes-console --example crawl")
    t0 = time.time()
    crawl = out / "crawl"
    if not (crawl / "crawl.json").exists():
        with open(out / "crawl.log", "w") as log:
            subprocess.run([crawl_bin, rom, crawl, str(a.steps)], check=True, stderr=log, stdout=log)
    lst = out / "listing.lst"
    with open(out / "paths.log", "w") as log:
        subprocess.run([sys.executable, HERE / "paths.py", rom, crawl, lst, "--nes", nes, "--jobs", str(a.jobs)], check=True, stderr=log, stdout=log)
    text = lst.read_text()
    summary = {
        "rom": rom.name,
        "steps": a.steps,
        "seconds": round(time.time() - t0),
        "paths": len(list((crawl / "scripts").glob("*.txt"))) if (crawl / "scripts").exists() else 0,
    }
    m = re.search(r"^;; @run frames=(\d+) instructions=(\d+) executed=(\d+) of=(\d+)", text, re.M)
    summary["frames"], summary["instructions"], summary["executed"], summary["prg"] = (int(x) for x in m.groups())
    kinds = {}
    for line in text.splitlines():
        if line.startswith(";; @routine ") and " by=run" in line:
            k = line.split(" kind=")[1].split()[0]
            kinds[k] = kinds.get(k, 0) + 1
    summary["routines"] = kinds
    patterns = {}
    for line in text.splitlines():
        if line.startswith(";; @is "):
            p = line.split()[2]
            patterns[p] = patterns.get(p, 0) + 1
    summary["is"] = patterns
    tables = re.findall(r"^;; @table dispatch entries=(\d+) seen=(\d+)", text, re.M)
    summary["tables"] = len(tables)
    summary["table_words"] = sum(int(e) for e, _ in tables)
    summary["variables"] = len(re.findall(r"^;; @var ", text, re.M))
    (out / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    pct = 100.0 * summary["executed"] / summary["prg"]
    print(
        f"{rom.name[:12]}: {summary['executed']} of {summary['prg']} bytes executed ({pct:.0f}%) over {summary['paths']} paths, "
        f"{sum(kinds.values())} routines ({', '.join(f'{v} {k}' for k, v in sorted(kinds.items()))}), "
        f"{sum(patterns.values())} matched ({', '.join(f'{k}' for k in sorted(patterns))}), "
        f"{summary['tables']} tables ({summary['table_words']} words), {summary['variables']} variables, {summary['seconds']} s"
    )


if __name__ == "__main__":
    main()
