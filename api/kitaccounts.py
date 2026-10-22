"""Who is signed in with a tinymachines passkey, asked of the kit's account service.

Every app on the kit (sprites, events, hotbits, tinypeek's site) signs people
in through one service, kit-accounts, on the box at a loopback port and on the
web as accounts.tinymachines.ai: one account and one passkey for every app.
This site is registered there as a site of its own, so the same passkey opens
the stream desk. The roof keeps no passkeys and no sessions for it: a request
carries the browser's cookie, this module hands the cookie to the service's
`GET /v1/auth/check` with the scheme and Host the browser used (together they
name the site), and the service answers 204 with the account's id and handle,
401 for nobody, or 403 for a write whose Origin is another site, which is the
service's own cross-site rule, relayed as it stands.

The answer is remembered for thirty seconds per cookie for a read, so a page's
burst of calls asks once; a write is always asked afresh, because the Origin
rule is per request. The service's address is `TM_KIT_ACCOUNTS` (default: the
box's loopback port, which the roof's unit may reach); tests swap `transport()`
for one that plays the service.

How a browser gets the cookie, and why no WebAuthn code ships here: the page
sends the reader to the accounts site's hand-off page (`{home}/?site={site}
&next={url}`), which runs the passkey ceremony on accounts.tinymachines.ai
and sends the browser back through `GET /api/v1/auth/hand-off` on this host.
nginx hands that one path to the service (deploy/tinymachines.ai.nginx), and
the service, answering with this Host, sets its session cookie here. The
ceremony is therefore the kit's, in one place, and `home` and `site` are read
from the service's `GET /v1/auth` for this host, never typed into a page.

This is the pattern the kit's apps use (kitapi.accounts; tinychase's
api/kitaccounts.py before it). It is copied rather than imported because the
kit is private and this repository is public.
"""

from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx
from fastapi import HTTPException, Request

TTL = 30.0
STATE_TTL = 300.0
_seen: dict[str, tuple[float, Optional["Member"]]] = {}
_state: dict[str, tuple[float, dict]] = {}


@dataclass(frozen=True)
class Member:
    id: str
    handle: str


def url() -> str:
    return os.environ.get("TM_KIT_ACCOUNTS", "http://127.0.0.1:8120").rstrip("/")


def transport() -> Optional[httpx.BaseTransport]:
    """Tests swap this for a transport that plays the service; on the box it is httpx's own."""
    return None


def forget() -> None:
    """Drop every remembered answer (a test that changes who is signed in)."""
    _seen.clear()
    _state.clear()


def _site_headers(request: Request) -> dict[str, str]:
    """The address the browser asked, which names the site on the service.

    nginx passes the Host and X-Forwarded-Proto; a test client has only its
    own Host and is http.
    """
    return {
        "host": request.headers.get("x-forwarded-host") or request.headers.get("host", ""),
        "x-forwarded-proto": request.headers.get("x-forwarded-proto") or request.url.scheme,
    }


def _down(exc: Exception) -> HTTPException:
    return HTTPException(status_code=503, detail="The account service did not answer. Try again in a moment.")


def ask(cookie: str, site: dict[str, str], method: str, origin: Optional[str]) -> Optional[Member]:
    headers = {**site, "cookie": cookie, "x-original-method": method}
    if origin:
        headers["origin"] = origin
    try:
        with httpx.Client(transport=transport(), timeout=5.0) as c:
            r = c.get(f"{url()}/v1/auth/check", headers=headers)
    except httpx.HTTPError as e:
        raise _down(e) from e
    if r.status_code == 204:
        return Member(id=r.headers["x-account-id"], handle=r.headers["x-account-handle"])
    if r.status_code == 401:
        return None
    if r.status_code == 403:
        raise HTTPException(status_code=403, detail="That request came from another site.")
    raise HTTPException(status_code=503, detail=f"The account service said {r.status_code}.")


def member(request: Request) -> Optional[Member]:
    """The account this request's cookie belongs to, or None for nobody.

    Raises 503 when the service cannot be asked and 403 when it refuses a
    write from another origin.
    """
    cookie = request.headers.get("cookie", "")
    if not cookie:
        return None
    site = _site_headers(request)
    method = request.method.upper()
    if method not in ("GET", "HEAD", "OPTIONS"):
        return ask(cookie, site, method, request.headers.get("origin"))
    key = hashlib.sha256(f"{site['x-forwarded-proto']}://{site['host']}|{cookie}".encode()).hexdigest()
    hit = _seen.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    who = ask(cookie, site, method, None)
    if len(_seen) > 5000:
        _seen.clear()
    _seen[key] = (time.monotonic() + TTL, who)
    return who


def auth_state(request: Request) -> Optional[dict]:
    """Where a passkey sign-in for this host happens: the service's `GET /v1/auth`
    (`home`, the accounts site; `site`, this host's id there). None when the
    service cannot be asked or does not know this host, so a page can say so
    rather than link to nothing."""
    site = _site_headers(request)
    key = f"{site['x-forwarded-proto']}://{site['host']}"
    hit = _state.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    try:
        with httpx.Client(transport=transport(), timeout=5.0) as c:
            r = c.get(f"{url()}/v1/auth", headers=site)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    body = r.json()
    if not isinstance(body, dict) or not body.get("home") or not body.get("site"):
        return None
    state = {"home": str(body["home"]), "site": str(body["site"])}
    _state[key] = (time.monotonic() + STATE_TTL, state)
    return state


def sign_out(request: Request) -> list[str]:
    """End the session this cookie names, on the service, and return the
    Set-Cookie headers it answers with, for the response here to carry: the
    cookie is the service's, set on this host, and only it knows its name."""
    cookie = request.headers.get("cookie", "")
    if not cookie:
        return []
    headers = {**_site_headers(request), "cookie": cookie}
    origin = request.headers.get("origin")
    if origin:
        headers["origin"] = origin
    try:
        with httpx.Client(transport=transport(), timeout=5.0) as c:
            r = c.post(f"{url()}/v1/auth/logout", headers=headers)
    except httpx.HTTPError as e:
        raise _down(e) from e
    if r.status_code >= 400:
        raise HTTPException(status_code=503, detail=f"The account service said {r.status_code} to the sign-out.")
    return r.headers.get_list("set-cookie")
