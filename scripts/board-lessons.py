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
import argparse, base64, datetime, io, itertools, json, subprocess, sys
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
    # The slide as the picture chip was told it: the last $2005 pair each
    # frame (scroll.txt beside the writes), which no read of memory can
    # catch early. Without the file, memory's own reads, which can.
    # Per frame: the last pair written while the picture was drawing (a
    # split sets the scroll for what is under it, as Zelda's does below
    # its status bar), or else the last pair written in the blank.
    told = {}
    sp = vram_path.with_name("scroll.txt")
    if sp.exists():
        split = {}
        for line in sp.read_text().splitlines():
            f, at, x, _ = map(int, line.split())
            (split if at < 240 else told)[f] = x
        told.update(split)
    if told:
        xs = {}
        last_x = 0
        for f in range(change - 5, min(change + 200, frames)):
            last_x = told.get(f, last_x)
            xs[f] = last_x
        moved = [f for f in range(change, min(change + 199, frames)) if xs[f] != xs[f - 1]]
        first, last = moved[0], moved[-1]
        moves = [min((xs[f] - xs[f - 1]) % 256, (xs[f - 1] - xs[f]) % 256) for f in range(first, last + 1)]
    else:
        moves = [min((cell(f, scroll) - cell(f - 1, scroll)) % 256, (cell(f - 1, scroll) - cell(f, scroll)) % 256) for f in range(first, last + 1)]
    travel = sum(moves)
    usual = max(set(m for m in moves if m), key=moves.count)
    def runs(a, b):
        out = {}
        for f in range(a, b):
            for _, n, st in writes.get(f, []):
                if n >= 8:
                    k = f"{n} {'down' if st == 32 else 'across'}"
                    out[k] = out.get(k, 0) + 1
        return dict(sorted(out.items()))
    during = [f for f in range(first, last + 2) if any(n >= 8 and st == 32 for _, n, st in writes.get(f, []))]
    mirroring = None
    mp = vram_path.with_name("mapper.txt")
    if mp.exists():
        seen = mmc1_mirroring(mp)
        playing = next((m for f, m in reversed(seen) if f < change), None)
        switch = next(((f, m) for f, m in seen if change <= f <= last + 10 and m != playing), None)
        back = next((f for f, m in seen if switch and f > switch[0] and m == playing), None)
        if playing and switch and back:
            mirroring = {"playing": playing, "slide": switch[1], "switched": switch[0] - first, "back": back - last}
    return {
        "mirroring": mirroring,
        "before": cell(change - 1, room), "after": cell(change, room),
        "wait": first - change, "slide": len([m for m in moves if m]), "travel": travel, "step": usual,
        "written_before": runs(change, first), "written_during": runs(first, last + 2),
        "column_every": sorted({b - a for a, b in zip(during, during[1:])}),
        "columns_from": during[0] - first if during else None, "columns": len(during),
    }


def screens_measures(cell, pad: bytes, report: dict, model: dict, screen: int, frames: int, after: int = 0):
    """One byte choosing the screen: the values it took, the table the
    autopsy's rules found chosen by it, whether the flow's stretches (cut
    by which routines ran, knowing nothing of screens) begin where the byte
    changed, and how still memory is while paused."""
    changes = [f for f in range(max(after, 1), frames) if cell(f, screen) != cell(f - 1, screen)]
    values = [cell(max(after, 0), screen)] + [cell(f, screen) for f in changes]
    starts = [a for a, _, _ in report["modes"]["segments"]][1:]
    met = sum(1 for f in changes if any(abs(f - b) <= 2 for b in starts))
    addr = f"${screen:04X}"
    tables = [t for t in model["tables"] if addr in t.get("on", [])]
    engine = any(i["pattern"] == "jump-engine" for x in model["routines"] for i in x["is"])
    moving = lambda f: sum(1 for a in range(0x800) if not 0x100 <= a < 0x300 and cell(f, a) != cell(f - 1, a))
    # Paused: a press of Start in play, and the next one.
    presses = [f for f in range(max(after, 1), frames) if pad[f] & 0x08 and not pad[f - 1] & 0x08]
    play = [f for f in presses if cell(f - 1, screen) == values[1] if len(values) > 1]
    pause = None
    later = [f for f in presses if play and f > play[0]]
    if play and later:
        p0, p1 = play[0], later[0]
        mid = sorted(moving(f) for f in range(p0 + 5, p1 - 1))
        pre = sorted(moving(f) for f in range(p0 - 20, p0))
        pause = {"before": pre[len(pre) // 2], "during": mid[len(mid) // 2], "frames": p1 - p0}
    return {
        "values": values, "changes": len(changes), "stretches": len(report["modes"]["segments"]), "met": met,
        "engine": engine, "table": ({k: tables[0][k] for k in ("entries", "seen")} if tables else None), "pause": pause,
    }


def autopsy_of(rom: Path, script: Path, frames: int, out: Path):
    """Our own autopsy of our own cartridge: trace the script, report it with
    the flow tool, list it with its run, and read the model back."""
    trace_bin = ROOT.parent / "nes" / "target" / "release" / "examples" / "script-trace"
    report_bin = ROOT / "wasm" / "flow" / "target" / "release" / "examples" / "report"
    for b in (trace_bin, report_bin):
        if not b.exists():
            sys.exit(f"board-lessons: {b} is not built")
    fifo = out / "t.fifo"
    if fifo.exists():
        fifo.unlink()
    import os
    os.mkfifo(fifo)
    try:
        w = subprocess.Popen([str(trace_bin), str(rom), str(script), str(frames), str(fifo)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        r = subprocess.Popen([str(report_bin), str(fifo), str(rom.read_bytes()[4] * 16384), str(out / "report.json")], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        # A trace that dies before it opens the pipe leaves the report
        # waiting on it for good: watch the writer, and stop the reader.
        err = w.communicate()[1]
        if w.returncode != 0:
            r.kill()
            sys.exit(f"board-lessons: script-trace {script} failed: {err.strip()[-500:]}")
        if r.wait() != 0:
            sys.exit(f"board-lessons: the flow report of {script} failed: {r.stderr.read()[-500:]}")
    finally:
        fifo.unlink()
    (out / "autopsy.s").write_text(build.listing("from", rom, out / "report.json"))
    build.listing("check", out / "autopsy.s", rom)
    return json.loads((out / "report.json").read_text()), json.loads(build.listing("model", out / "autopsy.s"))


def sg(v: int) -> int:
    return v - 256 if v > 127 else v


def touch_event(cell, f, px, py, pv, ex, ey, state_before, state_after):
    """Where the two were the frame before a touch, and the player's speed down then and after."""
    return {"frame": f, "dx": ex(f - 1) - px(f - 1), "dy": ey(f - 1) - py(f - 1), "fall": pv(f - 1), "after": pv(f), "state": [state_before, state_after]}


def stomp_measures(cell, frames: int, mm: dict, after: int):
    """Our walker: its speed, the first stomp and the first hit."""
    h = lambda k: int(mm[k][1:], 16)
    px = lambda f: cell(f, h("x"))
    py = lambda f: cell(f, h("y"))
    pv = lambda f: round(sg(cell(f, h("speed_down")[1] if False else int(mm["speed_down"][1][1:], 16))) + cell(f, int(mm["speed_down"][0][1:], 16)) / 256, 2)
    ex = lambda f: cell(f, h("walker_x")) + cell(f, h("walker_x") + 1) / 256
    ey = lambda f: cell(f, h("walker_y"))
    st = lambda f: cell(f, h("walker_state"))
    walking = [f for f in range(after, frames) if st(f) == 0 and st(f - 1) == 0 and ex(f) < ex(f - 1)]
    speed = round(sum(ex(f - 1) - ex(f) for f in walking) / len(walking), 2)
    stomp = next(f for f in range(after, frames) if cell(f, h("stomps")) != cell(f - 1, h("stomps")))
    hit = next(f for f in range(after, frames) if cell(f, h("hits")) != cell(f - 1, h("hits")))
    back = next(f for f in range(stomp, frames) if st(f) == 0)
    s = touch_event(cell, stomp, px, py, pv, ex, ey, st(stomp - 1), st(stomp))
    s["flat"] = back - stomp
    s["dx"] = round(s["dx"])
    t = touch_event(cell, hit, px, py, pv, ex, ey, st(hit - 1), st(hit))
    t["dx"] = round(t["dx"])
    return {"walk": speed, "stomp": s, "hit": t}


def mario_touches(dirpath: Path):
    """The same off Super Mario Bros.: a Goomba's walk, the first stomp in the
    longer run, the first hit in the first run. Slots 1 to 5: x at $0086+i
    (page $006D+i), y at $00CE+i, state at $001E+i-1; Mario's speed down
    $009F with its fraction at $0433; the player's state at $000E."""
    def load(d):
        r = (dirpath / d / "ram.bin").read_bytes()
        return frames_of(r), len(r) // 2048
    cell, n = load("run")
    X = lambda f, i: cell(f, 0x6D + i) * 256 + cell(f, 0x86 + i)
    pv = lambda f, c=cell: round(sg(c(f, 0x9F)) + c(f, 0x433) / 256, 2)
    steps = []
    for i in range(1, 6):
        run = [f for f in range(600, min(n, 1500)) if cell(f, 0x0F + i - 1) and cell(f, 0x1E + i - 1) == 0 and cell(f - 1, 0x1E + i - 1) == 0]
        seg = []
        for f in run:
            if seg and f != seg[-1] + 1:
                if len(seg) > 30 and X(seg[-1], i) < X(seg[0], i):
                    steps.append((X(seg[0], i) - X(seg[-1], i)) / (seg[-1] - seg[0]))
                seg = []
            seg.append(f)
    stomp = next((f, i) for f in range(600, n) for i in range(1, 6) if cell(f, 0x0F + i - 1) and cell(f - 1, 0x1E + i - 1) in (0, 1) and cell(f, 0x1E + i - 1) not in (0, 1) and sg(cell(f - 1, 0x9F)) > 0)
    f, i = stomp
    back = next(g for g in range(f, n) if not cell(g, 0x0F + i - 1) or cell(g, 0x1E + i - 1) in (0, 1))
    s = {"frame": f, "dx": X(f - 1, i) - X(f - 1, 0), "dy": cell(f - 1, 0xCE + i) - cell(f - 1, 0xCE), "fall": pv(f - 1), "after": pv(f), "state": [cell(f - 1, 0x1E + i - 1), cell(f, 0x1E + i - 1)], "flat": back - f}
    c2, n2 = load("board")
    X2 = lambda f, i: c2(f, 0x6D + i) * 256 + c2(f, 0x86 + i)
    hf = next(g for g in range(600, n2) if c2(g - 1, 0x0E) == 8 and c2(g, 0x0E) not in (8,) and c2(g - 1, 0xCE) < 230)
    near = min((i for i in range(1, 6) if c2(hf - 1, 0x0F + i - 1)), key=lambda i: abs(X2(hf - 1, i) - X2(hf - 1, 0)))
    t = {"frame": hf, "dx": X2(hf - 1, near) - X2(hf - 1, 0), "dy": c2(hf - 1, 0xCE + near) - c2(hf - 1, 0xCE), "fall": pv(hf - 1, c2), "after": pv(hf, c2), "state": [8, c2(hf, 0x0E)]}
    return {"game": "Super Mario Bros.", "walk": round(sum(steps) / len(steps), 2), "stomp": s, "hit": t}


def rooms_up(cell, vram_path: Path, room: int, frames: int, after: int):
    """The first step up after `after`: the room's number, and the rows
    written across into the picture chip's memory after it changed."""
    writes = {}
    for line in vram_path.read_text().splitlines():
        f, a, n, st = line.split()
        writes.setdefault(int(f), []).append((int(a, 16), int(n), int(st)))
    t = next(f for f in range(max(after, 1), frames) if cell(f, room) != cell(f - 1, room))
    rows = [(f, a, n) for f in range(t, min(t + 120, frames)) for a, n, st in writes.get(f, []) if st == 1 and n >= 24 and (a & 0x3FF) < 0x3C0]
    frames_of_rows = [f for f, _, _ in rows]
    addrs = [a for _, a, _ in rows]
    return {
        "before": cell(t - 1, room), "after": cell(t, room), "rows": len(rows),
        "tiles": sorted({n for _, _, n in rows}), "first": frames_of_rows[0] - t if rows else None,
        "every": sorted({b - a for a, b in zip(frames_of_rows, frames_of_rows[1:])}),
        "upward": all(b < a for a, b in zip(addrs, addrs[1:])),
        "from_row": (addrs[0] & 0x3FF) // 32 if rows else None, "to_row": (addrs[-1] & 0x3FF) // 32 if rows else None,
    }


def jump_of(cell, press: int, until: int, air: int, y: int, vy_hi, vy_lo, a_held):
    """One jump from a press: the first speed down, the pull while A is held
    and rising and after it, and how far it rose to its top before it first
    landed (a landing on something higher ends it too)."""
    V = lambda f: sg(cell(f, vy_hi)) * 256 + cell(f, vy_lo)
    flight = []
    for f in range(press, until):
        if cell(f, air):
            flight.append(f)
        elif flight:
            break
    t0 = flight[0]
    pulls = [(V(f) - V(f - 1), a_held(f) and V(f - 1) < 0) for f in range(t0 + 1, flight[-1] + 1) if V(f) > V(f - 1)]
    held = sorted({d for d, h in pulls if h})
    released = sorted({d for d, h in pulls if not h and d < 1024})
    return {"first": round(V(t0) / 256 - (held[0] if held else 0) / 256, 2), "held": held[0] if held else None,
            "released": max(set(d for d, h in pulls if not h), key=[d for d, h in pulls if not h].count) if released else None,
            "rose": cell(t0 - 1, y) - min(cell(f, y) for f in flight)}


def run_measures(cell, pad, rom: Path, out: Path, meta: dict):
    """Walking and running tops, the two jumps, and the speed at which the
    jump changes, found by jumping after more and more frames of running."""
    sx = lambda f: (cell(f, 0x13) * 256 + cell(f, 0x12)) / 256
    walk_top = max(sx(f) for f in range(60, 160))
    run_from = next(f for f in range(1, meta["frames"]) if pad[f] & 0x02 and not pad[f - 1] & 0x02)
    run_top = max(sx(f) for f in range(run_from, run_from + 120))
    after = next(f for f in range(run_from, run_from + 120) if sx(f) == run_top) - run_from
    jumps = [jump_of(cell, p, p + 120, 0x03, 0x15, 0x17, 0x16, lambda f: pad[f] & 0x01) for p, _ in meta["presses"]]
    light, strong = [], []
    for k in range(0, 40):
        sc = out / "sweep.txt"
        sc.write_text(f"# frames 200\nAT 20 82\nAT {20 + k} 83\nAT {40 + k} 82\n")
        subprocess.run([str(STORYBOARD), str(rom), str(sc), "200", str(out / "sweep")], check=True, capture_output=True)
        c2 = frames_of((out / "sweep" / "ram.bin").read_bytes())
        t0 = next(f for f in range(20 + k, 200) if c2(f, 0x03))
        # In sixteenths, as Mario keeps it, with the fraction ours has beside.
        speed = round((c2(t0 - 1, 0x13) * 256 + c2(t0 - 1, 0x12)) * 16 / 256, 2)
        (strong if c2(t0, 0x17) == 0xFB else light).append(speed)
    return {"walk_top": walk_top, "run_top": run_top, "run_after": after, "walk_jump": jumps[0], "run_jump": jumps[1],
            "light_max": max(light), "strong_min": min(strong)}


def mario_run(dirpath: Path):
    """Mario's side, counts only: its tops (speed at $0057 in sixteenths), the
    walking jump of the first run and the running jump of `runb`, and the
    sweep of jumps at running speeds kept as tiers.json."""
    def load(d):
        r = (dirpath / d / "ram.bin").read_bytes()
        return frames_of(r), (dirpath / d / "pad.bin").read_bytes()
    c, p = load("board")
    right = next(f for f in range(500, len(p)) if p[f] & 0x80)
    walk_top = max(c(f, 0x57) for f in range(right, right + 120)) / 16
    press = next(f for f in range(right, len(p)) if p[f] & 1)
    walk = jump_of(c, press, press + 120, 0x1D, 0xCE, 0x9F, 0x433, lambda f, p=p: p[f] & 1)
    c2, p2 = load("runb")
    run_from = next(f for f in range(500, len(p2)) if p2[f] & 0x02)
    run_top = max(c2(f, 0x57) for f in range(run_from, run_from + 80))
    after = next(f for f in range(run_from, run_from + 80) if c2(f, 0x57) == run_top) - run_from
    press2 = next(f for f in range(run_from, len(p2)) if p2[f] & 1)
    run = jump_of(c2, press2, press2 + 120, 0x1D, 0xCE, 0x9F, 0x433, lambda f, p=p2: p[f] & 1)
    tiers = json.loads((dirpath / "tiers.json").read_text())
    return {"game": "Super Mario Bros.", "walk_top": walk_top, "run_top": run_top / 16, "run_after": after, "walk_jump": walk, "run_jump": run,
            "light_max": tiers["light"]["speed_max"], "strong_min": tiers["strong"]["speed_min"]}


def status_measures(dirpath: Path, start: int, end: int):
    """A bar that stays still over a level that scrolls, from the logs of
    scroll pairs and picture-memory writes between two frames: where the
    picture is split, what the bar's scroll is, and what of the bar is
    rewritten and how often."""
    from collections import Counter
    split, blank = Counter(), Counter()
    for line in (dirpath / "scroll.txt").read_text().splitlines():
        f, at, x, y = map(int, line.split())
        if start <= f < end:
            (split if at < 240 else blank)[at if at < 240 else (x, y)] += 1
    bar = Counter()
    times = {}
    for line in (dirpath / "vram.txt").read_text().splitlines():
        f, a, n, st = line.split()
        f, a, n = int(f), int(a, 16), int(n)
        if start <= f < end and 0x2000 <= a < 0x2080:
            bar[(a, n)] += 1
            times.setdefault((a, n), []).append(f)
    (a, n), count = bar.most_common(1)[0]
    fs = times[(a, n)]
    return {
        "split_line": split.most_common(1)[0][0], "split_frames": split.most_common(1)[0][1], "frames": end - start,
        "bar_scroll": list(blank.most_common(1)[0][0]),
        "timer": {"row": (a & 0x3FF) // 32, "column": a & 31, "tiles": n, "writes": count, "every": sorted({y - x for x, y in zip(fs, fs[1:])})},
        "other_bar_writes": sum(bar.values()) - count,
    }


def sound_measures(dirpath: Path, after: int, end: int):
    """The shape of a jump sound sharing the music's channel, from the log
    of every write to the sound chip: never the values, only which
    channel, when, how many settings with the pitch sweep on, and when the
    music writes to the channel again."""
    pad = (dirpath / "pad.bin").read_bytes()
    press = next(f for f in range(max(after, 1), end) if pad[f] & 1 and not pad[f - 1] & 1)
    writes = [tuple(l.split()) for l in (dirpath / "apu.txt").read_text().splitlines()]
    writes = [(int(f), r, int(v)) for f, r, v in writes]
    before = sum(1 for f, r, v in writes if press - 60 <= f < press and r in ("00", "01", "02", "03"))
    sweep_on = [f for f, r, v in writes if press <= f < press + 60 and r == "01" and v & 0x80]
    if not sweep_on:
        return {"music_before": before, "sweep_settings": 0}
    back = next((f for f, r, v in writes if f > sweep_on[-1] and f < press + 120 and r == "01" and not v & 0x80), None)
    return {
        "music_before": before, "starts": sweep_on[0] - press, "sweep_settings": len(sweep_on),
        "sweep_frames": sorted({f - sweep_on[0] for f in sweep_on}),
        "music_back": None if back is None else back - sweep_on[0],
    }


def pause_measures(dirpath: Path, x: int, wait: int, after: int, chime: str, music: set, grabs: tuple):
    """A pause, from a run that holds Right throughout and presses Start
    (pause), Start again too soon, A, then Start (unpause): which presses
    stopped or started the world (the position at x moving or not), how
    long Start was ignored (the game's own count at `wait`), whether
    anything was drawn while paused (writes to the picture; two pictures
    taken while paused, compared byte for byte), and from the sound chip's
    log the shape of the sound: everything cut on the press, the notes of
    the chime on the channel whose period-high register is `chime`, and
    the frames from the unpause to the music's first write (to `music`)."""
    ram = (dirpath / "ram.bin").read_bytes()
    pad = (dirpath / "pad.bin").read_bytes()
    cell = frames_of(ram)
    moving = lambda f: cell(f, x) != cell(f - 1, x)
    starts = [f for f in range(max(after, 1), len(pad)) if pad[f] & 0x08 and not pad[f - 1] & 0x08]
    took = [f for f in starts if moving(f - 1) != moving(f + 3)]
    if len(took) != 2:
        sys.exit(f"board-lessons: expected one pause and one unpause in {dirpath}, saw {len(took)} of {len(starts)} presses take effect")
    on, off = took
    ignored = [f - on for f in starts if f not in took and on < f < off]
    stops = next(f for f in range(on, off) if not moving(f)) - on
    starts = next(f for f in range(off, len(pad)) if moving(f)) - off
    held = all(not moving(f) for f in range(on + stops, off + starts))
    count = next(f for f in range(on, off) if cell(f, wait) == 0) - on
    a = next((f for f in range(on + 1, off) if pad[f] & 0x01 and not pad[f - 1] & 0x01), None)
    vram = sum(1 for l in (dirpath / "vram.txt").read_text().splitlines() if on + 1 <= int(l.split()[0]) <= off)
    same = (dirpath / f"frame-{grabs[0]:05}.ppm").read_bytes() == (dirpath / f"frame-{grabs[1]:05}.ppm").read_bytes()
    writes = [l.split() for l in (dirpath / "apu.txt").read_text().splitlines()]
    writes = [(int(f), r, int(v)) for f, r, v in writes]
    cut = any(f in (on, on + 1) and r == "15" and v == 0 for f, r, v in writes)
    notes = sorted({f for f, r, v in writes if r == chime and on <= f < on + count})
    back = next((f for f, r, v in writes if f > off and r in music), None)
    return {
        "ignored_after": ignored, "a_pressed": a is not None, "stops": stops, "starts": starts, "held": held, "wait": count,
        "drawn": vram, "same_picture": same, "cut": cut,
        "chime_notes": len(notes), "chime_every": sorted({b - a for a, b in zip(notes, notes[1:])}),
        "music_back": None if back is None else back - off,
    }


def title_measures(dirpath: Path, x: int, after: int):
    """A title screen, from a run's logs alone: what it finds of these
    (a run need not hold them all). The title's drawing: the frames from
    its first write to the picture to its last (gaps of a few frames
    allowed), the whole name tables cleared on the way and the tiles
    written besides. The cursor: what a Select writes to the picture in
    the frames after it. The countdown: frames from a Select to the demo,
    the first frame the position at x moves with nothing held on the pad.
    The demo: frames until the title is drawn again, and whether the
    scroll moved meanwhile (the title scrolling away). And the frames
    from Start to the next write, during the demo and on the title."""
    ram = (dirpath / "ram.bin").read_bytes()
    pad = (dirpath / "pad.bin").read_bytes()
    cell = frames_of(ram)
    n = len(pad)
    nt = {}
    last = None
    for l in (dirpath / "vram.txt").read_text().splitlines():
        f, a, c, step = int(l.split()[0]), int(l.split()[1], 16), int(l.split()[2]), int(l.split()[3])
        if not 0x2000 <= a < 0x3000:
            continue
        # A run the log split where a frame began (a clear with the picture
        # off outlasts a blank) is one run, counted at the frame it began.
        if last and step == 1 == last[3] and a == last[1] + last[2] and f - last[4] <= 1:
            w = nt[last[0]]
            w[-1] = (w[-1][0] + c, 1)
            last = (last[0], last[1], last[2] + c, 1, f)
            continue
        nt.setdefault(f, []).append((c, step))
        last = (f, a, c, step, f)
    press = lambda bit: [f for f in range(max(after, 1), n) if pad[f] & bit and not pad[f - 1] & bit]
    selects, starts = press(0x04), press(0x08)

    def drawing(first):
        """The run of frames with writes from `first`, gaps of up to 4."""
        f = min((g for g in nt if g >= first), default=None)
        if f is None:
            return None
        end = f
        while any(g in nt for g in range(end + 1, end + 5)):
            end = next(g for g in range(end + 1, end + 5) if g in nt)
        return f, end

    def demo_from(f0):
        # The first move of at least three in 16 frames, with nothing held:
        # being placed once is not a demo.
        moved = lambda g: cell(g, x) != cell(g - 1, x) and not pad[g] & 0xC3
        return next((f for f in range(f0 + 1, n - 16) if moved(f) and sum(moved(g) for g in range(f, f + 16)) >= 3), None)

    out = {}
    # Each drawing of the title starts by clearing whole name tables.
    clears = sorted(f for f, w in nt.items() if f >= after and any(c >= 1024 for c, _ in w))
    titles = []
    for c in clears:
        if not titles or c > titles[-1][1]:
            titles.append(drawing(c))
    if not titles:
        sys.exit(f"board-lessons: no title drawn in {dirpath}")
    first, end = titles[0]
    writes = [w for f in range(first, end + 1) for w in nt.get(f, [])]
    out["title"] = {"frames": end - first + 1, "cleared": sum(c for c, _ in writes if c >= 1024) // 1024, "tiles": sum(c for c, _ in writes if c < 1024)}
    nexttitle = lambda f: min((t[0] for t in titles if t[0] > f), default=n)
    pressed = lambda lo, hi: any(lo < q <= hi for q in selects + starts)
    # A demo that ran to its end by itself: from its first move to the next drawing.
    for t0, t1 in titles:
        d = demo_from(t1)
        if d is not None and d < nexttitle(t1) < n and not pressed(d, nexttitle(t1)) and "demo" not in out:
            scroll = [int(l.split()[2]) for l in (dirpath / "scroll.txt").read_text().splitlines() if d <= int(l.split()[0]) < nexttitle(t1)]
            out["demo"] = {"frames": nexttitle(t1) - d, "scrolled": max(scroll, default=0) > 0}
    for p in selects:
        d = demo_from(p)
        w = [w for f in range(p, p + 4) for w in nt.get(f, [])]
        if w and "cursor" not in out:
            out["cursor"] = {"tiles": sum(c for c, _ in w), "step": max(s for _, s in w)}
        # A Select with nothing pressed after it before the demo: the countdown.
        if d is not None and d < nexttitle(p) and not pressed(p, d) and "countdown" not in out:
            out["countdown"] = d - p
    # Each demo, from its first move to the next drawing of the title.
    demos = [(d, nexttitle(t1)) for t0, t1 in titles if (d := demo_from(t1)) is not None and d < nexttitle(t1)]
    for p in starts:
        nxt = min((g for g in nt if g > p), default=None)
        if nxt is not None:
            out.setdefault("start_demo" if any(d <= p < e for d, e in demos) else "start_title", nxt - p)
    return out


def items_measures(dirpath: Path, after: int):
    """An item screen the picture slides away to show, from a run that
    presses Start (open), Start again while it slides, and Start (close).
    From the scroll log, the frame's last pair (the one the picture is
    drawn with): how many pixels a frame and how far it slides, frames
    from each Start to the slide's end, whether the Start in between
    changed the step, and whether any pair was written during the picture
    (a split). From the writes to the picture: the full rows written into
    the lower name table ($2800 to $2BBF) while it opened and while it
    closed, whether they went from the bottom up, and how many frames
    apart."""
    pad = (dirpath / "pad.bin").read_bytes()
    n = len(pad)
    starts = [f for f in range(max(after, 1), n) if pad[f] & 0x08 and not pad[f - 1] & 0x08]
    if len(starts) != 3:
        sys.exit(f"board-lessons: expected three presses of Start in {dirpath}, saw {len(starts)}")
    opened, between, closed = starts
    y, split = {}, False
    for l in (dirpath / "scroll.txt").read_text().splitlines():
        f, line, _, v = map(int, l.split())
        y[f] = v
        if opened <= f and line < 240:
            split = True
    at = lambda f: y.get(f, y.get(max((g for g in y if g < f), default=0), 0))
    held = at(closed - 1)
    open_end = next(f for f in range(opened, closed) if at(f) == held)
    back = next(f for f in range(closed, n) if at(f) == 0)
    steps = [abs(at(f) - at(f - 1)) for f in range(opened + 1, open_end + 1) if at(f) != at(f - 1) and at(f - 1) != 0]
    close_steps = [abs(at(f) - at(f - 1)) for f in range(closed + 1, back) if at(f) != at(f - 1)]
    rows = {}
    for l in (dirpath / "vram.txt").read_text().splitlines():
        f, a, c, step = l.split()
        f, a = int(f), int(a, 16)
        if 0x2800 <= a < 0x2BC0 and c == "32" and step == "1" and a % 32 == 0:
            rows.setdefault("open" if opened <= f <= open_end else "close" if closed <= f <= back else "other", []).append((f, a))
    opening = rows.get("open", [])
    gaps = [g - f for (f, _), (g, _) in zip(opening, opening[1:])]
    return {
        "step": max(set(steps), key=steps.count), "travel": 240 - held,
        "open_frames": open_end - opened, "close_frames": back - closed,
        "close_step": max(set(close_steps), key=close_steps.count),
        # The Start pressed mid-slide: the slide went on up the same way.
        "ignored": between < open_end and all(at(f - 1) - at(f) in (0, max(set(steps), key=steps.count)) for f in range(between, open_end + 1)),
        "split": split,
        "rows": len(opening), "bottom_up": all(b < a for (_, a), (_, b) in zip(opening, opening[1:])),
        "every": max(set(gaps), key=gaps.count) if gaps else None,
        "rows_closing": len(rows.get("close", [])),
    }


def menu_measures(dirpath: Path, cell: int, after: int):
    """Typing a name from a grid, from a run that presses Right, Right,
    Down, A, Left, A, Up, A and then holds Left: the cell under the cursor
    (the game's own byte at `cell`), the frames from each press to the
    move, the moves while the direction is held (the wait, then the
    beat), what a step down adds (the grid's width), where a step left
    from the first cell goes (the grid's size), the writes to the picture
    after each A, whether the cursor's sprites are drawn behind the
    background and how they blink, and a write to a sound channel
    (anything but $4015 and $4017) within two frames of each move."""
    ram = (dirpath / "ram.bin").read_bytes()
    pad = (dirpath / "pad.bin").read_bytes()
    c = frames_of(ram)
    n = len(pad)
    dirs = 0xF0
    presses = [f for f in range(max(after, 1), n) if pad[f] & dirs and not pad[f - 1] & dirs]
    types = [f for f in range(max(after, 1), n) if pad[f] & 0x01 and not pad[f - 1] & 0x01]
    moves = [f for f in range(max(after, 1), n) if c(f, cell) != c(f - 1, cell)]
    if len(presses) < 5 or len(types) < 3:
        sys.exit(f"board-lessons: {dirpath} does not press the directions and A the menu run needs")
    first = [next(m for m in moves if m >= p) - p for p in presses]
    # The held press: the last, held for the longest.
    hp = presses[-1]
    release = next((f for f in range(hp, n) if not pad[f] & dirs), n)
    held = [m for m in moves if hp <= m < release]
    gaps = [b - a for a, b in zip(held, held[1:])]
    down = next(p for p in presses if pad[p] & 0x20)
    dm = next(m for m in moves if m >= down)
    wrap = next((m for m in moves if c(m - 1, cell) == 0 and c(m, cell) > 1), None)
    nt = {}
    for l in (dirpath / "vram.txt").read_text().splitlines():
        f, a, cnt, _ = l.split()
        if 0x2000 <= int(a, 16) < 0x3000:
            nt.setdefault(int(f), []).append(int(cnt))
    typed = []
    for p in types:
        w = next((f for f in range(p, p + 4) if f in nt), None)
        typed.append(None if w is None else (w - p, sum(nt[w])))
    # The cursor's sprites: those drawn behind the background (attribute bit 5).
    behind = lambda f: sum(1 for i in range(64) if ram[f * 2048 + 0x200 + i * 4] < 0xEF and ram[f * 2048 + 0x202 + i * 4] & 0x20)
    runs, cur, k = [], behind(after + 1) > 0, 0
    for f in range(after + 1, n):
        v = behind(f) > 0
        if v == cur:
            k += 1
        else:
            runs.append((cur, k))
            cur, k = v, 1
    whole = runs[1:]
    on = [k for v, k in whole if v]
    off = [k for v, k in whole if not v]
    sound = {}
    for l in (dirpath / "apu.txt").read_text().splitlines():
        f, r, _ = l.split()
        if r not in ("15", "17"):
            sound.setdefault(int(f), set()).add(r)
    clicks = sum(1 for m in moves if any(f in sound for f in range(m, m + 3)))
    return {
        "after_press": sorted(set(first)), "wait": gaps[0] if gaps else None,
        "every": max(set(gaps[1:]), key=gaps[1:].count) if len(gaps) > 1 else None,
        "width": c(dm, cell) - c(dm - 1, cell), "wraps_to": None if wrap is None else c(wrap, cell),
        "typed": [t for t in typed if t], "behind": bool(on),
        "blink": [max(set(on), key=on.count) if on else 0, max(set(off), key=off.count) if off else 0],
        "moves": len(moves), "clicks": clicks,
    }


def splash_measures(dirpath: Path, after: int):
    """A splash screen, from a run that touches nothing: the palette
    writes of a few colours (the turning colours) and how many frames
    apart; the fade, the first run of whole-palette writes (32) each
    within 10 frames of the last, its steps and frames; the frames shown
    between the first turn and the fade; every tile written meanwhile;
    and the falling column: in the column of sprites whose heights change
    most, the most common step down a frame and how many frames apart it
    jumps back up."""
    ram = (dirpath / "ram.bin").read_bytes()
    n = len(ram) // 2048
    small, whole, tiles = [], [], {}
    for l in (dirpath / "vram.txt").read_text().splitlines():
        f, a, c, _ = l.split()
        f, a, c = int(f), int(a, 16), int(c)
        if f <= after:
            continue
        if 0x3F00 <= a < 0x4000:
            (whole if c == 32 else small).append(f)
        else:
            tiles[f] = tiles.get(f, 0) + c
    if not small:
        sys.exit(f"board-lessons: no colours turned in {dirpath}")
    turn = small[0]
    fade = []
    for f in whole:
        if f < turn:
            continue
        if fade and f - fade[-1] > 10:
            if len(fade) >= 3:
                break
            fade = []
        fade.append(f)
    gaps = [b - a for a, b in zip(small, small[1:]) if b < fade[0]]
    def column(f, x):
        return sorted(ram[f * 2048 + 0x200 + i * 4] for i in range(64) if ram[f * 2048 + 0x200 + i * 4] < 0xEF and ram[f * 2048 + 0x203 + i * 4] == x)
    moves = {}
    for f in range(turn, fade[0] - 1):
        xs = {ram[f * 2048 + 0x203 + i * 4] for i in range(64) if ram[f * 2048 + 0x200 + i * 4] < 0xEF}
        for x in xs:
            a, b = column(f, x), column(f + 1, x)
            if len(a) == len(b):
                d = [q - p for p, q in zip(a, b) if q != p]
                if d:
                    moves.setdefault(x, []).append((f, d))
    x = max(moves, key=lambda k: len(moves[k]))
    down = [v for _, d in moves[x] for v in d if v > 0]
    back = [f for f, d in moves[x] if any(v < 0 for v in d)]
    loops = [b - a for a, b in zip(back, back[1:])]
    mode = lambda v: max(set(v), key=v.count) if v else None
    return {
        "shown": fade[0] - turn, "tiles": sum(c for f, c in tiles.items() if turn <= f <= fade[-1]),
        "turn_every": mode(gaps), "turns": len([f for f in small if f < fade[0]]),
        "fade_steps": len(fade), "fade_frames": fade[-1] - fade[0],
        "fall": mode(down), "loop": mode(loops),
    }


def about_measures(dirpath: Path, after: int):
    """Words crawling up the screen, from a run that touches nothing,
    from the first full row (32 tiles) written after `after` to the run's
    end. From the scroll log, the frame's last pair: the most common step
    down (counted round 240, where the scroll passes into the other
    screen) and frames between steps, the pixels crawled, and whether a
    pair was written during the picture (a split). From the writes to the
    picture: the full rows, how many frames apart and so how many pixels
    of crawl each stands for, the colour bytes (attribute tables), and
    any other tile written."""
    pad = (dirpath / "pad.bin").read_bytes()
    n = len(pad)
    rows, colours, other = [], 0, 0
    writes = []
    for l in (dirpath / "vram.txt").read_text().splitlines():
        f, a, c, step = l.split()
        writes.append((int(f), int(a, 16), int(c), int(step)))
    start = next(f for f, a, c, s in writes if f > after and 0x2000 <= a < 0x3000 and c == 32 and s == 1 and a % 32 == 0)
    for f, a, c, s in writes:
        if f < start or not 0x2000 <= a < 0x3000:
            continue
        if (a & 0x3FF) >= 0x3C0:
            colours += c
        elif c == 32 and s == 1 and a % 32 == 0:
            rows.append(f)
        else:
            other += c
    y, split = {}, False
    for l in (dirpath / "scroll.txt").read_text().splitlines():
        f, line, _, v = map(int, l.split())
        if f >= start:
            y[f] = v
            split = split or line < 240
    fs = sorted(y)
    moves = [(b, (y[b] - y[a]) % 240) for a, b in zip(fs, fs[1:]) if y[b] != y[a]]
    mode = lambda v: max(set(v), key=v.count) if v else None
    step = mode([d for _, d in moves])
    every = mode([b[0] - a[0] for a, b in zip(moves, moves[1:])])
    gap = mode([b - a for a, b in zip(rows, rows[1:])])
    return {
        "step": step, "every": every, "crawled": sum(d for _, d in moves), "split": split,
        "rows": len(rows), "row_every": gap, "row_pixels": None if not (gap and every) else gap * step // every,
        "colours": colours, "other": other, "frames": n - start,
    }


def solid_measures(dirpath: Path, x: int, y: int, vy: int, speed: int, after: int):
    """Solid things, from a run that holds Right, jumps under a block
    (A held) and walks on into a wall: from memory (the game's own bytes
    for x, y, the speed down in whole pixels, and the speed across), the
    touch (the first frame after A that the speed down is no longer
    rising when a frame before it rose by 3 or more, so not the top of a
    jump), how fast it was rising then, the frames from the touch to
    standing where it took off; from the writes to the picture, the
    block's tiles (a write of two tiles and another 32 on, the block's
    two rows) on or just after the touch, and how many frames later the
    same tiles are written again; and at the wall, with Right held, where
    x stops, whether it is ever pushed back a pixel, and how many frames
    apart the speed across is taken away."""
    ram = (dirpath / "ram.bin").read_bytes()
    pad = (dirpath / "pad.bin").read_bytes()
    c = frames_of(ram)
    n = len(pad)
    sv = lambda f: c(f, vy) - 256 if c(f, vy) >= 128 else c(f, vy)
    press = next(f for f in range(max(after, 1), n) if pad[f] & 0x01 and not pad[f - 1] & 0x01)
    ground = c(press - 1, y)
    touch = next(f for f in range(press + 1, n) if sv(f) >= 0 and sv(f - 1) <= -3)
    landed = next(f for f in range(touch, n) if c(f, y) == ground)
    runs = {}
    for l in (dirpath / "vram.txt").read_text().splitlines():
        f, a, k, _ = l.split()
        if k == "2":
            runs.setdefault(int(f), set()).add(int(a, 16))
    hit = next(((f, a) for f in range(touch - 1, touch + 4) for a in sorted(runs.get(f, ())) if a + 32 in runs[f]), None)
    if hit is None:
        sys.exit(f"board-lessons: no block's tiles written near the touch at frame {touch} in {dirpath}")
    again = next(f for f in range(hit[0] + 1, n) if {hit[1], hit[1] + 32} <= runs.get(f, set()))
    # The wall: from the first frame x holds for 30 frames with Right held.
    held = lambda f: pad[f] & 0x80
    stop = next(f for f in range(landed, n - 30) if all(held(g) and c(g, x) == c(f, x) or (held(g) and c(g, x) == c(f, x) - 1) for g in range(f, f + 30)))
    pushing = [f for f in range(stop + 1, n) if held(f)]
    back = any(c(f, x) == c(f - 1, x) - 1 for f in pushing)
    zeroed = [f for f in pushing if c(f, speed) == 0 and c(f - 1, speed) > 0]
    gaps = [b - a for a, b in zip(zeroed, zeroed[1:])]
    return {
        "rising": -sv(touch - 1), "fall_frames": landed - touch,
        "block_after": hit[0] - touch, "block_back": again - hit[0],
        "wall_x": c(stop, x), "pushed_back": back,
        "zeroed": len(zeroed), "zeroed_every": sorted(set(gaps)),
        "pushing_frames": len(pushing),
    }


def walker_measures(dirpath: Path, slots: list, start: int, end: int):
    """Walkers, from memory: `slots` gives each walker's x, whether it is
    walking right, and whether it is there at all, as functions of a frame
    and the run's cells. A turn is a frame its direction differs from the
    frame before, with the walker there on both; two walkers turning on
    the same frame within 24 pixels of each other met, and any other turn
    was at a wall. For each: its
    pace (pixels a move and frames between moves, over stretches with no
    turn), at a wall whether the frame before the turn shows it a pixel
    further on than it settles (a frame spent inside the wall), and at a
    meeting how far the two overlap (16 less the distance between)."""
    ram = (dirpath / "ram.bin").read_bytes()
    c = frames_of(ram)
    n = min(end, len(ram) // 2048)
    turns = []
    for i, s in enumerate(slots):
        for f in range(start + 1, n):
            if s["there"](c, f) and s["there"](c, f - 1) and s["right"](c, f) != s["right"](c, f - 1):
                turns.append((f, i))
    at = {}
    for f, i in turns:
        at.setdefault(f, []).append(i)
    x = lambda i, f: slots[i]["x"](c, f)
    # Two that turn on one frame within 24 pixels of each other met; turns at
    # two walls on one frame are two turns at walls.
    near = lambda f, ii: len(ii) == 2 and abs(x(ii[0], f) - x(ii[1], f)) < 24
    meets = [(f, sorted(ii)) for f, ii in at.items() if near(f, ii)]
    walls = [(f, i) for f, ii in at.items() if not near(f, ii) for i in ii]
    if not meets or not walls:
        sys.exit(f"board-lessons: {dirpath} shows {len(meets)} meetings and {len(walls)} turns at walls; it needs both")
    inside = []
    for f, i in walls:
        before = 1 if slots[i]["right"](c, f - 1) else -1
        inside.append(x(i, f - 1) - x(i, f) == before)
    overlap = sorted({16 - abs(x(a, f) - x(b, f)) for f, (a, b, *_) in meets})
    # Pace: moves of the first walker where neither it nor the frame before turned.
    turned = {f for f, _ in turns}
    moves = [f for f in range(start + 2, n) if slots[0]["there"](c, f) and slots[0]["there"](c, f - 1) and f not in turned and x(0, f) != x(0, f - 1)]
    gaps = [b - a for a, b in zip(moves, moves[1:]) if not any(a <= t <= b for t in turned)]
    steps = [abs(x(0, f) - x(0, f - 1)) for f in moves]
    mode = lambda v: max(set(v), key=v.count) if v else None
    return {
        "pixels": mode(steps), "every": mode(gaps),
        "wall_turns": len(walls), "inside": sorted(set(inside)),
        "meetings": len(meets), "overlap": overlap,
    }


def flicker_measures(dirpath: Path, start: int, end: int, tracked):
    """Sprites on a line, from the sprite memory the game hands the
    picture chip each frame (page $0200, the page both games copy from):
    on each line the chip draws the first eight sprites it finds, so the
    rest are left out. Over the frames start to end: the most sprites on
    one line, how many of them were left out, which sprites (by their x)
    were never drawn in the window, and for the sprites `tracked` picks
    (a function of y, tile, attributes and x) the first sprite-memory slot
    they sit in each frame and the frames before that comes round again
    (1 if it never moves), the shortest cycle held on nine frames in ten."""
    ram = (dirpath / "ram.bin").read_bytes()
    end = min(end, len(ram) // 2048)
    most, left, seen, drawn, slots = 0, 0, set(), set(), []
    for f in range(start, end):
        oam = [tuple(ram[f * 2048 + 0x200 + i * 4: f * 2048 + 0x204 + i * 4]) for i in range(64)]
        lines = {}
        for i, (y, t, a, x) in enumerate(oam):
            if y >= 0xEF:
                continue
            seen.add(x)
            # A sprite with y in memory is drawn on lines y+1 to y+8.
            for line in range(y + 1, y + 9):
                lines.setdefault(line, []).append((i, x))
        for line, on in lines.items():
            most = max(most, len(on))
            left = max(left, len(on) - 8)
            drawn.update(x for _, x in sorted(on)[:8])
        mine = [i for i, s in enumerate(oam) if s[0] < 0xEF and tracked(*s)]
        if mine:
            slots.append(min(mine))
    # The shortest cycle the slots keep on nine frames in ten (a second
    # object with the same tiles coming and going breaks it now and then).
    period = next((p for p in range(1, len(slots) // 2) if sum(slots[k] == slots[k + p] for k in range(len(slots) - p)) >= 0.9 * (len(slots) - p)), None)
    return {"most": most, "left_out": left, "never_drawn": len(seen - drawn), "cycle": period, "frames": end - start}


def lives_measures(dirpath: Path, start: int, x, y, lives, dying, playing):
    """Losing a life, from memory and the writes to the picture, with the
    game's own bytes and states given as functions of the cells and a
    frame: the first touch after `start` (the first frame `dying`), the
    frames the player hangs there (y unchanged), how high the hop goes
    (from the height at the touch to the highest point before the fall),
    the frames from the touch to the life being taken, the frames from
    that to the picture being cleared (a thousand writes or more in a
    frame and the next), the frames from the clear to playing again, and whether play
    begins again at the x the level began at in this run."""
    ram = (dirpath / "ram.bin").read_bytes()
    c = frames_of(ram)
    n = len(ram) // 2048
    begun = next(f for f in range(start, n) if playing(c, f))
    x0 = x(c, begun)
    touch = next(f for f in range(begun, n) if dying(c, f) and not dying(c, f - 1))
    y0 = y(c, touch)
    moved = next(f for f in range(touch + 1, n) if y(c, f) != y0)
    top = min(y(c, f) for f in range(moved, moved + 60) if y(c, f) <= y0)
    taken = next(f for f in range(touch, n) if lives(c, f) != lives(c, touch))
    writes = {}
    for l in (dirpath / "vram.txt").read_text().splitlines():
        f, a, k, _ = l.split()
        if not a.startswith("3F"):
            writes[int(f)] = writes.get(int(f), 0) + int(k)
    # A clear with the picture off can outlast a frame, so two neighbouring
    # frames are counted together.
    cleared = next(f for f in range(taken, n) if writes.get(f, 0) + writes.get(f + 1, 0) >= 1000)
    again = next(f for f in range(cleared, n) if playing(c, f))
    return {
        "hang": moved - touch, "rise": y0 - top, "to_life": taken - touch,
        "clear_after": cleared - taken, "screen": again - cleared,
        "from_start": x(c, again) == x0, "lives": [lives(c, touch), lives(c, taken)],
    }


def hitbox_measures(dirpath: Path, start: int, player, walker, boxes, touched):
    """Boxes inside pictures, from memory, with the pictures and the
    boxes of the player and of a walker given as functions of the cells
    and a frame (each a left, top, right, bottom; right and bottom one
    past the last pixel), and `touched` the frame a touch is first
    known. Each box's distance in from its picture's four edges, the most
    common over the frames from `start` to the touch; and at the first
    touch, how far the two pictures overlapped across and down the frame
    before, how far the boxes did, and how many frames before that the
    pictures had overlapped while the boxes did not."""
    ram = (dirpath / "ram.bin").read_bytes()
    c = frames_of(ram)
    n = len(ram) // 2048
    t = next(f for f in range(start + 1, n) if touched(c, f))
    mode = lambda v: max(set(v), key=v.count)
    def inset(pic, box):
        vals = [tuple(abs(b - p) for p, b in zip(pic(c, f), box(c, f))) for f in range(start, t) if box(c, f)[0] < 240]
        return list(mode(vals))
    ov = lambda a, b: (min(a[2], b[2]) - max(a[0], b[0]), min(a[3], b[3]) - max(a[1], b[1]))
    pb, wb = boxes
    # The frame before the touch is known: the last frame both are where
    # they met. A game that decides as it moves them (ours) shows the boxes
    # not yet overlapping there, with the gap left; one that decides the
    # frame after (Mario's state changes a frame behind) shows them overlapping.
    f = t - 1
    pics = ov(player(c, f), walker(c, f))
    bx = ov(pb(c, f), wb(c, f))
    before = 0
    g = f if min(bx) <= 0 else f - 1
    while g > start and min(ov(player(c, g), walker(c, g))) > 0 and min(ov(pb(c, g), wb(c, g))) <= 0:
        before += 1
        g -= 1
    return {"player": inset(player, pb), "walker": inset(walker, wb), "pictures": list(pics), "boxes": list(bx),
            "before": before, "after": min(bx) > 0, "frame": t}


def mario_hitbox(dirpath: Path):
    """The same off Super Mario Bros., the run with its first hit (board):
    small Mario's picture is the lower half of his thirty-two pixel
    frame, at his screen x ($03AD) and sixteen below his y ($00CE); his
    box is kept at $04AC to $04AF. A Goomba's picture sits eight below
    its y ($00CF+s) at its x less the camera; its box at $04B0+4s. The
    enemy is the slot nearest Mario the frame before his state leaves 8,
    and the touch is that change."""
    ram = (dirpath / "board" / "ram.bin").read_bytes()
    c = frames_of(ram)
    n = len(ram) // 2048
    cam = lambda f: c(f, 0x71A) * 256 + c(f, 0x71C)
    hf = next(g for g in range(600, n) if c(g - 1, 0x0E) == 8 and c(g, 0x0E) != 8 and c(g - 1, 0xCE) < 230)
    there = [s for s in range(5) if c(hf - 1, 0x0F + s)]
    s = min(there, key=lambda s: abs(((c(hf - 1, 0x6E + s) * 256 + c(hf - 1, 0x87 + s)) - cam(hf - 1)) - c(hf - 1, 0x3AD)))
    ex = lambda c, f: ((c(f, 0x6E + s) * 256 + c(f, 0x87 + s)) - cam(f)) & 0xFF
    player = lambda c, f: (c(f, 0x3AD), c(f, 0xCE) + 16, c(f, 0x3AD) + 16, c(f, 0xCE) + 32)
    walker = lambda c, f: (ex(c, f), c(f, 0xCF + s) + 8, ex(c, f) + 16, c(f, 0xCF + s) + 24)
    pbox = lambda c, f: tuple(c(f, 0x4AC + i) for i in range(4))
    wbox = lambda c, f: tuple(c(f, 0x4B0 + 4 * s + i) for i in range(4))
    # Mario's insets over the frames he walks on the ground before the hit, the Goomba's while it walks.
    m = hitbox_measures(dirpath / "board", hf - 60, player, walker, (pbox, wbox), lambda c, f: f == hf)
    return {"game": "Super Mario Bros.", **m}


def coins_measures(dirpath: Path, start: int, coins, score, coin_tiles: set, points_tiles: set):
    """A coin from a block, from memory and the writes to the picture,
    with the game's coin count and score given as functions of the cells
    and a frame: the first frame after `start` the coin count changes (the
    bump), whether the score changed on that frame too, the tiles written
    to the bar (rows 0 to 5 of the first name table) on that frame and the
    one either side, and from sprite memory, for the coin's sprites (by
    tile) and then the points' sprites: the frames each is seen, how far
    it rises from where it first appears, and for the coin how many
    pictures it turns through and how many frames each is shown."""
    ram = (dirpath / "ram.bin").read_bytes()
    c = frames_of(ram)
    n = len(ram) // 2048
    bump = next(f for f in range(start, n) if coins(c, f) != coins(c, f - 1))
    bar = 0
    for l in (dirpath / "vram.txt").read_text().splitlines():
        f, a, k, _ = l.split()
        if bump - 1 <= int(f) <= bump + 1 and 0x2000 <= int(a, 16) < 0x20C0:
            bar += int(k)
    def sprites(f, tiles):
        return [(ram[f * 2048 + 0x200 + i * 4], ram[f * 2048 + 0x201 + i * 4]) for i in range(64)
                if ram[f * 2048 + 0x200 + i * 4] < 0xEF and ram[f * 2048 + 0x201 + i * 4] in tiles]
    def flight(tiles, after):
        seen = [f for f in range(after, min(after + 200, n)) if sprites(f, tiles)]
        if not seen:
            return None
        ys = [min(y for y, _ in sprites(f, tiles)) for f in seen]
        return seen, ys
    cf = flight(coin_tiles, bump - 1)
    if cf is None:
        sys.exit(f"board-lessons: no coin seen after the bump at frame {bump} in {dirpath}")
    seen, ys = cf
    pics = [sprites(f, coin_tiles)[0][1] for f in seen]
    runs = [len(list(g)) for _, g in itertools.groupby(pics)]
    pf = flight(points_tiles, seen[-1])
    return {
        "score_too": score(c, bump) != score(c, bump - 1), "bar_tiles": bar,
        "coin_frames": len(seen), "coin_rise": ys[0] - min(ys), "coin_pictures": len(set(pics)),
        "picture_frames": max(set(runs[1:-1] or runs), key=(runs[1:-1] or runs).count),
        "points_frames": len(pf[0]) if pf else 0, "points_rise": (pf[1][0] - min(pf[1])) if pf else 0,
    }


def mmc1_mirroring(path: Path):
    """An MMC1 board's mirroring as the game set it, frame by frame, from the
    log of writes into the cartridge's range: five writes of one bit each
    make a register, the address of the fifth picks which (the control
    register at $8000 to $9FFF holds the mirroring in its low two bits),
    and a write with its top bit set starts over."""
    names = {0: "one screen", 1: "one screen", 2: "vertical", 3: "horizontal"}
    out, shift, n = [], 0, 0
    for line in path.read_text().splitlines():
        f, a, v = line.split()
        f, a, v = int(f), int(a, 16), int(v)
        if v & 0x80:
            shift, n = 0, 0
            continue
        shift |= (v & 1) << n
        n += 1
        if n == 5:
            if (a >> 13) & 3 == 0:
                m = names[shift & 3]
                if not out or out[-1][1] != m:
                    out.append((f, m))
            shift, n = 0, 0
    return out


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
    # The groups and their order: every lesson in exactly one, and no name
    # that is not a lesson. The record keeps the lessons in this order.
    topics = json.loads((ROOT / "lessons" / "topics.json").read_text())["topics"]
    dirs = {p.name: p for p in (ROOT / "lessons").iterdir() if (p / "lesson.json").exists()}
    listed = [k for t in topics for k in t["lessons"]]
    if sorted(listed) != sorted(dirs):
        twice = sorted({k for k in listed if listed.count(k) > 1})
        sys.exit(f"board-lessons: lessons/topics.json and lessons/ disagree: in no group {sorted(set(dirs) - set(listed))}, "
                 f"in two {twice}, not a lesson {sorted(set(listed) - set(dirs))}")
    if any(not t["lessons"] for t in topics):
        sys.exit("board-lessons: a group in lessons/topics.json has no lessons")
    for d in (dirs[k] for k in listed):
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
        elif kind == "run":
            measures = run_measures(cell, (run / "pad.bin").read_bytes(), b["rom"], run, meta)
            against = mario_run(Path(compare[name])) if name in compare else prev.get("against")
        elif kind == "status":
            measures = status_measures(run, meta["walk_from"], meta["frames"])
            # Mario: the private run with its writes logged (snd), from Right to the end.
            against = ({"game": "Super Mario Bros.", **status_measures(Path(compare[name]) / "snd", 520, 700)} if name in compare else prev.get("against"))
        elif kind == "sound":
            measures = sound_measures(run, meta["walk_from"], meta["frames"])
            against = ({"game": "Super Mario Bros.", **sound_measures(Path(compare[name]) / "snd", 520, 700)} if name in compare else prev.get("against"))
        elif kind == "pause":
            h = lambda a: int(a[1:], 16)
            mm = meta["memory"]
            # Ours: the tune on the first square, the chime on the second.
            measures = pause_measures(run, h(mm["x"]), h(mm["wait"]), meta["walk_from"], "07", {"00", "01", "02", "03"}, tuple(meta["grabs"][1:3]))
            # Mario: x on screen at $0086, the wait at $0777; its chime on the
            # first square, its music back on the second and the triangle.
            against = ({"game": "Super Mario Bros.", **pause_measures(Path(compare[name]) / "pause2", 0x86, 0x777, 520, "03", {"04", "05", "06", "07", "08", "0A", "0B"}, (650, 710))} if name in compare else prev.get("against"))
        elif kind == "title":
            measures = title_measures(run, int(meta["memory"]["x"][1:], 16), 0)
            if name in compare:
                # Mario: three private runs from its cartridge's picker (Start at
                # frame 200): untouched, one late Select and Start in the demo,
                # Select three times and Start. x on screen at $0086. What one
                # run does not hold another does; the first found is kept.
                against = {"game": "Super Mario Bros."}
                for r in ("idle", "late", "title"):
                    for k, v in title_measures(Path(compare[name]) / r, 0x86, 205).items():
                        against.setdefault(k, v)
            else:
                against = prev.get("against")
        elif kind == "items":
            measures = items_measures(run, meta["walk_from"])
            # Ours is soldered: the board's mirroring cannot change.
            measures["mirroring"] = {"fixed": True, "changes": 0}
            if name in compare:
                # Zelda: a private run into the first room (its menus pass by
                # frame 700) that opens, presses Start mid-slide, and closes.
                dd = Path(compare[name]) / "inv2"
                pad = (dd / "pad.bin").read_bytes()
                against = {"game": "The Legend of Zelda", **items_measures(dd, 700)}
                # Changes of mirroring from the Start that opens it to the run's end.
                first = next(f for f in range(701, len(pad)) if pad[f] & 0x08 and not pad[f - 1] & 0x08)
                changes = [f for f, _ in mmc1_mirroring(dd / "mapper.txt") if f >= first]
                against["mirroring"] = {"fixed": False, "changes": len(changes)}
            else:
                against = prev.get("against")
        elif kind == "menu":
            measures = menu_measures(run, int(meta["memory"]["cell"][1:], 16), 0)
            # Zelda: a private run to its register screen (there by frame 300),
            # the cell under the cursor at $041F.
            against = ({"game": "The Legend of Zelda", **menu_measures(Path(compare[name]) / "name", 0x41F, 300)} if name in compare else prev.get("against"))
        elif kind == "splash":
            measures = splash_measures(run, 0)
            # Zelda: a private run from power on, untouched; its title is drawn by frame 60.
            against = ({"game": "The Legend of Zelda", **splash_measures(Path(compare[name]) / "idle", 60)} if name in compare else prev.get("against"))
        elif kind == "about":
            measures = about_measures(run, meta["walk_from"])
            # Zelda: the untouched private run; its story is drawn at 984 and
            # writes its first new row at 1722.
            against = ({"game": "The Legend of Zelda", **about_measures(Path(compare[name]) / "idle", 1000)} if name in compare else prev.get("against"))
        elif kind == "solid":
            h = lambda a: int(a[1:], 16)
            mm = meta["memory"]
            measures = solid_measures(run, h(mm["x"]), h(mm["y"]), h(mm["vy"]), h(mm["speed"]), meta["walk_from"])
            # Mario: a private run that bumps the first block of 1-1, stomps
            # the first Goomba and walks into the first pipe; x on its page
            # at $0086, y at $00CE, the speed down at $009F, across at $0057.
            against = ({"game": "Super Mario Bros.", **solid_measures(Path(compare[name]) / "wall704", 0x86, 0xCE, 0x9F, 0x57, 600)} if name in compare else prev.get("against"))
        elif kind == "walkers":
            h = lambda a: int(a[1:], 16)
            mm = meta["memory"]
            ours = [{"x": (lambda c, f, a=h(xa): c(f, a)), "right": (lambda c, f, a=h(sa): c(f, a) == 1), "there": (lambda c, f: True)} for xa, sa in zip(mm["x"], mm["step"])]
            measures = walker_measures(run, ours, 10, meta["frames"])
            # Mario: the private run that runs on past the second pipe; enemy
            # slots 0 to 4, x on its page at $006E+s/$0087+s, walking right
            # when $0046+s is 1, there when $000F+s is set and $0016+s is 6
            # (a Goomba); up to frame 1400, before Mario is caught.
            goombas = [{"x": (lambda c, f, s=s: c(f, 0x6E + s) * 256 + c(f, 0x87 + s)), "right": (lambda c, f, s=s: c(f, 0x46 + s) == 1),
                        "there": (lambda c, f, s=s: c(f, 0x0F + s) != 0 and c(f, 0x16 + s) == 6)} for s in range(5)]
            against = ({"game": "Super Mario Bros.", **walker_measures(Path(compare[name]) / "hop50", goombas, 830, 1400)} if name in compare else prev.get("against"))
        elif kind == "flicker":
            # Ours: the order kept until Select (frame 120), turning after.
            first = lambda y, t, a, x: t == 6 and x == 0x14
            measures = {"kept": flicker_measures(run, 10, 120, first), "turned": flicker_measures(run, 130, meta["frames"], first)}
            # Mario: the run past the second pipe, before he is caught; the
            # Goombas' sprites are tiles $70 to $73.
            goomba = lambda y, t, a, x: 0x70 <= t <= 0x73
            against = ({"game": "Super Mario Bros.", **flicker_measures(Path(compare[name]) / "hop50", 830, 1400, goomba)} if name in compare else prev.get("against"))
        elif kind == "lives":
            h = lambda a: int(a[1:], 16)
            mm = meta["memory"]
            measures = lives_measures(run, 10, lambda c, f: c(f, h(mm["x"])), lambda c, f: c(f, h(mm["y"])), lambda c, f: c(f, h(mm["lives"])),
                                      lambda c, f: c(f, h(mm["round"])) == 1, lambda c, f: c(f, h(mm["round"])) == 0 and c(f, h(mm["lives"])) > 0)
            # Mario: the private run that runs straight into the first Goomba
            # (hop): dying is state 11 at $000E, playing is the level's task
            # ($0772 = 3) with Mario walking (state 8), lives at $075A.
            against = ({"game": "Super Mario Bros.", **lives_measures(Path(compare[name]) / "hop", 400, lambda c, f: c(f, 0x6D) * 256 + c(f, 0x86), lambda c, f: c(f, 0xCE),
                                                                    lambda c, f: c(f, 0x75A), lambda c, f: c(f, 0x0E) == 11, lambda c, f: c(f, 0x772) == 3 and c(f, 0x0E) == 8)}
                       if name in compare else prev.get("against"))
        elif kind == "hitbox":
            h = lambda a: int(a[1:], 16)
            mm = meta["memory"]
            pic = lambda xa, ya: (lambda c, f: (c(f, xa), c(f, ya), c(f, xa) + 16, c(f, ya) + 16))
            box = lambda addrs: (lambda c, f: tuple(c(f, h(a)) for a in addrs))
            measures = hitbox_measures(run, meta["walk_from"], pic(h(mm["x"]), h(mm["y"])), pic(h(mm["walker_x"]), h(mm["walker_y"])),
                                       (box(mm["box"]), box(mm["walker_box"])), lambda c, f: c(f, h(mm["touches"])) != c(f - 1, h(mm["touches"])))
            against = mario_hitbox(Path(compare[name])) if name in compare else prev.get("against")
        elif kind == "coins":
            h = lambda a: int(a[1:], 16)
            mm = meta["memory"]
            lo, hi = mm["coin_tiles"]
            measures = coins_measures(run, meta["walk_from"], lambda c, f: tuple(c(f, h(a)) for a in mm["coins"]), lambda c, f: tuple(c(f, h(a)) for a in mm["score"]),
                                      set(range(lo, hi + 1)), set(mm["points_tiles"]))
            # Mario: the same private run as the solid lesson's (the first ?
            # block of 1-1); coins at $075E, the score's digits at $07DD to
            # $07E2, the coin's sprites tiles $60 to $63, the points' $F7 and $FB.
            against = ({"game": "Super Mario Bros.", **coins_measures(Path(compare[name]) / "wall704", 600, lambda c, f: c(f, 0x75E), lambda c, f: tuple(c(f, 0x7DD + i) for i in range(6)),
                                                                    {0x60, 0x61, 0x62, 0x63}, {0xF7, 0xFB})} if name in compare else prev.get("against"))
        elif kind == "stomp":
            measures = stomp_measures(cell, meta["frames"], meta["memory"], meta["walk_from"])
            # What our own autopsy calls the routine that tells the two apart, and
            # whether it is the one written as `touch` (its address in the listing).
            _, model = autopsy_of(b["rom"], d / meta["script"], meta["frames"], run)
            rendered = build.listing("render", b["listing"])
            at = next(int(l.split()[0][1:], 16) for i, l in enumerate(rendered.splitlines()) if l.startswith("$") and rendered.splitlines()[i - 1].strip() == "touch:")
            named = [(x, i["evidence"]) for x in model["routines"] for i in x["is"] if i["pattern"] == "position-compare"]
            measures["compare"] = [{"name": x["name"], "is_touch": x["addr"] == at, "x": ev.get("x", ""), "y": ev.get("y", "")} for x, ev in named]
            against = mario_touches(Path(compare[name])) if name in compare else prev.get("against")
        elif kind == "screens":
            h = lambda a: int(a[1:], 16)
            rep, model = autopsy_of(b["rom"], d / meta["script"], meta["frames"], run)
            measures = screens_measures(cell, (run / "pad.bin").read_bytes(), rep, model, h(meta["memory"]["screen"]), meta["frames"])
            if name in compare:
                dd = Path(compare[name])
                mr = (dd / "board" / "ram.bin").read_bytes()
                # Mario: the screen at $0770; its run's report and model are the private ones beside it.
                against = {"game": "Super Mario Bros.", **screens_measures(frames_of(mr), (dd / "board" / "pad.bin").read_bytes(), json.loads((dd / "report.json").read_text()), json.loads((dd / "model.json").read_text()), 0x770, len(mr) // 2048, after=15)}
            else:
                against = prev.get("against")
        elif kind == "rooms":
            h = lambda a: int(a[1:], 16)
            mm = meta["memory"]
            measures = rooms_measures(cell, run / "vram.txt", h(mm["room"]), h(mm["scroll"][0]), meta["frames"], after=meta["walk_from"])
            measures["up"] = rooms_up(cell, run / "vram.txt", h(mm["room"]), meta["frames"], meta["up_from"])
            # Ours is soldered: the board's mirroring cannot change.
            measures["mirroring"] = {"playing": meta["mirroring"], "fixed": True}
            if name in compare:
                other = Path(compare[name])
                zr = (other / "vr" / "ram.bin").read_bytes()
                # Zelda: the room at $00EB, the slide's scroll at $00FD; the first walk out is past the menus.
                against = {"game": "The Legend of Zelda", **rooms_measures(frames_of(zr), other / "vr" / "vram.txt", 0xEB, 0xFD, len(zr) // 2048, after=700)}
                # A second run that walks up out of the first room: the room's number before and after.
                # A second run that walks up out of the first room, its writes logged.
                if (other / "upvr" / "ram.bin").exists():
                    ur = (other / "upvr" / "ram.bin").read_bytes()
                    against["up"] = rooms_up(frames_of(ur), other / "upvr" / "vram.txt", 0xEB, len(ur) // 2048, 700)
            else:
                against = prev.get("against")
        else:
            mm = meta["memory"]
            h = lambda a: int(a[1:], 16)
            measures = scroll_measures(cell, run / "vram.txt", h(mm["camera"][0]), h(mm["camera"][1]), h(mm["countdown"]), meta["frames"])
            if name in compare:
                other = Path(compare[name])
                mr = (other / "run" / "ram.bin").read_bytes()
                # Mario: the camera at $071C (pixel) and $071A (page), the countdown at $071F.
                against = {"game": "Super Mario Bros.", **scroll_measures(frames_of(mr), other / "vr" / "vram.txt", 0x71C, 0x71A, 0x71F, min(len(mr) // 2048, 1700))}
            else:
                against = prev.get("against")
        # Every lesson through our own autopsy: the patterns its rules name
        # in it, so the patterns page can point at a cartridge of ours.
        if not (run / "autopsy.s").exists() or kind not in ("screens", "stomp"):
            autopsy_of(b["rom"], d / meta["script"], meta["frames"], run)
        found = {}
        model_all = json.loads(build.listing("model", run / "autopsy.s"))
        # Routines and the loops a rule named inside them (where it waits).
        for x in model_all["routines"] + model_all.get("loops", []):
            for i in x["is"]:
                found[i["pattern"]] = found.get(i["pattern"], 0) + 1
        lessons.append({
            "patterns": dict(sorted(found.items())),
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
        "topics": [{"key": t["key"], "title": t["title"], "lessons": t["lessons"]} for t in topics],
        "lessons": lessons,
    }, indent=1) + "\n")
    print(f"board-lessons: {len(lessons)} lesson(s); {OUT.relative_to(ROOT)} written ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
