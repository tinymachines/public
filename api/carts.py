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

## Every sign-in has a shelf

These are dumps of commercial cartridges, and this service cannot tell a
person keeping their own from a person keeping somebody else's. It shipped
with shelves granted by hand for that reason, and the owner opened them to
every sign-in the next day (2026-09-22): a shelf is private to its account,
nothing on it is served to anybody else, and the site is not a place to
find a game. Every account gets `db.SHELF_DEFAULT` places; an admin can
resize a shelf, and zero closes it. A closed shelf gets an empty list
rather than an error, so a menu can ask without caring, and a 403 with the
reason if it tries to add.

## The save

A cartridge with a battery keeps what the game writes to its RAM. Here the
play page is the battery: it writes the console's cartridge RAM to
`PUT .../save` while such a cartridge runs and when it stops, and reads it
back before the game starts. The save is a file beside the ROM
(`<sha256>.sav`), and that file is the one copy of the fact that a save
exists: a listing reports it by looking, and nothing is written in the row.

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
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response

import db
from admin import connection
from auth import require_user
from models import Cart, CartLimits, CartPatch, CartSave, Carts

router = APIRouter(prefix="/v1/me/carts", tags=["account"])

HEADER = 16
TRAINER = 512
NAME_MAX = 80
NOTE_MAX = 240
# The console's cartridge RAM is 8 KiB; a save is that or nothing. Room for
# four times it, for a board that fits more, and no more than that.
SAVE_MAX = 32 * 1024


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


class Refused(Exception):
    """A cartridge was not put on the shelf. `status` is the HTTP answer; `detail` the reason, written to be shown."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


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
        raise Refused(422, "name: a cartridge needs one.")
    if len(n) > NAME_MAX:
        raise Refused(422, f"name: {NAME_MAX} characters at most.")
    return n


def clean_note(note: str) -> str:
    n = " ".join("".join(ch for ch in note if ch.isprintable()).split())
    if len(n) > NOTE_MAX:
        raise Refused(422, f"note: {NOTE_MAX} characters at most.")
    return n


# ---------------------------------------------------------------------------
# Rows and files
# ---------------------------------------------------------------------------


def _file(uid: str, sha256: str) -> Path:
    # Both halves are ours: a generated user id and a hex digest computed
    # here. Nothing a caller typed reaches a path.
    return root() / uid / f"{sha256}.nes"


def _save_file(uid: str, sha256: str) -> Path:
    return _file(uid, sha256).with_suffix(".sav")


def _save_of(uid: str, sha256: str) -> Optional[CartSave]:
    """The save as the file on disk says: the file is the one copy of that fact."""
    try:
        st = _save_file(uid, sha256).stat()
    except FileNotFoundError:
        return None
    return CartSave(bytes=st.st_size, saved_at=datetime.fromtimestamp(st.st_mtime, timezone.utc))


def _cart(row: sqlite3.Row) -> Cart:
    d = dict(row)
    d.pop("user_id")
    return Cart(**d, rom=f"/v1/me/carts/{row['id']}/rom", save=_save_of(row["user_id"], row["sha256"]))


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


def store(conn: sqlite3.Connection, user: sqlite3.Row, data: bytes, name: str, note: str = "") -> sqlite3.Row:
    """Put a cartridge on an account's shelf, or refuse it with the reason.

    The one place the rules live: the route and the command at the foot of
    this file both call it, so a cartridge added on the box is held to the
    same header check, the same limits and the same digest as one uploaded.
    """
    limits = _limits(conn, user)
    if limits.max == 0:
        raise Refused(403, "This account's cartridge shelf is closed. An admin can open it.")
    if len(data) > limits.bytes_max:
        raise Refused(413, f"{len(data)} bytes; the shelf takes {limits.bytes_max} at most.")
    name, note = clean_name(name), clean_note(note)
    try:
        h = read_header(data)
    except NotACartridge as e:
        raise Refused(422, str(e)) from e

    sha = hashlib.sha256(data).hexdigest()
    twin = conn.execute("SELECT name FROM carts WHERE user_id = ? AND sha256 = ?", (user["id"], sha)).fetchone()
    if twin is not None:
        raise Refused(409, f"This exact file is already on the shelf, as {twin['name']!r}.")
    if limits.remaining == 0:
        raise Refused(409, f"The shelf holds {limits.held} cartridges, which is its limit of {limits.max}. Delete one to add another.")

    # File first, then the row: a row is the claim that the bytes are there, so
    # it is never written before they are. Written beside its final name and
    # moved into place, so a reader never sees half a file.
    path = _file(user["id"], sha)
    # Both directories are made 0700 explicitly rather than through mkdir's
    # mode, which the umask edits and which parents=True does not apply to
    # the parent at all: run from a shell with the usual umask, the top
    # directory came out 0775 (2026-09-21). The service's own umask is 0077
    # and hid it.
    for d in (path.parent.parent, path.parent):
        d.mkdir(exist_ok=True)
        d.chmod(0o700)
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
        raise Refused(409, "This exact file is already on the shelf.")
    return _owned(conn, user["id"], cid)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=Carts,
    summary="The cartridges this account keeps",
    description="The signed-in account's own shelf, by name, with what the shelf may hold. An account "
                "whose shelf an admin closed gets an empty list and a limit of zero, so a cartridge "
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
        403: {"description": "This account's shelf is closed."},
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
    try:
        return _cart(store(conn, user, data, name, note))
    except Refused as e:
        raise HTTPException(status_code=e.status, detail=e.detail) from e


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
    try:
        if "name" in changes:
            cleaned["name"] = clean_name(changes["name"] or "")
        if "note" in changes:
            cleaned["note"] = clean_note(changes["note"] or "")
    except Refused as e:
        raise HTTPException(status_code=e.status, detail=e.detail) from e
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
    _save_file(user["id"], row["sha256"]).unlink(missing_ok=True)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# The save: what the cartridge's battery would have kept
# ---------------------------------------------------------------------------


@router.get(
    "/{cart_id}/save",
    summary="The cartridge's saved RAM, for the account that owns it",
    description="The bytes the play page last wrote for this cartridge, to put back into the console "
                "before the game starts. `private, no-store`, like the ROM.",
    response_class=Response,
    responses={200: {"content": {"application/octet-stream": {}}, "description": "The saved RAM."}, **_NOT_YOURS, 404: {"description": "No such cartridge on this shelf, or it has never saved."}},
)
def cart_save(cart_id: str, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Response:
    row = _owned(conn, user["id"], cart_id)
    try:
        data = _save_file(user["id"], row["sha256"]).read_bytes()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="This cartridge has never saved.")
    return Response(content=data, media_type="application/octet-stream", headers={"Cache-Control": "private, no-store"})


@router.put(
    "/{cart_id}/save",
    status_code=204,
    summary="Write the cartridge's saved RAM",
    description="The body is the cartridge RAM as the console holds it, whole, as `application/octet-stream`. "
                "Replaces what was there. The play page does this while a cartridge with a battery runs and when it stops.",
    responses={**_NOT_YOURS, 413: {"description": "Larger than a cartridge's RAM could be."}, 422: {"description": "Empty."}},
)
def put_save(cart_id: str, request: Request, data: bytes = Body(media_type="application/octet-stream", description="The cartridge RAM."),
             user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Response:
    row = _owned(conn, user["id"], cart_id)
    if not data:
        raise HTTPException(status_code=422, detail="An empty save is not a save; DELETE it instead.")
    if len(data) > SAVE_MAX:
        raise HTTPException(status_code=413, detail=f"{len(data)} bytes; a cartridge's RAM is {SAVE_MAX} at most.")
    path = _save_file(user["id"], row["sha256"])
    tmp = path.with_suffix(f".{secrets.token_hex(4)}.part")
    try:
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
    return Response(status_code=204)


@router.delete(
    "/{cart_id}/save",
    status_code=204,
    summary="Forget the cartridge's saved RAM",
    description="The next start is a cartridge whose battery was never written. The ROM stays.",
    responses=_NOT_YOURS,
)
def delete_save(cart_id: str, request: Request, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Response:
    row = _owned(conn, user["id"], cart_id)
    _save_file(user["id"], row["sha256"]).unlink(missing_ok=True)
    return Response(status_code=204)


def grant(handle: str, most: int) -> Optional[str]:
    """Resize an account's shelf from the command line, for the box this runs
    on; zero closes it. The admin API does the same through
    `PATCH /v1/admin/users/{id}`; this is for when nobody has an admin key to hand.
    """
    conn = db.connect()
    try:
        with conn:
            cur = conn.execute("UPDATE users SET carts_max = ?, updated_at = ? WHERE handle = ?", (most, db.now(), handle.lower()))
        return handle.lower() if cur.rowcount else None
    finally:
        conn.close()


def add(handle: str, file: Path, name: Optional[str], note: str) -> str:
    """Put a file on an account's shelf from the command line, held to every
    rule an upload is. For dumps that are already on the box: they should not
    have to go out through a browser to come back in."""
    conn = db.connect()
    try:
        user = conn.execute("SELECT * FROM users WHERE handle = ?", (handle.lower(),)).fetchone()
        if user is None:
            raise Refused(404, f"no account with the handle {handle!r}")
        row = store(conn, user, file.read_bytes(), name or file.name, note)
        return f"{row['name']}: mapper {row['mapper']}, {row['prg_bytes'] // 1024}K program, {row['chr_bytes'] // 1024}K pictures, crc32 {row['crc32']}, {row['id']}"
    finally:
        conn.close()


def _main(argv: list[str]) -> int:
    import argparse
    import sys

    ap = argparse.ArgumentParser(prog="carts.py", description="The cartridge shelf, from the box it runs on.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("grant", help="resize an account's shelf; zero closes it")
    g.add_argument("handle")
    g.add_argument("how_many", type=int)
    a = sub.add_parser("add", help="put a .nes file on an account's shelf, held to every rule an upload is")
    a.add_argument("handle")
    a.add_argument("file", type=Path)
    a.add_argument("--name", help="what to call it; the filename without .nes otherwise")
    a.add_argument("--note", default="")
    ns = ap.parse_args(argv)
    try:
        if ns.cmd == "grant":
            who = grant(ns.handle, ns.how_many)
            if who is None:
                raise Refused(404, f"no account with the handle {ns.handle!r}")
            print(f"{who} may keep {ns.how_many} cartridges")
        else:
            print(add(ns.handle, ns.file, ns.name, ns.note))
    except Refused as e:
        print(f"refused ({e.status}): {e.detail}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(_main(sys.argv[1:]))
