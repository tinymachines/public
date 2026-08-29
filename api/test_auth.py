"""Sign in with GitHub, and the tokens an account holds.

GitHub itself is replaced by two functions (the code exchange and the
profile fetch); everything else, sessions, the registry, the ledger, is the
real code against temp files. The registry's code is imported from the 6502
checkout beside this one, as in test_mint.py.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import auth
import chip
import mint as mint_mod
from app import app

SERVICE = Path(os.environ.get("TM_REGISTRY_SERVICE", Path(__file__).resolve().parent.parent.parent / "6502" / "service"))
if not (SERVICE / "registry.py").exists():
    pytest.skip(f"no 6502 checkout at {SERVICE}; the account holds tokens the registry mints", allow_module_level=True)


@pytest.fixture
def registry(tmp_path, monkeypatch):
    path = tmp_path / "registry.db"
    reg = mint_mod._registry()
    rdb = reg.connect(path)
    reg.init(rdb)
    rdb.close()
    monkeypatch.setenv("TM_REGISTRY_DB", str(path))
    return path


class FakeChip:
    """Stands in for the chip API, and claims in the real registry database
    the way the chip API would, so the registry's view of who holds what is
    the real one."""

    def __init__(self, registry_path):
        self.claims = []
        self.registry_path = registry_path

    def claim(self, token, handle, name):
        self.claims.append((token, handle, name))
        reg = mint_mod._registry()
        rdb = reg.connect(self.registry_path)
        try:
            return reg.claim(rdb, token, handle, name)
        finally:
            rdb.close()

    def starter_blob(self):
        return b"\x1f\x8b starter"

    def publish(self, token, handle, slug, blob, frames=3):
        return {"slug": slug}


@pytest.fixture
def fake(monkeypatch, registry):
    f = FakeChip(registry)
    monkeypatch.setattr(mint_mod, "client", f)
    monkeypatch.setenv("TM_MINT_SECRET", "test-secret")
    return f


@pytest.fixture
def github(monkeypatch):
    """A configured GitHub app and a GitHub that always says the same person."""
    monkeypatch.setenv("TM_GITHUB_CLIENT_ID", "cid")
    monkeypatch.setenv("TM_GITHUB_CLIENT_SECRET", "csec")
    profile = {"id": 4242, "login": "Ada", "name": "Ada Lovelace", "avatar_url": "https://avatars.example/ada", "email": None}
    monkeypatch.setattr(auth, "github_exchange", lambda code: "gh-access-" + code)
    monkeypatch.setattr(auth, "github_user", lambda access: dict(profile))
    return profile


@pytest.fixture
def client():
    return TestClient(app, follow_redirects=False)


def sign_in(client: TestClient, next_path: str = "/6502/manage") -> None:
    r = client.get("/v1/auth/github", params={"next": next_path})
    assert r.status_code == 302
    loc = r.headers["location"]
    assert loc.startswith("https://github.com/login/oauth/authorize?")
    state = loc.split("state=")[1].split("&")[0]
    r = client.get("/v1/auth/github/callback", params={"code": "c0de", "state": state})
    assert r.status_code == 302, r.text
    assert r.headers["location"] == next_path
    assert auth.SESSION_COOKIE in client.cookies


def test_auth_state_reports_configuration(client, monkeypatch):
    monkeypatch.delenv("TM_GITHUB_CLIENT_ID", raising=False)
    monkeypatch.delenv("TM_GITHUB_CLIENT_SECRET", raising=False)
    monkeypatch.setattr(auth, "credentials", lambda: None)
    assert client.get("/v1/auth").json() == {"github": False}
    assert client.get("/v1/auth/github").status_code == 503


def test_sign_in_opens_a_session_and_me_answers(client, github):
    assert client.get("/v1/me").status_code == 401
    sign_in(client)
    me = client.get("/v1/me")
    assert me.status_code == 200, me.text
    j = me.json()
    assert j["user"]["login"] == "ada"
    assert j["user"]["handle"] == "ada"
    assert j["user"]["name"] == "Ada"
    assert j["tokens"] == []
    assert j["limits"]["remaining"] == j["limits"]["active_max"]


def test_callback_refuses_a_state_that_did_not_start_here(client, github):
    r = client.get("/v1/auth/github/callback", params={"code": "x", "state": "forged"})
    assert r.status_code == 400


def test_next_must_be_a_path_on_this_site(client, github):
    r = client.get("/v1/auth/github", params={"next": "https://evil.example/"})
    state = r.headers["location"].split("state=")[1].split("&")[0]
    r = client.get("/v1/auth/github/callback", params={"code": "c", "state": state})
    assert r.headers["location"] == "/6502/manage"


def test_signing_in_twice_is_one_user(client, github):
    sign_in(client)
    a = client.get("/v1/me").json()["user"]["id"]
    client.post("/v1/auth/logout")
    assert client.get("/v1/me").status_code == 401
    sign_in(client)
    assert client.get("/v1/me").json()["user"]["id"] == a


def test_account_mints_holds_reissues_and_revokes(client, github, registry, fake):
    sign_in(client)
    r = client.post("/v1/me/tokens", json={"handle": "ada", "note": "first"})
    assert r.status_code == 201, r.text
    first = r.json()
    assert first["token"].startswith("tm6502_")
    assert first["handle"] == "ada"
    assert fake.claims and fake.claims[0][1] == "ada"

    me = client.get("/v1/me").json()
    assert len(me["tokens"]) == 1 and me["tokens"][0]["handle"] == "ada" and me["tokens"][0]["revoked_at"] is None
    assert me["limits"]["active"] == 1
    tid = me["tokens"][0]["id"]

    # The registry honours the first token. A fresh connection per look: the
    # registry is in WAL mode and a connection with an unfinished cursor
    # keeps reading the snapshot it started on.
    reg = mint_mod._registry()

    def registry_says(token):
        rdb = reg.connect(registry)
        try:
            return reg.authorise(rdb, token)["handle"]
        finally:
            rdb.close()

    assert registry_says(first["token"]) == "ada"

    # Re-issue: the old one dies, the page moves.
    r = client.post(f"/v1/me/tokens/{tid}/reissue")
    assert r.status_code == 201, r.text
    second = r.json()
    assert second["token"] != first["token"]
    assert second["handle"] == "ada"
    assert second["page"].endswith("/6502/builders/ada")
    with pytest.raises(Exception):
        registry_says(first["token"])
    assert registry_says(second["token"]) == "ada"

    me = client.get("/v1/me").json()
    assert me["limits"]["active"] == 1
    assert sorted(t["revoked_at"] is None for t in me["tokens"]) == [False, True]
    new_id = next(t["id"] for t in me["tokens"] if t["revoked_at"] is None)

    # Re-issuing the dead one is refused; revoking the live one works.
    assert client.post(f"/v1/me/tokens/{tid}/reissue").status_code == 409
    assert client.delete(f"/v1/me/tokens/{new_id}").status_code == 204
    with pytest.raises(Exception):
        registry_says(second["token"])
    assert client.get("/v1/me").json()["limits"]["active"] == 0


def test_account_holds_ten_and_a_revoke_frees_a_slot(client, github, registry, fake, monkeypatch):
    monkeypatch.delenv("TM_ACCOUNT_TOKENS", raising=False)
    sign_in(client)
    assert client.get("/v1/me").json()["limits"]["active_max"] == 10
    for _ in range(10):  # ten mint; the eleventh is refused
        assert client.post("/v1/me/tokens", json={}).status_code == 201
    r = client.post("/v1/me/tokens", json={})
    assert r.status_code == 429
    assert "holds 10 live" in r.json()["detail"]
    me = client.get("/v1/me").json()
    assert me["limits"]["remaining"] == 0 and len(me["tokens"]) == 10
    assert client.delete(f"/v1/me/tokens/{me['tokens'][0]['id']}").status_code == 204
    me = client.get("/v1/me").json()
    assert me["limits"]["active"] == 9 and me["limits"]["remaining"] == 1
    assert client.post("/v1/me/tokens", json={}).status_code == 201
    assert client.post("/v1/me/tokens", json={}).status_code == 429


def test_account_limit_is_live_tokens(client, github, registry, fake, monkeypatch):
    monkeypatch.setenv("TM_ACCOUNT_TOKENS", "1")
    sign_in(client)
    assert client.post("/v1/me/tokens", json={}).status_code == 201
    r = client.post("/v1/me/tokens", json={})
    assert r.status_code == 429
    assert "holds 1 live" in r.json()["detail"]


def test_account_mints_do_not_spend_the_address_allowance(client, github, registry, fake):
    sign_in(client)
    before = client.get("/v1/tokens").json()["remaining_for_you"]
    assert client.post("/v1/me/tokens", json={}).status_code == 201
    assert client.get("/v1/tokens").json()["remaining_for_you"] == before


def test_someone_elses_token_is_not_found(client, github, registry, fake):
    sign_in(client)
    assert client.post("/v1/me/tokens", json={}).status_code == 201
    tid = client.get("/v1/me").json()["tokens"][0]["id"]
    client.post("/v1/auth/logout")
    # A second person.
    other = TestClient(app, follow_redirects=False)
    auth.github_user = lambda access: {"id": 7, "login": "bob", "name": "Bob"}
    sign_in(other)
    assert other.post(f"/v1/me/tokens/{tid}/reissue").status_code == 404
    assert other.delete(f"/v1/me/tokens/{tid}").status_code == 404


def test_state_change_from_another_origin_is_refused(client, github):
    sign_in(client)
    r = client.post("/v1/me/tokens", json={}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403
