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

Only the name and the note, and for a raw dump the board (the mapper number,
the mirroring and the battery), which a chip reader cannot know and a person
can. Everything else in a row was read off the bytes here: the header is
parsed, or for a raw dump written from the bytes' own lengths, its sizes are
checked against the file's length, and a file that does not add up is
refused with the numbers rather than kept.
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
from models import Cart, CartLimits, CartPatch, CartSave, Carts, Revision, RevisionPatch, Revisions

router = APIRouter(prefix="/v1/me/carts", tags=["account"])

HEADER = 16
TRAINER = 512
NAME_MAX = 80
NOTE_MAX = 240
# The console's cartridge RAM is 8 KiB; a save is that or nothing. Room for
# four times it, for a board that fits more, and no more than that.
SAVE_MAX = 32 * 1024


def revisions_max() -> int:
    """How many revisions one cartridge may keep. Sixteen is a working session's worth; the number is a quota, not a design."""
    return int(os.environ.get("TM_CART_REVISIONS", "16"))


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


def with_header(data: bytes, mapper: int, chr_kib: int, mirroring: str, battery: bool) -> bytes:
    """A raw dump (PRG, then CHR, no header) as an iNES file.

    A reader that dumps a cartridge's chips writes what the chips hold and
    nothing about the board, so the board comes from the person, and the
    sizes come from the bytes: the CHR is the last `chr_kib` of the body
    (zero for a board with CHR RAM) and the PRG is the rest. Sizes that are
    not whole banks are refused with the numbers, because a header that
    rounds them would name a cartridge that does not exist. Written as iNES
    1.0, so a mapper above 255 is refused rather than half-written.
    """
    if not 0 <= mapper <= 255:
        raise NotACartridge(f"mapper {mapper}: this writes an iNES 1.0 header, which holds mappers 0 to 255.")
    chr_len = chr_kib * 1024
    if chr_len > len(data):
        raise NotACartridge(f"{chr_kib} KiB of CHR is more than the {len(data)} bytes that arrived.")
    prg_len = len(data) - chr_len
    if prg_len == 0 or prg_len % 16384:
        raise NotACartridge(f"The PRG is {prg_len} bytes, which is not a whole number of 16 KiB banks.")
    if chr_len % 8192:
        raise NotACartridge(f"The CHR is {chr_len} bytes, which is not a whole number of 8 KiB banks.")
    if prg_len // 16384 > 255 or chr_len // 8192 > 255:
        raise NotACartridge("More banks than an iNES 1.0 header can count.")
    f6 = ((mapper & 0x0F) << 4) | (0x02 if battery else 0) | (1 if mirroring == "v" else 0)
    f7 = mapper & 0xF0
    return b"NES\x1a" + bytes([prg_len // 16384, chr_len // 8192, f6, f7]) + bytes(8) + data


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


def _cart(row: sqlite3.Row, conn: sqlite3.Connection) -> Cart:
    d = dict(row)
    d.pop("user_id")
    n = conn.execute("SELECT COUNT(*) FROM cart_revisions WHERE cart_id = ?", (row["id"],)).fetchone()[0]
    return Cart(**d, rom=f"/v1/me/carts/{row['id']}/rom", save=_save_of(row["user_id"], row["sha256"]), revisions=n)


def _limits(conn: sqlite3.Connection, user: sqlite3.Row) -> CartLimits:
    held = conn.execute("SELECT COUNT(*) FROM carts WHERE user_id = ?", (user["id"],)).fetchone()[0]
    most = user["carts_max"]
    return CartLimits(max=most, held=held, remaining=max(0, most - held), bytes_max=bytes_max(), revisions_max=revisions_max())


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
    return Carts(carts=[_cart(r, conn) for r in rows], limits=_limits(conn, user))


@router.post(
    "",
    response_model=Cart,
    status_code=201,
    summary="Put a cartridge on the shelf",
    description="The body is the `.nes` file itself, as `application/octet-stream`; the name travels in "
                "the query. The header is read here and held to the file's length, and a file that does "
                "not add up is refused with the numbers. Nothing the uploader says about the cartridge "
                "is kept except its name and note.\n\n"
                "A raw dump, the chips' contents with no header, goes in the same way with `mapper` "
                "given: the body is the PRG followed by the CHR, `chr_kib` says how much of the end is "
                "CHR (zero for a board with CHR RAM), and the header is written here from the bytes' "
                "own lengths and the board named. A pair of files is one body with the CHR appended.",
    responses={
        **_SIGNED_OUT,
        403: {"description": "This account's shelf is closed."},
        409: {"description": "The shelf is full, or this exact file is already on it (the answer names which)."},
        413: {"description": "Larger than the shelf takes."},
        422: {"description": "Not an iNES file, or its header and its length disagree; or a raw dump whose banks do not divide. The message gives the numbers."},
    },
)
def add_cart(
    request: Request,
    name: str = Query(description="What to call it. A trailing `.nes` is dropped, so a filename will do.", examples=["Blaster Master"]),
    note: str = Query(default="", description="Anything worth remembering about this dump."),
    mapper: Optional[int] = Query(default=None, ge=0, le=255, description="For a raw dump: the board, as its iNES mapper number. Absent, the body is a `.nes` with its own header."),
    chr_kib: int = Query(default=0, ge=0, description="For a raw dump: how many KiB at the end of the body are CHR. Zero means the board carries CHR RAM."),
    mirroring: str = Query(default="h", pattern="^[hv]$", description="For a raw dump: `h` (horizontal) or `v` (vertical) nametable mirroring, as the board is wired."),
    battery: bool = Query(default=False, description="For a raw dump: whether the board has a battery behind its RAM, so the console keeps its saves."),
    data: bytes = Body(media_type="application/octet-stream", description="The `.nes` file, or a raw dump's PRG followed by its CHR."),
    user: sqlite3.Row = Depends(require_user),
    conn: sqlite3.Connection = Depends(connection),
) -> Cart:
    try:
        if mapper is not None:
            try:
                data = with_header(data, mapper, chr_kib, mirroring, battery)
            except NotACartridge as e:
                raise Refused(422, str(e)) from e
        return _cart(store(conn, user, data, name, note), conn)
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
    return _cart(_owned(conn, user["id"], cart_id), conn)


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
    # The revisions' rows went with the cascade; their patches go here.
    for f in _file(user["id"], row["sha256"]).parent.glob(f"{row['sha256']}.r*.ips"):
        f.unlink(missing_ok=True)
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


# ---------------------------------------------------------------------------
# Revisions: an edit as an IPS patch against the cartridge as it arrived
#
# The cartridge's bytes are never edited (notes/workbench.md, the third
# step; NOTICE.md, "Somebody else's game"). What the workbench makes of an
# edit is the reader's own bytes at their offsets, and that is what is kept:
# the IPS file beside the ROM, and a row saying what this service measured
# when it applied the patch. The patched image is made on request, never
# stored, and checked against the digest measured on arrival on the way out,
# the way the ROM is.
# ---------------------------------------------------------------------------


class NotAPatch(ValueError):
    """The bytes are not an IPS file this service can apply. The message says why."""


def apply_ips(base: bytes, patch: bytes) -> tuple[bytes, int]:
    """The image with the patch laid over it, and how many records the patch has.

    IPS as every patcher reads it: "PATCH", then records of a three-byte
    offset, a two-byte length and that many bytes (a length of zero is a run:
    two bytes of count and one byte repeated), then "EOF". A record past the
    file's end is refused: a revision cannot grow a cartridge. One that
    touches the sixteen-byte header is refused too, because the header is
    the board and the sizes, and a cartridge whose board changed is another
    cartridge.
    """
    if not patch.startswith(b"PATCH"):
        raise NotAPatch("not an IPS file: no PATCH at the start")
    out = bytearray(base)
    i, n, records = 5, len(patch), 0
    while True:
        if i + 3 > n:
            raise NotAPatch("the patch ends without EOF")
        if patch[i:i + 3] == b"EOF" and i + 3 == n:
            break
        if i + 5 > n:
            raise NotAPatch(f"record {records + 1} is cut short")
        at = int.from_bytes(patch[i:i + 3], "big")
        size = int.from_bytes(patch[i + 3:i + 5], "big")
        i += 5
        if size == 0:
            if i + 3 > n:
                raise NotAPatch(f"record {records + 1} is a run cut short")
            run = int.from_bytes(patch[i:i + 2], "big")
            data = bytes([patch[i + 2]]) * run
            i += 3
        else:
            data = patch[i:i + size]
            if len(data) != size:
                raise NotAPatch(f"record {records + 1} claims {size} bytes and the patch has {len(data)} left")
            i += size
        if not data:
            raise NotAPatch(f"record {records + 1} is empty")
        if at < HEADER:
            raise NotAPatch(f"record {records + 1} at {at} touches the header; a revision cannot change the board or the sizes")
        if at + len(data) > len(base):
            raise NotAPatch(f"record {records + 1} reaches {at + len(data)} and the cartridge is {len(base)} bytes; a revision cannot grow it")
        out[at:at + len(data)] = data
        records += 1
    return bytes(out), records


def _rev_file(uid: str, sha256: str, seq: int) -> Path:
    return _file(uid, sha256).with_name(f"{sha256}.r{seq}.ips")


def _revision(row: sqlite3.Row) -> Revision:
    d = dict(row)
    d.pop("user_id")
    base = f"/v1/me/carts/{row['cart_id']}/revisions/{row['id']}"
    return Revision(**d, patch=f"{base}/patch", rom=f"{base}/rom")


def _owned_rev(conn: sqlite3.Connection, uid: str, cid: str, rid: str) -> sqlite3.Row:
    _owned(conn, uid, cid)
    row = conn.execute("SELECT * FROM cart_revisions WHERE id = ? AND cart_id = ? AND user_id = ?", (rid, cid, uid)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No such revision of this cartridge.")
    return row


def _rom_bytes(uid: str, row: sqlite3.Row) -> bytes:
    """The cartridge's bytes as recorded, or a 410 for a file that is gone or rotted."""
    try:
        data = _file(uid, row["sha256"]).read_bytes()
    except FileNotFoundError:
        raise HTTPException(status_code=410, detail="The shelf lists this cartridge and its file is gone from disk. Delete the entry and add the dump again.")
    if hashlib.sha256(data).hexdigest() != row["sha256"]:
        raise HTTPException(status_code=410, detail="The file on disk no longer matches the digest recorded when it arrived. Delete the entry and add the dump again.")
    return data


def keep_revision(conn: sqlite3.Connection, user: sqlite3.Row, cart: sqlite3.Row, patch: bytes, message: str = "") -> sqlite3.Row:
    """Keep a revision of a cartridge, or refuse it with the reason. The one place the rules live."""
    if not patch:
        raise Refused(422, "An empty body is not a patch.")
    if len(patch) > bytes_max():
        raise Refused(413, f"{len(patch)} bytes; a patch is at most the size a cartridge may be, {bytes_max()}.")
    message = clean_note(message)
    base = _rom_bytes(user["id"], cart)
    try:
        image, records = apply_ips(base, patch)
    except NotAPatch as e:
        raise Refused(422, str(e)) from e
    changed = sum(1 for a, b in zip(base, image) if a != b)
    if changed == 0:
        raise Refused(422, "The patch changes nothing: every byte it writes is already there.")
    sha = hashlib.sha256(image).hexdigest()
    twin = conn.execute("SELECT seq FROM cart_revisions WHERE cart_id = ? AND sha256 = ?", (cart["id"], sha)).fetchone()
    if twin is not None:
        raise Refused(409, f"This patch makes the same image as revision {twin['seq']}.")
    held = conn.execute("SELECT COUNT(*), COALESCE(MAX(seq), 0) FROM cart_revisions WHERE cart_id = ?", (cart["id"],)).fetchone()
    if held[0] >= revisions_max():
        raise Refused(409, f"This cartridge keeps {held[0]} revisions, which is its limit of {revisions_max()}. Delete one to keep another.")
    seq = held[1] + 1
    path = _rev_file(user["id"], cart["sha256"], seq)
    tmp = path.with_suffix(f".{secrets.token_hex(4)}.part")
    try:
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as f:
            f.write(patch)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
    rid, now = f"rv_{secrets.token_hex(8)}", db.now()
    try:
        with conn:
            conn.execute(
                "INSERT INTO cart_revisions (id, cart_id, user_id, seq, message, sha256, patch_bytes, ranges, changed, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (rid, cart["id"], user["id"], seq, message, sha, len(patch), records, changed, now, now),
            )
    except sqlite3.IntegrityError:
        path.unlink(missing_ok=True)
        raise Refused(409, "Two revisions raced for the same number; keep it again.")
    return _owned_rev(conn, user["id"], cart["id"], rid)


_NO_REV = {**_NOT_YOURS, 404: {"description": "No such cartridge on this shelf, or no such revision of it."}}


@router.get(
    "/{cart_id}/revisions",
    response_model=Revisions,
    summary="The cartridge's revisions",
    description="Oldest first. Each is an IPS patch against the file as it arrived, and what this service measured when it applied it.",
    responses=_NOT_YOURS,
)
def list_revisions(cart_id: str, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Revisions:
    _owned(conn, user["id"], cart_id)
    rows = conn.execute("SELECT * FROM cart_revisions WHERE cart_id = ? ORDER BY seq", (cart_id,)).fetchall()
    return Revisions(revisions=[_revision(r) for r in rows], max=revisions_max())


@router.post(
    "/{cart_id}/revisions",
    response_model=Revision,
    status_code=201,
    summary="Keep a revision of a cartridge",
    description="The body is an IPS patch, as `application/octet-stream`. It is applied here, to the cartridge as it arrived, and "
                "refused if it changes nothing, grows the file or touches the header. What is kept is the patch and what "
                "applying it measured; the patched image is made whenever it is asked for.",
    responses={
        **_NOT_YOURS,
        409: {"description": "The cartridge keeps as many revisions as it may, or this patch makes the same image as one it keeps."},
        410: {"description": "The cartridge's file is gone or rotted; the shelf says how to recover."},
        413: {"description": "Larger than a cartridge may be."},
        422: {"description": "Not an IPS file, a record past the file's end or in the header, a patch that changes nothing, or a message too long."},
    },
)
def add_revision(
    cart_id: str,
    request: Request,
    data: bytes = Body(media_type="application/octet-stream", description="The IPS patch."),
    message: str = Query(default="", description=f"What the revision is, {NOTE_MAX} characters at most."),
    user: sqlite3.Row = Depends(require_user),
    conn: sqlite3.Connection = Depends(connection),
) -> Revision:
    cart = _owned(conn, user["id"], cart_id)
    try:
        return _revision(keep_revision(conn, user, cart, data, message))
    except Refused as e:
        raise HTTPException(status_code=e.status, detail=e.detail) from e


@router.get("/{cart_id}/revisions/{rev_id}", response_model=Revision, summary="One revision", description="What the service measured when it kept it.", responses=_NO_REV)
def get_revision(cart_id: str, rev_id: str, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Revision:
    return _revision(_owned_rev(conn, user["id"], cart_id, rev_id))


@router.get(
    "/{cart_id}/revisions/{rev_id}/patch",
    summary="The revision's patch",
    description="The IPS file as it was kept, `private, no-store`.",
    response_class=Response,
    responses={200: {"content": {"application/octet-stream": {}}, "description": "The IPS file."}, **_NO_REV, 410: {"description": "The patch is gone from disk. Delete the revision and keep it again."}},
)
def revision_patch(cart_id: str, rev_id: str, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Response:
    cart = _owned(conn, user["id"], cart_id)
    rev = _owned_rev(conn, user["id"], cart_id, rev_id)
    try:
        data = _rev_file(user["id"], cart["sha256"], rev["seq"]).read_bytes()
    except FileNotFoundError:
        raise HTTPException(status_code=410, detail="The shelf lists this revision and its patch is gone from disk. Delete the revision and keep it again.")
    return Response(content=data, media_type="application/octet-stream", headers={"Cache-Control": "private, no-store"})


@router.get(
    "/{cart_id}/revisions/{rev_id}/rom",
    summary="The revision's image",
    description="The cartridge's bytes with the patch laid over them, made now and checked against the digest measured "
                "when the revision was kept. `private, no-store`, like the ROM.",
    response_class=Response,
    responses={200: {"content": {"application/octet-stream": {}}, "description": "The patched `.nes` image."}, **_NO_REV, 410: {"description": "The cartridge's file or the patch is gone or rotted, or the image no longer matches its digest."}},
)
def revision_rom(cart_id: str, rev_id: str, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Response:
    cart = _owned(conn, user["id"], cart_id)
    rev = _owned_rev(conn, user["id"], cart_id, rev_id)
    base = _rom_bytes(user["id"], cart)
    try:
        patch = _rev_file(user["id"], cart["sha256"], rev["seq"]).read_bytes()
        image, _ = apply_ips(base, patch)
    except FileNotFoundError:
        raise HTTPException(status_code=410, detail="The shelf lists this revision and its patch is gone from disk. Delete the revision and keep it again.")
    except NotAPatch as e:
        raise HTTPException(status_code=410, detail=f"The patch on disk no longer applies: {e}. Delete the revision and keep it again.")
    if hashlib.sha256(image).hexdigest() != rev["sha256"]:
        raise HTTPException(status_code=410, detail="The image no longer matches the digest measured when the revision was kept. Delete the revision and keep it again.")
    return Response(content=image, media_type="application/octet-stream", headers={"Cache-Control": "private, no-store"})


@router.patch("/{cart_id}/revisions/{rev_id}", response_model=Revision, summary="Change what a revision is called", description="Touches only what it names. The patch cannot be edited: keep a new revision.", responses={**_NO_REV, 422: {"description": "A message too long, or a field this route does not know."}})
def patch_revision(cart_id: str, rev_id: str, body: RevisionPatch, request: Request, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Revision:
    _owned_rev(conn, user["id"], cart_id, rev_id)
    changes = body.model_dump(exclude_unset=True)
    if "message" in changes:
        try:
            message = clean_note(changes["message"] or "")
        except Refused as e:
            raise HTTPException(status_code=e.status, detail=e.detail) from e
        with conn:
            conn.execute("UPDATE cart_revisions SET message = ?, updated_at = ? WHERE id = ?", (message, db.now(), rev_id))
    return _revision(_owned_rev(conn, user["id"], cart_id, rev_id))


@router.delete("/{cart_id}/revisions/{rev_id}", status_code=204, summary="Remove a revision", description="The row and the patch. The cartridge stays, and the number is not reused.", responses=_NO_REV)
def delete_revision(cart_id: str, rev_id: str, request: Request, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Response:
    cart = _owned(conn, user["id"], cart_id)
    rev = _owned_rev(conn, user["id"], cart_id, rev_id)
    with conn:
        conn.execute("DELETE FROM cart_revisions WHERE id = ?", (rev["id"],))
    _rev_file(user["id"], cart["sha256"], rev["seq"]).unlink(missing_ok=True)
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


def add(handle: str, file: Path, name: Optional[str], note: str, mapper: Optional[int] = None, chr_kib: int = 0, mirroring: str = "h", battery: bool = False, chr_file: Optional[Path] = None) -> str:
    """Put a file on an account's shelf from the command line, held to every
    rule an upload is. For dumps that are already on the box: they should not
    have to go out through a browser to come back in. With `mapper` the file
    is a raw dump (and `chr_file`, if given, is appended as its CHR)."""
    conn = db.connect()
    try:
        user = conn.execute("SELECT * FROM users WHERE handle = ?", (handle.lower(),)).fetchone()
        if user is None:
            raise Refused(404, f"no account with the handle {handle!r}")
        data = file.read_bytes()
        if mapper is not None:
            if chr_file is not None:
                chr_bytes = chr_file.read_bytes()
                data, chr_kib = data + chr_bytes, len(chr_bytes) // 1024
            try:
                data = with_header(data, mapper, chr_kib, mirroring, battery)
            except NotACartridge as e:
                raise Refused(422, str(e)) from e
        row = store(conn, user, data, name or file.name, note)
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
    a.add_argument("--mapper", type=int, help="the file is a raw dump (PRG, then CHR) on this board; the header is written here")
    a.add_argument("--chr", type=Path, help="raw dump: a separate CHR file to append")
    a.add_argument("--chr-kib", type=int, default=0, help="raw dump: KiB of CHR at the end of the file (0: CHR RAM)")
    a.add_argument("--mirroring", choices=["h", "v"], default="h")
    a.add_argument("--battery", action="store_true")
    ns = ap.parse_args(argv)
    try:
        if ns.cmd == "grant":
            who = grant(ns.handle, ns.how_many)
            if who is None:
                raise Refused(404, f"no account with the handle {ns.handle!r}")
            print(f"{who} may keep {ns.how_many} cartridges")
        else:
            print(add(ns.handle, ns.file, ns.name, ns.note, ns.mapper, ns.chr_kib, ns.mirroring, ns.battery, ns.chr))
    except Refused as e:
        print(f"refused ({e.status}): {e.detail}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(_main(sys.argv[1:]))
