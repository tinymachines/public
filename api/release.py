"""The version, from the one file that holds it.

There was no version. The API declared "1.0.0" in a decorator, web/package.json
said "0.1.0", and neither was ever incremented: two numbers that disagreed
about the same thing and a third fact, the commit, doing the actual work of
saying what was running.

So there is one file, `VERSION`, and everything reads it. `scripts/deploy.sh`
increments it, and it is the only thing that does.

## What the number means, which is worth stating before it drifts

It counts CHANGES THAT WERE DEPLOYED, not releases planned in advance. The
patch digit moves on every deploy that carries a change; minor and major move
when somebody says so. That makes it a running count of what has been put in
front of people, which is the question a version answers on a site that is
deployed continuously and never packaged.

It is not a substitute for the commit. The commit says exactly what is running
and is what a bug report needs; the version is what a person can say out loud.
`/v1/meta` reports both, and the footer shows both.
"""

from __future__ import annotations

from pathlib import Path

FILE = Path(__file__).resolve().parent.parent / "VERSION"


def version() -> str:
    """The current version.

    Read at import rather than per call: it changes when the file changes, and
    the file changes on deploy, which restarts this process. A running service
    reporting a version it is not running would be exactly the drift the file
    exists to remove.
    """
    try:
        return FILE.read_text().strip()
    except OSError:
        # A tarball with no VERSION still has to start. "0.0.0" is visibly not
        # a real version, which is better than a plausible one: a service
        # reporting 1.0.0 because it could not find the file is a service
        # lying with a straight face.
        return "0.0.0"


VERSION = version()
