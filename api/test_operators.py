"""The stream desk's second way in: an operator's passkey session.

The account service is played by an httpx transport: a cookie `tc_session=alice`
is the account u_alice, `tc_session=bob` is u_bob, anything else is nobody, and
a write whose Origin is another site is refused by the service as it is on the
box. The roof's own part, the operators table and the rule that a key presented
is judged as a key, is what these tests hold.

Sabotages these go red on: the reader ignoring the operators table (a signed-in
non-operator reads); the 401 losing its Bearer challenge (a script that forgot
its key gets no hint); the service's 403 swallowed (a cross-site write lands);
a presented bad key riding on the cookie beside it.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import db
import keys as keys_mod
import kitaccounts
from app import app

ACCOUNTS = {"alice": ("u_alice", "alice"), "bob": ("u_bob", "bob")}
HOME = "https://accounts.example"


def play(request: httpx.Request) -> httpx.Response:
    """The account service, as kitaccounts sees it."""
    assert request.headers.get("host"), "the roof must name the site by Host"
    path = request.url.path
    if path == "/v1/auth":
        return httpx.Response(200, json={"home": HOME, "site": "tinymachines", "passkey": True})
    cookie = request.headers.get("cookie", "")
    who = None
    for name, acct in ACCOUNTS.items():
        if cookie == f"tc_session={name}":
            who = acct
    if path == "/v1/auth/check":
        if who is None:
            return httpx.Response(401)
        method = request.headers.get("x-original-method", "GET")
        origin = request.headers.get("origin")
        if method not in ("GET", "HEAD", "OPTIONS") and origin and origin != "http://testserver":
            return httpx.Response(403)
        return httpx.Response(204, headers={"x-account-id": who[0], "x-account-handle": who[1]})
    if path == "/v1/auth/logout":
        return httpx.Response(204, headers={"set-cookie": "tc_session=; Max-Age=0; Path=/; HttpOnly"})
    return httpx.Response(404)


def down(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("refused", request=request)


@pytest.fixture(autouse=True)
def service(monkeypatch):
    monkeypatch.setattr(kitaccounts, "transport", lambda: httpx.MockTransport(play))
    kitaccounts.forget()
    yield
    kitaccounts.forget()


@pytest.fixture
def roms(tmp_path: Path, monkeypatch):
    """One fake cartridge, so a read route has something to list."""
    d = tmp_path / "roms"
    d.mkdir()
    (d / "bars.nes").write_bytes(b"NES\x1a" + bytes(12) + bytes(16384))
    monkeypatch.setenv("TM_STREAM_ROMS", str(d))
    monkeypatch.setenv("TM_STREAM_HOME", str(tmp_path / "home"))
    return d


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_key(client) -> str:
    conn = db.connect()
    key, _ = keys_mod.mint(conn, scope="admin", note="test admin")
    conn.close()
    return key


@pytest.fixture
def dev_key(client) -> str:
    conn = db.connect()
    key, _ = keys_mod.mint(conn, scope="dev", note="test dev")
    conn.close()
    return key


def auth(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


def cookie(name: str) -> dict:
    return {"Cookie": f"tc_session={name}"}


def make_operator(client, admin_key, account_id="u_alice", handle="alice") -> dict:
    r = client.post("/v1/admin/operators", json={"account_id": account_id, "handle": handle, "note": "test"}, headers=auth(admin_key))
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------


def test_nobody_is_told_both_ways_in(client, roms):
    r = client.get("/v1/stream/games")
    assert r.status_code == 401
    assert "bearer" in r.headers.get("www-authenticate", "").lower()
    assert "/v1/stream/me" in r.json()["detail"]
    me = client.get("/v1/stream/me")
    assert me.status_code == 200
    body = me.json()
    assert body["via"] is None and body["can_read"] is False and body["operator"] is False
    assert body["sign_in"] == {"home": HOME, "site": "tinymachines"}
    assert "signed in" in body["why"].lower()


def test_a_signed_in_non_operator_is_named_and_refused(client, roms):
    r = client.get("/v1/stream/games", headers=cookie("alice"))
    assert r.status_code == 403
    assert "alice" in r.json()["detail"]
    assert "operator" in r.json()["detail"]
    me = client.get("/v1/stream/me", headers=cookie("alice")).json()
    assert me["via"] == "passkey" and me["handle"] == "alice" and me["account_id"] == "u_alice"
    assert me["operator"] is False and me["can_read"] is False and me["can_administer"] is False
    assert "alice" in me["why"]


def test_an_operator_reads_and_writes_with_the_passkey_alone(client, roms, admin_key):
    made = make_operator(client, admin_key)
    assert made["active"] is True and made["added_by"] is not None
    kitaccounts.forget()
    r = client.get("/v1/stream/games", headers=cookie("alice"))
    assert r.status_code == 200
    assert [g["id"] for g in r.json()["games"]] == ["bars"]
    me = client.get("/v1/stream/me", headers=cookie("alice")).json()
    assert me["operator"] is True and me["can_read"] is True and me["can_administer"] is True and me["why"] is None
    # A write passes the gate: an unknown run is a 404, which is the route's
    # own answer, not the gate's 401 or 403.
    r = client.post("/v1/stream/runs/00000000/markers", json={"text": "x"}, headers=cookie("alice"))
    assert r.status_code == 404, r.text
    # Bob, signed in beside her, is not an operator.
    assert client.get("/v1/stream/games", headers=cookie("bob")).status_code == 403


def test_the_services_cross_site_refusal_is_relayed(client, roms, admin_key):
    make_operator(client, admin_key)
    r = client.post("/v1/stream/runs/00000000/markers", json={"text": "x"}, headers={**cookie("alice"), "Origin": "https://evil.example"})
    assert r.status_code == 403
    assert "another site" in r.json()["detail"]
    # The same write from the site itself passes the gate.
    r = client.post("/v1/stream/runs/00000000/markers", json={"text": "x"}, headers={**cookie("alice"), "Origin": "http://testserver"})
    assert r.status_code == 404


def test_a_removed_operator_is_refused_at_once(client, roms, admin_key):
    make_operator(client, admin_key)
    assert client.get("/v1/stream/games", headers=cookie("alice")).status_code == 200
    r = client.delete("/v1/admin/operators/u_alice", headers=auth(admin_key))
    assert r.status_code == 200 and r.json()["active"] is False and r.json()["removed_at"]
    # The service's answer is still remembered; the operators table is not.
    assert client.get("/v1/stream/games", headers=cookie("alice")).status_code == 403
    # Coming back is the same row, an operator again.
    again = make_operator(client, admin_key)
    assert again["active"] is True and again["removed_at"] is None
    listed = client.get("/v1/admin/operators", headers=auth(admin_key)).json()["operators"]
    assert [o["account_id"] for o in listed] == ["u_alice"]
    assert client.delete("/v1/admin/operators/u_nobody", headers=auth(admin_key)).status_code == 404


def test_the_operators_list_takes_only_the_admin_key(client, dev_key, admin_key):
    for method, path in (("GET", "/v1/admin/operators"), ("POST", "/v1/admin/operators"), ("DELETE", "/v1/admin/operators/u_x")):
        r = client.request(method, path, json={"account_id": "u_x"}, headers=auth(dev_key))
        assert r.status_code == 403, f"{method} {path}: {r.status_code}"
        r = client.request(method, path, json={"account_id": "u_x"}, headers=cookie("alice"))
        assert r.status_code == 401, f"{method} {path} on a cookie: {r.status_code}"
    assert client.post("/v1/admin/operators", json={"account_id": "no spaces"}, headers=auth(admin_key)).status_code == 422


def test_a_key_is_judged_as_a_key_even_beside_a_cookie(client, roms, admin_key, dev_key):
    make_operator(client, admin_key)
    # A dev key beside an operator's cookie: the key's rule, so a write is 403.
    r = client.post("/v1/stream/runs/00000000/markers", json={"text": "x"}, headers={**cookie("alice"), **auth(dev_key)})
    assert r.status_code == 403
    assert "scope" in r.json()["detail"]
    # A bad key beside it is a bad key.
    r = client.get("/v1/stream/games", headers={**cookie("alice"), "Authorization": "Bearer tmk_00000000_nothing"})
    assert r.status_code == 401
    me = client.get("/v1/stream/me", headers=auth(dev_key)).json()
    assert me["via"] == "key" and me["handle"] == "test dev" and me["can_read"] is True and me["can_administer"] is False
    me = client.get("/v1/stream/me", headers=auth(admin_key)).json()
    assert me["via"] == "key" and me["can_administer"] is True and me["why"] is None
    assert client.get("/v1/stream/me", headers=auth("tmk_00000000_nothing")).status_code == 401


def test_sign_out_relays_the_cookie_clearing_header(client):
    r = client.post("/v1/stream/sign-out", headers=cookie("alice"))
    assert r.status_code == 204
    assert "tc_session=;" in r.headers.get("set-cookie", "")
    assert client.post("/v1/stream/sign-out").status_code == 204


def test_the_service_being_down_is_said_not_guessed(client, roms, monkeypatch):
    monkeypatch.setattr(kitaccounts, "transport", lambda: httpx.MockTransport(down))
    kitaccounts.forget()
    r = client.get("/v1/stream/games", headers=cookie("alice"))
    assert r.status_code == 503
    me = client.get("/v1/stream/me", headers=cookie("alice")).json()
    assert me["via"] is None and me["sign_in"] is None and "account service" in me["why"]
    # A key needs no service.
    assert client.get("/v1/stream/me").json()["sign_in"] is None


def test_the_operators_table_survives_the_migration_check():
    conn = db.connect()
    cols = {r[1] for r in conn.execute("PRAGMA table_info(operators)")}
    conn.close()
    assert {"account_id", "handle", "note", "added_at", "added_by", "removed_at"} <= cols
