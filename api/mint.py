"""The public token mint: the registry's own mint, behind a door with a limit.

A registry token is what a builder sends to the chip API to claim a handle and
publish a cartridge. Until now it was minted by hand, with
`service/registry_admin.py mint` in the 6502 repository, which opens the
registry database and inserts a row. This module is the public front of that
same operation and nothing else: it imports the registry's `mint_token` and
calls it, so the token it hands out is exactly the token the CLI hands out,
made by the same code against the same file. Re-implementing the four lines
would be a second copy of what a token is, and the day the registry changed
its shape the copy would still mint the old one.

What is added is what a public door needs and a CLI never did:

**A limit.** Per caller per day and per day overall, both read from the
environment at call time with small defaults. Tokens are free and nobody is
sold anything, so the limit is not about money: it is about a loop minting a
thousand rows into somebody else's database. The refusal is a 429 that says
when to come back.

**A ledger, without the credential.** Every mint records a digest of the
caller's address, the note they left and the time, in the roof's own database.
It is what an admin reads to see whether the door is being abused. The token
never touches it: the registry stores the token's SHA-256 and this stores the
caller's, and neither can be turned back into the thing it hashes.

**An honest off state.** Where no registry is configured, `enabled` is false
and a mint is a 503 that says so, rather than a 500 or a token from nowhere.
A fresh clone of this repository has no registry beside it and must build and
run; on the box that serves tinymachines.ai the unit points at the file.

## Why the roof reaches into the registry's file at all

Both services run as the same user on the same box, and the registry's own
admin tool is "open the database and insert". Going through an HTTP endpoint
on the chip API instead would need that API to grow an admin credential and
this unit to hold it, which is a second secret to rotate for the privilege of
doing over a socket what the file permissions already allow. The coupling that
remains is one import (`registry.connect`, `registry.mint_token`) and it is
named at the top of this file so that a change over there fails here loudly.
"""

from __future__ import annotations

import hashlib
import importlib
import os
import secrets
import sqlite3
import sys
from pathlib import Path
from typing import Optional

import chip
import db

import base64 as _b64
import hmac as _hmac

DEFAULT_PER_IP_PER_DAY = 2
DEFAULT_PER_DAY = 60
LEDGER_KEEP_DAYS = 7
NOTE_LIMIT = 120


class Refused(Exception):
    """A mint that was not done, with the status the caller should see."""

    def __init__(self, status: int, detail: str, retry_after: Optional[int] = None):
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.retry_after = retry_after


# ---------------------------------------------------------------------------
# Configuration, read live so a test can point at a temp file.
# ---------------------------------------------------------------------------


def registry_path() -> Optional[Path]:
    p = os.environ.get("TM_REGISTRY_DB")
    return Path(p) if p else None


def service_dir() -> Path:
    """Where the registry's code lives: the 6502 checkout beside this one
    unless the unit says otherwise."""
    explicit = os.environ.get("TM_REGISTRY_SERVICE")
    if explicit:
        return Path(explicit)
    return Path(__file__).resolve().parent.parent.parent / "6502" / "service"


def per_ip_per_day() -> int:
    return int(os.environ.get("TM_MINT_PER_IP_DAY", DEFAULT_PER_IP_PER_DAY))


def per_day() -> int:
    return int(os.environ.get("TM_MINT_PER_DAY", DEFAULT_PER_DAY))


def enabled() -> bool:
    p = registry_path()
    return bool(p) and p.exists() and (service_dir() / "registry.py").exists()


def _registry():
    """The registry module, imported from the sibling checkout on first use.

    Lazy so that this service imports and serves everything else on a box
    with no 6502 checkout. The module name is the registry's own; nothing in
    this service is called `registry`, so there is no shadowing to worry
    about, and the path is put first so that a same-named package somewhere
    on the interpreter's path cannot answer instead.
    """
    d = str(service_dir())
    if d not in sys.path:
        sys.path.insert(0, d)
    return importlib.import_module("registry")


# ---------------------------------------------------------------------------
# The ledger and the limits
# ---------------------------------------------------------------------------


def ip_digest(ip: str) -> str:
    """The caller's address, one way. Enough to count a repeat caller and to
    let an admin see that one address minted forty times; not enough to hand
    the ledger to somebody and call it a list of people."""
    return hashlib.sha256(ip.strip().encode("utf-8")).hexdigest()


def _day_ago(now_iso: str) -> str:
    # ISO strings of one shape sort chronologically, so the window is a
    # string comparison against a timestamp one day back.
    from datetime import datetime, timedelta

    t = datetime.fromisoformat(now_iso) - timedelta(days=1)
    return t.isoformat(timespec="seconds")


def _keep_from(now_iso: str) -> str:
    from datetime import datetime, timedelta

    t = datetime.fromisoformat(now_iso) - timedelta(days=LEDGER_KEEP_DAYS)
    return t.isoformat(timespec="seconds")


def counts(conn: sqlite3.Connection, ip: str, now_iso: Optional[str] = None) -> dict:
    """How many mints this address and everybody have used in the last day."""
    now_iso = now_iso or db.now()
    since = _day_ago(now_iso)
    mine = conn.execute(
        "SELECT COUNT(*) FROM token_mints WHERE ip_sha256 = ? AND created_at > ?",
        (ip_digest(ip), since),
    ).fetchone()[0]
    everyone = conn.execute(
        "SELECT COUNT(*) FROM token_mints WHERE created_at > ?", (since,)
    ).fetchone()[0]
    return {"mine": mine, "everyone": everyone}


def availability(conn: sqlite3.Connection, ip: str) -> dict:
    c = counts(conn, ip)
    return {
        "enabled": enabled(),
        "per_ip_per_day": per_ip_per_day(),
        "per_day": per_day(),
        "remaining_for_you": max(0, per_ip_per_day() - c["mine"]),
        "remaining_today": max(0, per_day() - c["everyone"]),
    }


def mint(conn: sqlite3.Connection, *, ip: str, note: str = "") -> tuple[str, str]:
    """Mint a registry token for this caller. Returns (token, minted_at).

    The order matters: the limits are checked and the ledger row written in
    the roof's database FIRST, and only then is the registry asked for a
    token. A caller that finds a way to make the registry call fail should
    not also find that failures are free.
    """
    if not enabled():
        raise Refused(503, "Minting is not enabled on this deployment: no registry is configured beside it.")
    if len(note) > NOTE_LIMIT:
        raise Refused(422, f"The note is limited to {NOTE_LIMIT} characters.")

    now_iso = db.now()
    c = counts(conn, ip, now_iso)
    if c["mine"] >= per_ip_per_day():
        raise Refused(
            429,
            f"This address has minted {c['mine']} token(s) in the last day, which is the limit. "
            "One token is one builder; if you lost yours, the one you have can be revoked and replaced by asking.",
            retry_after=24 * 3600,
        )
    if c["everyone"] >= per_day():
        raise Refused(
            429,
            f"The mint has handed out {c['everyone']} tokens in the last day, which is its daily limit. Try tomorrow.",
            retry_after=3600,
        )

    with conn:
        conn.execute("DELETE FROM token_mints WHERE created_at < ?", (_keep_from(now_iso),))
        conn.execute(
            "INSERT INTO token_mints (id, ip_sha256, note, created_at) VALUES (?, ?, ?, ?)",
            ("m_" + secrets.token_hex(8), ip_digest(ip), note, now_iso),
        )

    reg = _registry()
    rdb = reg.connect(registry_path())
    try:
        token = reg.mint_token(rdb, f"public mint: {note}" if note else "public mint")
    finally:
        rdb.close()
    return token, now_iso


def ledger(conn: sqlite3.Connection, limit: int = 200) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM token_mints ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()


# ---------------------------------------------------------------------------
# The cart code: a slug derived from the token
# ---------------------------------------------------------------------------
#
# The owner's rule: the slug is HMAC of the key. The token authorises, the
# slug identifies, and the pairing is checkable by anyone holding the secret
# (this service) and by nobody else. Ten lowercase base32 characters, which is
# fifty bits: enough that two builders do not collide, short enough to say
# aloud, and a valid handle and ROM name under the registry's rule.
#
# The secret is not in the repository and not in the unit file. It is read
# from TM_MINT_SECRET if set, else from a 0600 file beside the roof's
# database, created once with 256 bits from the CSPRNG. Losing it would change
# every future code and none of the existing ones, which is the failure mode
# a per-install secret should have.


def _secret() -> bytes:
    explicit = os.environ.get("TM_MINT_SECRET")
    if explicit:
        return explicit.encode("utf-8")
    f = db.path().parent / "mint.secret"
    if f.exists():
        return f.read_bytes()
    f.parent.mkdir(parents=True, exist_ok=True)
    raw = secrets.token_bytes(32)
    fd = os.open(f, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(raw)
    return raw


CODE_LEN = 10


def cart_code(token: str) -> str:
    mac = _hmac.new(_secret(), token.encode("utf-8"), hashlib.sha256).digest()
    code = _b64.b32encode(mac).decode("ascii").lower().rstrip("=")
    return code[:CODE_LEN]


def code_matches(token: str, slug: str) -> bool:
    return _hmac.compare_digest(cart_code(token), (slug or "").strip().lower())


# ---------------------------------------------------------------------------
# The setup: a page for the token, and the starter cart in front of it
# ---------------------------------------------------------------------------

SITE = "https://tinymachines.ai"
CHIP_PUBLIC = "https://6502.tinymachines.ai/api"

client: chip.ChipClient = chip.ChipClient()


def publish_starter() -> bool:
    return os.environ.get("TM_MINT_PUBLISH_STARTER", "0") == "1"


def setup(token: str, *, handle: str | None = None) -> dict:
    """Claim a page for a freshly minted token and point it at the starter.

    Never raises. A token whose setup failed is still a valid token, so the
    dict says what happened in `setup`, and the fields that could not be
    established are None. The handle is the one asked for, or the cart code.
    """
    code = cart_code(token)
    want = (handle or code).strip().lower()
    sh, ss = chip.starter()
    out: dict = {
        "slug": code,
        "handle": None,
        "page": None,
        "play": f"{SITE}/6502/games?cart={CHIP_PUBLIC}/v1/registry/b/{sh}/roms/{ss}/cart",
        "brief": f"{SITE}/6502/cart/brief.md?slug={code}&handle={want}",
        "setup": "",
    }
    try:
        client.claim(token, want, f"builder {want}" if want == code else want)
        out["handle"] = want
        out["page"] = f"{SITE}/6502/builders/{want}"
        out["setup"] = f"Your page is claimed as {want!r}."
    except chip.ChipError as e:
        out["brief"] = f"{SITE}/6502/cart/brief.md?slug={code}"
        out["setup"] = f"The token is yours, but its page could not be claimed: {e}. Claim one in the editor."
        return out
    if publish_starter():
        try:
            client.publish(token, want, code, client.starter_blob())
            out["play"] = f"{SITE}/6502/games?cart={CHIP_PUBLIC}/v1/registry/b/{want}/roms/{code}/cart"
            out["setup"] += f" The starter cart is published under it as {code!r}."
        except chip.ChipError as e:
            out["setup"] += f" The starter cart could not be published: {e}."
    return out
