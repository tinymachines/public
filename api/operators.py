"""Who may work the stream desk: a key, as before, or an operator's passkey.

Two credentials, one table of who is which:

- **A bearer key**, exactly as the administered surface takes it: any live key
  reads, an admin key writes (admin.require_dev, admin.require_admin). Scripts
  and the console session's tests use these, and nothing about them changes.
- **A passkey session on the kit's account service** (api/kitaccounts.py).
  The owner asked for the same sign-in the other tinymachines apps have, so a
  person signs in once with their tinymachines.ai passkey and the desk opens.
  Which accounts may operate is this module's `operators` table: an account on
  it reads and writes; a signed-in account that is not on it is told so, with
  a 403 that names the handle; nobody at all is a 401 with the Bearer
  challenge, so a script that forgot its key is told the same thing as before.

An operator is admin-equivalent on the desk, on purpose. The desk has two
levels because a dev key exists for reading; a person trusted to watch a run
from the monitor is a person trusted to stop it.

The operators table is managed with the admin key: GET, POST and DELETE under
/v1/admin/operators. So the first operator is added with the admin key the
host minted (scripts/recover-admin-key.sh), once, from the desk's own sign-in
page; after that the key stays in the drawer.

What the desk asks first is GET /v1/stream/me, which answers 200 for everybody
and says which way in to offer: a signed-in operator (open the desk), a
signed-in non-operator (the add-me form, which takes the admin key), or nobody
(the hand-off page's address, read from the account service, and the key
field). POST /v1/stream/sign-out ends a passkey session on the service and
relays its cookie-clearing header.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

import admin
import db
import keys as keys_mod
import kitaccounts
from models import NewOperator, Operator, OperatorsResponse, StreamMe, StreamSignIn

# ---------------------------------------------------------------------------
# The table
# ---------------------------------------------------------------------------


def is_operator(conn: sqlite3.Connection, account_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM operators WHERE account_id = ? AND removed_at IS NULL", (account_id,)
    ).fetchone()
    return row is not None


def listing(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM operators ORDER BY added_at DESC, account_id").fetchall()


def get(conn: sqlite3.Connection, account_id: str) -> Optional[sqlite3.Row]:
    return conn.execute("SELECT * FROM operators WHERE account_id = ?", (account_id,)).fetchone()


def add(conn: sqlite3.Connection, body: NewOperator, by_key: Optional[str]) -> sqlite3.Row:
    """Add an operator, or make a removed one an operator again: the row is the
    account's, so coming back rewrites it rather than making a second."""
    now = db.now()
    with conn:
        conn.execute(
            "INSERT INTO operators (account_id, handle, note, added_at, added_by, removed_at) "
            "VALUES (?, ?, ?, ?, ?, NULL) "
            "ON CONFLICT(account_id) DO UPDATE SET handle = excluded.handle, note = excluded.note, "
            "added_at = excluded.added_at, added_by = excluded.added_by, removed_at = NULL",
            (body.account_id, body.handle.strip(), body.note.strip(), now, by_key),
        )
    row = get(conn, body.account_id)
    assert row is not None
    return row


def remove(conn: sqlite3.Connection, account_id: str) -> Optional[sqlite3.Row]:
    with conn:
        conn.execute(
            "UPDATE operators SET removed_at = ? WHERE account_id = ? AND removed_at IS NULL",
            (db.now(), account_id),
        )
    return get(conn, account_id)


def _operator(row: sqlite3.Row) -> Operator:
    return Operator(**dict(row), active=row["removed_at"] is None)


# ---------------------------------------------------------------------------
# The dependencies the stream routes take
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Who:
    """What authenticated a stream request."""

    via: str  # "key" or "passkey"
    label: str  # the key's note or id, or the account's handle
    can_administer: bool
    key: Optional[sqlite3.Row] = None
    member: Optional[kitaccounts.Member] = None


def _who(request: Request, conn: sqlite3.Connection, need_admin: bool) -> Who:
    # A key presented is a key judged: a bad key is refused as a bad key even
    # when a passkey cookie is beside it, so a script never silently rides on
    # a browser's session.
    if request.headers.get("authorization"):
        row = admin.require_admin(request, conn) if need_admin else admin.require_dev(request, conn)
        return Who("key", row["note"] or row["id"], keys_mod.covers(row["scope"], "admin"), key=row)
    who = kitaccounts.member(request)
    if who is None:
        raise HTTPException(
            status_code=401,
            detail="This route needs a key (Authorization: Bearer tmk_...) or a signed-in operator. "
                   "GET /v1/stream/me says where a passkey signs in.",
            headers=admin.BEARER,
        )
    if not is_operator(conn, who.id):
        raise HTTPException(
            status_code=403,
            detail=f"Signed in as {who.handle}, who is not an operator of the stream desk. "
                   "An admin key adds operators: POST /v1/admin/operators.",
        )
    return Who("passkey", who.handle, True, member=who)


def reader(request: Request, conn: sqlite3.Connection = Depends(admin.connection)) -> Who:
    """Any live key, or an operator's passkey session."""
    return _who(request, conn, need_admin=False)


def operator(request: Request, conn: sqlite3.Connection = Depends(admin.connection)) -> Who:
    """An admin key, or an operator's passkey session."""
    return _who(request, conn, need_admin=True)


# ---------------------------------------------------------------------------
# Routes: who am I, sign out (under /v1/stream)
# ---------------------------------------------------------------------------

stream_router = APIRouter(prefix="/v1/stream", tags=["stream"])


@stream_router.get(
    "/me",
    response_model=StreamMe,
    summary="Who this request is to the stream desk, and what it may do",
    description=(
        "What the desk asks first. With a bearer key it says what the key may do, as /v1/admin/whoami "
        "does. With a passkey session on the account service it says whose, and whether that account "
        "is an operator. For nobody it says where a passkey signs in (`sign_in`), read from the account "
        "service for this host. It answers 200 in every case, because the page's first question is "
        "which way in to offer, and a 401 cannot carry the answer. A key that is wrong is still a 401: "
        "a presented credential is judged, not ignored."
    ),
    responses={401: {"description": "A key was presented and is unknown or revoked."}},
)
def me(request: Request, conn: sqlite3.Connection = Depends(admin.connection)) -> StreamMe:
    if request.headers.get("authorization"):
        row = admin.require_dev(request, conn)
        is_admin = keys_mod.covers(row["scope"], "admin")
        return StreamMe(
            via="key", handle=row["note"] or row["id"], account_id=None, operator=False,
            can_read=True, can_administer=is_admin, sign_in=None,
            why=None if is_admin else "This key reads; starting, stopping, marking and the pad take an admin key.",
        )
    state = kitaccounts.auth_state(request)
    sign_in = StreamSignIn(**state) if state else None
    try:
        who = kitaccounts.member(request)
    except HTTPException as e:
        if e.status_code != 503:
            raise
        return StreamMe(via=None, operator=False, can_read=False, can_administer=False, sign_in=None, why=e.detail)
    if who is None:
        why = "Nobody is signed in." if sign_in else "Nobody is signed in, and the account service did not answer, so a passkey cannot sign in right now."
        return StreamMe(via=None, operator=False, can_read=False, can_administer=False, sign_in=sign_in, why=why)
    ok = is_operator(conn, who.id)
    return StreamMe(
        via="passkey", handle=who.handle, account_id=who.id, operator=ok,
        can_read=ok, can_administer=ok, sign_in=sign_in,
        why=None if ok else f"Signed in as {who.handle}, who is not an operator of the stream desk yet.",
    )


@stream_router.post(
    "/sign-out",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="End a passkey session on the stream desk",
    description=(
        "Ends the account service's session this request's cookie names and relays the header that "
        "clears the cookie here. Idempotent: with no cookie it does nothing and still answers 204. A "
        "bearer key has no session to end; the page simply forgets it."
    ),
    responses={503: {"description": "The account service did not answer."}},
)
def sign_out(request: Request) -> Response:
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    for value in kitaccounts.sign_out(request):
        resp.headers.append("set-cookie", value)
    return resp


# ---------------------------------------------------------------------------
# Routes: the operators list (under /v1/admin, admin key only)
# ---------------------------------------------------------------------------

admin_router = APIRouter(prefix="/v1/admin", tags=["admin"])


@admin_router.get(
    "/operators",
    response_model=OperatorsResponse,
    summary="The stream desk's operators",
    description="Every account ever made an operator, newest first; a removed one keeps its row with `removed_at`. Admin key.",
    responses={401: {"description": "No key, or an unknown or revoked one."}, 403: {"description": "A dev key."}},
)
def list_operators(
    _: sqlite3.Row = Depends(admin.require_admin),
    conn: sqlite3.Connection = Depends(admin.connection),
) -> OperatorsResponse:
    return OperatorsResponse(operators=[_operator(r) for r in listing(conn)])


@admin_router.post(
    "/operators",
    response_model=Operator,
    status_code=status.HTTP_201_CREATED,
    summary="Make an account an operator of the stream desk",
    description=(
        "The account is one on the kit's account service, by the id GET /v1/stream/me reports for a "
        "signed-in person. Nothing is checked against the service: an id that is nobody's is a row "
        "nobody can use. An account removed earlier comes back as an operator with this call. Admin key."
    ),
    responses={401: {"description": "No key, or an unknown or revoked one."}, 403: {"description": "A dev key."}},
)
def add_operator(
    body: NewOperator,
    key_row: sqlite3.Row = Depends(admin.require_admin),
    conn: sqlite3.Connection = Depends(admin.connection),
) -> Operator:
    return _operator(add(conn, body, key_row["id"]))


@admin_router.delete(
    "/operators/{account_id}",
    response_model=Operator,
    summary="Stop an account operating the stream desk",
    description="Marks the row removed; the next request on that session is a 403. The row stays as the record. Idempotent. Admin key.",
    responses={401: {"description": "No key, or an unknown or revoked one."}, 403: {"description": "A dev key."}, 404: {"description": "Never an operator."}},
)
def remove_operator(
    account_id: str,
    _: sqlite3.Row = Depends(admin.require_admin),
    conn: sqlite3.Connection = Depends(admin.connection),
) -> Operator:
    row = remove(conn, account_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"no operator with account id {account_id!r}")
    return _operator(row)
