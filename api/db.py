"""One SQLite file, and the migrations that shape it.

Until now this service held nothing. Every answer it gave was derived from
`pieces.py` or measured live, which is why it could be restarted at any moment
and why a copy of it was worth nothing to anybody. That changes here, so the
boundary is worth stating rather than discovering: **this file is the only
thing in the service that persists**, and everything in it is administrative.
No chip state, no machine, no cartridge. Those stay where they are.

Three decisions, each with the reason it was made.

**sqlite3 from the standard library, no ORM and no driver.** The registry next
door is one SQLite file with a row per thing and has not needed more. Adding a
dependency to this service means adding it to a unit that runs on the system
interpreter with no virtualenv, which is a deployment change to buy an
abstraction over eight columns.

**Migrations are a list, applied by `PRAGMA user_version`.** Not "create table
if not exists", which is the version of this that works until the day a column
is added and then silently serves an old shape. The number in the file says
which migrations have run, and a database from the future is refused rather
than opened: a downgrade that silently drops writes is worse than a service
that will not start.

**The file is not in the repository, and its path is not decided here.**
`TM_DB` names it. Under systemd, `StateDirectory=tinymachines` sets
`$STATE_DIRECTORY` and the unit points `TM_DB` at it, so the data outlives any
move of the checkout. `*.db` is gitignored, but a path that defaults into the
working tree is a thing somebody eventually commits, so the default is a state
directory rather than `./`.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Where the file is.
# ---------------------------------------------------------------------------


def path() -> Path:
    """The database file, resolved on every call rather than at import.

    Read live so a test can point the whole service at a temp file by setting
    one environment variable, without importing anything in a particular order.
    An import-time constant here would mean the test suite's isolation depended
    on module load order, which is the kind of thing that works until somebody
    adds an import.
    """
    explicit = os.environ.get("TM_DB")
    if explicit:
        return Path(explicit)
    state = os.environ.get("STATE_DIRECTORY")  # set by systemd StateDirectory=
    if state:
        return Path(state) / "roof.db"
    return Path.home() / ".local" / "state" / "tinymachines" / "roof.db"


def now() -> str:
    """UTC, ISO 8601, with the offset on it.

    Stored as text because SQLite has no date type and a naive string is how
    a timezone gets lost. Pydantic parses these back into aware datetimes, so
    what the API emits carries the offset too.
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Migrations. Append only. Never edit one that has shipped.
# ---------------------------------------------------------------------------

MIGRATIONS: list[str] = [
    # 1: users and keys.
    """
    CREATE TABLE users (
        id          TEXT PRIMARY KEY,
        email       TEXT NOT NULL,
        handle      TEXT NOT NULL,
        first_name  TEXT NOT NULL,
        pic         TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        disabled_at TEXT
    );

    -- Both are identity, so both are unique, and both are stored lowercased by
    -- the layer above. Case-folding in the column would be a second place that
    -- decides what two identities being the same means.
    CREATE UNIQUE INDEX users_email ON users(email);
    CREATE UNIQUE INDEX users_handle ON users(handle);

    CREATE TABLE api_keys (
        id           TEXT PRIMARY KEY,
        -- The whole presented key, SHA-256, hex. The key itself is never
        -- stored: see keys.py for why this is a plain digest and not a slow
        -- password hash.
        sha256       TEXT NOT NULL,
        -- The public half, shown in every list. It identifies a key in a log
        -- or a table without being any part of the secret.
        pub          TEXT NOT NULL,
        scope        TEXT NOT NULL,
        note         TEXT NOT NULL DEFAULT '',
        -- Nullable on purpose. Keys exist before users do: the bootstrap admin
        -- key belongs to nobody, and a dev key can be minted for someone who
        -- has not been given a row yet. ON DELETE SET NULL rather than CASCADE
        -- because deleting a person should never silently delete the audit of
        -- what their credential did.
        user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at   TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at   TEXT
    );

    CREATE UNIQUE INDEX api_keys_sha256 ON api_keys(sha256);
    CREATE INDEX api_keys_user ON api_keys(user_id);
    """,
    # 2: the public token mint's ledger. Who minted (as a digest of their
    #    address), when, and the note they left. Never the token: that lives,
    #    as its own digest, in the registry's database next door. See mint.py.
    """
    CREATE TABLE token_mints (
        id         TEXT PRIMARY KEY,
        ip_sha256  TEXT NOT NULL,
        note       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );
    CREATE INDEX token_mints_ip ON token_mints(ip_sha256, created_at);
    CREATE INDEX token_mints_created ON token_mints(created_at);
    """,
]


class Downgrade(RuntimeError):
    """The file was written by a newer version of this service."""


def connect(*, handed_between_threads: bool = False) -> sqlite3.Connection:
    """A connection with the pragmas that matter, migrated up to date.

    WAL because a read must not block while the admin screen writes, and this
    process is asyncio: a blocked write in one request stalls the event loop
    for every other. busy_timeout because the alternative to waiting is
    `database is locked` surfacing as a 500 on a working database.

    foreign_keys is ON per connection, not per file. SQLite defaults it OFF for
    backwards compatibility, so a connection that forgets it enforces nothing
    and the REFERENCES above become documentation.

    `handed_between_threads` turns off sqlite3's same-thread assertion, and it
    is off by default because that assertion is usually catching a real bug.
    The one caller that sets it is the request dependency in admin.py, and the
    reason is specific: **FastAPI runs a generator dependency's setup and its
    teardown in different threadpool workers.** The connection is opened in one
    worker and closed in another, so the assertion fires on `conn.close()` and
    the request 500s.

    That is safe here and it is worth saying exactly why, because "we turned
    the thread check off" is otherwise the sentence in front of a data race.
    The connection is used by exactly one request, and that request's work is
    strictly sequential: the route body is a `def`, so it runs to completion in
    one worker before the teardown runs in another. There is never a moment
    when two threads hold it, so what is being disabled is a check about
    concurrent sharing that is not happening. Nothing else in this service may
    pass this.

    It shipped without it, and every one of the forty sequential tests passed:
    under one request at a time the pool hands back the same worker. It fired
    on the first real page load, because the admin screen fetches keys and
    users with Promise.all. api/test_admin.py now makes concurrent requests.
    """
    p = path()
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p, timeout=5.0, check_same_thread=not handed_between_threads)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    migrate(conn)
    return conn


def migrate(conn: sqlite3.Connection) -> int:
    """Bring the file up to len(MIGRATIONS). Returns how many ran."""
    have = conn.execute("PRAGMA user_version").fetchone()[0]
    if have > len(MIGRATIONS):
        raise Downgrade(
            f"{path()} is at schema version {have}, this build knows "
            f"{len(MIGRATIONS)}. Refusing to open it: running an older service "
            "against a newer file writes rows the newer one cannot read back."
        )
    ran = 0
    for i in range(have, len(MIGRATIONS)):
        with conn:  # one transaction per migration, DDL included
            conn.executescript(MIGRATIONS[i])
            # Not a bound parameter: PRAGMA does not take one, and the value is
            # a loop index rather than anything a caller supplies.
            conn.execute(f"PRAGMA user_version = {i + 1}")
        ran += 1
    return ran
