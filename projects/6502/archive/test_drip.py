"""The drip's pure parts, tested without touching the network.

Nothing here fetches. A suite that needs the internet fails for reasons that
have nothing to do with the code, and then gets ignored: the same rule
api/test_api.py already runs on. What is worth testing here is the part that
has actually gone wrong, which is not the HTTP.

The path mapping is where this tool's bugs live. It has to turn 24,000 URLs
into 24,000 filenames on a real filesystem, where a name can collide with a
directory, exceed 255 bytes, or contain a character the kernel will not accept,
and where the same URL must map to the same name on a resumed run months later.
The original's first run died on exactly one of those.

    python3 -m pytest projects -q
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent

# Loaded by path because the filename has no package around it and the tool is
# meant to be run as a script, which is how it will be run.
_spec = importlib.util.spec_from_file_location("drip", HERE / "drip.py")
drip = importlib.util.module_from_spec(_spec)
sys.modules["drip"] = drip
_spec.loader.exec_module(drip)


@pytest.fixture(autouse=True)
def archive_in_a_tmpdir(tmp_path, monkeypatch):
    """Point the whole tool at a temp directory.

    autouse so a test cannot forget it. Without it these would write into the
    real state directory, and one of them deliberately creates colliding files.
    """
    monkeypatch.setenv("TM_ARCHIVE", str(tmp_path))
    assert str(drip.root()) == str(tmp_path)
    return tmp_path


# ---------------------------------------------------------------------------
# Where things go
# ---------------------------------------------------------------------------


def test_the_harvest_is_never_inside_the_checkout(monkeypatch):
    """The reason for the port's one structural change.

    Three gigabytes of another project's CC BY-NC-SA content inside a public
    working tree is one `git add -A` from being published. A .gitignore entry
    is a weaker guarantee than a path that was never in the tree, so this
    asserts the default is outside it rather than that it is ignored.
    """
    monkeypatch.delenv("TM_ARCHIVE", raising=False)
    monkeypatch.delenv("STATE_DIRECTORY", raising=False)
    repo = HERE.parents[2]
    assert (repo / "PROJECTS.md").is_file(), "not the repo root; this check would pass on nothing"
    assert repo not in drip.root().parents and drip.root() != repo


def test_systemd_state_directory_is_used_when_there_is_one(monkeypatch):
    monkeypatch.delenv("TM_ARCHIVE", raising=False)
    monkeypatch.setenv("STATE_DIRECTORY", "/var/lib/tinymachines")
    assert drip.root() == Path("/var/lib/tinymachines/archive")


# ---------------------------------------------------------------------------
# URL to filename
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("url,expected", [
    ("http://visual6502.org:80/", "visual6502.org/index.html"),
    ("http://visual6502.org/images/", "visual6502.org/images/index.html"),
    ("http://visual6502.org/images/6502/x.png", "visual6502.org/images/6502/x.png"),
    ("http://VISUAL6502.ORG/Foo", "visual6502.org/Foo"),
])
def test_the_obvious_shapes(url, expected):
    assert drip.safe_path(url) == expected


def test_the_query_is_the_page_identity_and_is_kept():
    """MediaWiki puts the whole page identity in the query. Dropping it
    collapses thousands of distinct pages onto one file, which is data loss
    that looks like deduplication."""
    a = drip.safe_path("http://visual6502.org/wiki/index.php?title=Foo")
    b = drip.safe_path("http://visual6502.org/wiki/index.php?title=Bar")
    assert a != b
    assert "title=Foo" in a


def test_a_slash_in_the_query_does_not_become_a_directory():
    """A behaviour change made during the port, called out rather than slipped in.

    The original sanitised control characters and the Windows-illegal set but
    not the separator, and the query is appended to the last path component
    AFTER the split on "/". So a page whose title contains a slash, which
    MediaWiki allows and uses for subpages, silently became a directory and
    the file landed one level deeper than the index believed.
    """
    p = drip.safe_path("http://visual6502.org/wiki/index.php?title=Foo/Bar")
    assert p.count("/") == 2, f"the query created a directory: {p}"
    assert "Foo_Bar" in p


def test_a_name_too_long_for_a_filesystem_is_truncated_and_stays_unique():
    long_a = "http://visual6502.org/wiki/index.php?title=" + "A" * 400
    long_b = "http://visual6502.org/wiki/index.php?title=" + "A" * 399 + "B"
    pa, pb = drip.safe_path(long_a), drip.safe_path(long_b)
    for p in (pa, pb):
        for part in p.split("/"):
            assert len(part.encode()) <= drip.MAX_NAME + 11, f"{part!r} is too long"
    assert pa != pb, "two different long URLs collapsed onto one filename"


def test_characters_a_filesystem_will_refuse_are_replaced():
    p = drip.safe_path('http://visual6502.org/a<b>c:d"e|f?g=1')
    assert not set(p.split("/")[-1]) & set('<>:"|')


def test_the_same_url_always_maps_to_the_same_name():
    """A resumed run months later has to agree with the first one, or it
    refetches the corpus and writes it beside itself."""
    u = "http://visual6502.org/wiki/index.php?title=6502&action=edit"
    assert drip.safe_path(u) == drip.safe_path(u)


def test_the_snapshot_url_asks_for_the_original_bytes():
    """`id_` is the difference between preserving what was served and
    preserving what the Archive shows a reader, which is rewritten and lossy."""
    u = drip.wb_url("20100918234739", "http://visual6502.org/")
    assert "id_/" in u and u.endswith("http://visual6502.org/")


# ---------------------------------------------------------------------------
# The collision that killed the first run
# ---------------------------------------------------------------------------


def test_a_page_that_is_also_a_directory_heals_whichever_arrives_first(archive_in_a_tmpdir):
    """/images serves a listing and /images/6502/x.png lives under it, and the
    CDX index yields them in arbitrary order. Both orderings are tested,
    because the whole point of the healing is that neither one loses."""
    db = drip.connect()
    _, files, _ = drip.paths()

    # Order one: the page first, then something beneath it.
    page = drip.prepare_dest(db, "visual6502.org/images")
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_bytes(b"listing")
    db.execute("UPDATE urls SET path=? WHERE url=?", ("visual6502.org/images", "x"))
    child = drip.prepare_dest(db, "visual6502.org/images/6502/x.png")
    child.parent.mkdir(parents=True, exist_ok=True)
    child.write_bytes(b"png")

    assert (files / "visual6502.org/images/index.html").read_bytes() == b"listing", \
        "the page was lost when its own child arrived"
    assert child.read_bytes() == b"png"

    # Order two: the directory already exists, and the page arrives after.
    (files / "visual6502.org/docs/deep").mkdir(parents=True, exist_ok=True)
    later = drip.prepare_dest(db, "visual6502.org/docs")
    assert later.name == "index.html" and later.parent.name == "docs"


# ---------------------------------------------------------------------------
# The state file
# ---------------------------------------------------------------------------


def test_connect_is_idempotent_and_creates_the_schema():
    db = drip.connect()
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"urls", "blobs"} <= tables
    drip.connect()   # again, on the same file
    assert {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")} == tables


def test_loading_the_index_twice_adds_nothing_the_second_time():
    """Resumability starts here: a re-run must not reset progress or duplicate
    rows, and INSERT OR IGNORE is what makes that true."""
    import json
    cdx, _, _ = drip.paths()
    cdx.mkdir(parents=True, exist_ok=True)
    (cdx / "all-0.json").write_text(json.dumps([
        ["original", "timestamp", "mimetype", "length", "digest"],
        ["http://visual6502.org/", "20100918234739", "text/html", "2490", "MS645ZO"],
        ["http://visual6502.org/a.png", "20110101000000", "image/png", "17", "QQQQQQQ"],
    ]))
    db = drip.connect()
    drip.load_index(db)
    assert db.execute("SELECT count(*) FROM urls").fetchone()[0] == 2

    db.execute("UPDATE urls SET state='done' WHERE url='http://visual6502.org/'")
    db.commit()
    drip.load_index(db)
    assert db.execute("SELECT count(*) FROM urls").fetchone()[0] == 2, "the index duplicated rows"
    assert db.execute(
        "SELECT state FROM urls WHERE url='http://visual6502.org/'").fetchone()[0] == "done", \
        "a re-run reset work that was already finished"


def test_a_missing_index_is_refused_rather_than_treated_as_empty():
    """An empty harvest and an absent index look identical afterwards: nothing
    on disk and a clean exit. One of them is a bug."""
    db = drip.connect()
    with pytest.raises(SystemExit):
        drip.load_index(db)
