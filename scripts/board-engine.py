#!/usr/bin/env python3
"""Board the engine: test what is served, record it, refuse anything else.

The roof does not compile Rust. It serves the engine three ways, all of them
from the 6502 project's SERVED RELEASE (notes/modules.md, "The engine edge"):

  - the wasm bundle and the explorer's modules, from that project's release
    directory, through an nginx alias at /6502/chip/
  - halfwave, the warm engine process, behind the chip API that /6502/api
    proxies to, reporting its commit at /v1/meta
  - the explorer's pages and the API reference, read at build time from a
    worktree of the 6502 repository pinned to the released commit

So "the engine this site is running" is the commit the served release was
built from (its build-info.json), and the two things held to it: the commit
the running service reports, and the commit the build's worktree is at. This
script takes those measurements, keeps the worktree at the served commit, and
is the only thing that writes data/engine.json.

    python3 scripts/board-engine.py --board        test the served commit, then record
    python3 scripts/board-engine.py --check        measure, compare, refuse

`--board` reads the served release's commit, refuses unless the running API
reports the same one (a release published and not restarted is not served
yet), checks out that commit into the worktree (../6502-served, or
TM_CHIP_SERVED), runs the engine's own test suites THERE (halfphi's three
chips, v6502-sim's functional, state, timing, interrupt and golden tests) and
writes the record only when every one of them passed. `--check` is what
deploy.sh runs: it fails when the served release, the running service or the
worktree is not the boarded commit, and says which.

Why the served release and not the checkout beside this one (owner's call,
2026-08-27): the checkout is the 6502 project's working tree, and holding the
roof to it blocked four deploys in one day on commits that were documentation
and tests, and collided with that project's habit of dirtying its tree on
purpose for a mutation test. What the roof depends on is what is served, and
that is readable without looking in anyone's working tree. The 6502 repo's
objects are still where the commit comes from; its working tree is never read
and never needs to be clean.

The rule this implements is the registry's: the thing that publishes must
not be the thing that claims. build-info.json carries that project's own test
counts; they are recorded for the reader but not believed: the suites are run
here, on the commit that is served, and the record says when and what.

Absent a served release directory (every box but the one serving the site),
`--check` SKIPS and says so: a clone of this repository alone has to build
and deploy. TM_REQUIRE_ENGINE=1 makes absence a failure.

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
    """The 6502 repository beside this one: TM_CHIP_TREE, else the sibling.
    Its OBJECTS are what the worktree is checked out from; its working tree
    is not read. An explicit path is used alone, so a wrong one is reported
    rather than quietly replaced."""
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


def git_dir(tree: Path) -> Path:
    """`.git` is a directory in a checkout and a pointer file in a worktree
    (`gitdir: <repo>/.git/worktrees/<name>`), where HEAD lives."""
    dot = tree / ".git"
    if dot.is_file():
        text = dot.read_text().strip()
        if text.startswith("gitdir:"):
            p = Path(text[7:].strip())
            return p if p.is_absolute() else (tree / p).resolve()
    return dot


def head_of(tree: Path) -> str | None:
    """The commit, read out of .git so a PATH without git still answers."""
    head = git_dir(tree) / "HEAD"
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
    A release published and not restarted is caught here and nowhere else."""
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
    m = re.search(r"location (?:\^~ )?/6502/chip/ \{\s*alias (\S+?);", conf.read_text())
    if not m:
        return None
    p = Path(m.group(1))
    return p.resolve() if p.is_dir() else None


def served_info() -> dict | None:
    """What the served release says it was built from: build-info.json, which
    that project's deploy writes beside the assets."""
    rd = served_release()
    if not rd or not (rd / "build-info.json").is_file():
        return None
    info = json.loads((rd / "build-info.json").read_text())
    return {
        "version": info.get("version"),
        "commit": info.get("commitFull") or info.get("commit"),
        "built": info.get("built"),
        "dirty": info.get("dirty"),
        # Recorded for the reader, not believed: the suites below are run here.
        "their_tests": info.get("tests"),
    }


def worktree_path() -> Path:
    return Path(os.environ.get("TM_CHIP_SERVED") or (ROOT.parent / "6502-served")).resolve()


# Generated, gitignored files the suites need, linked from the repository
# beside this one where they exist: the golden oracle (5 MB, derived from the
# die data, never committed) and the die layout. A link rather than a copy,
# and only where the worktree lacks the file.
GENERATED = ["tools/golden-trace/golden.txt", "web/layout.bin"]


def sync_worktree(repo: Path, commit: str) -> Path:
    """The worktree at the served commit: created from the repository's
    objects the first time, moved to the commit every time after. Detached,
    so nothing in it is a branch anyone else is on; its submodule is
    initialised with the sibling's copy as a reference so no clone leaves
    the box."""
    wt = worktree_path()
    if not (wt / ".git").exists():
        wt.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(["git", "-C", str(repo), "worktree", "add", "--detach", str(wt), commit], capture_output=True, text=True)
        if r.returncode != 0:
            raise Refused(f"could not create the worktree at {wt}: {r.stderr.strip()[:300]}")
    else:
        r = subprocess.run(["git", "-C", str(wt), "checkout", "--detach", "--force", commit], capture_output=True, text=True)
        if r.returncode != 0:
            raise Refused(f"could not move the worktree at {wt} to {commit[:12]}: {r.stderr.strip()[:300]} (is the commit in {repo}?)")
    sub = repo / "extern" / "visual6502"
    ref = ["--reference", str(sub)] if (sub / ".git").exists() or (sub / "segdefs.js").exists() else []
    r = subprocess.run(["git", "-C", str(wt), "submodule", "update", "--init", *ref], capture_output=True, text=True)
    if r.returncode != 0:
        raise Refused(f"the worktree's submodule did not initialise: {r.stderr.strip()[:300]}")
    for rel in GENERATED:
        src, dst = repo / rel, wt / rel
        if not dst.exists() and src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.symlink_to(src)
    return wt


def measure(repo: Path) -> dict:
    """Everything --check compares and --board records, taken now. `repo` is
    the 6502 repository; what is measured is the served release, the running
    service, and the worktree."""
    served = served_info()
    wt = worktree_path()
    have_wt = (wt / "crates" / "halfphi" / "src" / "engine.rs").is_file()

    halfphi = None
    if have_wt:
        cargo = (wt / "crates" / "halfphi" / "Cargo.toml").read_text()
        version = re.search(r'^version\s*=\s*"([^"]+)"', cargo, re.M)
        digest = hashlib.sha256()
        for rel in SHARED:
            digest.update(rel.encode() + b"\0" + (wt / "crates" / "halfphi" / rel).read_bytes() + b"\0")
        standalone = None
        sib = Path(os.environ.get("HALFPHI") or (ROOT.parent / "halfphi"))
        if (sib / "src" / "engine.rs").is_file():
            same = all((sib / rel).read_bytes() == (wt / "crates" / "halfphi" / rel).read_bytes() for rel in SHARED)
            standalone = {
                "commit": head_of(sib),
                "tag": git(sib, "describe", "--tags", "--exact-match", "--match", "v*"),
                "shared_files_identical": same,
            }
        halfphi = {
            "version": version.group(1) if version else None,
            "tag": git(wt, "describe", "--tags", "--exact-match", "--match", "halfphi-v*"),
            "shared_files_sha256": digest.hexdigest(),
            "standalone": standalone,
        }

    # The binary on disk is the 6502 project's; what the roof runs against is
    # the process, which reports its own commit. The file is recorded for the
    # reader (its stamp says what it was built from) and holds nothing.
    hw = halfwave_bin(repo)
    binary = None
    if hw:
        st = hw.stat()
        binary = {"sha256": sha256(hw), "bytes": st.st_size, "modified": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(timespec="seconds"), "stated": stated_commit(hw)}

    status = git(wt, "status", "--porcelain", "--untracked-files=no") if have_wt else None
    return {
        "served": served,
        "running": running_commit(),
        "worktree": {
            "commit": head_of(wt) if have_wt else None,
            "subject": git(wt, "log", "-1", "--format=%s") if have_wt else None,
            "committed": git(wt, "log", "-1", "--format=%cI") if have_wt else None,
            "dirty": None if status is None else bool(status),
        },
        "halfphi": halfphi,
        "halfwave": binary,
    }


def run_suites(tree: Path, allow_no_golden: bool) -> list[dict]:
    env = dict(os.environ)
    # Its own target directory, beside the worktree: the 6502 project's build
    # cache is that project's, and the worktree's sources are at another
    # path anyway.
    env.setdefault("CARGO_TARGET_DIR", str(tree.parent / (tree.name + "-target")))
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


def board(repo: Path, allow_no_golden: bool) -> int:
    served = served_info()
    if served is None or not served.get("commit"):
        raise Refused("no served release to board: the aliased release directory carries no build-info.json (TM_CHIP_RELEASE names it on another box)")
    commit = served["commit"]
    running = running_commit()
    if running is None:
        raise Refused("the chip API did not answer /v1/meta over loopback; the served engine cannot be told from the published one")
    if running != commit:
        raise Refused(f"the served release {served['version']} was built from {commit[:12]} but the running service reports {running[:12]}: published and not restarted. Restart it, then board")
    if not shutil.which("cargo"):
        raise Refused("cargo is not on PATH")
    wt = sync_worktree(repo, commit)
    m = measure(repo)
    if m["worktree"]["commit"] != commit:
        raise Refused(f"the worktree at {wt} is at {str(m['worktree']['commit'])[:12]} after checkout of {commit[:12]}; not recording")
    print(f"board-engine: testing the served release {served['version']} at {commit[:12]} ({m['worktree']['subject']}) in {wt}")
    suites = run_suites(wt, allow_no_golden)
    if not all(s["ok"] for s in suites):
        raise Refused("a suite failed; nothing recorded")
    record = {
        "_": "The engine this site boards: written only by scripts/board-engine.py --board, after the suites below passed on the served commit, in a worktree pinned to it. deploy.sh --check compares the served release, the running service and the worktree against it. See notes/modules.md.",
        "boarded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rustc": subprocess.run(["rustc", "--version"], capture_output=True, text=True).stdout.strip() or None,
        **m,
        "tests": suites,
    }
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    print(f"board-engine: recorded {RECORD.relative_to(ROOT)}: served {served['version']} {commit[:12]}, halfphi {m['halfphi']['version']} {m['halfphi']['shared_files_sha256'][:12]}")
    return check(repo)


def check(repo: Path) -> int:
    if not RECORD.is_file():
        raise Refused(f"{RECORD.relative_to(ROOT)} does not exist; run --board first")
    rec = json.loads(RECORD.read_text())
    if "served" not in rec:
        raise Refused("the record predates the served-release gate (it names a checkout); run --board to write one that names a release")
    now = measure(repo)
    faults: list[str] = []
    want = rec["served"]["commit"]

    if not rec.get("tests") or not all(t.get("ok") and t.get("passed", 0) > 0 for t in rec["tests"]):
        faults.append("the record carries a suite that did not pass, or none; it should be impossible to write one")

    if now["served"] is None:
        print("  served release: not measurable on this box (no aliased release directory); skipped")
    elif now["served"]["commit"] != want:
        faults.append(f"the served release {now['served']['version']} was built from {str(now['served']['commit'])[:12]}; boarded {want[:12]}")

    if now["running"] is None:
        print("  running service: /v1/meta did not answer over loopback; not measured on this box")
    elif now["running"] != want:
        faults.append(f"the running chip API reports engine {now['running'][:12]}; boarded {want[:12]} (published and not restarted?)")

    if now["worktree"]["commit"] is None:
        faults.append(f"no worktree at {worktree_path()}; the build reads its pages from it (--board creates it)")
    else:
        if now["worktree"]["commit"] != want:
            faults.append(f"the worktree is at {now['worktree']['commit'][:12]}; boarded {want[:12]}. The build reads its pages from it (--board moves it)")
        if now["worktree"]["dirty"]:
            faults.append("the worktree has uncommitted changes; nothing should write there")
        if now["halfphi"]["shared_files_sha256"] != rec["halfphi"]["shared_files_sha256"]:
            faults.append("halfphi's shared sources in the worktree differ from the boarded digest")
        sa = now["halfphi"]["standalone"]
        if sa and not sa["shared_files_identical"]:
            faults.append("the standalone halfphi checkout differs from the served crate (tools/check-halfphi.mjs over there says which files)")

    line = (
        f"served {(now['served'] or {}).get('version', 'unmeasured')} {str((now['served'] or {}).get('commit'))[:12]}"
        f" runs {str(now['running'])[:12]} worktree {str(now['worktree']['commit'])[:12]}"
        f" halfphi {(now['halfphi'] or {}).get('version')} {(now['halfphi'] or {}).get('tag') or 'untagged'} {str((now['halfphi'] or {}).get('shared_files_sha256'))[:12]}"
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
    g.add_argument("--board", action="store_true", help="test the served release's commit in the worktree and record the result")
    g.add_argument("--check", action="store_true", help="compare what is served and built against the record")
    ap.add_argument("--allow-no-golden", action="store_true", help="board on a box without the golden oracle; the record then says the differential test may have been skipped")
    a = ap.parse_args()

    tree = chip_tree()
    if tree is None:
        msg = "board-engine: no 6502 repository beside this one (TM_CHIP_TREE, or ../6502) to check the served commit out of."
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
