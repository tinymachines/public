#!/usr/bin/env python3
"""Build each lesson, play it on our console, and record what it did.

  python3 scripts/board-lessons.py [--compare jump=DIR] [--check]

For every lessons/<name>/ (see lessons/build.py): the cartridge is built
with our own assembler and held to its listing; then the lesson's script
is played on the console (the nes repository's `storyboard`, beside this
checkout) and its memory read after every frame. What the lesson says it
does is measured there, never typed: for the jump, how long the walk
takes to reach full speed and, for each press of A, the frames in the
air and the pixels risen. Four frames are kept as pictures.

--compare jump=DIR reads the same measures off runs of Super Mario Bros.
kept privately in DIR (the storyboard's ram.bin for three presses):
counts only, which is all a commercial cartridge may give a public page.
Without it the comparison already in the record is kept, if the record
has one.

The record is data/lessons.json: per lesson the git tree of its directory
at HEAD (so the directory must be committed and clean), the cartridge's
digest and bytes, the measures and the pictures. --check rebuilds each
cartridge and holds it to the record without writing anything.
"""
import argparse, base64, datetime, io, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lessons"))
import build  # noqa: E402

OUT = ROOT / "data" / "lessons.json"
STORYBOARD = ROOT.parent / "nes" / "target" / "release" / "examples" / "storyboard"


def git(*a):
    return subprocess.run(["git", "-C", str(ROOT), *a], capture_output=True, text=True, check=True).stdout.strip()


def frames_of(ram: bytes):
    return lambda f, a: ram[f * 2048 + a]


def jump_measures(cell, meta, presses):
    m = meta["memory"]
    air, y, sx = int(m["air"][1:], 16), int(m["y"][1:], 16), [int(a[1:], 16) for a in m["speed_x"]]
    start = meta["walk_from"]
    speed = lambda f: (cell(f, sx[1]) * 256 + cell(f, sx[0])) / 256
    top = max(speed(f) for f in range(start, start + 400))
    full = next(f for f in range(start, start + 400) if speed(f) == top)
    rows = []
    ends = [p for p, _ in presses[1:]] + [meta["frames"]]
    for (press, up), end in zip(presses, ends):
        # One jump: from its press to the next, where the next may begin.
        up_air = [f for f in range(press, end) if cell(f, air)]
        if not up_air or up_air[-1] == end - 1:
            sys.exit(f"board-lessons: the jump pressed at frame {press} did not land before frame {end}")
        rows.append({"held": up - press, "frames": len(up_air), "risen": meta["ground"] - min(cell(f, y) for f in up_air)})
    return {"full_speed_after": full - start, "full_speed": top, "jumps": rows}


def mario(dirpath: Path):
    """Mario's walk and three jumps, from the private runs: counts only."""
    def load(d):
        return frames_of((dirpath / d / "ram.bin").read_bytes()), (dirpath / d / "pad.bin").read_bytes()
    cell, pad = load("board")
    right = next(f for f in range(500, len(pad)) if pad[f] & 0x80)
    # $0057 is the speed across in sixteenths of a pixel a frame.
    top = max(cell(f, 0x57) for f in range(right, right + 200))
    full = next(f for f in range(right, right + 200) if cell(f, 0x57) == top)
    rows = []
    for d in ("jump-tap", "board", "jump-held"):
        c, p = load(d)
        press = next(f for f in range(right, len(p)) if p[f] & 1)
        up = next(f for f in range(press, len(p)) if not p[f] & 1)
        a = [f for f in range(press, min(press + 200, len(p))) if c(f, 0x1D)]
        rows.append({"held": up - press, "frames": a[-1] + 1 - a[0], "risen": c(a[0] - 1, 0xCE) - min(c(f, 0xCE) for f in range(a[0], a[-1] + 2))})
    return {"game": "Super Mario Bros.", "full_speed_after": full - right, "full_speed": top / 16, "jumps": rows}


def png(path: Path) -> str:
    from PIL import Image
    b = io.BytesIO()
    Image.open(path).save(b, "PNG", optimize=True)
    return base64.b64encode(b.getvalue()).decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compare", action="append", default=[])
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    compare = dict(x.split("=", 1) for x in a.compare)
    old = json.loads(OUT.read_text()) if OUT.exists() else {"lessons": []}
    lessons = []
    for d in sorted(p for p in (ROOT / "lessons").iterdir() if (p / "lesson.json").exists()):
        name = d.name
        b = build.build(name)
        sha = b["sha256"]
        if a.check:
            was = next((x for x in old["lessons"] if x["key"] == name), None)
            if was is None or was["sha256"] != sha or was["tree"] != git("rev-parse", f"HEAD:lessons/{name}"):
                sys.exit(f"board-lessons: {name} is not what data/lessons.json records; run scripts/board-lessons.py")
            print(f"board-lessons: {name} builds to the recorded cartridge ({sha[:12]})")
            continue
        if git("status", "--porcelain", "--", f"lessons/{name}"):
            sys.exit(f"board-lessons: lessons/{name} has uncommitted changes; the record pins a committed tree")
        meta = json.loads((d / "lesson.json").read_text())
        if not STORYBOARD.exists():
            sys.exit(f"board-lessons: {STORYBOARD} is not built (cargo build --release -p nes-console --example storyboard in ../nes)")
        run = d / "build" / "run"
        subprocess.run([str(STORYBOARD), str(b["rom"]), str(d / meta["script"]), str(meta["frames"]), str(run), ",".join(map(str, meta["grabs"]))], check=True, capture_output=True)
        cell = frames_of((run / "ram.bin").read_bytes())
        measures = jump_measures(cell, meta, meta["presses"])
        prev = next((x for x in old["lessons"] if x["key"] == name), {})
        against = mario(Path(compare[name])) if name in compare else prev.get("against")
        lessons.append({
            "key": name, "title": meta["title"], "tree": git("rev-parse", f"HEAD:lessons/{name}"),
            "sha256": sha, "code_bytes": b["code_bytes"], "instructions": b["instructions"],
            "rom": base64.b64encode(b["rom"].read_bytes()).decode(),
            "measures": measures, "against": against,
            "pictures": [{"frame": f, "png": png(run / f"frame-{f:05}.ppm")} for f in meta["grabs"]],
        })
        print(f"board-lessons: {name}: {measures}" + (f"; against {against['game']}: {against['jumps']}" if against else ""))
    if a.check:
        return
    OUT.write_text(json.dumps({
        "note": "Written only by scripts/board-lessons.py. Our own cartridges, built from lessons/ and measured on our console; a comparison with a commercial game carries counts only.",
        "boarded_on": datetime.date.today().isoformat(),
        "lessons": lessons,
    }, indent=1) + "\n")
    print(f"board-lessons: {len(lessons)} lesson(s); {OUT.relative_to(ROOT)} written ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
