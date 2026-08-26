#!/usr/bin/env python3
"""Board the engine: test it here, record what was tested, refuse anything else.

The roof does not compile Rust. It serves the engine three ways, all of them
from the 6502 checkout beside this one (notes/modules.md, "The engine edge"):

  - the wasm bundle and the explorer's modules, from that project's release
    directory, through an nginx alias at /6502/chip/
  - halfwave, the warm engine process, behind the chip API that /6502/api
    proxies to, as the binary the 6502 unit names
  - the explorer's pages and the API reference, read out of the checkout's
    working tree at build time

So "the engine this site is running" is four measurements: the commit the
served release was built from, the commit the halfwave binary says it was
built from (`halfwave --version`, stamped by that crate's build.rs) and the
one the running service reports at /v1/meta, and the commit the working tree
is at. This script takes them, and it is the only thing that writes
data/engine.json.

    python3 scripts/board-engine.py --board        test, then record
    python3 scripts/board-engine.py --check        measure, compare, refuse

`--board` runs the engine's own test suites in the 6502 checkout (halfphi's
three chips, v6502-sim's functional, state, timing, interrupt and golden
tests) and writes the record only when every one of them passed. It refuses a
dirty checkout, because a record of a commit that is not what was tested is
worse than no record. `--check` is what deploy.sh runs: it fails when the
release, the binary or the tree is not the boarded one, and says which.

The rule this implements is the registry's: the thing that publishes must
not be the thing that claims. Neither repository's CI is trusted for this; the
tests are run here, on the checkout that is about to be served, and the
record says when and what.

Absent a 6502 checkout, `--check` SKIPS and says so, the way
tools/check-halfphi.mjs skips over there: a clone of this repository alone has
to build and deploy. TM_REQUIRE_ENGINE=1 makes absence a failure.

No host-specific detail is written into the record: the paths it measures are
read from the two projects' own deploy files at run time and are not stored.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECORD = ROOT / "data" / "engine.json"

# The five files halfphi shares with its standalone repository: the same list
# tools/check-halfphi.mjs holds over there. The digest of these is what
# "halfphi 0.1.0" means on a given day, since the crate version does not move
# between releases.
SHARED = ["src/lib.rs", "src/source.rs", "src/netlist.rs", "src/engine.rs", "tests/chips.rs"]

# What "tested" means. Each entry is one cargo invocation in the 6502 tree,
# and the env makes a missing fixture a FAILURE rather than a skip: under
# `cargo test` a skipped test's stderr is captured and it counts as passed,
# so without these a suite with nothing to load would read as green. The
# golden (differential) test's oracle is 5 MB, generated and gitignored;
# --allow-no-golden lets a box without it board, and the record says so.
SUITES = [
    ("halfphi: the 6502, the 6800 and the Z80", ["cargo", "test", "-q", "-p", "halfphi"], {"HALFPHI_REQUIRE_CHIPS": "1"}),
    ("v6502-sim: functional, state, timing, interrupts, decode, rewind, golden", ["cargo", "test", "-q", "-p", "v6502-sim"], {"V6502_REQUIRE_GOLDEN": "1"}),
]


class Refused(SystemExit):
    def __init__(self, why: str):
        super().__init__(f"board-engine: {why}")


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def chip_tree() -> Path | None:
    """The 6502 checkout: TM_CHIP_TREE, else the sibling. An explicit path is
    used alone, so a wrong one is reported rather than quietly replaced."""
    explicit = os.environ.get("TM_CHIP_TREE")
    cands = [Path(explicit)] if explicit else [ROOT.parent / "6502"]
    for c in cands:
        if (c / "crates" / "halfphi" / "src" / "engine.rs").is_file():
            return c.resolve()
    return None


def git(tree: Path, *args: str) -> str | None:
    if not shutil.which("git"):
        return None
    r = subprocess.run(["git", "-C", str(tree), *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def head_of(tree: Path) -> str | None:
    """The commit, read out of .git so a PATH without git still answers."""
    head = tree / ".git" / "HEAD"
    try:
        text = head.read_text().strip()
    except OSError:
        return None
    if re.fullmatch(r"[0-9a-f]{40}", text):
        return text
    if text.startswith("ref:"):
        ref = text[4:].strip()
        try:
            return (tree / ".git" / ref).read_text().strip()
        except OSError:
            packed = tree / ".git" / "packed-refs"
            if packed.is_file():
                for line in packed.read_text().splitlines():
                    if line.endswith(" " + ref):
                        return line.split()[0]
    return None


def halfwave_bin(tree: Path) -> Path | None:
    """The binary the chip API runs: TM_HALFWAVE_BIN, else the path the 6502
    unit names, else the workspace's release target. The unit file is read,
    not copied: its path is the host's and stays out of the record."""
    explicit = os.environ.get("TM_HALFWAVE_BIN")
    if explicit:
        p = Path(explicit)
        return p if p.is_file() else None
    unit = tree / "deploy" / "6502-api.service"
    if unit.is_file():
        m = re.search(r"^Environment=HALFWAVE_BIN=(\S+)", unit.read_text(), re.M)
        if m and Path(m.group(1)).is_file():
            return Path(m.group(1))
    p = tree / "target" / "release" / "halfwave"
    return p if p.is_file() else None


def stated_commit(hw: Path) -> str | None:
    """What the binary says it was built from: `halfwave 0.1.0 <sha>[-dirty]`.
    None for a binary older than the stamp, which is then a finding."""
    try:
        r = subprocess.run([str(hw), "--version"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return None
    m = re.match(r"halfwave \S+ (\S+)", r.stdout.strip())
    return m.group(1) if m else None


def running_commit() -> str | None:
    """What the chip API's warm engine reports at /v1/meta, over loopback.
    A binary rebuilt and not restarted is caught here and nowhere else."""
    base = os.environ.get("TM_CHIP_API", "http://127.0.0.1:6502").rstrip("/")
    try:
        with urllib.request.urlopen(base + "/v1/meta", timeout=5) as r:
            return json.load(r).get("commit")
    except Exception:
        return None


def served_release() -> Path | None:
    """The release directory nginx aliases at /6502/chip/, read from this
    repository's own nginx file. None where that directory does not exist,
    which is every box but the one serving the site."""
    explicit = os.environ.get("TM_CHIP_RELEASE")
    if explicit:
        p = Path(explicit)
        return p if p.is_dir() else None
    conf = ROOT / "deploy" / "tinymachines.ai.nginx"
    if not conf.is_file():
        return None
    m = re.search(r"location /6502/chip/ \{\s*alias (\S+?);", conf.read_text())
    if not m:
        return None
    p = Path(m.group(1))
    return p.resolve() if p.is_dir() else None


def measure(tree: Path) -> dict:
    """Everything --check compares and --board records, taken now."""
    halfphi = tree / "crates" / "halfphi"
    cargo = (halfphi / "Cargo.toml").read_text()
    version = re.search(r'^version\s*=\s*"([^"]+)"', cargo, re.M)
    digest = hashlib.sha256()
    for rel in SHARED:
        digest.update(rel.encode() + b"\0" + (halfphi / rel).read_bytes() + b"\0")

    # The release tag, where the checkout is at one: tools/release-halfphi.sh
    # over there tags both repositories at one shared-file digest. A commit
    # past the tag is recorded as such rather than given the tag's name.
    tag = git(tree, "describe", "--tags", "--exact-match", "--match", "halfphi-v*")
    standalone = None
    sib = Path(os.environ.get("HALFPHI") or (ROOT.parent / "halfphi"))
    if (sib / "src" / "engine.rs").is_file():
        same = all((sib / rel).read_bytes() == (halfphi / rel).read_bytes() for rel in SHARED)
        standalone = {
            "commit": head_of(sib),
            "tag": git(sib, "describe", "--tags", "--exact-match", "--match", "v*"),
            "shared_files_identical": same,
        }

    hw = halfwave_bin(tree)
    binary = None
    if hw:
        st = hw.stat()
        binary = {
            "sha256": sha256(hw),
            "bytes": st.st_size,
            "modified": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(timespec="seconds"),
            "stated": stated_commit(hw),
            "running": running_commit(),
        }

    release = None
    rd = served_release()
    if rd and (rd / "build-info.json").is_file():
        info = json.loads((rd / "build-info.json").read_text())
        release = {"version": info.get("version"), "commit": info.get("commitFull") or info.get("commit"), "built": info.get("built")}

    status = git(tree, "status", "--porcelain", "--untracked-files=no")
    return {
        "chip_tree": {
            "commit": head_of(tree),
            "branch": git(tree, "rev-parse", "--abbrev-ref", "HEAD"),
            "subject": git(tree, "log", "-1", "--format=%s"),
            "committed": git(tree, "log", "-1", "--format=%cI"),
            "dirty": None if status is None else bool(status),
        },
        "halfphi": {
            "version": version.group(1) if version else None,
            "tag": tag,
            "shared_files_sha256": digest.hexdigest(),
            "standalone": standalone,
        },
        "halfwave": binary,
        "release": release,
    }


def run_suites(tree: Path, allow_no_golden: bool) -> list[dict]:
    env = dict(os.environ)
    out = []
    for name, cmd, extra in SUITES:
        if allow_no_golden:
            extra = {k: v for k, v in extra.items() if k != "V6502_REQUIRE_GOLDEN"}
        t0 = time.monotonic()
        r = subprocess.run(cmd, cwd=tree, env={**env, **extra}, capture_output=True, text=True)
        text = r.stdout + r.stderr
        passed = sum(int(m) for m in re.findall(r"test result: \w+\. (\d+) passed", text))
        failed = sum(int(m) for m in re.findall(r"(\d+) failed", text))
        skipped = sorted(set(re.findall(r"SKIPPED \(([^)]*)\)", text)))
        rec = {
            "name": name,
            "command": " ".join(cmd),
            "env": extra,
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "seconds": round(time.monotonic() - t0, 1),
            "ok": r.returncode == 0 and failed == 0 and passed > 0,
        }
        out.append(rec)
        mark = "ok" if rec["ok"] else "FAILED"
        print(f"  {mark:6} {name}: {passed} passed, {failed} failed, {len(skipped)} skipped, {rec['seconds']}s")
        for s in skipped:
            print(f"         skipped: {s}")
        if not rec["ok"]:
            sys.stderr.write(text[-4000:])
    return out


def board(tree: Path, allow_no_golden: bool) -> int:
    m = measure(tree)
    ct = m["chip_tree"]
    if ct["commit"] is None:
        raise Refused("could not read the 6502 checkout's commit")
    if ct["dirty"] is None:
        raise Refused("git is not on PATH, so whether the checkout is clean cannot be told; not recording")
    if ct["dirty"]:
        raise Refused(f"the 6502 checkout at {tree} has uncommitted changes; a record must name a commit that is what was tested")
    if m["halfwave"] is None:
        raise Refused("no halfwave binary to record (TM_HALFWAVE_BIN, the 6502 unit's HALFWAVE_BIN, or target/release/halfwave)")
    if m["halfwave"]["stated"] != ct["commit"]:
        raise Refused(f"the halfwave binary says it was built from {str(m['halfwave']['stated'])[:12]}, not this commit; rebuild it first (cargo build --release -p v6502-sim --bin halfwave)")
    if not shutil.which("cargo"):
        raise Refused("cargo is not on PATH")
    print(f"board-engine: testing {tree} at {ct['commit'][:12]} ({ct['subject']})")
    suites = run_suites(tree, allow_no_golden)
    if not all(s["ok"] for s in suites):
        raise Refused("a suite failed; nothing recorded")
    record = {
        "_": "The engine this site boards: written only by scripts/board-engine.py --board, after the suites below passed on this commit. deploy.sh --check compares the served release, the halfwave binary and the checkout against it. See notes/modules.md.",
        "boarded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rustc": subprocess.run(["rustc", "--version"], capture_output=True, text=True).stdout.strip() or None,
        **m,
        "tests": suites,
    }
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    print(f"board-engine: recorded {RECORD.relative_to(ROOT)}: 6502 {ct['commit'][:12]}, halfphi {m['halfphi']['version']} {m['halfphi']['shared_files_sha256'][:12]}, halfwave {m['halfwave']['sha256'][:12]}")
    return check(tree)


def check(tree: Path) -> int:
    if not RECORD.is_file():
        raise Refused(f"{RECORD.relative_to(ROOT)} does not exist; run --board first")
    rec = json.loads(RECORD.read_text())
    now = measure(tree)
    faults: list[str] = []
    want = rec["chip_tree"]["commit"]

    if not rec.get("tests") or not all(t.get("ok") and t.get("passed", 0) > 0 for t in rec["tests"]):
        faults.append("the record carries a suite that did not pass, or none; it should be impossible to write one")

    have = now["chip_tree"]["commit"]
    if have != want:
        faults.append(f"the 6502 checkout is at {(have or 'unknown')[:12]}; boarded {want[:12]}. The build reads its pages from this tree")
    if now["chip_tree"]["dirty"]:
        faults.append("the 6502 checkout has uncommitted changes, which no record can name")

    if now["halfphi"]["shared_files_sha256"] != rec["halfphi"]["shared_files_sha256"]:
        faults.append("halfphi's shared sources differ from the boarded digest")
    sa = now["halfphi"]["standalone"]
    if sa and not sa["shared_files_identical"]:
        faults.append("the standalone halfphi checkout differs from the 6502 tree's crate (tools/check-halfphi.mjs over there says which files)")

    if now["halfwave"] is None:
        faults.append("no halfwave binary found to compare")
    else:
        hw = now["halfwave"]
        if hw["sha256"] != rec["halfwave"]["sha256"]:
            faults.append(f"the halfwave binary ({hw['sha256'][:12]}, modified {hw['modified']}) is not the boarded one ({rec['halfwave']['sha256'][:12]})")
        if hw["stated"] is None:
            faults.append("the halfwave binary does not say what it was built from (older than the stamp, or would not run)")
        elif hw["stated"] != want:
            faults.append(f"the halfwave binary says it was built from {hw['stated'][:12]}; boarded {want[:12]}")
        if hw["running"] is None:
            print("  running service: /v1/meta did not answer over loopback; not measured on this box")
        elif hw["running"] != want:
            faults.append(f"the running chip API reports engine {hw['running'][:12]}; boarded {want[:12]} (rebuilt without a restart?)")

    if now["release"] is not None:
        if now["release"]["commit"] != want:
            faults.append(f"the served release {now['release']['version']} was built from {str(now['release']['commit'])[:12]}; boarded {want[:12]}")
    elif rec.get("release") is not None:
        print("  release: not measurable on this box (no aliased release directory); skipped")

    line = (
        f"6502 {(have or 'unknown')[:12]} halfphi {now['halfphi']['version']} {now['halfphi']['tag'] or 'untagged'} {now['halfphi']['shared_files_sha256'][:12]}"
        f" halfwave {(now['halfwave'] or {}).get('sha256', 'absent')[:12]} says {str((now['halfwave'] or {}).get('stated'))[:12]} runs {str((now['halfwave'] or {}).get('running'))[:12]}"
        f" release {(now['release'] or {}).get('version', 'unmeasured')}"
        f" boarded {rec['boarded_at']} ({sum(t['passed'] for t in rec['tests'])} tests)"
    )
    if faults:
        print(f"board-engine: NOT the boarded engine: {line}", file=sys.stderr)
        for f in faults:
            print(f"  - {f}", file=sys.stderr)
        print("  Test and record it with: python3 scripts/board-engine.py --board", file=sys.stderr)
        return 1
    print(f"board-engine: the boarded engine: {line}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--board", action="store_true", help="run the engine's suites in the 6502 checkout and record the result")
    g.add_argument("--check", action="store_true", help="compare what is served and built against the record")
    ap.add_argument("--allow-no-golden", action="store_true", help="board on a box without the golden oracle; the record then says the differential test may have been skipped")
    a = ap.parse_args()

    tree = chip_tree()
    if tree is None:
        msg = "board-engine: no 6502 checkout beside this one (TM_CHIP_TREE, or ../6502)."
        if a.board or os.environ.get("TM_REQUIRE_ENGINE") == "1":
            raise Refused(msg + " Nothing to board.")
        print(msg + " Skipped; TM_REQUIRE_ENGINE=1 makes that a failure.")
        return 0
    try:
        return board(tree, a.allow_no_golden) if a.board else check(tree)
    except Refused as e:
        print(e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
