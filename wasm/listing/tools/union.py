#!/usr/bin/env python3
"""The union of game models: which patterns recur across the games, and
one line per game, from the model.json files tools/autopsy.py wrote.
Shape only; a game is named by its digest's first twelve characters
unless --names gives a JSON object from that prefix to a name.

    python3 tools/union.py MODEL.json [MODEL.json ...] [--names NAMES.json]
"""

import argparse
import json
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("models", nargs="+")
    ap.add_argument("--names")
    a = ap.parse_args()
    names = json.loads(Path(a.names).read_text()) if a.names else {}
    games = []
    for p in a.models:
        g = json.loads(Path(p).read_text())
        g["_name"] = names.get(g["sha256"][:12], g["sha256"][:12])
        games.append(g)
    games.sort(key=lambda g: g["_name"])
    patterns = sorted({k for g in games for k in g["patterns"]})
    print("| game | board | PRG executed | routines (run) | tables | arrays | variables | patterns |")
    print("|---|---|---|---|---|---|---|---|")
    for g in games:
        run = g["run"] or {}
        executed, of = run.get("executed", 0), run.get("of", g["prg"])
        pct = 100.0 * executed / of if of else 0
        n_run = sum(1 for r in g["routines"] if r.get("by") == "run")
        print(f"| {g['_name']} | {g['mapper']} | {executed} of {of} ({pct:.0f}%) | {n_run} | {len(g['tables'])} | {len(g['arrays'])} | {len(g['variables'])} | {sum(g['patterns'].values())} |")
    print()
    print("| pattern | games | marks |")
    print("|---|---|---|")
    for p in patterns:
        n_games = sum(1 for g in games if p in g["patterns"])
        n_marks = sum(g["patterns"].get(p, 0) for g in games)
        print(f"| {p} | {n_games} of {len(games)} | {n_marks} |")


if __name__ == "__main__":
    main()
