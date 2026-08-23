"""Dev keys: minted once, shown once, stored as a digest.

The rule this inherits is the registry's, and START-HERE.md §5 says to extend
it rather than start again: **a key is shown once and only its SHA-256 is
stored**, so a copy of the database is not a copy of everybody's credentials.
That is the part which would hurt to change later, so it is the part that is
copied exactly.

Two things are added on top of it, and both are here because the registry's
version has a gap the roof would inherit.

**A key has a public half.** The registry stores a bare digest, so a token in a
list is a hash: unrecognisable to the person who holds the key, and useless in
a log line. A key here is `tmk_<pub>_<secret>`. `pub` is eight hex characters,
stored in clear, printed in every list and safe in a log; `secret` is 256 bits
that nothing but the holder ever sees again. Revoking the right key stops being
a guess.

**Scope is a column rather than a convention.** `dev` and `admin`, ordered, and
`admin` covers `dev`. Two scopes is not a permission system and is not meant to
be; what it is, is a place for the third one to go that is not a boolean called
`is_admin`.

## Why a plain SHA-256 and not bcrypt or argon2

Because the thing being hashed is not a password. `secrets.token_urlsafe(32)`
is 256 bits from the system CSPRNG, so there is no dictionary to run against
it, no reuse from another site, and no candidate list shorter than 2^256. A
slow KDF exists to make guessing expensive; where guessing is already
impossible it buys nothing and costs the thing that makes this work: a digest
can be a UNIQUE index, so authentication is one indexed lookup rather than a
scan that tries every stored hash in turn.

The comparison is done by SQLite, on an index, and is therefore not
constant-time. That is fine here and it is worth writing down why, because
"not constant-time" is usually a finding: the value being compared is the hash
of the caller's own input. A timing difference tells an attacker something
about a string they already hold, and nothing whatever about the stored
secret, which cannot be recovered from the digest in the first place.
"""

from __future__ import annotations

import hashlib
import re
import secrets
import sqlite3
from typing import Optional

import db

# Ordered by power. Membership and ordering both matter: `covers` reads the
# index, so adding a scope in the wrong position silently widens or narrows
# every key that already exists.
SCOPES = ("dev", "admin")

PREFIX = "tmk"
_SHAPE = re.compile(r"^tmk_[0-9a-f]{8}_[A-Za-z0-9_-]{40,}$")


def covers(have: str, need: str) -> bool:
    """Does a key with scope `have` satisfy a route needing `need`?"""
    if have not in SCOPES or need not in SCOPES:
        return False
    return SCOPES.index(have) >= SCOPES.index(need)


def digest(presented: str) -> str:
    return hashlib.sha256(presented.encode("utf-8")).hexdigest()


def looks_like_a_key(presented: str) -> bool:
    """Shape only. Says nothing about whether the key exists.

    Worth having as its own step: it lets an obviously malformed credential be
    refused without a database round trip, and it keeps the pattern in one
    place instead of implied by whatever mint() happened to emit.
    """
    return bool(_SHAPE.match(presented))


def mint(
    conn: sqlite3.Connection,
    *,
    scope: str,
    note: str = "",
    user_id: Optional[str] = None,
) -> tuple[str, sqlite3.Row]:
    """Create a key. Returns (the key itself, the stored row).

    The first element of that tuple is the only time the key exists anywhere
    outside the caller's hands. Nothing here logs it, and the row that comes
    back with it cannot reproduce it.
    """
    if scope not in SCOPES:
        raise ValueError(f"unknown scope {scope!r}; valid: {', '.join(SCOPES)}")

    pub = secrets.token_hex(4)
    key = f"{PREFIX}_{pub}_{secrets.token_urlsafe(32)}"
    kid = "k_" + secrets.token_hex(8)
    with conn:
        conn.execute(
            "INSERT INTO api_keys (id, sha256, pub, scope, note, user_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (kid, digest(key), pub, scope, note, user_id, db.now()),
        )
    return key, get(conn, kid)


def get(conn: sqlite3.Connection, key_id: str) -> Optional[sqlite3.Row]:
    return conn.execute("SELECT * FROM api_keys WHERE id = ?", (key_id,)).fetchone()


def find(conn: sqlite3.Connection, presented: str) -> Optional[sqlite3.Row]:
    """The row for a presented key, revoked or not.

    Revoked keys are returned rather than hidden, so the caller can answer
    "this key was revoked" instead of "no such key". They are different facts
    and the person holding a revoked key is usually entitled to the first one.
    """
    if not looks_like_a_key(presented):
        return None
    return conn.execute(
        "SELECT * FROM api_keys WHERE sha256 = ?", (digest(presented),)
    ).fetchone()


def touch(conn: sqlite3.Connection, key_id: str, when: str) -> None:
    """Record that a key was used, at most once a minute.

    Every authenticated GET would otherwise be a write, which is a lot of
    fsync for a column nobody reads to the second. The comparison is on the
    stored ISO string: these are all UTC with the same shape, so lexical order
    is chronological order.
    """
    conn.execute(
        "UPDATE api_keys SET last_used_at = ? "
        "WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)",
        (when, key_id, when),
    )
    conn.commit()


def revoke(conn: sqlite3.Connection, key_id: str, when: str) -> bool:
    """Returns whether this call was the one that revoked it.

    False for a key that was already revoked, so the caller can decline to
    report a second revocation as if it had done something. The row is kept:
    revoking is about the credential, and deleting it would delete the record
    that it ever existed along with it.
    """
    with conn:
        cur = conn.execute(
            "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
            (when, key_id),
        )
    return cur.rowcount == 1


def listing(conn: sqlite3.Connection, *, include_revoked: bool = True) -> list[sqlite3.Row]:
    sql = "SELECT * FROM api_keys"
    if not include_revoked:
        sql += " WHERE revoked_at IS NULL"
    sql += " ORDER BY created_at DESC, id DESC"
    return list(conn.execute(sql))


def active_admin_count(conn: sqlite3.Connection) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM api_keys WHERE scope = 'admin' AND revoked_at IS NULL"
    ).fetchone()[0]
