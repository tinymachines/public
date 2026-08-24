"""The administered surface: dev keys, and the people they belong to.

Everything else this service serves is public and derived. These routes are
neither, so they are the first ones with a credential in front of them and they
live in their own module for that reason: the line between "anyone may ask" and
"a key may ask" should be visible in the file listing, not discovered by
reading decorators.

## What authenticates

`Authorization: Bearer tmk_...`, and nothing else. Not a cookie, not a session,
not a form post.

That is a decision rather than a first draft. A cookie would need a session
table, an expiry policy, a CSRF answer and a logout that actually invalidates
something, and every one of those is a choice about how *users* sign in, which
is a question nobody has answered yet and which this service cannot answer
while it has no way to send mail. A bearer header needs none of them, and the
admin screen holds the key in memory for the life of a tab and writes it
nowhere: no localStorage, no cookie, nothing at rest in the browser. A reload
asks again. That is the cost, it is small, and it is paid by one person.

## What the failures mean

401 for a request with no key, an unreadable key, an unknown key or a revoked
one. 403 for a real key without the scope. They are kept apart because they
call for different actions: 401 means present a credential, 403 means present a
different one, and collapsing them makes a screen say "sign in" to somebody who
already has.

A revoked key is told it is revoked, rather than being answered as though it
never existed. The registry's 404-not-403 rule is about a token learning
whether some *other* builder exists, which is a different question: the holder
of a revoked key is entitled to know that it is the revocation, not a typo.
"""

from __future__ import annotations

import sqlite3
import sys
from typing import Iterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status

import db
import keys as keys_mod
import mint as mint_mod
import users as users_mod
from models import (
    ApiKey,
    DisabledState,
    KeysResponse,
    MintedKey,
    MintRecord,
    MintsResponse,
    NewKey,
    NewUser,
    User,
    UserPatch,
    UsersResponse,
    WhoAmI,
)

router = APIRouter(prefix="/v1/admin", tags=["admin"])

# Named once so a 401 body and the docs cannot describe different headers.
BEARER = {"WWW-Authenticate": 'Bearer realm="tinymachines-api"'}


# ---------------------------------------------------------------------------
# Connection and authentication
# ---------------------------------------------------------------------------


def connection() -> Iterator[sqlite3.Connection]:
    """One SQLite connection per request, opened and closed in this thread.

    Per request rather than per process on purpose. A module-level connection
    shared by every request would be a data race the moment two arrive at once,
    and it would work under a test client, which is the worst available failure
    mode.

    `handed_between_threads` is the fix for a bug this shipped with. FastAPI
    runs a generator dependency's setup and teardown in DIFFERENT threadpool
    workers, so the connection is opened in one and closed in another, and
    sqlite3's same-thread assertion fires on the close. It is safe to turn off
    here for a specific reason rather than a general one: this connection
    belongs to one request, the route body is a `def` and therefore runs to
    completion in one worker before teardown runs in another, so two threads
    never hold it at the same time. db.py carries the long form.

    FastAPI caches a dependency's result within a request, so the auth
    dependency and the route body get the same connection and therefore the
    same transaction view.
    """
    conn = db.connect(handed_between_threads=True)
    try:
        yield conn
    finally:
        conn.close()


def _presented(request: Request) -> str:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        raise HTTPException(
            status_code=401,
            detail="This route needs a dev key: Authorization: Bearer tmk_...",
            headers=BEARER,
        )
    return value.strip()


def _authenticate(request: Request, conn: sqlite3.Connection) -> sqlite3.Row:
    row = keys_mod.find(conn, _presented(request))
    if row is None:
        raise HTTPException(status_code=401, detail="No such key.", headers=BEARER)
    if row["revoked_at"] is not None:
        raise HTTPException(
            status_code=401,
            detail=f"This key was revoked at {row['revoked_at']}.",
            headers=BEARER,
        )
    keys_mod.touch(conn, row["id"], db.now())
    return row


def require_dev(request: Request, conn: sqlite3.Connection = Depends(connection)) -> sqlite3.Row:
    """Any live key."""
    return _authenticate(request, conn)


def require_admin(request: Request, conn: sqlite3.Connection = Depends(connection)) -> sqlite3.Row:
    """A live key with the admin scope."""
    row = _authenticate(request, conn)
    if not keys_mod.covers(row["scope"], "admin"):
        raise HTTPException(
            status_code=403,
            detail=f"This key has scope {row['scope']!r}; this route needs 'admin'.",
        )
    return row


# ---------------------------------------------------------------------------
# Rows to models
# ---------------------------------------------------------------------------


def _key(row: sqlite3.Row) -> ApiKey:
    return ApiKey(**dict(row), active=row["revoked_at"] is None)


def _user(row: Optional[sqlite3.Row]) -> Optional[User]:
    return User(**dict(row)) if row is not None else None


def _found(row: Optional[sqlite3.Row], what: str, ident: str):
    if row is None:
        raise HTTPException(status_code=404, detail=f"no {what} with id {ident!r}")
    return row


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------


def bootstrap(conn: sqlite3.Connection) -> Optional[str]:
    """Mint the first admin key when there is not one, and return it.

    Answers the question every credentialed system has to answer once: where
    does the first credential come from. Here it is minted at startup when no
    live admin key exists, and printed to stderr, which under systemd is the
    journal. That is deliberately a place only somebody already on the host can
    read.

    It runs on every start and does nothing on almost all of them, because the
    condition is "no live admin key" rather than "the database is new". That
    also makes it the recovery path: revoke every admin key by accident and a
    restart mints another, which is why nothing here needs a break-glass flag.

    Returns None when a live admin key already exists, so the caller can tell
    the difference between minting and finding.
    """
    if keys_mod.active_admin_count(conn) > 0:
        return None
    key, _ = keys_mod.mint(conn, scope="admin", note="bootstrap, minted at first start")
    return key


def announce(key: str) -> None:
    """Print the bootstrap key once, to stderr, framed so it is not missed.

    Separated from bootstrap() so that a test can exercise the minting without
    printing a credential into a test log, which is exactly the kind of place
    secrets end up being kept forever.
    """
    print(
        "\n"
        "  ---------------------------------------------------------------\n"
        "  No live admin key existed, so one has been minted.\n"
        "  It is shown here and nowhere else, ever. Copy it now.\n"
        "\n"
        f"      {key}\n"
        "\n"
        "  Sign in with it at /admin. Mint a replacement and revoke this one\n"
        "  rather than sharing it.\n"
        "  ---------------------------------------------------------------\n",
        file=sys.stderr,
    )


# ---------------------------------------------------------------------------
# Who am I
# ---------------------------------------------------------------------------


@router.get(
    "/whoami",
    response_model=WhoAmI,
    summary="What the presented key is, and what it can do",
    description=(
        "Identifies the key on this request and says whether it satisfies the admin "
        "scope. This is what a client should call first, because the alternative is "
        "inferring its own permissions from whether some other request returned 401, "
        "and a screen that reads its permissions out of a failure shows the wrong "
        "thing whenever the failure has another cause.\n\n"
        "It needs only the `dev` scope, so a key can always find out what it is."
    ),
    responses={401: {"description": "No key, an unreadable key, an unknown key, or a revoked one."}},
)
def whoami(
    key_row: sqlite3.Row = Depends(require_dev),
    conn: sqlite3.Connection = Depends(connection),
) -> WhoAmI:
    owner = users_mod.get(conn, key_row["user_id"]) if key_row["user_id"] else None
    return WhoAmI(
        key=_key(key_row),
        user=_user(owner),
        can_administer=keys_mod.covers(key_row["scope"], "admin"),
    )


# ---------------------------------------------------------------------------
# Keys
# ---------------------------------------------------------------------------


@router.get(
    "/keys",
    response_model=KeysResponse,
    summary="Every dev key, without any of the keys",
    description=(
        "Lists every key that has been minted, revoked ones included, newest first. "
        "No secret is in this response and none can be: only a key's SHA-256 is "
        "stored, so what survives minting is the public half, the scope, the note and "
        "the timestamps.\n\n"
        "Revoked keys are listed rather than filtered out, because the row is the "
        "record that the credential existed and a list that hides them makes "
        "'this key is gone' and 'this key was never minted' look the same."
    ),
    responses={401: {"description": "No key or an unusable one."}, 403: {"description": "A live key without the admin scope."}},
)
def list_keys(
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(connection),
) -> KeysResponse:
    rows = keys_mod.listing(conn)
    return KeysResponse(
        count=len(rows),
        active=sum(1 for r in rows if r["revoked_at"] is None),
        keys=[_key(r) for r in rows],
    )


@router.post(
    "/keys",
    response_model=MintedKey,
    status_code=status.HTTP_201_CREATED,
    summary="Mint a dev key, shown once",
    description=(
        "Creates a key and returns it in full. **This is the only response anywhere "
        "in this API that contains a key.** Only the SHA-256 is stored, so nothing, "
        "including an admin, can show it again: a lost key is replaced and revoked, "
        "not recovered.\n\n"
        "`user_id` is optional, because a key can be minted for somebody before they "
        "have a row. An unknown one is refused rather than stored, so a key cannot "
        "end up pointing at a person who does not exist."
    ),
    responses={
        400: {"description": "An unknown user_id."},
        401: {"description": "No key or an unusable one."},
        403: {"description": "A live key without the admin scope."},
    },
)
def mint_key(
    body: NewKey,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(connection),
) -> MintedKey:
    if body.user_id is not None and users_mod.get(conn, body.user_id) is None:
        raise HTTPException(status_code=400, detail=f"no user with id {body.user_id!r}")
    key, row = keys_mod.mint(conn, scope=body.scope, note=body.note, user_id=body.user_id)
    return MintedKey(key=key, record=_key(row))


@router.delete(
    "/keys/{key_id}",
    response_model=ApiKey,
    summary="Revoke a dev key",
    description=(
        "Marks a key revoked. The row is kept and keeps appearing in the listing: "
        "revoking is about the credential, and deleting the record would delete the "
        "evidence that it ever existed along with it.\n\n"
        "Revoking a key that is already revoked is a 409 rather than a second "
        "success, because reporting 'done' for a call that did nothing is how a "
        "double-click reads as two revocations.\n\n"
        "Revoking the **last live admin key** is refused, also with a 409. A restart "
        "would mint a new one and print it to the journal, so this is recoverable "
        "rather than fatal, but the correct rotation is to mint the replacement "
        "first and then revoke this one, and the refusal says so."
    ),
    responses={
        401: {"description": "No key or an unusable one."},
        403: {"description": "A live key without the admin scope."},
        404: {"description": "No key with that id."},
        409: {"description": "Already revoked, or it is the last live admin key."},
    },
)
def revoke_key(
    key_id: str,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(connection),
) -> ApiKey:
    row = _found(keys_mod.get(conn, key_id), "key", key_id)
    if row["revoked_at"] is not None:
        raise HTTPException(status_code=409, detail=f"already revoked at {row['revoked_at']}")
    if row["scope"] == "admin" and keys_mod.active_admin_count(conn) == 1:
        raise HTTPException(
            status_code=409,
            detail="this is the last live admin key. Mint its replacement first, "
                   "then revoke this one.",
        )
    keys_mod.revoke(conn, key_id, db.now())
    return _key(keys_mod.get(conn, key_id))


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@router.get(
    "/users",
    response_model=UsersResponse,
    summary="Everybody",
    description=(
        "Every user, newest first. There is no paging, and there is no pretend paging "
        "either: when the list is long enough to need it the parameters arrive here "
        "and the description changes with them."
    ),
    responses={401: {"description": "No key or an unusable one."}, 403: {"description": "A live key without the admin scope."}},
)
def list_users(
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(connection),
) -> UsersResponse:
    rows = users_mod.listing(conn)
    return UsersResponse(count=len(rows), users=[_user(r) for r in rows])


@router.post(
    "/users",
    response_model=User,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user",
    description=(
        "Creates a person. Email and handle are folded to lowercase and both are "
        "unique, because a handle is going to be a path segment and two rows differing "
        "only in case is one person with two accounts.\n\n"
        "A handle that collides with a path this site serves is refused: `admin`, "
        "`docs`, `api` and the rest are reserved here rather than in the route table, "
        "so the answer is the same in the API, in the admin screen and in any future "
        "sign-up.\n\n"
        "Nothing is sent to the address. This service cannot send mail, so the address "
        "is recorded and shape-checked, never verified."
    ),
    responses={
        401: {"description": "No key or an unusable one."},
        403: {"description": "A live key without the admin scope."},
        409: {"description": "That email or handle is already in use, and the message says which."},
        422: {"description": "A field failed its shape check, and the message names the field."},
    },
)
def create_user(
    body: NewUser,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(connection),
) -> User:
    try:
        row = users_mod.create(
            conn,
            email=body.email,
            handle=body.handle,
            first_name=body.first_name,
            pic=body.pic,
        )
    except users_mod.Taken as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except users_mod.Invalid as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return _user(row)


@router.get(
    "/users/{user_id}",
    response_model=User,
    summary="One user by id",
    description=(
        "One person. Looked up by id rather than by handle on purpose: a handle can be "
        "changed and an id cannot, so anything that stores a reference stores this."
    ),
    responses={
        401: {"description": "No key or an unusable one."},
        403: {"description": "A live key without the admin scope."},
        404: {"description": "No user with that id."},
    },
)
def get_user(
    user_id: str,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(connection),
) -> User:
    return _user(_found(users_mod.get(conn, user_id), "user", user_id))


@router.patch(
    "/users/{user_id}",
    response_model=User,
    summary="Change only the fields named",
    description=(
        "A partial update. **It touches only what the request names**, which is the "
        "registry's rule carried over because it was paid for there: a client saving "
        "a first name cannot blank a picture it never loaded.\n\n"
        "Absent and null are therefore different. Omitting `pic` leaves the picture "
        "alone; sending `\"pic\": null` removes it. A field this endpoint does not "
        "recognise is rejected rather than ignored, because silently dropping a "
        "misspelled field is how a save appears to succeed and changes nothing."
    ),
    responses={
        401: {"description": "No key or an unusable one."},
        403: {"description": "A live key without the admin scope."},
        404: {"description": "No user with that id."},
        409: {"description": "The new email or handle is already in use."},
        422: {"description": "A field failed its shape check, and the message names the field."},
    },
)
def patch_user(
    user_id: str,
    body: UserPatch,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(connection),
) -> User:
    # exclude_unset is the whole mechanism. Without it every field arrives with
    # its default of None and a request that named one field would blank three.
    changes = body.model_dump(exclude_unset=True)
    try:
        row = users_mod.patch(conn, user_id, changes)
    except users_mod.Taken as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except users_mod.Invalid as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return _user(_found(row, "user", user_id))


@router.put(
    "/users/{user_id}/disabled",
    response_model=User,
    summary="Disable or restore an account",
    description=(
        "Sets whether the account is disabled. A PUT on the state rather than a "
        "DELETE on the user, because nothing here deletes a person: the keys that "
        "reference them are the record of what that credential did, and a handle that "
        "was somebody is a fact worth keeping once handles are URLs. A DELETE that "
        "does not delete is a lie in the method name.\n\n"
        "It is symmetric, so the same route restores an account, and it is "
        "idempotent: disabling something already disabled succeeds and changes the "
        "timestamp to now."
    ),
    responses={
        401: {"description": "No key or an unusable one."},
        403: {"description": "A live key without the admin scope."},
        404: {"description": "No user with that id."},
    },
)
def set_user_disabled(
    user_id: str,
    body: DisabledState,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(connection),
) -> User:
    return _user(_found(users_mod.set_disabled(conn, user_id, body.disabled), "user", user_id))


@router.get(
    "/mints",
    response_model=MintsResponse,
    summary="The public mint's ledger",
    description=(
        "Who minted a registry token through the public door, as a digest of each "
        "address, with the note they left and when. Newest first, last seven days. "
        "No token appears here or anywhere: the registry holds each token's digest, "
        "this holds the caller's. It exists so an admin can see that one address "
        "minted forty times, and decide."
    ),
    responses={401: {"description": "No key or an unusable one."}, 403: {"description": "A live key without the admin scope."}},
)
def list_mints(
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(connection),
) -> MintsResponse:
    rows = mint_mod.ledger(conn)
    return MintsResponse(mints=[MintRecord(**dict(r)) for r in rows], count=len(rows))
