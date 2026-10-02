#!/usr/bin/env python3
"""Build a lesson's cartridge from its source, with our own assembler.

  python3 lessons/build.py jump

A lesson is a directory: prg.s (the program, in the listing's text),
chr.s (the tiles), lesson.json (the board, sizes and what to measure).
This writes lessons/<name>/build/<name>.s (the whole listing: header,
program, fill, vectors, tiles) and <name>.nes, stamps the listing with
the cartridge's digest and holds the one to the other with `listing
check`. build/ is not committed: a clone builds it.
"""
import json, os, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LISTING = ROOT / "wasm/listing"


# rustup's toolchain, not the system's older rustc (the deploy's PATH has
# the same order for the bundles).
ENV = {**os.environ, "PATH": f"{Path.home() / '.cargo/bin'}:{os.environ.get('PATH', '')}"}


def listing(*args, text=True):
    r = subprocess.run(["cargo", "run", "-q", "--manifest-path", str(LISTING / "Cargo.toml"), "--bin", "listing", "--", *map(str, args)], capture_output=True, text=text, env=ENV)
    if r.returncode != 0:
        sys.exit(f"listing {' '.join(map(str, args))}: {r.stderr.strip()}")
    return r.stdout


def size(line: str) -> int:
    """The bytes one line of the program takes."""
    t = line.split(";")[0].strip()
    if not t or t.endswith(":"):
        return 0
    if t.startswith(".byte"):
        return len(t[5:].split(","))
    if t.startswith(".word"):
        return 2
    p = t.split(None, 1)
    if len(p) == 1 or p[1] == "A":
        return 1
    o = p[1]
    if p[0] in ("BPL", "BMI", "BVC", "BVS", "BCC", "BCS", "BNE", "BEQ") or o.startswith("#"):
        return 2
    if re.fullmatch(r"\$[0-9A-Fa-f]{2}(,[XY])?", o) or re.fullmatch(r"\(\$[0-9A-Fa-f]{2}(,X\)|\),Y)", o):
        return 2
    return 3


def build(name: str) -> dict:
    d = ROOT / "lessons" / name
    meta = json.loads((d / "lesson.json").read_text())
    prg, chr_ = (d / "prg.s").read_text(), (d / "chr.s").read_text()
    used = sum(size(l) for l in prg.splitlines())
    tiles = sum(size(l) for l in chr_.splitlines())
    if used > meta["prg"] - 6 or tiles > meta["chr"]:
        sys.exit(f"{name}: {used} bytes of program and {tiles} of tiles do not fit")
    head = (f";; @listing 0\n;; @rom sha256=0 mapper=0 mirroring={meta['mirroring']} prg={meta['prg']} chr={meta['chr']}\n"
            f";; @bank prg 0 org={meta['org']} size={meta['prg']} fixed\n")
    src = head + prg + "    .byte $FF\n" * (meta["prg"] - 6 - used) + "    .word nmi\n    .word reset\n    .word irq\n"
    src += f";; @bank chr 0 size={meta['chr']}\n" + chr_ + "    .byte $00\n" * (meta["chr"] - tiles)
    out = d / "build"
    out.mkdir(exist_ok=True)
    s, rom = out / f"{name}.s", out / f"{name}.nes"
    s.write_text(src)
    listing("rom", s, rom)
    # The header names the cartridge it assembles to.
    sha = next(l for l in listing("from", rom).splitlines() if l.startswith(";; @rom ")).split("sha256=")[1].split()[0]
    s.write_text(src.replace("sha256=0 ", f"sha256={sha} ", 1))
    listing("check", s, rom)
    return {"rom": rom, "listing": s, "sha256": sha, "code_bytes": used, "instructions": sum(1 for l in prg.splitlines() if size(l) and not l.strip().startswith("."))}


if __name__ == "__main__":
    for n in sys.argv[1:] or [p.name for p in (ROOT / "lessons").iterdir() if (p / "lesson.json").exists()]:
        b = build(n)
        print(f"{n}: {b['rom'].relative_to(ROOT)} ({b['code_bytes']} bytes of program, {b['instructions']} instructions), {b['listing'].relative_to(ROOT)} assembles to it")
