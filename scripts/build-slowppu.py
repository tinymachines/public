#!/usr/bin/env python3
"""Build the playground's slow chip and record it.

wasm/slowppu wraps the engineers' switch-level 2C02 (and their fast one)
for /nes/playground. It builds from the sibling 2c02 checkout, whose
fetched extern carries Quietust's Visual 2C02 netlist (NC-SA), so:

- the checkout must be clean and at the 2c02 commit data/nes.json
  records (the one the rest of the site was boarded at), or this refuses;
- the native suite runs first (tests/warm.rs: the chip restored from the
  recorded reset state draws what a freshly reset one draws);
- the bundle goes to web/public/nes/slow/, which is gitignored, and
  data/slowppu.json records the commit, the tools and each file's hash.

Run it:

    python3 scripts/build-slowppu.py
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CRATE = ROOT / "wasm" / "slowppu"
PPU = ROOT.parent / "2c02"
DEST = ROOT / "web" / "public" / "nes" / "slow"
RECORD = ROOT / "data" / "slowppu.json"
FILES = ("slowppu.js", "slowppu_bg.wasm")


def fail(msg: str) -> None:
    print(f"build-slowppu: {msg}", file=sys.stderr)
    sys.exit(1)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=PPU, capture_output=True, text=True).stdout.strip()


def main() -> int:
    if not (PPU / "crates" / "v2c02-sim").is_dir():
        fail(f"{PPU} is not a 2c02 checkout")
    if not (PPU / "extern" / "visual2c02").is_dir():
        fail("the 2c02 checkout has no extern/visual2c02; its tools/fetch-netlist.sh fetches it")
    want = json.loads((ROOT / "data" / "nes.json").read_text())["c2c02"]["commit"]
    dirty = git("status", "--porcelain")
    if dirty:
        fail(f"the 2c02 checkout is dirty:\n{dirty}")
    head = git("rev-parse", "HEAD")
    if head != want:
        fail(f"the 2c02 checkout is at {head[:7]}, data/nes.json records {want[:7]}")

    # rustup's toolchain first: /usr/bin carries an older rustc.
    env = {**os.environ, "PATH": f"{Path.home()}/.cargo/bin:{os.environ['PATH']}"}
    print(f"build-slowppu: the native suite at 2c02 {head[:7]}...")
    t = subprocess.run(["cargo", "test", "--release"], cwd=CRATE, env=env, capture_output=True, text=True)
    if t.returncode != 0:
        fail(f"the native suite failed:\n{(t.stdout + t.stderr)[-3000:]}")
    passed = [l for l in t.stdout.splitlines() if l.startswith("test result: ok.") and " 0 passed" not in l]
    if not passed:
        fail("the native suite ran no test; a build nothing checked is not recorded")

    flags = "-C target-feature=+simd128"
    out = CRATE / "target" / "web"
    print("build-slowppu: the bundle...")
    b = subprocess.run(["wasm-pack", "build", ".", "--target", "web", "--release", "--out-dir", str(out)],
                       cwd=CRATE, env={**env, "RUSTFLAGS": flags}, capture_output=True, text=True)
    if b.returncode != 0:
        fail(f"wasm-pack failed:\n{b.stderr[-3000:]}")

    DEST.mkdir(parents=True, exist_ok=True)
    files = {}
    for name in FILES:
        src = out / name
        if not src.is_file():
            fail(f"the build produced no {name}; wasm-pack's layout moved")
        shutil.copy2(src, DEST / name)
        files[name] = {"sha256": hashlib.sha256(src.read_bytes()).hexdigest(), "bytes": src.stat().st_size}

    tool = subprocess.run(["wasm-pack", "--version"], env=env, capture_output=True, text=True).stdout.strip()
    rustc = subprocess.run(["rustc", "--version"], env=env, capture_output=True, text=True).stdout.strip()
    RECORD.write_text(json.dumps({
        "note": "Written only by scripts/build-slowppu.py. The slow chip for /nes/playground: wasm/slowppu "
                "built against the 2c02 checkout at this commit, after its native suite passed. The files in "
                "web/public/nes/slow/ must hash to these values and are never committed (the netlist inside "
                "is NC-SA).",
        "repo": "https://github.com/tinymachines/2c02",
        "commit": head,
        "built_on": dt.date.today().isoformat(),
        "built_with": f"{tool}; {rustc}; RUSTFLAGS {flags}",
        "files": files,
    }, indent=2) + "\n")
    print("build-slowppu: recorded " + ", ".join(f"{n} ({v['bytes']} bytes)" for n, v in files.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
