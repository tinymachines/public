"""Build the playground's WebAssembly bundles and record them.

Two crates under wasm/ wrap the engineers' chips, unchanged, for
/nes/playground:

- wasm/slowppu: the switch-level 2C02 and the fast one (the slow chip
  station), from the sibling 2c02 checkout;
- wasm/apuvoices: the fast 2A03's sound unit and its DACs (the sound
  station), from the sibling 2a03 checkout.

Each builds out of die data fetched into its checkout (NC-SA), so for
each:

- the checkout must be clean and at the commit data/nes.json records
  for that chip (the one the rest of the site was boarded at), or this
  refuses;
- the crate's native suite runs first and must run at least one test;
- the bundle goes to a gitignored directory under web/public/nes/, and
  a record under data/ keeps the commit, the tools and each file's hash.

Run it:

    python3 scripts/build-playground-wasm.py            # both
    python3 scripts/build-playground-wasm.py apuvoices  # one
    python3 scripts/build-playground-wasm.py --check    # what is served, checked

--check builds nothing. It holds what is in web/public to what the
records say: the commit each bundle was built from must be the commit
data/nes.json records for that chip, and every file must still hash to
what was recorded. A bundle that is not in the tree at all is not a
failure (a fresh clone has none, and the stations say so on the page);
a bundle that is there and stale is, because it would be served as
though it were the boarded chip. The deploy runs it.
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
NES = json.loads((ROOT / "data" / "nes.json").read_text())

BUNDLES = {
    "slowppu": {
        "repo": ROOT.parent / "2c02",
        "url": "https://github.com/tinymachines/2c02",
        "commit": NES["c2c02"]["commit"],
        "marker": "crates/v2c02-sim",
        "extern": "extern/visual2c02",
        "dest": ROOT / "web" / "public" / "nes" / "slow",
        "record": ROOT / "data" / "slowppu.json",
        "what": "The slow chip for /nes/playground: wasm/slowppu built against the 2c02 checkout at this commit",
        # Written by the crate's build script into OUT_DIR and served beside
        # the bundle: the die's own shapes, for the die view.
        "extras": ["geometry.bin"],
    },
    "apuvoices": {
        "repo": ROOT.parent / "2a03",
        "url": "https://github.com/tinymachines/2a03",
        "commit": NES["commit"],
        "marker": "crates/v2a03-micro",
        "extern": "extern/visual2a03",
        "dest": ROOT / "web" / "public" / "nes" / "voices",
        "record": ROOT / "data" / "apuvoices.json",
        "what": "The sound station for /nes/playground: wasm/apuvoices built against the 2a03 checkout at this commit",
    },
}


def fail(msg: str) -> None:
    print(f"build-playground-wasm: {msg}", file=sys.stderr)
    sys.exit(1)


def build(name: str) -> None:
    b = BUNDLES[name]
    repo: Path = b["repo"]
    crate = ROOT / "wasm" / name
    files = (f"{name}.js", f"{name}_bg.wasm")
    git = lambda *a: subprocess.run(["git", *a], cwd=repo, capture_output=True, text=True).stdout.strip()
    if not (repo / b["marker"]).is_dir():
        fail(f"{repo} is not the checkout {name} needs")
    if not (repo / b["extern"]).is_dir():
        fail(f"{repo.name} has no {b['extern']}; its tools/fetch-netlist.sh fetches it")
    dirty = git("status", "--porcelain")
    if dirty:
        fail(f"the {repo.name} checkout is dirty:\n{dirty}")
    head = git("rev-parse", "HEAD")
    if head != b["commit"]:
        fail(f"the {repo.name} checkout is at {head[:7]}, data/nes.json records {b['commit'][:7]}")

    # rustup's toolchain first: /usr/bin carries an older rustc.
    env = {**os.environ, "PATH": f"{Path.home()}/.cargo/bin:{os.environ['PATH']}"}
    print(f"build-playground-wasm: {name}: the native suite at {repo.name} {head[:7]}...")
    t = subprocess.run(["cargo", "test", "--release"], cwd=crate, env=env, capture_output=True, text=True)
    if t.returncode != 0:
        fail(f"{name}: the native suite failed:\n{(t.stdout + t.stderr)[-3000:]}")
    if not [l for l in t.stdout.splitlines() if l.startswith("test result: ok.") and " 0 passed" not in l]:
        fail(f"{name}: the native suite ran no test; a build nothing checked is not recorded")

    flags = "-C target-feature=+simd128"
    out = crate / "target" / "web"
    print(f"build-playground-wasm: {name}: the bundle...")
    w = subprocess.run(["wasm-pack", "build", ".", "--target", "web", "--release", "--out-dir", str(out)],
                       cwd=crate, env={**env, "RUSTFLAGS": flags}, capture_output=True, text=True)
    if w.returncode != 0:
        fail(f"{name}: wasm-pack failed:\n{w.stderr[-3000:]}")

    dest: Path = b["dest"]
    dest.mkdir(parents=True, exist_ok=True)
    hashes = {}
    extras = {}
    for f in b.get("extras", ()):
        found = sorted((crate / "target" / "release" / "build").glob(f"{name}-*/out/{f}"), key=lambda p: p.stat().st_mtime)
        if not found:
            fail(f"{name}: the build wrote no {f}; its build script should")
        extras[f] = found[-1]
    for f in (*files, *extras):
        src = extras.get(f, out / f)
        if not src.is_file():
            fail(f"{name}: the build produced no {f}; wasm-pack's layout moved")
        shutil.copy2(src, dest / f)
        hashes[f] = {"sha256": hashlib.sha256(src.read_bytes()).hexdigest(), "bytes": src.stat().st_size}

    tool = subprocess.run(["wasm-pack", "--version"], env=env, capture_output=True, text=True).stdout.strip()
    rustc = subprocess.run(["rustc", "--version"], env=env, capture_output=True, text=True).stdout.strip()
    b["record"].write_text(json.dumps({
        "note": f"Written only by scripts/build-playground-wasm.py. {b['what']}, after its native suite passed. "
                f"The files in {dest.relative_to(ROOT)}/ must hash to these values and are never committed "
                "(what the chip was measured from is NC-SA).",
        "repo": b["url"],
        "commit": head,
        "built_on": dt.date.today().isoformat(),
        "built_with": f"{tool}; {rustc}; RUSTFLAGS {flags}",
        "files": hashes,
    }, indent=2) + "\n")
    print(f"build-playground-wasm: {name}: recorded " + ", ".join(f"{n} ({v['bytes']} bytes)" for n, v in hashes.items()))


def check(name: str) -> list[str]:
    """What is wrong with the bundle that is in the tree, if anything."""
    b = BUNDLES[name]
    dest: Path = b["dest"]
    record: Path = b["record"]
    files = (f"{name}.js", f"{name}_bg.wasm", *b.get("extras", ()))
    here = [f for f in files if (dest / f).is_file()]
    if not record.is_file() and not here:
        print(f"build-playground-wasm: {name}: not in this build (the page says so)")
        return []
    bad = []
    if not record.is_file():
        return [f"{name}: {dest.relative_to(ROOT)}/ is served but {record.relative_to(ROOT)} does not exist"]
    r = json.loads(record.read_text())
    if r.get("commit") != b["commit"]:
        bad.append(
            f"{name}: built from {str(r.get('commit'))[:7]}, but data/nes.json records "
            f"{b['commit'][:7]} for that chip; rebuild it with "
            f"python3 scripts/build-playground-wasm.py {name}"
        )
    for f in files:
        want = r.get("files", {}).get(f)
        path = dest / f
        if not want:
            bad.append(f"{name}: {record.relative_to(ROOT)} records no {f}")
        elif not path.is_file():
            bad.append(f"{name}: {path.relative_to(ROOT)} is recorded but not in this build")
        elif hashlib.sha256(path.read_bytes()).hexdigest() != want["sha256"]:
            bad.append(f"{name}: {path.relative_to(ROOT)} is not the file that was recorded")
    if not bad:
        print(f"build-playground-wasm: {name}: {b['repo'].name} {b['commit'][:7]}, {len(files)} files as recorded")
    return bad


def main() -> int:
    args = sys.argv[1:]
    checking = "--check" in args
    names = [a for a in args if a != "--check"] or list(BUNDLES)
    for n in names:
        if n not in BUNDLES:
            fail(f"no bundle {n!r}; there are {', '.join(BUNDLES)}")
    if checking:
        bad = [msg for n in names for msg in check(n)]
        for msg in bad:
            print(f"build-playground-wasm: {msg}", file=sys.stderr)
        return 1 if bad else 0
    for n in names:
        build(n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
