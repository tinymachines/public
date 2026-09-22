"""An account's own shelf of cartridges.

## What this is for

Several pages on the site ask for a `.nes` file: the console you can play, and
three benches in the playground. Somebody who has dumped the cartridges they
own would otherwise pick the same file off their disk on every page and every
visit. The shelf keeps those dumps beside the account, so every one of those
menus can offer them by name.

## Who can see what

**A cartridge answers only to the session that put it there.** Every route
here asks for the signed-in account and looks a cartridge up by id *and* by
that account, so somebody else's id is a 404, the same answer as an id that
never existed. There is no listing across accounts, no admin route that reads
a shelf, and no public address for the bytes. The ROM is sent `private,
no-store`, and the site's service worker never caches anything under `/api/`.

## Why a shelf is granted, not given

These are dumps of commercial cartridges. Keeping a copy of one you own, for
yourself, is one thing; a public site that takes them from anybody with a
GitHub account is another, and this service cannot tell the two apart. So an
account has no shelf until an admin gives it one (`carts_max` on the user,
zero by default). An account without a shelf gets an empty list rather than an
error, so a menu can ask without caring, and a 403 with the reason if it tries
to add.

## Where the bytes live

On disk beside the database (`$STATE/carts/<user>/<sha256>.nes`, or under
`TM_CARTS`), mode 0600 in a 0700 directory. Never in the database, and never
in the repository: nothing generated is committed, and a dump of somebody
else's game least of all.

## What is believed

Only the name and the note. Everything else in a row was read off the bytes
here: the header is parsed, its sizes are checked against the file's length,
and a file that does not add up is refused with the numbers rather than kept.
Whether the console model has the board a header names is *not* decided here:
the list of boards lives in the console, and the console says so when the
cartridge is loaded.
"""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response

import db
from admin import connection
from auth import require_user
from models import Cart, CartLimits, CartPatch, Carts

router = APIRouter(prefix="/v1/me/carts", tags=["account"])

HEADER = 16
TRAINER = 512
NAME_MAX = 80
NOTE_MAX = 240


def bytes_max() -> int:
    """The largest file the shelf takes.

    Four mebibytes of ROM plus a header and a trainer. The largest licensed
    cartridge is a quarter of that; the room is for later boards and homebrew.
    """
    return int(os.environ.get("TM_CART_BYTES", str(4 * 1024 * 1024 + HEADER + TRAINER)))


def root() -> Path:
    """Where the files are. Read live, for the reason `db.path()` is."""
    explicit = os.environ.get("TM_CARTS")
    return Path(explicit) if explicit else db.path().parent / "carts"


# ---------------------------------------------------------------------------
# Reading a header, or refusing it
# ---------------------------------------------------------------------------


class NotACartridge(ValueError):
    """The bytes are not an iNES file this service can vouch for. The message says why."""


@dataclass(frozen=True)
class Header:
    mapper: int
    prg_bytes: int
    chr_bytes: int
    trainer: bool

    @property
    def payload_at(self) -> int:
        return HEADER + (TRAINER if self.trainer else 0)


def read_header(data: bytes) -> Header:
    """Parse an iNES or NES 2.0 header and hold it to the file's length.

    The length check is the point. A header is sixteen bytes anybody can type;
    the sizes it declares either add up to the file that arrived or they do
    not, and a file that is short is a bad dump that would otherwise be kept
    under a good name.
    """
    if len(data) < HEADER:
        raise NotACartridge(f"{len(data)} bytes is shorter than an iNES header, which is {HEADER}.")
    if data[:4] != b"NES\x1a":
        raise NotACartridge("It does not begin with the iNES signature (the letters NES and the byte 1A). "
                            "A separate PRG or CHR file is not a cartridge on its own: the shelf takes the .nes.")
    prg_units, chr_units, f6, f7 = data[4], data[5], data[6], data[7]
    nes2 = (f7 & 0x0C) == 0x08
    mapper = (f6 >> 4) | (f7 & 0xF0)
    if nes2:
        mapper |= (data[8] & 0x0F) << 8
        prg_hi, chr_hi = data[9] & 0x0F, data[9] >> 4
        if prg_hi == 0x0F or chr_hi == 0x0F:
            raise NotACartridge("The header gives a ROM size in NES 2.0's exponent form, which this shelf does not read.")
        prg_units |= prg_hi << 8
        chr_units |= chr_hi << 8
    elif any(data[12:16]):
        # An old dumping tool signed its work across bytes 7 to 15, which puts
        # letters where the mapper's high half goes. The convention every
        # loader follows: with junk in the last four bytes and no NES 2.0
        # marker, only the low half of the mapper number is real.
        mapper &= 0x0F
    h = Header(mapper=mapper, prg_bytes=prg_units * 16384, chr_bytes=chr_units * 8192, trainer=bool(f6 & 0x04))
    if h.prg_bytes == 0:
        raise NotACartridge("The header declares no program ROM.")
    want = h.payload_at + h.prg_bytes + h.chr_bytes
    if len(data) < want:
        raise NotACartridge(f"The header declares {h.prg_bytes} bytes of program and {h.chr_bytes} of pictures, "
                            f"which with the header makes {want}; the file is {len(data)}. It is {want - len(data)} bytes short.")
    if len(data) > want:
        raise NotACartridge(f"The header declares {h.prg_bytes} bytes of program and {h.chr_bytes} of pictures, "
                            f"which with the header makes {want}; the file is {len(data)}. "
                            f"There are {len(data) - want} bytes after the end that the header does not account for.")
    return h


def clean_name(name: str) -> str:
    n = " ".join("".join(ch for ch in name if ch.isprintable()).split())
    if n.lower().endswith(".nes"):
        n = n[:-4].rstrip()
    if not n:
        raise HTTPException(status_code=422, detail="name: a cartridge needs one.")
    if len(n) > NAME_MAX:
        raise HTTPException(status_code=422, detail=f"name: {NAME_MAX} characters at most.")
    return n


def clean_note(note: str) -> str:
    n = " ".join("".join(ch for ch in note if ch.isprintable()).split())
    if len(n) > NOTE_MAX:
        raise HTTPException(status_code=422, detail=f"note: {NOTE_MAX} characters at most.")
    return n


# ---------------------------------------------------------------------------
# Rows and files
# ---------------------------------------------------------------------------


def _file(uid: str, sha256: str) -> Path:
    # Both halves are ours: a generated user id and a hex digest computed
    # here. Nothing a caller typed reaches a path.
    return root() / uid / f"{sha256}.nes"


def _cart(row: sqlite3.Row) -> Cart:
    d = dict(row)
    d.pop("user_id")
    return Cart(**d, rom=f"/v1/me/carts/{row['id']}/rom")


def _limits(conn: sqlite3.Connection, user: sqlite3.Row) -> CartLimits:
    held = conn.execute("SELECT COUNT(*) FROM carts WHERE user_id = ?", (user["id"],)).fetchone()[0]
    most = user["carts_max"]
    return CartLimits(max=most, held=held, remaining=max(0, most - held), bytes_max=bytes_max())


def _owned(conn: sqlite3.Connection, uid: str, cid: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM carts WHERE id = ? AND user_id = ?", (cid, uid)).fetchone()
    if row is None:
        # The same answer for "never existed" and "somebody else's", on purpose.
        raise HTTPException(status_code=404, detail="No such cartridge on this account's shelf.")
    return row


_SIGNED_OUT = {401: {"description": "Not signed in."}}
_NOT_YOURS = {**_SIGNED_OUT, 404: {"description": "No such cartridge on this account's shelf. Somebody else's id gets this answer too."}}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=Carts,
    summary="The cartridges this account keeps",
    description="The signed-in account's own shelf, by name, with what the shelf may hold. An account "
                "that has not been given a shelf gets an empty list and a limit of zero, so a cartridge "
                "menu can ask this of anybody who is signed in.",
    responses=_SIGNED_OUT,
)
def list_carts(user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Carts:
    rows = conn.execute("SELECT * FROM carts WHERE user_id = ? ORDER BY name COLLATE NOCASE, created_at", (user["id"],))
    return Carts(carts=[_cart(r) for r in rows], limits=_limits(conn, user))


@router.post(
    "",
    response_model=Cart,
    status_code=201,
    summary="Put a cartridge on the shelf",
    description="The body is the `.nes` file itself, as `application/octet-stream`; the name travels in "
                "the query. The header is read here and held to the file's length, and a file that does "
                "not add up is refused with the numbers. Nothing the uploader says about the cartridge "
                "is kept except its name and note.",
    responses={
        **_SIGNED_OUT,
        403: {"description": "This account has not been given a shelf."},
        409: {"description": "The shelf is full, or this exact file is already on it (the answer names which)."},
        413: {"description": "Larger than the shelf takes."},
        422: {"description": "Not an iNES file, or its header and its length disagree. The message gives the numbers."},
    },
)
def add_cart(
    request: Request,
    name: str = Query(description="What to call it. A trailing `.nes` is dropped, so a filename will do.", examples=["Blaster Master"]),
    note: str = Query(default="", description="Anything worth remembering about this dump."),
    data: bytes = Body(media_type="application/octet-stream", description="The `.nes` file."),
    user: sqlite3.Row = Depends(require_user),
    conn: sqlite3.Connection = Depends(connection),
) -> Cart:
    limits = _limits(conn, user)
    if limits.max == 0:
        raise HTTPException(status_code=403, detail="This account has not been given a cartridge shelf. They are granted by hand, because what goes on one is a dump of a cartridge you own.")
    if len(data) > limits.bytes_max:
        raise HTTPException(status_code=413, detail=f"{len(data)} bytes; the shelf takes {limits.bytes_max} at most.")
    name, note = clean_name(name), clean_note(note)
    try:
        h = read_header(data)
    except NotACartridge as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    sha = hashlib.sha256(data).hexdigest()
    twin = conn.execute("SELECT name FROM carts WHERE user_id = ? AND sha256 = ?", (user["id"], sha)).fetchone()
    if twin is not None:
        raise HTTPException(status_code=409, detail=f"This exact file is already on the shelf, as {twin['name']!r}.")
    if limits.remaining == 0:
        raise HTTPException(status_code=409, detail=f"The shelf holds {limits.held} cartridges, which is its limit of {limits.max}. Delete one to add another.")

    # File first, then the row: a row is the claim that the bytes are there, so
    # it is never written before they are. Written beside its final name and
    # moved into place, so a reader never sees half a file.
    path = _file(user["id"], sha)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_suffix(f".{secrets.token_hex(4)}.part")
    try:
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)

    cid, now = f"ct_{secrets.token_hex(8)}", db.now()
    try:
        with conn:
            conn.execute(
                "INSERT INTO carts (id, user_id, name, note, sha256, crc32, size, mapper, prg_bytes, chr_bytes, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (cid, user["id"], name, note, sha, f"{zlib.crc32(data[h.payload_at:]):08x}", len(data),
                 h.mapper, h.prg_bytes, h.chr_bytes, now, now),
            )
    except sqlite3.IntegrityError:
        # Two uploads of one file raced and the other won. Its file is ours too
        # (same digest, same bytes), so there is nothing to clean up.
        raise HTTPException(status_code=409, detail="This exact file is already on the shelf.")
    return _cart(_owned(conn, user["id"], cid))


@router.get(
    "/{cart_id}/rom",
    summary="The cartridge's bytes, for the account that owns it",
    description="The `.nes` file exactly as it arrived. Sent `private, no-store`: it is for the "
                "signed-in owner's own browser and nothing between.",
    response_class=Response,
    responses={
        200: {"content": {"application/octet-stream": {}}, "description": "The `.nes` file."},
        **_NOT_YOURS,
        410: {"description": "The shelf lists it and the file is gone from disk. Delete the entry and add the dump again."},
    },
)
def cart_rom(cart_id: str, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Response:
    row = _owned(conn, user["id"], cart_id)
    try:
        data = _file(user["id"], row["sha256"]).read_bytes()
    except FileNotFoundError:
        raise HTTPException(status_code=410, detail="The shelf lists this cartridge and its file is gone from disk. Delete the entry and add the dump again.")
    if hashlib.sha256(data).hexdigest() != row["sha256"]:
        # Measured on the way out as well as the way in: a file that rotted on
        # disk is refused rather than handed to a console as the real thing.
        raise HTTPException(status_code=410, detail="The file on disk no longer matches the digest recorded when it arrived. Delete the entry and add the dump again.")
    return Response(content=data, media_type="application/octet-stream", headers={"Cache-Control": "private, no-store"})


@router.patch(
    "/{cart_id}",
    response_model=Cart,
    summary="Rename a cartridge, or change its note",
    description="Touches only what it names. The bytes cannot be edited: delete the entry and add the new dump.",
    responses={**_NOT_YOURS, 422: {"description": "A name that is empty or too long, or a field this route does not know."}},
)
def patch_cart(cart_id: str, body: CartPatch, request: Request, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Cart:
    _owned(conn, user["id"], cart_id)
    changes = body.model_dump(exclude_unset=True)
    cleaned: dict[str, str] = {}
    if "name" in changes:
        if changes["name"] is None:
            raise HTTPException(status_code=422, detail="name: a cartridge needs one.")
        cleaned["name"] = clean_name(changes["name"])
    if "note" in changes:
        cleaned["note"] = clean_note(changes["note"] or "")
    if cleaned:
        # Column names come from the two literals above; every value is bound.
        sets = ", ".join(f"{k} = ?" for k in cleaned)
        with conn:
            conn.execute(f"UPDATE carts SET {sets}, updated_at = ? WHERE id = ?", (*cleaned.values(), db.now(), cart_id))
    return _cart(_owned(conn, user["id"], cart_id))


@router.delete(
    "/{cart_id}",
    status_code=204,
    summary="Take a cartridge off the shelf",
    description="Removes the entry and the file. There is no undo: the dump is yours to add again.",
    responses=_NOT_YOURS,
)
def delete_cart(cart_id: str, request: Request, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Response:
    row = _owned(conn, user["id"], cart_id)
    # Row first, then the file: the other order leaves, for a moment, a row
    # that claims bytes which are not there.
    with conn:
        conn.execute("DELETE FROM carts WHERE id = ?", (row["id"],))
    _file(user["id"], row["sha256"]).unlink(missing_ok=True)
    return Response(status_code=204)


def grant(handle: str, most: int) -> Optional[str]:
    """Give an account a shelf from the command line, for the box this runs on.

    The admin API does the same through `PATCH /v1/admin/users/{id}`; this is
    for the first grant, before anybody has an admin key to hand.
    """
    conn = db.connect()
    try:
        with conn:
            cur = conn.execute("UPDATE users SET carts_max = ?, updated_at = ? WHERE handle = ?", (most, db.now(), handle.lower()))
        return handle.lower() if cur.rowcount else None
    finally:
        conn.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 4 or sys.argv[1] != "grant" or not sys.argv[3].isdigit():
        sys.exit("usage: carts.py grant <handle> <how-many>")
    who = grant(sys.argv[2], int(sys.argv[3]))
    sys.exit(f"no account with the handle {sys.argv[2]!r}" if who is None else print(f"{who} may keep {sys.argv[3]} cartridges"))
