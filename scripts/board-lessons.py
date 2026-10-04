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
        "lessons": lessons,
    }, indent=1) + "\n")
    print(f"board-lessons: {len(lessons)} lesson(s); {OUT.relative_to(ROOT)} written ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
