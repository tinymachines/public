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


def scroll_measures(cell, vram_path: Path, cam_lo: int, cam_hi: int, countdown: int, frames: int):
    """How the picture is kept ahead of the camera: from memory (the camera
    and the strip countdown) and from the log of picture-memory writes."""
    cam = lambda f: cell(f, cam_hi) * 256 + cell(f, cam_lo)
    writes = {}
    for line in vram_path.read_text().splitlines():
        f, a, n, st = line.split()
        writes.setdefault(int(f), []).append((int(a, 16), int(n), int(st)))
    moving = [f for f in range(1, frames) if cam(f) != cam(f - 1)]
    lo, hi = moving[0], moving[-1]
    # A strip started too near the end of the run to be seen through is left out.
    starts = [f for f in range(lo, min(hi, frames - 16)) if cell(f, countdown) and not cell(f - 1, countdown)]
    gaps = [cam(b) - cam(a) for a, b in zip(starts, starts[1:])]
    strips = []
    for f0 in starts:
        f1 = next(g for g in range(f0, f0 + 30) if cell(g, countdown) == 0)
        # A frame past the countdown's end: a game that prepares in its main
        # loop writes in the next blank.
        cols = [(g, w) for g in range(f0, f1 + 2) for w in writes.get(g, []) if w[2] == 32]
        attr = [w for g in range(f0, f1 + 2) for w in writes.get(g, []) if (w[0] & 0x3FF) >= 0x3C0 and w[1] == 1]
        if not cols:
            continue
        g, (a, n, _) = cols[0]
        # Where the first column lands, counted from the right edge of the
        # picture: the name tables are 512 pixels round, the camera's
        # pixel is where the picture starts in them.
        x = (0x100 if a & 0x400 else 0) + (a & 0x1F) * 8
        ahead = (x - cam(g) % 512) % 512 - 256
        last = max([g for g, _ in cols] + [g for g in range(f0, f1 + 2) for w in writes.get(g, []) if (w[0] & 0x3FF) >= 0x3C0 and w[1] == 1])
        strips.append({"frames": f1 - f0 + 1, "last_write": last - f0, "columns": len(cols), "tiles": sorted({w[1] for _, w in cols}), "colours": len(attr), "ahead": ahead,
                       "column_frames": sorted({g - f0 for g, _ in cols})})
    one = lambda k: sorted({str(x[k]) for x in strips})
    return {
        "strips": len(strips), "every_min": min(gaps), "every_max": max(gaps), "every_mean": round(sum(gaps) / len(gaps), 1),
        "frames": one("frames"), "columns": one("columns"), "tiles": sorted({t for x in strips for t in x["tiles"]}),
        "colours": one("colours"), "ahead_min": min(x["ahead"] for x in strips), "ahead_max": max(x["ahead"] for x in strips),
        "column_frames": one("column_frames"), "last_write": one("last_write"),
    }


def rooms_measures(cell, vram_path: Path, room: int, scroll: int, frames: int, after: int = 0):
    """The first walk out of a room after frame `after`: what the room's
    number did, how long until the picture moved, how it moved, and what
    was written to the picture chip's memory before and during the slide."""
    writes = {}
    for line in vram_path.read_text().splitlines():
        f, a, n, st = line.split()
        writes.setdefault(int(f), []).append((int(a, 16), int(n), int(st)))
    change = next(f for f in range(max(after, 1), frames) if cell(f, room) != cell(f - 1, room))
    moved = [f for f in range(change, min(change + 200, frames)) if cell(f, scroll) != cell(f - 1, scroll)]
    # The moment memory is read can fall before a frame's work is done, so
    # one frame without a move inside the slide is not its end; two are.
    first, last = moved[0], moved[0]
    while last + 1 in moved or last + 2 in moved:
        last += 1 if last + 1 in moved else 2
    # Pixels a frame over the whole slide (a frame read early shows 0 and
    # the next twice the step, so the steps one by one would mislead).
    travel = sum(min((cell(f, scroll) - cell(f - 1, scroll)) % 256, (cell(f - 1, scroll) - cell(f, scroll)) % 256) for f in range(first, last + 1))
    def runs(a, b):
        out = {}
        for f in range(a, b):
            for _, n, st in writes.get(f, []):
                if n >= 8:
                    k = f"{n} {'down' if st == 32 else 'across'}"
                    out[k] = out.get(k, 0) + 1
        return dict(sorted(out.items()))
    during = [f for f in range(first, last + 2) if any(n >= 8 and st == 32 for _, n, st in writes.get(f, []))]
    return {
        "before": cell(change - 1, room), "after": cell(change, room),
        "wait": first - change, "slide": last - first + 1, "travel": travel, "step": round(travel / (last - first + 1), 2),
        "written_before": runs(change, first), "written_during": runs(first, last + 2),
        "column_every": sorted({b - a for a, b in zip(during, during[1:])}),
        "columns_from": during[0] - first if during else None, "columns": len(during),
    }


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
        env = {**__import__("os").environ, "VRAM": "1"}
        subprocess.run([str(STORYBOARD), str(b["rom"]), str(d / meta["script"]), str(meta["frames"]), str(run), ",".join(map(str, meta["grabs"]))], check=True, capture_output=True, env=env)
        cell = frames_of((run / "ram.bin").read_bytes())
        kind = meta.get("kind", "jump")
        prev = next((x for x in old["lessons"] if x["key"] == name), {})
        if kind == "jump":
            measures = jump_measures(cell, meta, meta["presses"])
            against = mario(Path(compare[name])) if name in compare else prev.get("against")
        elif kind == "rooms":
            h = lambda a: int(a[1:], 16)
            mm = meta["memory"]
            measures = rooms_measures(cell, run / "vram.txt", h(mm["room"]), h(mm["scroll"][0]), meta["frames"], after=meta["walk_from"])
            if name in compare:
                d = Path(compare[name])
                zr = (d / "vr" / "ram.bin").read_bytes()
                # Zelda: the room at $00EB, the slide's scroll at $00FD; the first walk out is past the menus.
                against = {"game": "The Legend of Zelda", **rooms_measures(frames_of(zr), d / "vr" / "vram.txt", 0xEB, 0xFD, len(zr) // 2048, after=700)}
                # A second run that walks up out of the first room: the room's number before and after.
                if (d / "up" / "ram.bin").exists():
                    ur = (d / "up" / "ram.bin").read_bytes()
                    uc = frames_of(ur)
                    t = next(f for f in range(700, len(ur) // 2048) if uc(f, 0xEB) != uc(f - 1, 0xEB))
                    against["up"] = {"before": uc(t - 1, 0xEB), "after": uc(t, 0xEB)}
            else:
                against = prev.get("against")
        else:
            mm = meta["memory"]
            h = lambda a: int(a[1:], 16)
            measures = scroll_measures(cell, run / "vram.txt", h(mm["camera"][0]), h(mm["camera"][1]), h(mm["countdown"]), meta["frames"])
            if name in compare:
                d = Path(compare[name])
                mr = (d / "run" / "ram.bin").read_bytes()
                # Mario: the camera at $071C (pixel) and $071A (page), the countdown at $071F.
                against = {"game": "Super Mario Bros.", **scroll_measures(frames_of(mr), d / "vr" / "vram.txt", 0x71C, 0x71A, 0x71F, min(len(mr) // 2048, 1700))}
            else:
                against = prev.get("against")
        lessons.append({
            "key": name, "kind": meta.get("kind", "jump"), "title": meta["title"], "description": meta["description"], "tree": git("rev-parse", f"HEAD:lessons/{name}"),
            "sha256": sha, "code_bytes": b["code_bytes"], "instructions": b["instructions"],
            "rom": base64.b64encode(b["rom"].read_bytes()).decode(),
            "measures": measures, "against": against,
            "pictures": [{"frame": f, "png": png(run / f"frame-{f:05}.ppm")} for f in meta["grabs"]],
        })
        print(f"board-lessons: {name}: {measures}" + (f"; against {against['game']}: {dict((k, v) for k, v in against.items() if k != 'game')}" if against else ""))
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
