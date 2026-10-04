#!/usr/bin/env python3
"""Build a lesson's cartridge from its source, with our own assembler.

  python3 lessons/build.py jump

A lesson is a directory: prg.s (the program, in the listing's text),
chr.s (the tiles), lesson.json (the board, sizes and what to measure).
This writes lessons/<name>/build/<name>.s (the whole listing: header,
program, fill, vectors, tiles) and <name>.nes, by way of the listing's
`lesson` verb, which stamps the listing with the cartridge's digest and
holds the one to the other. build/ is not committed: a clone builds it.
"""
import json, os, subprocess, sys
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


def build(name: str) -> dict:
    d = ROOT / "lessons" / name
    meta = json.loads((d / "lesson.json").read_text())
    out = d / "build"
    out.mkdir(exist_ok=True)
    s, rom = out / f"{name}.s", out / f"{name}.nes"
    # The listing's own `lesson` verb puts the parts together, assembles,
    # stamps the digest and checks the one against the other: the same
    # code the desk runs in the page (wasm/listing/src/lesson.rs).
    got = json.loads(listing("lesson", d / "prg.s", d / "chr.s", meta["mirroring"], meta["prg"], meta["org"], meta["chr"], s, rom))
    return {"rom": rom, "listing": s, "sha256": got["sha256"], "code_bytes": got["code_bytes"], "instructions": got["instructions"]}


if __name__ == "__main__":
    for n in sys.argv[1:] or [p.name for p in (ROOT / "lessons").iterdir() if (p / "lesson.json").exists()]:
        b = build(n)
        print(f"{n}: {b['rom'].relative_to(ROOT)} ({b['code_bytes']} bytes of program, {b['instructions']} instructions), {b['listing'].relative_to(ROOT)} assembles to it")
