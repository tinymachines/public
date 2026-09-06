#!/usr/bin/env python3
"""Board the NES console arc's chip repo (2a03) into data/nes.json.

    python3 scripts/board-nes.py --board [--repo PATH]

The discipline is board-ntsc's: refuse a dirty checkout, run the
repository's own gates at the recorded commit (the full suite with the
netlist and goldens REQUIRED, then the MUTATE=1 run which must go red),
and only then extract the page's figures, each by an anchored regex
over the repository's own reports, or recomputed here exactly where
arithmetic allows and cross-checked against the report's claim. This
script is the only writer of data/nes.json; no number on /nes is typed.
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECORD = ROOT / "data" / "nes.json"


def fail(msg: str) -> None:
    print(f"board-nes: {msg}", file=sys.stderr)
    sys.exit(1)


def extract(text: str, pattern: str, where: str) -> str:
    m = re.search(pattern, text)
    if not m:
        fail(f"anchored extraction failed: {where} ({pattern!r})")
    return m.group(1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", action="store_true")
    ap.add_argument("--repo", type=Path, default=ROOT.parent / "2a03")
    args = ap.parse_args()
    if not args.board:
        ap.print_help()
        return 2

    repo = args.repo.resolve()
    if not (repo / "crates" / "v2a03-sim").is_dir():
        fail(f"{repo} is not a 2a03 checkout")
    dirty = subprocess.run(["git", "status", "--porcelain"], cwd=repo,
                           capture_output=True, text=True).stdout.strip()
    if dirty:
        fail(f"the checkout is dirty:\n{dirty}")
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo,
                            capture_output=True, text=True).stdout.strip()
    remote = subprocess.run(["git", "remote", "get-url", "origin"], cwd=repo,
                            capture_output=True, text=True).stdout.strip()
    remote = re.sub(r"\.git$", "", remote)

    # REQUIRE_PINS: the N3 gates read the 6502 repository's recorded pin
    # golden from the sibling checkout; without it they would SKIP and
    # the counts below would be a smaller suite than the one claimed.
    env = {**os.environ, "REQUIRE_NETLIST": "1", "REQUIRE_GOLDEN": "1", "REQUIRE_PINS": "1"}
    print(f"board-nes: running the suite at {commit[:7]} (netlist, goldens and the 6502's pin golden required)...")
    suite = subprocess.run(["cargo", "test", "--workspace", "--release", "--", "--nocapture"], cwd=repo,
                           capture_output=True, text=True, env=env)
    if suite.returncode != 0:
        fail(f"the suite is not green:\n{suite.stdout[-2000:]}{suite.stderr[-2000:]}")
    passed = sum(int(m) for m in re.findall(r"(\d+) passed", suite.stdout))
    failed = sum(int(m) for m in re.findall(r"(\d+) failed", suite.stdout))
    if failed or passed == 0:
        fail(f"suite counts unusable: {passed} passed, {failed} failed")

    print("board-nes: the MUTATE=1 run (must go red)...")
    # --no-fail-fast: cargo test otherwise stops at the first red test
    # binary, and the count below would be that binary's reds alone.
    mut = subprocess.run(["cargo", "test", "--workspace", "--release", "--no-fail-fast"], cwd=repo,
                         capture_output=True, text=True,
                         env={**env, "MUTATE": "1"})
    mutate_red = sum(int(m) for m in re.findall(r"(\d+) failed", mut.stdout))
    if mut.returncode == 0 or mutate_red == 0:
        fail("MUTATE=1 did not go red; a check that cannot fail is not a check")

    a0 = (repo / "docs" / "a0-report.md").read_text()
    a0n = re.sub(r"\s+", " ", a0)
    transistors = extract(a0n, r"\*\*([\d,]+) conducting transistors", "A0 transistor count")
    nodes = extract(a0n, r"over ([\d,]+) defined nodes\*\*", "A0 node count")
    supply_gated = extract(a0n, r"supply-gated family recurs, bigger: (\d+) transistors",
                           "A0 supply-gated count")
    contested = extract(a0n, r"is \*\*(\d)\*\* on the 2A03", "A0 contested count")
    golden_states = extract(a0n, r"across (\d+) states with no exemption list", "A0 golden states")
    throughput = extract(a0n, r"\*\*([\d,]+) master half-steps/s\*\* quiescent", "A0 throughput")

    a3 = re.sub(r"\s+", " ", (repo / "docs" / "a3-report.md").read_text())
    a3_states = extract(a3, r"([\d,]+) states over every node", "A3 golden states")
    plateau = int(extract(a3, r"plateaus of exactly (\d+) half-steps", "A3 plateau"))
    plateaus_n = extract(a3, r"(\w+) of them measured", "A3 plateau count")

    # The plateau is arithmetic: the program's own timer byte, 4 duty
    # steps of 8, two CPU cycles per timer tick, two half-steps per
    # cycle. Recomputed here and held to the report's claim.
    prog = (repo / "tools" / "golden-trace" / "program-a3.json").read_text()
    m = re.search(r'"bytes": \[([\d, ]+)\]', prog)
    if not m:
        fail("program-a3.json bytes not found")
    timer = int(m.group(1).split(",")[11].strip())
    if 2 * 2 * (timer + 1) * 4 != plateau:
        fail(f"recomputed plateau {2*2*(timer+1)*4} disagrees with the report's {plateau}")

    # The mixer's AD1 level for the sung note, recomputed from the
    # constants mixer.rs transcribed (themselves the nesdev wiki's).
    mixer = (repo / "crates" / "v2a03-sim" / "src" / "mixer.rs").read_text()
    c1 = float(extract(mixer, r"\((\d+\.\d+) / \(8128\.0", "mixer 95.88"))
    hi = c1 / (8128.0 / 15.0 + 100.0)

    halfphi_tag = extract((repo / "crates" / "v2a03-sim" / "Cargo.toml").read_text(),
                          r'halfphi", tag = "v([0-9.]+)"', "halfphi pin")

    # N3, the 2A03 ladder: the gates print their own measurement lines
    # (the suite ran with --nocapture above), and the report carries
    # the bench and the one finding. Each is an anchored extraction.
    out = suite.stdout + suite.stderr
    xc = re.search(r"cross-chip: (\d+) traces compared, (\d+) refused by name \([^)]*\), (\d+) exact in every field; "
                   r"stack pointer at h=0 \$([0-9a-f]{2}) on the 6502 and \$([0-9a-f]{2}) on the 2A03", out)
    if not xc:
        fail("the cross-chip gate's summary line is not on the suite output")
    core = re.search(r"core rung vs rung 0: (\d+) programs, (\d+) half-cycles, (\d+) exact in every field", out)
    if not core:
        fail("the core rung gate's summary line is not on the suite output")
    worlds = re.findall(r"world: (\d+) half-steps, five codes and the frame IRQ flag identical to rung 0", out)
    if len(worlds) < 2 or len(set(worlds)) != 1:
        fail(f"the APU gate's worlds are not on the output as one length: {worlds}")
    dma_even = re.search(r"sprite DMA, write on an even cycle: (\d+) frames identical in every field but (\d+) write-phi1 bytes; RDY low on (\d+)", out)
    dma_odd = re.search(r"sprite DMA, write on an odd cycle: (\d+) frames identical in every field but (\d+) write-phi1 bytes; RDY low on (\d+)", out)
    dmc = re.search(r"DMC fetches: (\d+) frames identical in every field but (\d+) write-phi1 bytes; RDY low on (\d+)", out)
    if not (dma_even and dma_odd and dmc):
        fail("the stall gate's summary lines are not on the suite output")
    if dma_even.group(1) != dma_odd.group(1):
        fail("the two sprite DMA programs ran different lengths")
    n3r = re.sub(r"\s+", " ", (repo / "docs" / "n3-report.md").read_text())
    n3_hcs = extract(n3r, r"\| the core rung with the APU \| ([\d,]+) \|", "N3 throughput with the APU")
    n3_rt_m = re.search(r"\*\*About ([\d,]+)x rung 0 and ([\d.]+)x the 2A03's real time\*\* with the APU attached", n3r)
    if not n3_rt_m:
        fail("anchored extraction failed: N3 real-time multiple")
    n3_rt = n3_rt_m.group(2)
    noise_die = extract(n3r, r"index 12 measures (\d+) where the published value is (\d+)", "noise index 12")
    noise_pub = re.search(r"index 12 measures (\d+) where the published value is (\d+)", n3r).group(2)
    stores = len(re.findall(r"\| \$00[0-9A-F]{2} \| \$[0-9A-F]{2} \| \$[0-9A-F]{2} \(", n3r)) + len(re.findall(r"\| \$01FA \(PHP\)", n3r))
    if stores != 9:
        fail(f"the decimal store table in n3-report.md has {stores} rows, not the nine the gate lists")
    golden_dir = (args.repo.parent / "6502" / "tools" / "pin-golden").resolve()
    golden_traces = len(list(golden_dir.glob("*.pins"))) if golden_dir.is_dir() else 0
    if golden_traces != int(xc.group(1)) + int(xc.group(2)):
        fail(f"the pin golden has {golden_traces} traces but the gate compared {xc.group(1)} and refused {xc.group(2)}")
    n3 = {
        "traces_compared": int(xc.group(1)),
        "traces_refused": int(xc.group(2)),
        "traces_exact": int(xc.group(3)),
        "stack_offset_hex": f"{(int(xc.group(4), 16) - int(xc.group(5), 16)) & 0xff:02x}",
        "decimal_stores": stores,
        "core_programs": int(core.group(1)),
        "core_half_cycles": int(core.group(2)),
        "core_exact": int(core.group(3)),
        "apu_worlds": len(worlds),
        "apu_half_steps": int(worlds[0]),
        "dma_frames": int(dma_even.group(1)),
        "dma_rdy_low_even": int(dma_even.group(3)),
        "dma_rdy_low_odd": int(dma_odd.group(3)),
        "dmc_frames": int(dmc.group(1)),
        "dmc_rdy_low": int(dmc.group(3)),
        "half_cycles_per_s": n3_hcs,
        "real_time_x": n3_rt,
        "noise_index12_die": int(noise_die),
        "noise_index12_published": int(noise_pub),
        "golden_traces": golden_traces,
    }

    # The PPU (2c02), boarded the same way: a clean checkout, its full
    # suite with every golden required, run with --nocapture so the gates'
    # own measurement lines are on the output, then the MUTATE=1 run; the
    # figures are anchored extractions from those lines and from the
    # milestone reports. P2's positions come from its report because the
    # P2 gate asserts them without printing them.
    ppu = (args.repo.parent / "2c02").resolve()
    if not (ppu / "crates" / "v2c02-fast").is_dir():
        fail(f"{ppu} is not a 2c02 checkout")
    dirty = subprocess.run(["git", "status", "--porcelain"], cwd=ppu,
                           capture_output=True, text=True).stdout.strip()
    if dirty:
        fail(f"the 2c02 checkout is dirty:\n{dirty}")
    ppu_commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ppu,
                                capture_output=True, text=True).stdout.strip()
    ppu_remote = re.sub(r"\.git$", "", subprocess.run(["git", "remote", "get-url", "origin"], cwd=ppu,
                                                        capture_output=True, text=True).stdout.strip())
    ppu_env = {**os.environ, "REQUIRE_NETLIST": "1", "REQUIRE_GOLDEN": "1", "REQUIRE_GOLDEN_P1": "1",
               "REQUIRE_GOLDEN_P2": "1", "REQUIRE_GOLDEN_P3": "1"}
    print(f"board-nes: running the 2c02 suite at {ppu_commit[:7]} (every golden required, minutes)...")
    ppu_suite = subprocess.run(["cargo", "test", "--workspace", "--release", "--", "--nocapture"], cwd=ppu,
                               capture_output=True, text=True, env=ppu_env)
    if ppu_suite.returncode != 0:
        fail(f"the 2c02 suite is not green:\n{ppu_suite.stdout[-2000:]}{ppu_suite.stderr[-2000:]}")
    ppu_passed = sum(int(m) for m in re.findall(r"(\d+) passed", ppu_suite.stdout))
    out = ppu_suite.stdout + ppu_suite.stderr
    print("board-nes: the 2c02 MUTATE=1 run (must go red)...")
    ppu_mut = subprocess.run(["cargo", "test", "--workspace", "--release", "--no-fail-fast"], cwd=ppu,
                             capture_output=True, text=True, env={**ppu_env, "MUTATE": "1"})
    ppu_red = sum(int(m) for m in re.findall(r"(\d+) failed", ppu_mut.stdout))
    if ppu_mut.returncode == 0 or ppu_red == 0:
        fail("the 2c02 MUTATE=1 run did not go red")
    p0_states = int(extract(out, r"replayed (\d+) states bit-exact on every node, no exemption", "P0 states"))
    p1_states = int(extract(out, r"replayed (\d+) states through the harness, every node, no exemption", "P1 states"))
    visible = int(extract(out, r"(\d+) visible dots agree with rung 0, backdrop", "P3 visible dots"))
    m_ft = re.search(r"frame period ([\d.]+) ms; (\d+) frames: mean ([\d.]+) ms \(([\d.]+)x inside\), worst ([\d.]+) ms \(([\d.]+)x inside\)", out)
    if not m_ft:
        fail("the P3 frame-time line was not printed")
    m_spr = re.search(r"(\d+) visible dots agree with rung 0 with sprites on; sprite 0 hit at Some\(\((\d+), (\d+)\)\) \(chip Some\(\((\d+), (\d+)\)\)\)", out)
    if not m_spr:
        fail("the P3 sprite line was not printed")
    scroll_dots = int(extract(out, r"(\d+) visible dots agree with rung 0 through the register file", "P3 scroll dots"))
    write_plateau = sorted(int(d) for d in re.findall(r"write delay (\d+): 0 mismatching dots", out))
    if not write_plateau:
        fail("the P3 write-delay plateau was not printed")
    area_vote_lows = int(extract(out, r"area_vote_lows (\d+)", "charge-rule gate"))
    p2 = re.sub(r"\s+", " ", (ppu / "docs" / "p2-report.md").read_text())
    p2_hit = re.search(r"hits at \*\*vpos (\d+), hpos (\d+)\*\*", p2)
    if not p2_hit:
        fail("P2 hit position not found in the report")
    p2_states = int(extract(p2, r"\*\*(\d+) states bit-exact, node for node", "P2 sprite states"))
    if "**[0, 0, 1]**" not in p2:
        fail("the P2 race result is no longer stated as [0, 0, 1]")
    ppu_halfphi = extract((ppu / "crates" / "v2c02-sim" / "Cargo.toml").read_text(),
                          r'halfphi", tag = "v([0-9.]+)"', "2c02 halfphi pin")
    c2c02 = {
        "repo": ppu_remote,
        "commit": ppu_commit,
        "halfphi": ppu_halfphi,
        "tests_green": ppu_passed,
        "mutate_red": ppu_red,
        "p0_states": p0_states,
        "p1_states": p1_states,
        "p2": {"sprite_states": p2_states, "hit_vpos": int(p2_hit.group(1)), "hit_hpos": int(p2_hit.group(2)), "race_bits": "[0, 0, 1]"},
        "p3": {
            "visible_dots": visible,
            "frame_period_ms": m_ft.group(1),
            "frames_timed": int(m_ft.group(2)),
            "mean_ms": m_ft.group(3),
            "mean_inside_x": m_ft.group(4),
            "worst_ms": m_ft.group(5),
            "worst_inside_x": m_ft.group(6),
            "sprite_dots": int(m_spr.group(1)),
            "hit_line": int(m_spr.group(2)),
            "hit_pixel": int(m_spr.group(3)),
            "chip_hit_hpos": int(m_spr.group(5)),
            "scroll_dots": scroll_dots,
            "write_delay_plateau": ", ".join(str(d) for d in write_plateau),
        },
        "area_vote_lows": area_vote_lows,
    }

    # The console (nes): the glue and the console crates' suite at a clean
    # commit, the plumbing gate's own summary line, and the N5 report's
    # gate-2 table read row by row (a pass counted by its word, never
    # typed). The console has no MUTATE=1 run of its own yet, and the
    # record says so by carrying no count for it.
    con = (args.repo.parent / "nes").resolve()
    if not (con / "crates" / "nes-console").is_dir():
        fail(f"{con} is not a nes checkout")
    con_dirty = subprocess.run(["git", "status", "--porcelain"], cwd=con, capture_output=True, text=True).stdout.strip()
    if con_dirty:
        fail(f"the nes checkout is dirty:\n{con_dirty}")
    con_commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=con, capture_output=True, text=True).stdout.strip()
    con_remote = re.sub(r"\.git$", "", subprocess.run(["git", "remote", "get-url", "origin"], cwd=con,
                                                        capture_output=True, text=True).stdout.strip())
    print(f"board-nes: running the nes suite at {con_commit[:7]}...")
    con_suite = subprocess.run(["cargo", "test", "--workspace", "--release", "--", "--nocapture"], cwd=con,
                               capture_output=True, text=True, env=os.environ)
    if con_suite.returncode != 0:
        fail(f"the nes suite is not green:\n{con_suite.stdout[-2000:]}{con_suite.stderr[-2000:]}")
    con_passed = sum(int(m) for m in re.findall(r"(\d+) passed", con_suite.stdout))
    con_failed = sum(int(m) for m in re.findall(r"(\d+) failed", con_suite.stdout))
    if con_passed == 0 or con_failed:
        fail(f"nes suite counts unusable: {con_passed} passed, {con_failed} failed")
    out = con_suite.stdout + con_suite.stderr
    plumb = re.search(r"(\d+) frames, (\d+) master half-steps, (\d+) CPU half-cycles, (\d+) NMIs counted by the program", out)
    if not plumb:
        fail("the console's plumbing gate summary line is not on the suite output")
    # Gate 1's two replays print their own summary lines.
    nmi_gate = re.search(r"gate 1: (\d+) half-cycles compared over (\w+) offsets, stack offset removed", out)
    if not nmi_gate:
        fail("the console's NMI replay summary line is not on the suite output")
    race_set = re.search(r"gate 1 \(race, set\): (\d+) reads within five dots of the set, every position covered", out)
    race_clear = re.search(r"gate 1 \(race, clear\): (\d+) reads within five dots of the clear, twenty-four alignments, every position covered", out)
    if not (race_set and race_clear):
        fail("the console's race replay summary lines are not on the suite output")
    offsets_word = {"eight": 8}
    if nmi_gate.group(2) not in offsets_word:
        fail(f"the NMI replay's offset count is a word this script does not know: {nmi_gate.group(2)}")
    n5r = re.sub(r"\s+", " ", (con / "docs" / "n5-report.md").read_text())
    pin_6502 = extract(n5r, r"Pins: 6502 `([0-9a-f]{7,})`", "N5 pin of the 6502")
    cargo_pin = extract((con / "crates" / "nes-console" / "Cargo.toml").read_text(),
                        r'v6502-micro = \{[^}]*rev = "([0-9a-f]{7,})"', "nes-console's v6502-micro pin")
    if cargo_pin != pin_6502:
        fail(f"the N5 report says the 6502 pin is {pin_6502} but Cargo.toml pins {cargo_pin}")
    align_m = re.search(r"Alignment stamp: `Alignment::MEASURED`, cpu_phase (\d+), ppu_phase (\d+)", n5r)
    if not align_m:
        fail("anchored extraction failed: N5 alignment stamp")
    rate_m = re.search(r"Throughput: (\d+) to (\d+) frames a second on one core, ([\d.]+)x to ([\d.]+)x real time", n5r)
    if not rate_m:
        fail("anchored extraction failed: N5 throughput")
    # The gate-2 table: one row per suite or group of ROMs. A row passes
    # when its result cell begins with "pass" (bold or not); the ROM
    # lists on grouped rows are counted from their ranges.
    rows = re.findall(r"\| ((?:cpu_timing|instr_test|ppu_vbl_nmi|sprite_hit|apu_test)[^|]*) \| ([^|]*) \|", n5r)
    if not rows:
        fail("the N5 report's gate-2 table is not where the extraction looks")

    def roms(label: str) -> int:
        tail = label.split(" ", 1)[1] if " " in label else ""
        n = 0
        for part in tail.split(","):
            part = part.strip()
            m = re.match(r"(\d+)\.\.(\d+)$", part)
            if m:
                n += int(m.group(2)) - int(m.group(1)) + 1
            elif re.match(r"\d+", part):
                n += 1
        return n

    tally: dict = {}
    for label, result in rows:
        suite = label.split(" ", 1)[0]
        plain = re.sub(r"\*", "", result).strip().lower()
        t = tally.setdefault(suite, [0, 0])
        # A row that counts for itself ("8 of 8 pass") is taken as it
        # says; otherwise its ROMs are counted from the label and pass
        # or fail together on the cell's first word.
        counted = re.match(r"(\d+) of (\d+) pass", plain)
        if counted:
            t[0] += int(counted.group(1))
            t[1] += int(counted.group(2))
            continue
        n = roms(label) or 1
        t[0] += n if plain.startswith("pass") else 0
        t[1] += n
    for suite, total in [("cpu_timing_test6", 1), ("instr_test-v5", 16), ("ppu_vbl_nmi", 10), ("sprite_hit_tests", 11), ("apu_test", 8)]:
        if suite not in tally or tally[suite][1] != total:
            fail(f"the gate-2 table's {suite} rows count {tally.get(suite)} ROMs, not {total}")
    console = {
        "repo": con_remote,
        "commit": con_commit,
        "tests_green": con_passed,
        "pin_6502": pin_6502,
        "alignment": {"cpu_phase": int(align_m.group(1)), "ppu_phase": int(align_m.group(2))},
        "gate1": {
            "nmi_half_cycles": int(nmi_gate.group(1)),
            "nmi_offsets": offsets_word[nmi_gate.group(2)],
            "race_reads_set": int(race_set.group(1)),
            "race_reads_clear": int(race_clear.group(1)),
            "alignments": 24,
        },
        "plumbing": {
            "frames": int(plumb.group(1)),
            "master_half_steps": int(plumb.group(2)),
            "cpu_half_cycles": int(plumb.group(3)),
            "nmis": int(plumb.group(4)),
        },
        "frames_per_s": [int(rate_m.group(1)), int(rate_m.group(2))],
        "real_time_x": [rate_m.group(3), rate_m.group(4)],
        "blargg": {
            "cpu_timing_pass": tally["cpu_timing_test6"][0],
            "instr_pass": tally["instr_test-v5"][0], "instr_total": tally["instr_test-v5"][1],
            "sprite_pass": tally["sprite_hit_tests"][0], "sprite_total": tally["sprite_hit_tests"][1],
            "vbl_nmi_pass": tally["ppu_vbl_nmi"][0], "vbl_nmi_total": tally["ppu_vbl_nmi"][1],
            "apu_pass": tally["apu_test"][0], "apu_total": tally["apu_test"][1],
        },
    }

    record = {
        "note": "Written only by scripts/board-nes.py --board. The suite and the "
                "MUTATE=1 run were executed at this commit with the netlist and "
                "goldens required; every figure is an anchored extraction from the "
                "repository's own reports, or recomputed here and held to them.",
        "boarded_on": dt.date.today().isoformat(),
        "repo": remote,
        "commit": commit,
        "tests_green": passed,
        "mutate_red": mutate_red,
        "halfphi": halfphi_tag,
        "a0": {
            "transistors": transistors,
            "defined_nodes": nodes,
            "supply_gated": int(supply_gated),
            "contested_groups": int(contested),
            "golden_states": int(golden_states),
            "quiescent_half_steps_per_s": throughput,
        },
        "c2c02": c2c02,
        "n3": n3,
        "console": console,
        "first_sound": {
            "golden_states": a3_states,
            "timer_byte": timer,
            "plateau_half_steps": plateau,
            "plateaus_measured": plateaus_n,
            "ad1_high": f"{hi:.4f}",
            "stamp": "a3-report run 2026-09-03; the mixer constants are the nesdev "
                     "wiki's APU Mixer page, a dated claim awaiting the bench",
        },
        "family": {
            "nes_bus": "https://github.com/tinymachines/nes-bus",
            "c2a03": remote,
            "c2c02": "https://github.com/tinymachines/2c02",
            "nes": con_remote,
            "sketch": "https://github.com/tinymachines/nes-bus/blob/main/docs/nes-end-to-end-v0_2.md",
        },
    }
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    print(f"board-nes: recorded {commit[:7]}: {passed} tests green, "
          f"{mutate_red} MUTATE reds -> {RECORD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
