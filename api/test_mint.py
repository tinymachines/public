"""The public token mint: the registry's mint behind a door with a limit.

Every rule here is one the door exists to enforce, and each test is written so
that removing the rule makes it fail: a mint that ignores the limit passes no
test below.

The registry's code is imported from the 6502 checkout beside this one, as the
service does. Where that checkout is absent the whole module is skipped and
says so, rather than passing against a stub that is not the registry.
"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import chip
import db
import keys as keys_mod
import mint as mint_mod
from app import app

SERVICE = mint_mod.service_dir()
if not (SERVICE / "registry.py").exists():
    pytest.skip(f"no 6502 checkout at {SERVICE}; the mint imports its registry from there", allow_module_level=True)


@pytest.fixture
def registry(tmp_path, monkeypatch):
    """A registry database of the registry's own making, in a temp file."""
    path = tmp_path / "registry.db"
    reg = mint_mod._registry()
    rdb = reg.connect(path)
    reg.init(rdb)
    rdb.close()
    monkeypatch.setenv("TM_REGISTRY_DB", str(path))
    return path


class FakeChip:
    """Records what the mint asked the chip API for, and answers like it."""

    def __init__(self, fail_claim: bool = False):
        self.claims: list[tuple] = []
        self.publishes: list[tuple] = []
        self.fail_claim = fail_claim

    def claim(self, token, handle, name):
        if self.fail_claim:
            raise chip.ChipError("POST /v1/registry/claim: HTTP 409: 'ada' is taken")
        self.claims.append((token, handle, name))
        return {"handle": handle}

    def starter_blob(self):
        return b"\x1f\x8b starter"

    def publish(self, token, handle, slug, blob, frames=3):
        self.publishes.append((token, handle, slug, blob))
        return {"slug": slug}


@pytest.fixture
def fake(monkeypatch):
    f = FakeChip()
    monkeypatch.setattr(mint_mod, "client", f)
    monkeypatch.setenv("TM_MINT_SECRET", "test-secret")
    return f


@pytest.fixture
def client(fake):
    with TestClient(app) as c:
        yield c


def from_ip(ip: str) -> dict:
    return {"X-Real-IP": ip}


def test_off_where_no_registry_is_configured(client, monkeypatch):
    monkeypatch.delenv("TM_REGISTRY_DB", raising=False)
    assert client.get("/v1/tokens").json()["enabled"] is False
    r = client.post("/v1/tokens", json={})
    assert r.status_code == 503
    assert "not enabled" in r.json()["detail"]


def test_a_mint_is_the_registrys_own_token_and_the_ledger_never_holds_it(client, registry):
    r = client.post("/v1/tokens", json={"note": "ada, snake"}, headers=from_ip("203.0.113.5"))
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    assert token.startswith("tm6502_")
    # The registry knows it, by digest, with the public note.
    reg = mint_mod._registry()
    rdb = reg.connect(registry)
    row = rdb.execute("SELECT * FROM tokens WHERE hash = ?", (reg.hash_token(token),)).fetchone()
    rdb.close()
    assert row is not None and row["note"].startswith("public mint")
    # The roof's ledger has the caller, hashed, and not the token.
    conn = db.connect()
    rows = [dict(x) for x in conn.execute("SELECT * FROM token_mints").fetchall()]
    conn.close()
    assert len(rows) == 1
    assert rows[0]["ip_sha256"] == mint_mod.ip_digest("203.0.113.5")
    assert rows[0]["note"] == "ada, snake"
    assert token not in str(rows) and "203.0.113.5" not in str(rows)


def test_the_per_address_limit_is_a_429_with_a_retry_after(client, registry, monkeypatch):
    monkeypatch.setenv("TM_MINT_PER_IP_DAY", "2")
    for _ in range(2):
        assert client.post("/v1/tokens", json={}, headers=from_ip("198.51.100.7")).status_code == 201
    r = client.post("/v1/tokens", json={}, headers=from_ip("198.51.100.7"))
    assert r.status_code == 429
    assert r.headers.get("retry-after")
    # A different address is not the same caller.
    assert client.post("/v1/tokens", json={}, headers=from_ip("198.51.100.8")).status_code == 201
    a = client.get("/v1/tokens", headers=from_ip("198.51.100.7")).json()
    assert a["remaining_for_you"] == 0 and a["enabled"] is True


def test_the_daily_total_is_a_limit_on_everyone(client, registry, monkeypatch):
    monkeypatch.setenv("TM_MINT_PER_DAY", "1")
    assert client.post("/v1/tokens", json={}, headers=from_ip("192.0.2.1")).status_code == 201
    r = client.post("/v1/tokens", json={}, headers=from_ip("192.0.2.2"))
    assert r.status_code == 429
    assert "daily" in r.json()["detail"]


def test_a_long_note_and_a_stray_field_are_refused(client, registry):
    assert client.post("/v1/tokens", json={"note": "x" * 121}).status_code == 422
    assert client.post("/v1/tokens", json={"scope": "admin"}).status_code == 422


def test_the_ledger_needs_an_admin_and_shows_digests_not_addresses(client, registry):
    client.post("/v1/tokens", json={"note": "n"}, headers=from_ip("203.0.113.9"))
    assert client.get("/v1/admin/mints").status_code == 401
    conn = db.connect()
    key, _ = keys_mod.mint(conn, scope="admin", note="test")
    conn.close()
    r = client.get("/v1/admin/mints", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["mints"][0]["ip_sha256"] == mint_mod.ip_digest("203.0.113.9")
    assert "203.0.113.9" not in r.text and "tm6502_" not in r.text


def test_the_cart_code_is_an_hmac_of_the_token_and_a_valid_name(monkeypatch):
    monkeypatch.setenv("TM_MINT_SECRET", "test-secret")
    a = mint_mod.cart_code("tm6502_one")
    b = mint_mod.cart_code("tm6502_one")
    c = mint_mod.cart_code("tm6502_two")
    assert a == b and a != c
    assert re.fullmatch(r"[a-z2-7]{10}", a), a
    assert mint_mod.code_matches("tm6502_one", a) and not mint_mod.code_matches("tm6502_two", a)
    # A different secret is a different code: the pairing is this install's.
    monkeypatch.setenv("TM_MINT_SECRET", "other")
    assert mint_mod.cart_code("tm6502_one") != a


def test_a_mint_claims_the_page_as_the_code_and_returns_the_places(client, registry, fake):
    r = client.post("/v1/tokens", json={}, headers=from_ip("203.0.113.20"))
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["slug"] == mint_mod.cart_code(j["token"])
    assert j["handle"] == j["slug"] and j["page"].endswith("/6502/builders/" + j["slug"])
    assert fake.claims == [(j["token"], j["slug"], "builder " + j["slug"])]
    assert fake.publishes == []          # the starter is loaded, not published, by default
    assert "die-runner" in j["play"] and j["brief"].endswith(f"?slug={j['slug']}&handle={j['slug']}")
    assert "claimed" in j["setup"]


def test_a_mint_can_claim_a_handle_of_your_own(client, registry, fake):
    r = client.post("/v1/tokens", json={"handle": "Ada"}, headers=from_ip("203.0.113.21"))
    assert r.status_code == 201
    j = r.json()
    assert j["handle"] == "ada" and j["slug"] != "ada"
    assert fake.claims[0][1:] == ("ada", "ada")


def test_a_failed_claim_still_returns_the_token_and_says_so(client, registry, monkeypatch):
    monkeypatch.setattr(mint_mod, "client", FakeChip(fail_claim=True))
    r = client.post("/v1/tokens", json={"handle": "ada"}, headers=from_ip("203.0.113.22"))
    assert r.status_code == 201
    j = r.json()
    assert j["token"].startswith("tm6502_") and j["handle"] is None and j["page"] is None
    assert "could not be claimed" in j["setup"] and "taken" in j["setup"]


def test_publishing_the_starter_is_a_switch(client, registry, fake, monkeypatch):
    monkeypatch.setenv("TM_MINT_PUBLISH_STARTER", "1")
    r = client.post("/v1/tokens", json={}, headers=from_ip("203.0.113.23"))
    j = r.json()
    assert len(fake.publishes) == 1 and fake.publishes[0][1:3] == (j["slug"], j["slug"])
    assert j["play"].endswith(f"/b/{j['slug']}/roms/{j['slug']}/cart")


def test_the_limit_counts_the_real_address_not_a_header_the_client_wrote(client, registry, monkeypatch):
    monkeypatch.setenv("TM_MINT_PER_IP_DAY", "1")
    real = {"X-Real-IP": "198.51.100.40"}
    assert client.post("/v1/tokens", json={}, headers=real).status_code == 201
    # A client that rewrites X-Forwarded-For is still the same address.
    r = client.post("/v1/tokens", json={}, headers={**real, "X-Forwarded-For": "1.2.3.4"})
    assert r.status_code == 429
