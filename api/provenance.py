"""What commit is running, read out of .git rather than asked of git.

Two reasons it is not a subprocess:

  - A deploy runs under systemd's PATH, which on this host is
    /usr/local/sbin:...:/snap/bin and nothing else. That trap has already been
    paid for once here with node. Assuming `git` is on it is the same bet.
  - A production checkout may have no git at all. Reading two small files
    degrades to "I do not know" instead of to a traceback.

Where it cannot tell, it says null. A fabricated "unknown" commit in a
provenance endpoint is worse than an absent one, because it looks like an
answer.
"""

from __future__ import annotations

import re
from pathlib import Path

HEAD_REF = re.compile(r"^ref:\s*(?P<ref>\S+)")
SHA = re.compile(r"^[0-9a-f]{40}$")


def _git_dir(start: Path) -> Path | None:
    """The .git directory for `start`, or None. Walks up, because the service
    runs from api/ and the repository root is above it."""
    for d in [start, *start.parents]:
        candidate = d / ".git"
        if candidate.is_dir():
            return candidate
        # A worktree or submodule has .git as a file holding a gitdir: line.
        if candidate.is_file():
            text = candidate.read_text(errors="replace").strip()
            if text.startswith("gitdir:"):
                p = Path(text.split(":", 1)[1].strip())
                return p if p.is_dir() else None
    return None


def commit_and_branch(start: Path | None = None) -> tuple[str | None, str | None]:
    """(commit, branch). Either may be None, and None means "could not tell"."""
    git = _git_dir((start or Path(__file__).resolve()).parent)
    if git is None:
        return None, None

    head = git / "HEAD"
    if not head.is_file():
        return None, None
    text = head.read_text(errors="replace").strip()

    # Detached HEAD: the file is the sha itself and there is no branch.
    if SHA.match(text):
        return text, None

    m = HEAD_REF.match(text)
    if not m:
        return None, None
    ref = m.group("ref")
    branch = ref.split("/", 2)[-1] if ref.startswith("refs/heads/") else None

    loose = git / ref
    if loose.is_file():
        sha = loose.read_text(errors="replace").strip()
        return (sha if SHA.match(sha) else None), branch

    # Packed refs, which is where a ref lives after gc. Not an error case: a
    # long-lived checkout ends up here on its own.
    packed = git / "packed-refs"
    if packed.is_file():
        for line in packed.read_text(errors="replace").splitlines():
            if line.startswith(("#", "^")):
                continue
            parts = line.split(None, 1)
            if len(parts) == 2 and parts[1].strip() == ref and SHA.match(parts[0]):
                return parts[0], branch

    return None, branch
