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

    env = {**os.environ, "REQUIRE_NETLIST": "1", "REQUIRE_GOLDEN": "1"}
    print(f"board-nes: running the suite at {commit[:7]} (netlist and goldens required)...")
    suite = subprocess.run(["cargo", "test", "--workspace", "--release"], cwd=repo,
                           capture_output=True, text=True, env=env)
    if suite.returncode != 0:
        fail(f"the suite is not green:\n{suite.stdout[-2000:]}{suite.stderr[-2000:]}")
    passed = sum(int(m) for m in re.findall(r"(\d+) passed", suite.stdout))
    failed = sum(int(m) for m in re.findall(r"(\d+) failed", suite.stdout))
    if failed or passed == 0:
        fail(f"suite counts unusable: {passed} passed, {failed} failed")

    print("board-nes: the MUTATE=1 run (must go red)...")
    mut = subprocess.run(["cargo", "test", "--workspace", "--release"], cwd=repo,
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
    ppu_mut = subprocess.run(["cargo", "test", "--workspace", "--release"], cwd=ppu,
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
            "sketch": "https://github.com/tinymachines/nes-bus/blob/main/docs/nes-end-to-end-v0_2.md",
        },
    }
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    print(f"board-nes: recorded {commit[:7]}: {passed} tests green, "
          f"{mutate_red} MUTATE reds -> {RECORD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
