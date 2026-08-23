"""The administered surface: keys, users, and the gate in front of both.

The checks worth having here are not "does create_user create a user". They
are the ones that go red when a property this repository has already paid for
somewhere else quietly stops holding:

  - a key must never be recoverable from the database
  - a route under /v1/admin must never be reachable without a key
  - a PATCH must never touch a field it was not given
  - a misspelled field must never be accepted and ignored

Each of those was broken deliberately while writing this file, and each
assertion was watched to go red before it was kept.

    python3 -m pytest api/ -q
"""

from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

import admin
import db
import keys as keys_mod
import users as users_mod
from app import app


@pytest.fixture
def conn():
    c = db.connect()
    yield c
    c.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_key(client, conn) -> str:
    """A live admin key, minted directly rather than through the API.

    Through the API would need a key to mint a key, which is the bootstrap
    problem these tests are not here to re-solve.
    """
    key, _ = keys_mod.mint(conn, scope="admin", note="test")
    return key


@pytest.fixture
def dev_key(client, conn) -> str:
    key, _ = keys_mod.mint(conn, scope="dev", note="test")
    return key


def auth(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


# ---------------------------------------------------------------------------
# The schema
# ---------------------------------------------------------------------------


def test_migrations_are_applied_once(conn):
    assert conn.execute("PRAGMA user_version").fetchone()[0] == len(db.MIGRATIONS)
    assert db.MIGRATIONS, "no migrations; every check in this file would pass on nothing"
    assert db.migrate(conn) == 0, "a second migrate() re-ran a migration"


def test_a_newer_file_is_refused_rather_than_opened(conn):
    """A downgrade that silently drops writes is worse than a service that
    will not start, so opening a file from the future is an error."""
    conn.execute(f"PRAGMA user_version = {len(db.MIGRATIONS) + 1}")
    with pytest.raises(db.Downgrade):
        db.migrate(conn)
    conn.execute(f"PRAGMA user_version = {len(db.MIGRATIONS)}")


def test_foreign_keys_are_enforced(conn):
    """SQLite defaults foreign_keys OFF per connection, so REFERENCES is
    documentation unless every connection turns it on."""
    with pytest.raises(sqlite3.IntegrityError):
        with conn:
            conn.execute(
                "INSERT INTO api_keys (id, sha256, pub, scope, note, user_id, created_at) "
                "VALUES ('k_x', 'x', 'x', 'dev', '', 'u_nobody', '2026-01-01T00:00:00+00:00')"
            )


# ---------------------------------------------------------------------------
# The key never lands anywhere
# ---------------------------------------------------------------------------


def test_the_key_is_not_in_the_database_file(conn):
    """The rule the registry paid for: a copy of the database is not a copy of
    everybody's credentials.

    Asserted against the bytes on disk rather than against the columns, because
    the columns are what somebody reviewing the schema already checked. This
    catches the case a schema review does not: a key that reaches the file
    through a log table, a default, or an index nobody thought about.
    """
    key, row = keys_mod.mint(conn, scope="dev", note="on disk?")
    conn.commit()
    conn.execute("PRAGMA wal_checkpoint(FULL)")

    blob = db.path().read_bytes()
    assert key.encode() not in blob, "the key itself is stored in the database"
    assert keys_mod.digest(key).encode() in blob, (
        "the digest is not in the file either, so the previous assertion "
        "passed on a row that was never written"
    )
    # The public half is meant to be there, in clear.
    assert row["pub"].encode() in blob


def test_a_minted_key_authenticates_and_a_near_miss_does_not(conn):
    key, row = keys_mod.mint(conn, scope="dev", note="")
    assert keys_mod.find(conn, key)["id"] == row["id"]
    assert keys_mod.find(conn, key[:-1] + ("a" if key[-1] != "a" else "b")) is None
    assert keys_mod.find(conn, "not-a-key") is None


def test_scopes_are_ordered_and_admin_covers_dev():
    assert keys_mod.covers("admin", "dev")
    assert keys_mod.covers("dev", "dev")
    assert not keys_mod.covers("dev", "admin")
    assert not keys_mod.covers("nonsense", "dev")


# ---------------------------------------------------------------------------
# The gate
# ---------------------------------------------------------------------------


def admin_paths() -> list[tuple[str, str]]:
    out = []
    for r in app.routes:
        if isinstance(r, APIRoute) and r.path.startswith("/v1/admin"):
            for method in sorted(r.methods - {"HEAD", "OPTIONS"}):
                out.append((method, r.path))
    return out


def test_every_admin_route_refuses_an_anonymous_request(client):
    """The check that matters when somebody adds the next route.

    It is derived from the routing table rather than from a list, so a route
    added without a dependency fails here rather than being reachable in
    production by anybody who guesses the path.
    """
    paths = admin_paths()
    assert len(paths) >= 8, f"only {len(paths)} admin routes found; this would pass on nothing"
    for method, path in paths:
        url = path.replace("{user_id}", "u_x").replace("{key_id}", "k_x")
        r = client.request(method, url, json={})
        assert r.status_code == 401, f"{method} {path} answered {r.status_code} with no key"
        assert "bearer" in r.headers.get("www-authenticate", "").lower(), (
            f"{method} {path} returned 401 without telling the client how to authenticate"
        )


def test_a_dev_key_can_identify_itself_but_not_administer(client, dev_key):
    who = client.get("/v1/admin/whoami", headers=auth(dev_key))
    assert who.status_code == 200
    assert who.json()["can_administer"] is False
    assert who.json()["key"]["scope"] == "dev"

    forbidden = client.get("/v1/admin/keys", headers=auth(dev_key))
    assert forbidden.status_code == 403, "a dev key reached an admin route"
    # 403 and 401 are different instructions: present a different credential
    # versus present one at all.
    assert "admin" in forbidden.json()["detail"]


def test_a_revoked_key_is_told_it_was_revoked(client, conn, admin_key):
    row = keys_mod.find(conn, admin_key)
    keys_mod.revoke(conn, row["id"], db.now())
    r = client.get("/v1/admin/whoami", headers=auth(admin_key))
    assert r.status_code == 401
    assert "revoked" in r.json()["detail"].lower(), (
        "a revoked key was answered as though it never existed; the holder is "
        "entitled to know which"
    )


def test_using_a_key_records_that_it_was_used(client, conn, admin_key):
    before = keys_mod.find(conn, admin_key)
    assert before["last_used_at"] is None
    client.get("/v1/admin/whoami", headers=auth(admin_key))
    assert keys_mod.find(conn, admin_key)["last_used_at"] is not None


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------


def test_bootstrap_mints_one_admin_key_and_then_stops(conn):
    assert keys_mod.active_admin_count(conn) == 0
    first = admin.bootstrap(conn)
    assert first is not None and keys_mod.find(conn, first)["scope"] == "admin"
    assert admin.bootstrap(conn) is None, "a second start minted a second admin key"


def test_bootstrap_is_the_recovery_path(conn):
    """Revoke every admin key and a restart mints another. That is why there is
    no break-glass flag, and it is worth a test because the alternative is
    finding out during a lockout."""
    key = admin.bootstrap(conn)
    keys_mod.revoke(conn, keys_mod.find(conn, key)["id"], db.now())
    assert admin.bootstrap(conn) is not None


# ---------------------------------------------------------------------------
# Keys through the API
# ---------------------------------------------------------------------------


def test_minting_returns_the_key_once_and_the_listing_never_does(client, admin_key):
    made = client.post("/v1/admin/keys", headers=auth(admin_key),
                       json={"scope": "dev", "note": "ada, laptop"})
    assert made.status_code == 201
    secret = made.json()["key"]
    assert secret.startswith("tmk_")

    listed = client.get("/v1/admin/keys", headers=auth(admin_key))
    assert listed.status_code == 200
    assert secret not in listed.text, "the listing carried a key"
    assert made.json()["record"]["pub"] in listed.text
    assert all(k["active"] for k in listed.json()["keys"])


def test_minting_for_an_unknown_user_is_refused(client, admin_key):
    r = client.post("/v1/admin/keys", headers=auth(admin_key),
                    json={"scope": "dev", "user_id": "u_nobody"})
    assert r.status_code == 400, "a key was minted pointing at a person who does not exist"


def test_revoking_twice_is_a_conflict_not_a_second_success(client, admin_key):
    kid = client.post("/v1/admin/keys", headers=auth(admin_key),
                      json={"scope": "dev"}).json()["record"]["id"]
    first = client.delete(f"/v1/admin/keys/{kid}", headers=auth(admin_key))
    assert first.status_code == 200 and first.json()["active"] is False
    second = client.delete(f"/v1/admin/keys/{kid}", headers=auth(admin_key))
    assert second.status_code == 409


def test_a_revoked_key_is_still_listed(client, admin_key):
    kid = client.post("/v1/admin/keys", headers=auth(admin_key),
                      json={"scope": "dev"}).json()["record"]["id"]
    client.delete(f"/v1/admin/keys/{kid}", headers=auth(admin_key))
    body = client.get("/v1/admin/keys", headers=auth(admin_key)).json()
    assert kid in [k["id"] for k in body["keys"]], (
        "a revoked key vanished from the listing, which makes 'revoked' and "
        "'never minted' look the same"
    )
    assert body["active"] < body["count"]


def test_the_last_admin_key_cannot_be_revoked(client, conn, admin_key):
    """The bootstrap key is minted by the client fixture's lifespan, so revoke
    it first and leave exactly one admin key standing."""
    for row in keys_mod.listing(conn):
        if row["scope"] == "admin" and row["sha256"] != keys_mod.digest(admin_key):
            keys_mod.revoke(conn, row["id"], db.now())
    assert keys_mod.active_admin_count(conn) == 1

    mine = keys_mod.find(conn, admin_key)["id"]
    r = client.delete(f"/v1/admin/keys/{mine}", headers=auth(admin_key))
    assert r.status_code == 409
    assert "mint" in r.json()["detail"].lower(), "the refusal did not say what to do instead"
    assert keys_mod.active_admin_count(conn) == 1


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


def make_user(client, key, **over) -> dict:
    body = {"email": "Ada@Example.ORG", "handle": "Ada", "first_name": "Ada"}
    body.update(over)
    r = client.post("/v1/admin/users", headers=auth(key), json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_identity_is_folded_to_lowercase_on_the_way_in(client, admin_key):
    u = make_user(client, admin_key)
    assert u["handle"] == "ada" and u["email"] == "ada@example.org"


def test_the_same_identity_in_another_case_is_a_conflict(client, admin_key):
    make_user(client, admin_key)
    r = client.post("/v1/admin/users", headers=auth(admin_key),
                    json={"email": "ADA@example.org", "handle": "different", "first_name": "A"})
    assert r.status_code == 409
    assert "email" in r.json()["detail"], "the conflict did not say which field collided"


@pytest.mark.parametrize("handle", ["admin", "docs", "api", "style"])
def test_a_handle_that_is_a_path_this_site_serves_is_refused(client, admin_key, handle):
    r = client.post("/v1/admin/users", headers=auth(admin_key),
                    json={"email": f"{handle}@example.org", "handle": handle, "first_name": "X"})
    assert r.status_code == 422, f"{handle!r} was accepted as a handle"


@pytest.mark.parametrize("handle", ["a", "-ada", "ada-", "Ada Lovelace", "a" * 33, "ada_x"])
def test_a_handle_that_cannot_be_a_path_segment_is_refused(client, admin_key, handle):
    r = client.post("/v1/admin/users", headers=auth(admin_key),
                    json={"email": "x@example.org", "handle": handle, "first_name": "X"})
    assert r.status_code == 422, f"{handle!r} was accepted as a handle"


def test_patch_touches_only_what_it_names(client, admin_key):
    """The registry's rule. Without exclude_unset every absent field arrives as
    None and a request naming one field blanks the rest."""
    u = make_user(client, admin_key, pic="/pics/ada.png")
    r = client.patch(f"/v1/admin/users/{u['id']}", headers=auth(admin_key),
                     json={"first_name": "Augusta"})
    assert r.status_code == 200
    after = r.json()
    assert after["first_name"] == "Augusta"
    assert after["pic"] == "/pics/ada.png", "a save that named first_name blanked the picture"
    assert after["handle"] == "ada" and after["email"] == "ada@example.org"


def test_an_explicit_null_does_remove_the_field(client, admin_key):
    """Absent and null are different, and this is the assertion that keeps them
    that way: without it, exclude_unset could be satisfied by ignoring nulls."""
    u = make_user(client, admin_key, pic="/pics/ada.png")
    r = client.patch(f"/v1/admin/users/{u['id']}", headers=auth(admin_key), json={"pic": None})
    assert r.status_code == 200 and r.json()["pic"] is None


def test_a_misspelled_field_is_refused_rather_than_ignored(client, admin_key):
    """Pydantic ignores unknown fields by default, so without extra="forbid"
    this returns 200, changes nothing, and reads as a successful save."""
    u = make_user(client, admin_key)
    r = client.patch(f"/v1/admin/users/{u['id']}", headers=auth(admin_key),
                     json={"first_nmae": "Augusta"})
    assert r.status_code == 422, "a misspelled field was accepted and silently dropped"
    assert client.get(f"/v1/admin/users/{u['id']}", headers=auth(admin_key)).json()["first_name"] == "Ada"


def test_patching_into_somebody_elses_handle_is_a_conflict(client, admin_key):
    make_user(client, admin_key)
    other = make_user(client, admin_key, email="grace@example.org", handle="grace", first_name="Grace")
    r = client.patch(f"/v1/admin/users/{other['id']}", headers=auth(admin_key), json={"handle": "ada"})
    assert r.status_code == 409


@pytest.mark.parametrize("pic", ["ftp://host/x.png", "javascript:alert(1)", "//evil.example/x.png"])
def test_a_picture_reference_that_is_not_one_of_the_three_forms_is_refused(client, admin_key, pic):
    r = client.post("/v1/admin/users", headers=auth(admin_key),
                    json={"email": "x@example.org", "handle": "xx", "first_name": "X", "pic": pic})
    assert r.status_code == 422, f"{pic!r} was accepted as a picture"


def test_disabling_is_reversible_and_deletes_nothing(client, admin_key):
    u = make_user(client, admin_key)
    off = client.put(f"/v1/admin/users/{u['id']}/disabled", headers=auth(admin_key),
                     json={"disabled": True})
    assert off.status_code == 200 and off.json()["disabled_at"] is not None
    on = client.put(f"/v1/admin/users/{u['id']}/disabled", headers=auth(admin_key),
                    json={"disabled": False})
    assert on.status_code == 200 and on.json()["disabled_at"] is None
    assert client.get("/v1/admin/users", headers=auth(admin_key)).json()["count"] == 1


def test_a_key_survives_the_person_it_belonged_to(client, conn, admin_key):
    """ON DELETE SET NULL rather than CASCADE: deleting a person must never
    silently delete the record of what their credential did."""
    u = make_user(client, admin_key)
    made = client.post("/v1/admin/keys", headers=auth(admin_key),
                       json={"scope": "dev", "user_id": u["id"]}).json()
    with conn:
        conn.execute("DELETE FROM users WHERE id = ?", (u["id"],))
    row = keys_mod.get(conn, made["record"]["id"])
    assert row is not None and row["user_id"] is None


def test_unknown_ids_are_404_and_name_what_was_looked_for(client, admin_key):
    for method, url in [
        ("GET", "/v1/admin/users/u_nope"),
        ("PATCH", "/v1/admin/users/u_nope"),
        ("DELETE", "/v1/admin/keys/k_nope"),
    ]:
        r = client.request(method, url, headers=auth(admin_key), json={})
        assert r.status_code == 404, f"{method} {url} answered {r.status_code}"


# ---------------------------------------------------------------------------
# What the administered surface deliberately is not
# ---------------------------------------------------------------------------


def test_no_admin_capability_is_exposed_over_mcp(client):
    """MCP is a surface for a language model, and it carries no credential.

    Every tool there answers from public data. This fails if somebody wires an
    administrative capability into it, which is the sort of thing that looks
    like a convenience at the time.
    """
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    names = [t["name"] for t in r.json()["result"]["tools"]]
    assert names, "no tools listed; this check would pass on nothing"
    banned = ("key", "user", "admin", "mint", "revoke")
    for name in names:
        assert not any(word in name.lower() for word in banned), (
            f"MCP tool {name!r} looks administrative. MCP has no credential on it."
        )


def test_only_one_operation_in_the_document_returns_a_key(client):
    """The boundary lives in the schema, so widening it means changing a model.

    MintedKey is the one model with a full credential on it. This walks the
    generated document and asserts that exactly one operation can return that
    shape, and names which. A route added later that hands back a stored secret
    would have to declare MintedKey to do it, and would fail here.

    Deliberately not a search for properties called "key": Piece.key is a piece
    identifier, and a check that cannot tell those apart is one that gets
    weakened the first time it fires on something harmless.
    """
    doc = client.get("/openapi.json").json()
    assert "MintedKey" in doc["components"]["schemas"], "the model is gone; this would pass on nothing"

    def mentions(node) -> bool:
        if isinstance(node, dict):
            if node.get("$ref", "").endswith("/MintedKey"):
                return True
            return any(mentions(v) for v in node.values())
        if isinstance(node, list):
            return any(mentions(v) for v in node)
        return False

    returning = [
        f"{verb} {path}"
        for path, ops in doc["paths"].items()
        for verb, op in ops.items()
        if mentions(op.get("responses", {}))
    ]
    assert returning == ["post /v1/admin/keys"], (
        f"operations that can return a full key: {returning}. There may be exactly one."
    )

    # And nothing else embeds it, so it cannot arrive inside another response.
    others = [
        name for name, spec in doc["components"]["schemas"].items()
        if name != "MintedKey" and mentions(spec)
    ]
    assert not others, f"these schemas embed MintedKey: {others}"


def test_concurrent_requests_do_not_500(client, admin_key):
    """Two requests at once, which is what the admin screen actually does.

    This is here because the first version of the connection dependency shipped
    a bug that every sequential test passed: FastAPI runs a generator
    dependency's setup and its teardown in DIFFERENT threadpool workers, so
    `conn.close()` ran on a thread that had not opened the connection and
    sqlite3 raised ProgrammingError. Under one request at a time the pool hands
    back the same worker and it never fires.

    The screen loads keys and users with Promise.all, so it fired on the first
    real page load and on none of the forty tests. Driving the deployed page in
    a browser is what found it.
    """
    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = [
            f.result().status_code
            for f in [
                pool.submit(client.get, path, headers=auth(admin_key))
                for path in ["/v1/admin/keys", "/v1/admin/users", "/v1/admin/whoami"] * 6
            ]
        ]
    assert codes, "no requests made; this check would pass on nothing"
    assert set(codes) == {200}, f"concurrent requests returned {sorted(set(codes))}"
