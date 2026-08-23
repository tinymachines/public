"""The user table: email, handle, first name, picture. Nothing else yet.

Four columns because four were asked for, and the restraint is the point. A
user table is the schema most likely to accumulate fields nobody fills in, and
every one of them then has to be carried through an API, a form and a
migration. What is here is what an account needs to be identifiable by a human
and addressable by a URL.

**There is no authentication for a user.** No password column, no session, no
verification flag. That is not an omission to fill in later without deciding:
with no mail capability there is no reset path, so choosing passwords now would
be choosing a mechanism whose recovery story does not exist. A row here is a
record of a person, and a dev key is the only credential this service accepts.
When sign-in arrives it decides its own storage; nothing in this table presumes
what it will be.

**An email is stored, not verified.** It is validated for shape only, and the
shape check is deliberately loose. RFC 5321 permits addresses that every strict
validator on the internet rejects, so a strict check here would be an opinion
about which valid addresses are allowed. The only proof an address works is
sending to it, and this service cannot send.

**Both identities are folded to lowercase before they are stored.** Domains are
case-insensitive and handles are going to become path segments, so `Ada` and
`ada` being two rows is a bug that only shows up as two accounts belonging to
the same person. The UNIQUE index enforces it; the folding happens here so
there is one place that decides what "the same identity" means.
"""

from __future__ import annotations

import re
import secrets
import sqlite3
from typing import Optional

import db

# Two to thirty-two characters, no leading or trailing hyphen. The bound
# matches the registry's builder-page regex next door, because a handle here
# should be able to become /b/<handle> there without a second rule about what
# a handle is.
HANDLE = re.compile(r"^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$")

# Loose on purpose: see the module docstring. It rejects what is certainly not
# an address (no @, whitespace, no dot in the domain) and accepts the rest.
EMAIL = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")

# A handle becomes a path segment. These are the segments this site already
# serves or is going to, and a user holding one of them is a routing conflict
# discovered at the worst possible time. Reserved here rather than in the
# route table so the answer is the same in the API, the admin screen and any
# future sign-up.
RESERVED = frozenset({
    "admin", "api", "app", "assets", "b", "docs", "health", "help", "mcp",
    "openapi", "public", "root", "static", "style", "support", "system",
    "tinymachines", "user", "users", "www", "zoo",
})


class Invalid(ValueError):
    """A field did not pass its shape check. The message names the field."""


class Taken(ValueError):
    """A unique identity is already held by another row."""


def _clean_pic(pic: Optional[str]) -> Optional[str]:
    """Validate a picture reference, or refuse it.

    Three forms are accepted and the third one is the interesting one:

      /path            same origin, which is the only kind this site can show
      https://host/... a real URL, stored and shown as a link, NOT as an image
      data:image/...   inline, which the policy does permit

    The site's CSP is `img-src 'self' data:`, so an <img> pointing at another
    host is blocked by the browser and renders as a broken image with no error
    on the page: the quiet failure this repository keeps a list of. So a remote
    URL is stored, because it is a true fact about the person, and the admin
    screen shows it as a link beside a monogram rather than pretending to
    render it. Widening img-src to display avatars is a policy change and
    belongs in a conversation about the policy, not in a form handler.
    """
    if pic is None:
        return None
    pic = pic.strip()
    if not pic:
        return None
    if len(pic) > 4096:
        raise Invalid("pic: longer than 4096 characters")
    if pic.startswith("/") and not pic.startswith("//"):
        return pic
    if pic.startswith("https://") or pic.startswith("http://"):
        return pic
    if pic.startswith("data:image/"):
        return pic
    raise Invalid(
        "pic: must be a site-relative path, an http(s) URL, or a data:image URI"
    )


def _clean_handle(handle: str) -> str:
    handle = handle.strip().lower()
    if not HANDLE.match(handle):
        raise Invalid(
            "handle: 2 to 32 characters, lowercase letters, digits and hyphens, "
            "not starting or ending with a hyphen"
        )
    if handle in RESERVED:
        raise Invalid(f"handle: {handle!r} is reserved, because it is a path this site serves")
    return handle


def _clean_email(email: str) -> str:
    email = email.strip().lower()
    if not EMAIL.match(email) or len(email) > 254:
        raise Invalid("email: not an address")
    return email


def _clean_first_name(first_name: str) -> str:
    first_name = first_name.strip()
    if not first_name or len(first_name) > 128:
        raise Invalid("first_name: 1 to 128 characters")
    return first_name


def create(
    conn: sqlite3.Connection,
    *,
    email: str,
    handle: str,
    first_name: str,
    pic: Optional[str] = None,
) -> sqlite3.Row:
    email = _clean_email(email)
    handle = _clean_handle(handle)
    first_name = _clean_first_name(first_name)
    pic = _clean_pic(pic)

    uid = "u_" + secrets.token_hex(8)
    stamp = db.now()
    try:
        with conn:
            conn.execute(
                "INSERT INTO users (id, email, handle, first_name, pic, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (uid, email, handle, first_name, pic, stamp, stamp),
            )
    except sqlite3.IntegrityError as e:
        raise Taken(_which_is_taken(conn, email, handle)) from e
    return get(conn, uid)


def _which_is_taken(conn: sqlite3.Connection, email: str, handle: str) -> str:
    """Say which field collided.

    SQLite's IntegrityError names the index, but parsing an error string to
    decide what to tell a caller is a check that breaks on a library upgrade
    with no test failing. One extra query answers it from the data.
    """
    clashes = [
        name
        for name, value in (("email", email), ("handle", handle))
        if conn.execute(f"SELECT 1 FROM users WHERE {name} = ?", (value,)).fetchone()
    ]
    return f"{' and '.join(clashes)} already in use" if clashes else "already in use"


def get(conn: sqlite3.Connection, user_id: str) -> Optional[sqlite3.Row]:
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def by_handle(conn: sqlite3.Connection, handle: str) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM users WHERE handle = ?", (handle.strip().lower(),)
    ).fetchone()


def listing(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return list(conn.execute("SELECT * FROM users ORDER BY created_at DESC, id DESC"))


# The fields a PATCH may name, and the function that cleans each one.
PATCHABLE = {
    "email": _clean_email,
    "handle": _clean_handle,
    "first_name": _clean_first_name,
    "pic": _clean_pic,
}


def patch(conn: sqlite3.Connection, user_id: str, changes: dict) -> Optional[sqlite3.Row]:
    """Update only the fields named, and refuse anything else.

    The registry's rule, carried over verbatim because it was paid for there:
    **a PATCH touches only what it names**, so a client saving a first name
    cannot blank a picture it never loaded. That is a property of this
    function, not of the caller's diligence: a field absent from `changes` is
    absent from the UPDATE.

    An unknown field is an error rather than an ignored key. Silently dropping
    `first_nmae` is how a save appears to succeed and changes nothing.
    """
    if get(conn, user_id) is None:
        return None
    unknown = set(changes) - set(PATCHABLE)
    if unknown:
        raise Invalid(f"not updatable: {', '.join(sorted(unknown))}")
    if not changes:
        return get(conn, user_id)

    cleaned = {field: PATCHABLE[field](value) for field, value in changes.items()}
    # Column names come from PATCHABLE, which is a literal in this module, so
    # they are never caller-supplied. Every value is bound.
    sets = ", ".join(f"{field} = ?" for field in cleaned)
    try:
        with conn:
            conn.execute(
                f"UPDATE users SET {sets}, updated_at = ? WHERE id = ?",
                (*cleaned.values(), db.now(), user_id),
            )
    except sqlite3.IntegrityError as e:
        row = get(conn, user_id)
        raise Taken(
            _which_is_taken(conn, cleaned.get("email", row["email"]),
                            cleaned.get("handle", row["handle"]))
        ) from e
    return get(conn, user_id)


def set_disabled(conn: sqlite3.Connection, user_id: str, disabled: bool) -> Optional[sqlite3.Row]:
    """Disable or restore. Never delete.

    A row is not removed because the keys that reference it are the record of
    what that credential did, and because "this handle was somebody" is a fact
    worth keeping when the handle is a URL. Disabling is reversible; a DELETE
    with ON DELETE SET NULL on the other side is not.
    """
    if get(conn, user_id) is None:
        return None
    with conn:
        conn.execute(
            "UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?",
            (db.now() if disabled else None, db.now(), user_id),
        )
    return get(conn, user_id)
