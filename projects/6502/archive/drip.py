#!/usr/bin/env python3
"""Slowly pull everything the Wayback Machine holds for a domain.

    python3 projects/6502/archive/drip.py --fetch-index   # query the CDX API
    python3 projects/6502/archive/drip.py --index         # load the CDX into the DB
    python3 projects/6502/archive/drip.py                 # fetch, resumable, Ctrl-C safe
    python3 projects/6502/archive/drip.py --status        # progress, ETA, failures

Brought over from `tinymachines/6502` (`archive/tools/drip.py`), where it has
already run to completion once: **24,429 of 24,442 URLs, 3.01 GB, 23,958
distinct content blobs**, at a measured ~15 URLs/min. The 13 that failed are
9 x HTTP 404 and 4 x HTTP 500, server side, and a re-run fails on them
identically. Those figures are that run's, not this file's: nothing here has
fetched anything yet.

This is the completionist pass. A targeted harvest takes what is known to be
worth having; this one takes the whole domain index and works through it, on
the principle that the cheapest moment to collect something is before anybody
has decided it matters. Sorting comes later. Collection comes first.

Designed to run for days:

* **Resumable at any moment.** State is one SQLite row per URL, committed as it
  goes. Killing the process loses at most the request in flight.
* **Content-addressed with hardlinks.** The CDX index carries a digest per
  capture, so a URL whose bytes we already hold is hardlinked rather than
  refetched. On a wiki that is most of the corpus, because MediaWiki serves the
  same navigation chrome under thousands of distinct URLs, and on a drip
  measured in requests per second, not fetching is the only real optimisation
  available. The completed run deduplicated 471 URLs this way.
* **Polite by construction.** One request at a time, a delay between each, and
  generous backoff on the 429s the Archive uses to push back. The Internet
  Archive is a charity preserving this material for everyone. Hammering it to
  save ourselves an afternoon would be a poor trade.

Failures are recorded, not fatal. A URL that fails is left pending with its
error and its attempt count, so a later run retries it without disturbing the
rest.

## Two things changed in the port, and both are about this being a public repo

**The harvest is written outside the checkout.** `TM_ARCHIVE` names the
directory; under systemd `$STATE_DIRECTORY` is used, and otherwise it falls
back to a state directory under `$HOME`. The original wrote 3.01 GB into
`archive/wayback/` beside the code. That was fine in a repo where the archive
tree was already the point, and it is not fine here: three gigabytes of another
project's content sitting in a public working tree is one `git add -A` from
being published, and `.gitignore` is a weaker guarantee than a path that was
never inside the tree.

**The index step that was missing is here.** `drip.py` in the 6502 repo reads
`cdx-full/*.json` and nothing in that repository produces them: the shards were
fetched by hand and committed, so a fresh clone had the data but not the means.
`--fetch-index` queries the CDX API with the same paging the Archive documents
and writes the same shard format, so the harvest is reproducible rather than
merely repeatable.

## What may be done with what this collects

**Nothing is redistributed from this repository.** What comes down is
visual6502.org's own content: die photography, wikitext and the pages built on
them, under **CC BY-NC-SA 3.0**, and NonCommercial and ShareAlike travel with
it. `NOTICE.md` records that `extern/visual6502` is a submodule in the 6502
repo precisely so that repository does not redistribute NC-SA data. Writing a
harvest into a state directory rather than into the tree is the same decision,
made the same way, for the same reason.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import signal
import sqlite3
import sys
import time
import urllib.error
import urllib.parse as up
import urllib.request
from pathlib import Path

# The domain this harvests. One constant rather than an argument: which domain
# a harvest is of is a property of the harvest, and pointing the same state
# directory at a second domain would interleave two corpora in one index.
DOMAIN = "visual6502.org"

CDX_API = "http://web.archive.org/cdx/search/cdx"

# Identifies us and says how to reach us, which is what a polite crawler owes
# the service it is reading.
UA = ("Mozilla/5.0 (compatible; archival retrieval for preservation; "
      "contact via github.com/tinymachines/public)")

MAX_NAME = 150          # leave room for the digest suffix within 255-byte names

stop = False


def _sigint(*_):
    global stop
    stop = True
    print("\n  stopping after the current request (state is already saved)...")


# --------------------------------------------------------------------------
# Where the harvest lives. Never inside the checkout: see the module docstring.
# --------------------------------------------------------------------------

def root() -> Path:
    """The archive directory, resolved on every call rather than at import.

    Same resolution order as api/db.py, and for the same reason: a test or a
    one-off run points the whole tool somewhere else by setting one environment
    variable, without depending on import order.
    """
    explicit = os.environ.get("TM_ARCHIVE")
    if explicit:
        return Path(explicit)
    state = os.environ.get("STATE_DIRECTORY")       # set by systemd StateDirectory=
    if state:
        return Path(state) / "archive"
    return Path.home() / ".local" / "state" / "tinymachines" / "archive"


def paths() -> tuple[Path, Path, Path]:
    r = root() / DOMAIN
    return r / "cdx", r / "files", r / "state.db"


# --------------------------------------------------------------------------

def connect() -> sqlite3.Connection:
    _, _, db_path = paths()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(db_path, timeout=60)
    db.execute("PRAGMA journal_mode=WAL")     # survives a hard kill mid-write
    db.execute("""CREATE TABLE IF NOT EXISTS urls (
        url        TEXT PRIMARY KEY,
        timestamp  TEXT,
        mime       TEXT,
        length     INTEGER,
        digest     TEXT,
        path       TEXT,            -- relative to files/, once fetched
        state      TEXT DEFAULT 'pending',   -- pending|done|failed|skipped
        attempts   INTEGER DEFAULT 0,
        error      TEXT,
        fetched_at TEXT
    )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_state ON urls(state)")
    # Digest -> first local path holding those bytes, for hardlink dedupe.
    db.execute("""CREATE TABLE IF NOT EXISTS blobs (
        digest TEXT PRIMARY KEY, path TEXT)""")
    db.commit()
    return db


def safe_path(url: str) -> str:
    """A filesystem path mirroring the URL, including its query string.

    MediaWiki puts the entire page identity in the query (index.php?title=X),
    so dropping it would collapse thousands of distinct pages onto one file.
    Long or awkward names are truncated and given a hash suffix, which keeps
    them unique without any component exceeding what a filesystem accepts.
    """
    u = up.urlparse(url)
    host = u.netloc.lower().replace(":80", "")
    path = up.unquote(u.path)
    parts = [p for p in path.split("/") if p not in ("", ".", "..")]
    # A URL ending in "/" is a directory listing, and something else in the
    # index almost certainly lives underneath it. Naming it index.html keeps the
    # directory free for its children instead of racing them for the name.
    if not parts or path.endswith("/"):
        parts.append("index.html")
    if u.query:
        parts[-1] += "@" + up.unquote(u.query)

    clean = []
    for p in parts:
        p = re.sub(r'[\x00-\x1f<>:"\\|?*/]', "_", p).strip() or "_"
        if len(p.encode()) > MAX_NAME:
            h = hashlib.sha1(p.encode()).hexdigest()[:10]
            p = p.encode()[:MAX_NAME].decode("utf-8", "ignore") + "~" + h
        clean.append(p)
    return "/".join([host] + clean)


def wb_url(timestamp: str, original: str) -> str:
    """Original archived bytes: no toolbar, no rewritten links.

    The `id_` modifier is the difference between preserving what was served and
    preserving what the Archive shows a reader. A rewritten copy would have to
    be un-rewritten later, and the rewriting is lossy.
    """
    return f"https://web.archive.org/web/{timestamp}id_/{original}"


def prepare_dest(db: sqlite3.Connection, rel: str) -> Path:
    """Resolve file and directory name collisions, self-healing in either order.

    A URL can be both a page and a directory prefix: /images serves a listing
    and /images/6502/x.png lives under it, and the index yields them in
    arbitrary order. Whichever arrives first would otherwise claim the name and
    make the other unwritable, which is how the first run of this died.

    The web's own convention resolves it: a path that is also a directory keeps
    its content at <path>/index.html. Applied to whichever side is already on
    disk, so neither ordering loses.
    """
    _, files, _ = paths()
    dest = files / rel

    # An ancestor already written as a file: move it into its own directory.
    for i in range(1, len(dest.relative_to(files).parts)):
        anc = files / Path(*dest.relative_to(files).parts[:i])
        if anc.is_file():
            tmp = anc.with_name(anc.name + ".__tmp")
            anc.rename(tmp)
            anc.mkdir(parents=True, exist_ok=True)
            tmp.rename(anc / "index.html")
            moved = str((anc / "index.html").relative_to(files))
            db.execute("UPDATE urls SET path=? WHERE path=?",
                       (moved, str(anc.relative_to(files))))
            db.execute("UPDATE blobs SET path=? WHERE path=?",
                       (moved, str(anc.relative_to(files))))
            db.commit()

    # The target itself is already a directory: put the page inside it.
    if dest.is_dir():
        dest = dest / "index.html"
    return dest


# --------------------------------------------------------------------------
# The index. This half did not come over, because it did not exist.
# --------------------------------------------------------------------------

def fetch_index(page_size: int = 5000, delay: float = 2.0, pages: int = 0) -> None:
    """Query the CDX API for the whole domain and write it as shards.

    Paged with `showResumeKey`, which is the Archive's own mechanism: each
    response ends with a blank row and a key, and the next request carries it.
    Paging rather than one enormous query because a single unpaged request for
    a domain this size is the kind of thing that gets a client throttled, and
    because a run that dies halfway then has to start over.

    `collapse=urlkey` takes one capture per URL. That is the completionist pass
    over the domain, not over every version of every page: full version history
    per URL would be its own pass and its own order of magnitude.

    `pages` caps how many requests are made, and it exists because the first
    time this was exercised it began paging the whole 24,000 URL domain to
    prove that paging worked. Twenty minutes of somebody else's bandwidth to
    check a JSON shape is the wrong trade, and a tool with no way to take a
    small bite invites exactly that.
    """
    cdx, _, _ = paths()
    cdx.mkdir(parents=True, exist_ok=True)
    shard, rows_total, resume = 0, 0, None

    while not stop:
        q = {
            "url": DOMAIN,
            "matchType": "domain",
            "output": "json",
            "fl": "original,timestamp,mimetype,length,digest",
            "collapse": "urlkey",
            "limit": str(page_size),
            "showResumeKey": "true",
        }
        if resume:
            q["resumeKey"] = resume
        body, err = fetch(f"{CDX_API}?{up.urlencode(q)}")
        if body is None:
            sys.exit(f"CDX query failed: {err}")

        rows = json.loads(body.decode("utf-8", "replace")) if body.strip() else []
        if not rows:
            break

        # The resume key arrives as a trailing blank row then the key itself.
        resume = None
        while rows and (not rows[-1] or not rows[-1][0]):
            rows.pop()
        if rows and len(rows[-1]) == 1:
            resume = rows.pop()[0]
        while rows and (not rows[-1] or not rows[-1][0]):
            rows.pop()
        if not rows:
            break

        out = cdx / f"all-{shard}.json"
        out.write_text(json.dumps(rows))
        rows_total += len(rows) - (1 if rows[0][0] == "original" else 0)
        print(f"  {out.name}: {len(rows)} rows", flush=True)
        shard += 1
        if not resume or (pages and shard >= pages):
            break
        time.sleep(delay)

    print(f"index: {rows_total} rows in {shard} shard(s) under {cdx}")


def load_index(db: sqlite3.Connection) -> None:
    cdx, _, _ = paths()
    if not cdx.exists() or not any(cdx.glob("*.json")):
        sys.exit(f"no CDX index in {cdx}. Run --fetch-index first.")
    n_new = n_seen = 0
    for f in sorted(cdx.glob("*.json")):
        try:
            rows = json.loads(f.read_text())
        except json.JSONDecodeError:
            print(f"  skipping unreadable {f.name}")
            continue
        if rows and rows[0][0] == "original":
            rows = rows[1:]
        for r in rows:
            orig, ts, mime, length, digest = (list(r) + [None] * 5)[:5]
            n_seen += 1
            try:
                length = int(length)
            except (TypeError, ValueError):
                length = 0
            cur = db.execute(
                "INSERT OR IGNORE INTO urls(url,timestamp,mime,length,digest) "
                "VALUES(?,?,?,?,?)", (orig, ts, mime, length, digest))
            n_new += cur.rowcount
        db.commit()
        print(f"  {f.name}: {len(rows)} rows")
    print(f"index: {n_seen} rows, {n_new} new URLs")


# --------------------------------------------------------------------------

def fetch(url: str, tries: int = 4) -> tuple:
    """Return (body, error). Backs off on the Archive's throttling responses."""
    for attempt in range(tries):
        if stop:
            return None, "interrupted"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read(), None
        except urllib.error.HTTPError as e:
            if e.code in (429, 503, 502, 504) and attempt < tries - 1:
                # The Archive is asking us to slow down. Obey generously.
                time.sleep(30 * (attempt + 1) + random.uniform(0, 10))
                continue
            return None, f"HTTP {e.code}"
        except Exception as e:  # noqa: BLE001
            if attempt < tries - 1:
                time.sleep(10 * (attempt + 1))
                continue
            return None, f"{type(e).__name__}: {e}"
    return None, "exhausted"


def run(db: sqlite3.Connection, delay: float, limit: int) -> None:
    _, files, _ = paths()
    todo = db.execute(
        "SELECT url,timestamp,digest FROM urls "
        "WHERE state IN ('pending','failed') AND attempts < 5 "
        "ORDER BY attempts, rowid").fetchall()
    if limit:
        todo = todo[:limit]
    total = len(todo)
    print(f"{total} URLs to fetch (delay {delay}s)")
    if not total:
        return

    done = linked = failed = 0
    t0 = time.time()
    for i, (url, ts, digest) in enumerate(todo, 1):
        if stop:
            break
        try:
            dest = prepare_dest(db, safe_path(url))
        except OSError as e:
            db.execute("UPDATE urls SET state='failed', attempts=attempts+1, "
                       "error=? WHERE url=?", (f"path: {e}", url))
            db.commit()
            failed += 1
            continue
        rel = str(dest.relative_to(files))

        # Content we already hold under another URL: hardlink instead of
        # refetching. This is where most of the time is saved.
        prior = db.execute("SELECT path FROM blobs WHERE digest=?",
                           (digest,)).fetchone() if digest else None
        if prior and (files / prior[0]).is_file():
            try:
                dest.parent.mkdir(parents=True, exist_ok=True)
                if not dest.exists():
                    os.link(files / prior[0], dest)
                db.execute("UPDATE urls SET state='done', path=?, "
                           "fetched_at=datetime('now') WHERE url=?", (rel, url))
                db.commit()
                linked += 1
                continue
            except OSError:
                pass   # cross-device or name clash: fall through and fetch

        body, err = fetch(wb_url(ts, url))
        if body is None:
            db.execute("UPDATE urls SET state='failed', attempts=attempts+1, "
                       "error=? WHERE url=?", (err, url))
            db.commit()
            failed += 1
            if err == "interrupted":
                break
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                dest.write_bytes(body)
            except OSError as e:
                db.execute("UPDATE urls SET state='failed', attempts=attempts+1,"
                           " error=? WHERE url=?", (f"write: {e}", url))
                db.commit()
                failed += 1
                continue
            if digest:
                db.execute("INSERT OR IGNORE INTO blobs(digest,path) VALUES(?,?)",
                           (digest, rel))
            db.execute("UPDATE urls SET state='done', path=?, "
                       "fetched_at=datetime('now') WHERE url=?", (rel, url))
            db.commit()
            done += 1
            time.sleep(delay + random.uniform(0, delay * 0.4))

        if i % 25 == 0 or i == total:
            el = time.time() - t0
            rate = i / el if el else 0
            eta = (total - i) / rate if rate else 0
            print(f"  {i}/{total}  fetched={done} linked={linked} failed={failed}"
                  f"  {rate * 60:.0f}/min  eta {eta / 3600:.1f}h", flush=True)

    print(f"\nfetched {done}, hardlinked {linked}, failed {failed}")


def status(db: sqlite3.Connection) -> None:
    _, files, db_path = paths()
    print(f"{DOMAIN}, under {db_path.parent}")
    rows = dict(db.execute("SELECT state, count(*) FROM urls GROUP BY state"))
    total = sum(rows.values())
    print(f"{total} URLs in index")
    for k in ("done", "pending", "failed", "skipped"):
        if rows.get(k):
            print(f"  {rows[k]:7} {k}")
    n_blob = db.execute("SELECT count(*) FROM blobs").fetchone()[0]
    if n_blob:
        print(f"  {n_blob} distinct content blobs "
              f"({rows.get('done', 0) - n_blob} URLs deduplicated)")
    size = sum(f.stat().st_size for f in files.rglob("*") if f.is_file()) \
        if files.exists() else 0
    print(f"  {size / 1e9:.2f} GB on disk (hardlinks counted once by du)")
    errs = db.execute("SELECT error, count(*) c FROM urls WHERE state='failed' "
                      "GROUP BY error ORDER BY c DESC LIMIT 6").fetchall()
    for e, c in errs:
        print(f"  {c:6} failed: {e}")


def main() -> None:
    ap = argparse.ArgumentParser(description=f"Drip {DOMAIN} out of the Wayback Machine.")
    ap.add_argument("--fetch-index", action="store_true",
                    help="query the CDX API and write the shards")
    ap.add_argument("--pages", type=int, default=0,
                    help="stop after N CDX requests (default 0, meaning the whole domain)")
    ap.add_argument("--index", action="store_true", help="load the CDX shards into the DB")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--delay", type=float, default=1.5,
                    help="seconds between requests (default 1.5)")
    ap.add_argument("--limit", type=int, default=0, help="stop after N URLs")
    ap.add_argument("--where", action="store_true",
                    help="print where the harvest would go, and do nothing else")
    args = ap.parse_args()

    if args.where:
        cdx, files, db_path = paths()
        print(f"  cdx    {cdx}\n  files  {files}\n  db     {db_path}")
        print("\nSet TM_ARCHIVE to put it somewhere else. It is deliberately "
              "outside the checkout: see the module docstring.")
        return

    signal.signal(signal.SIGINT, _sigint)
    signal.signal(signal.SIGTERM, _sigint)

    if args.fetch_index:
        fetch_index(pages=args.pages)
        db = connect()
        load_index(db)
        status(db)
        return

    db = connect()
    if args.index:
        load_index(db)
        status(db)
        return
    if args.status:
        status(db)
        return

    if not db.execute("SELECT count(*) FROM urls").fetchone()[0]:
        print("index is empty; loading it first")
        load_index(db)
    _, files, _ = paths()
    files.mkdir(parents=True, exist_ok=True)
    run(db, args.delay, args.limit)
    status(db)


if __name__ == "__main__":
    main()
