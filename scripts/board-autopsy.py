#!/usr/bin/env python3
"""The autopsy's record: what the pipeline found in each game, as shape.

    python3 scripts/board-autopsy.py SHELF_DIR [--names NAMES.json]

SHELF_DIR holds one directory per game as wasm/listing/tools/autopsy.py
wrote it (model.json and summary.json beside the listing). This reads the
models and writes data/autopsy.json: per game the coverage, every routine
the runs entered with how it was entered and which patterns it is, the
jump engines' tables, the arrays and the busiest shared bytes of RAM.
Addresses, labels, counts and pattern names only: nothing of a ROM's
bytes is in a model, so nothing of them is here (NOTICE.md: shape is not
bytes). The listings themselves stay in SHELF_DIR, which for a
commercial dump is somewhere no repository sees.

NAMES.json maps a digest's first twelve characters to the game's name;
without it a game is named by that prefix. The record is written only
by this script and the pages read every figure from it.
"""

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "autopsy.json"
VARIABLES_KEPT = 24


def git(repo: Path, *a: str) -> str:
    return subprocess.run(["git", *a], cwd=repo, capture_output=True, text=True).stdout.strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("shelf")
    ap.add_argument("--names")
    a = ap.parse_args()
    shelf = Path(a.shelf)
    names = json.loads(Path(a.names).read_text()) if a.names else {}
    games = []
    for d in sorted(shelf.iterdir()):
        model, summary = d / "model.json", d / "summary.json"
        if not model.is_file() or not summary.is_file():
            print(f"board-autopsy: {d.name}: no model or no summary, left out", file=sys.stderr)
            continue
        g = json.loads(model.read_text())
        s = json.loads(summary.read_text())
        key = g["sha256"][:12]
        run = g["run"] or {}
        routines = [r for r in g["routines"] if r.get("by") == "run"]
        kinds = {}
        for r in routines:
            kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
        variables = sorted(g["variables"], key=lambda v: -v["total"])[:VARIABLES_KEPT]
        games.append({
            "key": key,
            "name": names.get(key, key),
            "sha256": g["sha256"],
            "mapper": g["mapper"],
            "prg": g["prg"],
            "chr": g["chr"],
            "executed": run.get("executed", 0),
            "frames": run.get("frames", 0),
            "instructions": run.get("instructions", 0),
            "steps": s["steps"],
            "paths": s["paths"],
            "banks": g["banks"],
            "routines": kinds,
            "patterns": g["patterns"],
            "tables": len(g["tables"]),
            "table_words": sum(t["entries"] for t in g["tables"]),
            "arrays": len(g["arrays"]),
            "variables": len(g["variables"]),
            "routine_list": [
                {k: r[k] for k in ("name", "bank", "addr", "kind", "entered", "inside", "is") if k in r}
                for r in routines
            ],
            "table_list": [{k: t[k] for k in ("bank", "addr", "kind", "entries", "seen", "on") if k in t} for t in g["tables"]],
            # A mark on a loop's head that is no routine's entry: where the game waits.
            "loop_list": [{k: l[k] for k in ("name", "bank", "addr", "is")} for l in g.get("loops", [])],
            "array_list": g["arrays"],
            "object_list": g.get("objects", []),
            "variable_list": [
                {"addr": v["addr"], "total": v["total"], "writers": len(v["writers"]), "readers": len(v["readers"])}
                for v in variables
            ],
        })
    if not games:
        print("board-autopsy: no game in that directory had a model; nothing written", file=sys.stderr)
        return 1
    games.sort(key=lambda g: g["name"].lower())
    patterns = sorted({p for g in games for p in g["patterns"]})
    steps = sorted({g["steps"] for g in games})
    record = {
        "note": "Written only by scripts/board-autopsy.py from the models wasm/listing/tools/autopsy.py wrote. "
                "Shape only: addresses, labels, counts and pattern names; no byte of any ROM.",
        "boarded_on": dt.date.today().isoformat(),
        "repo": "https://github.com/tinymachines/public",
        "listing_tree": git(ROOT, "rev-parse", "HEAD:wasm/listing"),
        "flow_tree": git(ROOT, "rev-parse", "HEAD:wasm/flow"),
        "console_commit": git(ROOT.parent / "nes", "rev-parse", "HEAD"),
        "steps": steps[0] if len(steps) == 1 else steps,
        "variables_kept": VARIABLES_KEPT,
        "patterns": patterns,
        "totals": {
            "games": len(games),
            "prg": sum(g["prg"] for g in games),
            "executed": sum(g["executed"] for g in games),
            "routines": sum(sum(g["routines"].values()) for g in games),
            "marks": sum(sum(g["patterns"].values()) for g in games),
            "tables": sum(g["tables"] for g in games),
            "table_words": sum(g["table_words"] for g in games),
        },
        "games": games,
    }
    OUT.write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
    t = record["totals"]
    print(f"board-autopsy: {t['games']} games, {t['routines']} routines, {t['marks']} pattern marks, {t['tables']} tables; {OUT.relative_to(ROOT)} written ({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
