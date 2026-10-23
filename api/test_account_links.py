"""A passkey onto a shelf: account_links (migration 9, notes/desk-move.md step A).

The account service is played by an httpx transport, as in test_operators: a
cookie `tc_session=alice` is the account u_alice, `tc_session=carol` is
u_carol, anything else is nobody, and a write whose Origin is another site is
refused by the service. GitHub is played as in test_carts: the code is the
person.

Sabotages these go red on: the join dropping `disabled_at` (a disabled user's
passkey opens the shelf); the passkey branch skipping account_links (an
unlinked passkey reads somebody's shelf, here the first user's); the service's
503 raised instead of read as nobody (every page breaks when the service is
down); the service's 403 swallowed (a cross-site write lands); sign-out not
ending the passkey session; the script writing on a dry run or past a clash.
"""

from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import auth
import db
import kitaccounts
from app import app
from test_carts import ines, put

ACCOUNTS = {"alice": ("u_alice", "alice"), "carol": ("u_carol", "carol")}
HOME = "https://accounts.example"
ended: list[str] = []


def play(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/v1/auth":
        return httpx.Response(200, json={"home": HOME, "site": "tinymachines"})
    cookie = request.headers.get("cookie", "")
    who = next((acct for name, acct in ACCOUNTS.items() if f"tc_session={name}" in cookie), None)
    if path == "/v1/auth/check":
        if who is None:
            return httpx.Response(401)
        method = request.headers.get("x-original-method", "GET")
        origin = request.headers.get("origin")
        if method not in ("GET", "HEAD", "OPTIONS") and origin and origin != "http://testserver":
            return httpx.Response(403)
        return httpx.Response(204, headers={"x-account-id": who[0], "x-account-handle": who[1]})
    if path == "/v1/auth/logout":
        ended.append(who[0] if who else "")
        return httpx.Response(204, headers={"set-cookie": "tc_session=; Max-Age=0; Path=/; HttpOnly"})
    return httpx.Response(404)


def down(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("refused", request=request)


@pytest.fixture(autouse=True)
def service(tmp_path, monkeypatch):
    monkeypatch.setattr(kitaccounts, "transport", lambda: httpx.MockTransport(play))
    monkeypatch.setenv("TM_CARTS", str(tmp_path / "carts"))
    monkeypatch.setenv("TM_MINT_SECRET", "test-secret")
    monkeypatch.setenv("TM_GITHUB_CLIENT_ID", "cid")
    monkeypatch.setenv("TM_GITHUB_CLIENT_SECRET", "csec")
    monkeypatch.setattr(auth, "github_exchange", lambda code: code)
    monkeypatch.setattr(auth, "github_user", lambda access: {
        "id": {"ada": 1, "bob": 2}[access], "login": access, "name": access.title(), "avatar_url": None, "email": None,
    })
    kitaccounts.forget()
    ended.clear()
    yield
    kitaccounts.forget()


def github(who: str) -> TestClient:
    c = TestClient(app, follow_redirects=False)
    loc = c.get("/v1/auth/github").headers["location"]
    state = loc.split("state=")[1].split("&")[0]
    assert c.get("/v1/auth/github/callback", params={"code": who, "state": state}).status_code == 302
    return c


def passkey(name: str) -> TestClient:
    c = TestClient(app, follow_redirects=False)
    c.cookies.set("tc_session", name)
    return c


def uid(handle: str) -> str:
    conn = db.connect()
    row = conn.execute("SELECT id FROM users WHERE handle = ?", (handle,)).fetchone()
    conn.close()
    return row[0]


def link(account: str, handle: str, github_id: str = "1") -> None:
    conn = db.connect()
    with conn:
        conn.execute("INSERT INTO account_links (account_id, user_id, github_id, linked_at) VALUES (?, ?, ?, ?)",
                     (account, uid(handle), github_id, db.now()))
    conn.close()


def test_a_linked_passkey_reads_the_same_shelf_as_github():
    ada = github("ada")
    assert put(ada, ines(), name="bars.nes").status_code == 201
    shelf = ada.get("/v1/me/carts").json()["carts"]
    assert len(shelf) == 1, "nothing on the shelf: the comparison below would pass on nothing"
    link("u_alice", "ada")
    key = passkey("alice")
    me = key.get("/v1/me")
    assert me.status_code == 200 and me.json()["user"]["handle"] == "ada"
    assert me.json()["user"]["via"] == "passkey"
    assert ada.get("/v1/me").json()["user"]["via"] == "github"
    assert key.get("/v1/me/carts").json()["carts"] == shelf
    rom = key.get(f"/v1/me/carts/{shelf[0]['id']}/rom")
    assert rom.status_code == 200 and rom.content == ines()
    state = key.get("/v1/auth").json()["passkey"]
    assert state == {"home": HOME, "site": "tinymachines", "handle": "alice", "linked": True}


def test_an_unlinked_passkey_opens_nobody_and_is_told_so():
    ada = github("ada")
    assert put(ada, ines(), name="bars.nes").status_code == 201
    link("u_alice", "ada")
    carol = passkey("carol")
    assert carol.get("/v1/me").status_code == 401
    assert carol.get("/v1/me/carts").status_code == 401
    assert carol.get("/v1/auth").json()["passkey"]["handle"] == "carol"
    assert carol.get("/v1/auth").json()["passkey"]["linked"] is False


def test_a_link_to_a_disabled_user_opens_nothing():
    github("ada")
    link("u_alice", "ada")
    conn = db.connect()
    with conn:
        conn.execute("UPDATE users SET disabled_at = ? WHERE handle = 'ada'", (db.now(),))
    conn.close()
    key = passkey("alice")
    assert key.get("/v1/me").status_code == 401
    assert key.get("/v1/me/carts").status_code == 401
    assert key.get("/v1/auth").json()["passkey"]["linked"] is False


def test_a_write_from_another_site_is_refused_for_a_passkey():
    github("ada")
    link("u_alice", "ada")
    key = passkey("alice")
    r = key.post("/v1/me/carts", params={"name": "x.nes"}, content=ines(),
                 headers={"content-type": "application/octet-stream", "origin": "https://evil.example"})
    assert r.status_code == 403
    ok = key.post("/v1/me/carts", params={"name": "x.nes"}, content=ines(),
                  headers={"content-type": "application/octet-stream"})
    assert ok.status_code == 201, "the same write from this site must land, or the 403 above proves nothing"


def test_the_service_down_is_nobody_not_an_error(monkeypatch):
    ada = github("ada")
    link("u_alice", "ada")
    monkeypatch.setattr(kitaccounts, "transport", lambda: httpx.MockTransport(down))
    kitaccounts.forget()
    assert ada.get("/v1/me").status_code == 200, "the GitHub session broke because the passkey side is down"
    key = passkey("alice")
    assert key.get("/v1/me").status_code == 401
    assert key.get("/v1/auth").status_code == 200 and key.get("/v1/auth").json()["passkey"] is None


def test_sign_out_ends_the_passkey_session_too():
    github("ada")
    link("u_alice", "ada")
    key = passkey("alice")
    r = key.post("/v1/auth/logout")
    assert r.status_code == 204
    assert ended == ["u_alice"]
    assert any(c.startswith("tc_session=") for c in r.headers.get_list("set-cookie"))
    nobody = TestClient(app).post("/v1/auth/logout")
    assert nobody.status_code == 204 and ended == ["u_alice"], "a sign-out with no passkey session asked the service to end one"


# ---------------------------------------------------------------------------
# scripts/link-accounts.py
# ---------------------------------------------------------------------------

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "link-accounts.py"


def script():
    spec = importlib.util.spec_from_file_location("link_accounts", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def service_file(tmp_path: Path, rows: list[tuple[str, str, str]]) -> str:
    """An account service's file with just what the script reads: (account id, handle, GitHub id)."""
    p = tmp_path / "accounts.db"
    c = sqlite3.connect(p)
    c.executescript("CREATE TABLE users (id TEXT PRIMARY KEY, handle TEXT); "
                    "CREATE TABLE logins (provider TEXT, provider_id TEXT, user_id TEXT, login TEXT)")
    for a, h, g in rows:
        c.execute("INSERT INTO users VALUES (?, ?)", (a, h))
        c.execute("INSERT INTO logins VALUES ('github', ?, ?, ?)", (g, a, h))
        c.execute("INSERT INTO logins VALUES ('passkey', ?, ?, ?)", (a, a, h))
    c.commit()
    c.close()
    return str(p)


def links() -> list[tuple[str, str]]:
    conn = db.connect()
    rows = [(r[0], r[1]) for r in conn.execute("SELECT account_id, u.handle FROM account_links a JOIN users u ON u.id = a.user_id ORDER BY 1")]
    conn.close()
    return rows


def test_the_script_matches_by_github_id_and_writes_only_when_asked(tmp_path, capsys):
    github("ada")
    github("bob")
    # carol shares bob's handle on the service but not his GitHub id: never matched.
    accounts = service_file(tmp_path, [("u_alice", "ada", "1"), ("u_carol", "bob", "99")])
    mod = script()
    assert mod.main(["--roof", str(db.path()), "--accounts", accounts]) == 0
    out = capsys.readouterr().out
    assert "1 to link" in out and "A dry run" in out
    assert links() == [], "the dry run wrote"
    assert mod.main(["--roof", str(db.path()), "--accounts", accounts, "--write"]) == 0
    assert links() == [("u_alice", "ada")]
    assert mod.main(["--roof", str(db.path()), "--accounts", accounts, "--write"]) == 0
    assert "0 to link, 1 already linked" in capsys.readouterr().out
    assert links() == [("u_alice", "ada")]


def test_the_script_stops_on_a_clash_and_writes_nothing(tmp_path, capsys):
    github("ada")
    github("bob")
    link("u_alice", "bob", "2")
    # The service says u_alice is ada's GitHub id, but here u_alice is linked to bob.
    accounts = service_file(tmp_path, [("u_alice", "ada", "1")])
    assert script().main(["--roof", str(db.path()), "--accounts", accounts, "--write"]) == 1
    assert "CLASH" in capsys.readouterr().out
    assert links() == [("u_alice", "bob")]


def test_the_script_never_makes_the_table(tmp_path, capsys):
    """A roof file the API has not migrated yet is refused, not migrated here."""
    roof = tmp_path / "roof.db"
    c = sqlite3.connect(roof)
    c.executescript("CREATE TABLE users (id TEXT PRIMARY KEY, handle TEXT, disabled_at TEXT); "
                    "CREATE TABLE logins (provider TEXT, provider_id TEXT, user_id TEXT, login TEXT); "
                    "INSERT INTO users VALUES ('u1', 'ada', NULL); INSERT INTO logins VALUES ('github', '1', 'u1', 'ada');")
    c.commit()
    c.close()
    accounts = service_file(tmp_path, [("u_alice", "ada", "1")])
    assert script().main(["--roof", str(roof), "--accounts", accounts, "--write"]) == 2
    c = sqlite3.connect(roof)
    assert c.execute("SELECT 1 FROM sqlite_master WHERE name = 'account_links'").fetchone() is None
    c.close()
