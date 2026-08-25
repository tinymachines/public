"""Sign in with GitHub, and the registry tokens an account holds.

## Why an account at all

A registry token is the whole credential for a builder's page: hold it and
you publish, lose it and the page is gone, because the registry stores only
its digest. That is right for the registry and hard on people. An account is
the thing a lost token can be recovered *through*: it holds the digests of
the tokens it minted, so it can ask the registry to revoke one and take its
handle across to a fresh one. Nothing about a token is stored here either.

## Why GitHub

The people building cartridges have GitHub accounts; it gives a stable
identity with its own recovery; and it costs one OAuth app and no email
handling here. The tables are provider-agnostic (`logins` keys on provider
and id), so a second way in can arrive without a schema change.

## The session

A random 32-byte value in an HttpOnly, SameSite=Lax cookie, stored here as
its SHA-256 with an expiry. Lax means a cross-site POST never carries it, so
the state-changing routes below are safe from a foreign form; the Origin
check on them is belt and braces.

## Secrets

The OAuth client id and secret are read from `$STATE/github.secret` (JSON:
`{"client_id": ..., "client_secret": ...}`, mode 0600) or from
`TM_GITHUB_CLIENT_ID` / `TM_GITHUB_CLIENT_SECRET`. Neither is in the repo or
the unit. Without them the routes answer that sign-in is off, and the site
shows the public mint alone.

## Reaching into the registry

Re-issuing writes two rows in the registry's own database: the old token's
`revoked`, the new token's `handle`. `registry_admin.py grant` and `revoke`
do exactly these updates; there is no `transfer()` in the registry module
yet, and this is the one place the roof touches its tables directly. It is
noted in notes/upstream-transport.md's neighbour as a thing to ask for.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

import db
import mint as mint_mod
from admin import connection
from models import AuthState, Me, MeLimits, MeToken, MeUser, MintedToken, NewToken

router = APIRouter(prefix="/v1", tags=["account"])

SESSION_COOKIE = "tm_session"
STATE_COOKIE = "tm_oauth"
SESSION_DAYS = 30
SITE = mint_mod.SITE

GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN = "https://github.com/login/oauth/access_token"
GITHUB_USER = "https://api.github.com/user"


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


def credentials() -> Optional[tuple[str, str]]:
    cid = os.environ.get("TM_GITHUB_CLIENT_ID")
    sec = os.environ.get("TM_GITHUB_CLIENT_SECRET")
    if cid and sec:
        return cid, sec
    f = db.path().parent / "github.secret"
    if f.exists():
        try:
            j = json.loads(f.read_text())
            if j.get("client_id") and j.get("client_secret"):
                return str(j["client_id"]), str(j["client_secret"])
        except (ValueError, OSError):
            return None
    return None


def enabled() -> bool:
    return credentials() is not None


def active_max() -> int:
    """How many live tokens one account may hold. Three: a page, a spare, a mistake."""
    return int(os.environ.get("TM_ACCOUNT_TOKENS", "3"))


def _secure(request: Request) -> bool:
    # Behind nginx the scheme reaching uvicorn is http; the site is https.
    # A test client is http and gets a non-Secure cookie, which is the only
    # way a test can send it back.
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https"


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _sign(value: str) -> str:
    return hmac.new(mint_mod._secret(), value.encode("utf-8"), hashlib.sha256).hexdigest()[:32]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def open_session(conn: sqlite3.Connection, user_id: str) -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    now = _now()
    exp = (now + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")
    with conn:
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now.isoformat(timespec="seconds"),))
        conn.execute(
            "INSERT INTO sessions (sha256, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (_sha(raw), user_id, now.isoformat(timespec="seconds"), exp),
        )
    return raw, exp


def _set_session(resp: Response, request: Request, raw: str) -> None:
    resp.set_cookie(
        SESSION_COOKIE, raw, max_age=SESSION_DAYS * 86400, httponly=True,
        secure=_secure(request), samesite="lax", path="/",
    )


def current_user(request: Request, conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        return None
    row = conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.sha256 = ? AND s.expires_at > ? AND u.disabled_at IS NULL",
        (_sha(raw), _now().isoformat(timespec="seconds")),
    ).fetchone()
    return row


def require_user(request: Request, conn: sqlite3.Connection = Depends(connection)) -> sqlite3.Row:
    row = current_user(request, conn)
    if row is None:
        raise HTTPException(status_code=401, detail="Not signed in. GET /v1/auth/github starts a sign-in.")
    # A state change from another origin is refused even though Lax cookies
    # already keep it out; the header is cheap to check and the rule is
    # cheap to state.
    if request.method not in ("GET", "HEAD"):
        origin = request.headers.get("origin")
        if origin and origin != SITE and not origin.startswith("http://127.0.0.1") and not origin.startswith("http://localhost") and not origin.startswith("http://testserver"):
            raise HTTPException(status_code=403, detail="That request came from another site.")
    return row


# ---------------------------------------------------------------------------
# GitHub, with the two calls a test replaces
# ---------------------------------------------------------------------------


def github_exchange(code: str) -> str:
    cid, sec = credentials() or ("", "")
    r = httpx.post(
        GITHUB_TOKEN,
        data={"client_id": cid, "client_secret": sec, "code": code},
        headers={"Accept": "application/json"},
        timeout=15,
    )
    r.raise_for_status()
    j = r.json()
    tok = j.get("access_token")
    if not tok:
        raise HTTPException(status_code=502, detail=f"GitHub did not return a token: {j.get('error', 'no access_token')}.")
    return str(tok)


def github_user(access: str) -> dict:
    r = httpx.get(
        GITHUB_USER,
        headers={"Authorization": f"Bearer {access}", "Accept": "application/vnd.github+json", "User-Agent": "tinymachines.ai"},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _safe_next(v: Optional[str]) -> str:
    if not v or not v.startswith("/") or v.startswith("//") or "\\" in v:
        return "/6502/manage"
    return v


def upsert_github_user(conn: sqlite3.Connection, gh: dict) -> str:
    """The user row for this GitHub identity, made if it is new. Returns the id."""
    now = db.now()
    pid = str(gh["id"])
    login = str(gh.get("login", "")).lower()
    name = (gh.get("name") or gh.get("login") or "").strip()
    first = name.split(" ")[0] if name else login
    avatar = gh.get("avatar_url")
    # users.email is identity elsewhere in this service and unique; GitHub
    # may withhold the address, and GitHub's own noreply address for the
    # account is a real, stable one to record in that case.
    email = (gh.get("email") or f"{pid}+{login}@users.noreply.github.com").lower()
    row = conn.execute("SELECT user_id FROM logins WHERE provider = 'github' AND provider_id = ?", (pid,)).fetchone()
    with conn:
        if row:
            uid = row["user_id"]
            conn.execute("UPDATE logins SET login = ?, avatar = ?, last_at = ? WHERE provider = 'github' AND provider_id = ?", (login, avatar, now, pid))
            conn.execute("UPDATE users SET pic = COALESCE(?, pic), updated_at = ? WHERE id = ?", (avatar, now, uid))
            return uid
        uid = "u_" + secrets.token_hex(8)
        # The handle is the GitHub login unless somebody already has it here.
        handle = login or uid
        n = 1
        while conn.execute("SELECT 1 FROM users WHERE handle = ?", (handle,)).fetchone():
            n += 1
            handle = f"{login}-{n}"
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            email = f"{pid}+{login}@users.noreply.github.com"
        conn.execute(
            "INSERT INTO users (id, email, handle, first_name, pic, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (uid, email, handle, first, avatar, now, now),
        )
        conn.execute(
            "INSERT INTO logins (provider, provider_id, user_id, login, avatar, created_at, last_at) VALUES ('github', ?, ?, ?, ?, ?, ?)",
            (pid, uid, login, avatar, now, now),
        )
    return uid


# ---------------------------------------------------------------------------
# Routes: sign in, sign out, who am I
# ---------------------------------------------------------------------------


@router.get(
    "/auth",
    response_model=AuthState,
    summary="Which ways of signing in this deployment offers",
    description="`github` is true where a GitHub OAuth app is configured beside this service; "
                "the site shows a sign-in button on that answer and the public mint alone otherwise.",
)
def auth_state() -> AuthState:
    return AuthState(github=enabled())


@router.get(
    "/auth/github",
    summary="Start a GitHub sign-in",
    description="Redirects to GitHub. `next` is where to land afterwards, a path on this site. "
                "A 503 says GitHub sign-in is not configured on this deployment.",
    responses={302: {"description": "To GitHub."}, 503: {"description": "Not configured here."}},
)
def github_start(request: Request, next: Optional[str] = None) -> Response:
    creds = credentials()
    if not creds:
        raise HTTPException(status_code=503, detail="GitHub sign-in is not configured on this deployment.")
    state = secrets.token_urlsafe(24)
    dest = _safe_next(next)
    payload = f"{state}|{dest}"
    q = urlencode({
        "client_id": creds[0],
        "redirect_uri": f"{SITE}/api/v1/auth/github/callback",
        "scope": "read:user",
        "state": state,
    })
    resp = RedirectResponse(f"{GITHUB_AUTHORIZE}?{q}", status_code=302)
    resp.set_cookie(STATE_COOKIE, f"{payload}|{_sign(payload)}", max_age=600, httponly=True, secure=_secure(request), samesite="lax", path="/")
    return resp


@router.get(
    "/auth/github/callback",
    summary="Where GitHub sends the browser back",
    description="Exchanges the code, records the identity, opens a session and redirects to `next`. "
                "Not a route to call by hand.",
    responses={302: {"description": "Signed in; to `next`."}, 400: {"description": "The state did not match: start again."}},
)
def github_callback(request: Request, code: str, state: str, conn: sqlite3.Connection = Depends(connection)) -> Response:
    raw = request.cookies.get(STATE_COOKIE, "")
    parts = raw.split("|")
    if len(parts) != 3 or parts[0] != state or not hmac.compare_digest(_sign(f"{parts[0]}|{parts[1]}"), parts[2]):
        raise HTTPException(status_code=400, detail="The sign-in did not start here, or took too long. Start again.")
    try:
        access = github_exchange(code)
        gh = github_user(access)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"GitHub did not answer: {e}.")
    uid = upsert_github_user(conn, gh)
    session, _ = open_session(conn, uid)
    resp = RedirectResponse(_safe_next(parts[1]), status_code=302)
    _set_session(resp, request, session)
    resp.delete_cookie(STATE_COOKIE, path="/")
    return resp


@router.post(
    "/auth/logout",
    summary="Sign out",
    status_code=204,
    description="Forgets the session the cookie names and clears the cookie. Idempotent.",
)
def logout(request: Request, conn: sqlite3.Connection = Depends(connection)) -> Response:
    raw = request.cookies.get(SESSION_COOKIE)
    if raw:
        with conn:
            conn.execute("DELETE FROM sessions WHERE sha256 = ?", (_sha(raw),))
    resp = Response(status_code=204)
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


def _tokens(conn: sqlite3.Connection, uid: str) -> list[MeToken]:
    rows = conn.execute(
        "SELECT * FROM builder_tokens WHERE user_id = ? ORDER BY created_at DESC", (uid,)
    ).fetchall()
    return [
        MeToken(id=r["id"], handle=r["handle"], pub=r["sha256"][:12], note=r["note"],
                created_at=r["created_at"], revoked_at=r["revoked_at"])
        for r in rows
    ]


def _me(conn: sqlite3.Connection, user: sqlite3.Row) -> Me:
    login = conn.execute("SELECT * FROM logins WHERE user_id = ? ORDER BY last_at DESC", (user["id"],)).fetchone()
    tokens = _tokens(conn, user["id"])
    active = sum(1 for t in tokens if t.revoked_at is None)
    return Me(
        user=MeUser(id=user["id"], handle=user["handle"], name=user["first_name"], pic=user["pic"],
                    provider=login["provider"] if login else "github", login=login["login"] if login else user["handle"]),
        tokens=tokens,
        limits=MeLimits(active_max=active_max(), active=active, remaining=max(0, active_max() - active)),
    )


@router.get(
    "/me",
    response_model=Me,
    summary="Who is signed in, and the tokens their account holds",
    description="The account behind the session cookie, its tokens by digest (never the tokens), "
                "and how many more it may mint.",
    responses={401: {"description": "Nobody."}},
)
def me(user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Me:
    return _me(conn, user)


# ---------------------------------------------------------------------------
# Routes: the account's tokens
# ---------------------------------------------------------------------------


def _active_count(conn: sqlite3.Connection, uid: str) -> int:
    return conn.execute("SELECT COUNT(*) FROM builder_tokens WHERE user_id = ? AND revoked_at IS NULL", (uid,)).fetchone()[0]


def _record(conn: sqlite3.Connection, uid: str, token: str, handle: Optional[str], note: str) -> str:
    tid = "bt_" + secrets.token_hex(8)
    with conn:
        conn.execute(
            "INSERT INTO builder_tokens (id, user_id, sha256, handle, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (tid, uid, _sha(token.strip()), handle, note, db.now()),
        )
    return tid


@router.post(
    "/me/tokens",
    response_model=MintedToken,
    status_code=201,
    summary="Mint a registry token held by this account",
    description="The same token the public mint hands out, counted against the account rather than "
                "the address, and remembered by digest so the account can revoke or replace it. "
                "An account holds a few live tokens at most; the daily total still applies.",
    responses={401: {"description": "Not signed in."}, 429: {"description": "The account holds its maximum, or the daily total is spent."}, 503: {"description": "No registry beside this service."}},
)
def mint_for_account(body: NewToken, request: Request, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> MintedToken:
    if _active_count(conn, user["id"]) >= active_max():
        raise HTTPException(status_code=429, detail=f"This account holds {active_max()} live tokens, which is its limit. Revoke one to mint another.")
    try:
        token, when = mint_mod.mint(conn, ip="", note=body.note, account=user["id"])
    except mint_mod.Refused as e:
        headers = {"Retry-After": str(e.retry_after)} if e.retry_after else None
        raise HTTPException(status_code=e.status, detail=e.detail, headers=headers)
    done = mint_mod.setup(token, handle=body.handle)
    _record(conn, user["id"], token, done.get("handle"), body.note)
    return MintedToken(token=token, minted_at=when, editor=f"{SITE}/6502/manage",
                       claim=f"POST {mint_mod.CHIP_PUBLIC}/v1/registry/claim", **done)


def _owned(conn: sqlite3.Connection, uid: str, tid: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM builder_tokens WHERE id = ? AND user_id = ?", (tid, uid)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No such token on this account.")
    return row


def _registry_db():
    reg = mint_mod._registry()
    p = mint_mod.registry_path()
    if p is None:
        raise HTTPException(status_code=503, detail="No registry is configured beside this service.")
    return reg, reg.connect(p)


@router.post(
    "/me/tokens/{token_id}/reissue",
    response_model=MintedToken,
    status_code=201,
    summary="Replace a token: revoke it in the registry and move its page to a new one",
    description="For a token that was lost. The old one stops working at once; the page and every "
                "ROM on it stay, now held by the new token, which is returned once.",
    responses={401: {"description": "Not signed in."}, 404: {"description": "Not this account's token."}, 409: {"description": "Already revoked."}},
)
def reissue(token_id: str, request: Request, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> MintedToken:
    old = _owned(conn, user["id"], token_id)
    if old["revoked_at"]:
        raise HTTPException(status_code=409, detail="That token is already revoked; mint a new one instead.")
    reg, rdb = _registry_db()
    now = db.now()
    try:
        token = reg.mint_token(rdb, f"reissue for account {user['handle']}")
        rdb.execute("UPDATE tokens SET revoked = ? WHERE hash = ? AND revoked IS NULL", (now, old["sha256"]))
        if old["handle"]:
            rdb.execute("UPDATE tokens SET handle = ? WHERE hash = ?", (old["handle"], reg.hash_token(token)))
        rdb.commit()
    finally:
        rdb.close()
    with conn:
        conn.execute("UPDATE builder_tokens SET revoked_at = ? WHERE id = ?", (now, old["id"]))
    tid = _record(conn, user["id"], token, old["handle"], f"replaces {old['id']}")
    code = mint_mod.cart_code(token)
    handle = old["handle"]
    return MintedToken(
        token=token, minted_at=now, editor=f"{SITE}/6502/manage",
        claim=f"POST {mint_mod.CHIP_PUBLIC}/v1/registry/claim",
        slug=code, handle=handle,
        page=f"{SITE}/6502/builders/{handle}" if handle else None,
        play=f"{SITE}/6502/games?cart={mint_mod.CHIP_PUBLIC}/v1/registry/b/{handle}/roms/{code}/cart" if handle else f"{SITE}/6502/games",
        brief=f"{SITE}/6502/cart/brief.md?slug={code}" + (f"&handle={handle}" if handle else ""),
        setup=f"Token {old['sha256'][:12]} is revoked; {tid} holds the page now." if handle else f"Token {old['sha256'][:12]} is revoked. The new one has no page yet: claim one in the editor.",
    )


@router.delete(
    "/me/tokens/{token_id}",
    status_code=204,
    summary="Revoke a token this account holds",
    description="The registry stops honouring it at once. The page stays, and can be moved to a new token by re-issuing first instead.",
    responses={401: {"description": "Not signed in."}, 404: {"description": "Not this account's token."}},
)
def revoke(token_id: str, request: Request, user: sqlite3.Row = Depends(require_user), conn: sqlite3.Connection = Depends(connection)) -> Response:
    row = _owned(conn, user["id"], token_id)
    if not row["revoked_at"]:
        reg, rdb = _registry_db()
        now = db.now()
        try:
            rdb.execute("UPDATE tokens SET revoked = ? WHERE hash = ? AND revoked IS NULL", (now, row["sha256"]))
            rdb.commit()
        finally:
            rdb.close()
        with conn:
            conn.execute("UPDATE builder_tokens SET revoked_at = ? WHERE id = ?", (now, row["id"]))
    return Response(status_code=204)
