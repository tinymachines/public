"""Revisions of a cartridge: an edit kept as an IPS patch against the file as it arrived.

The fixture is the colour-bars cartridge, ours, as in test_carts.py; the
patches are built here a byte at a time, and every figure a revision carries
is checked against what applying the patch actually does.
"""
from __future__ import annotations

import hashlib

import pytest
from fastapi.testclient import TestClient

import carts
from app import app
from test_carts import BARS, ines, put, shelf_dir, signed_in  # noqa: F401  (the autouse fixture)


def ips(*records: tuple[int, bytes]) -> bytes:
    out = b"PATCH"
    for at, data in records:
        out += at.to_bytes(3, "big") + len(data).to_bytes(2, "big") + data
    return out + b"EOF"


def keep(c: TestClient, cid: str, patch: bytes, message: str = ""):
    return c.post(f"/v1/me/carts/{cid}/revisions", params={"message": message}, content=patch, headers={"content-type": "application/octet-stream"})


@pytest.fixture
def shelf():
    """Ada, signed in, with the colour bars on her shelf."""
    ada = signed_in("ada", 3)
    data = BARS.read_bytes()
    cart = put(ada, data).json()
    return ada, cart, data


def test_nothing_here_answers_without_a_session():
    c = TestClient(app)
    assert c.get("/v1/me/carts/ct_x/revisions").status_code == 401
    assert c.post("/v1/me/carts/ct_x/revisions", content=b"PATCHEOF", headers={"content-type": "application/octet-stream"}).status_code == 401


def test_a_revision_is_kept_with_every_figure_the_server_s_own(shelf):
    ada, cart, data = shelf
    assert cart["revisions"] == 0
    at = 16 + 32768 + 16  # tile 1 of the CHR
    new = bytes(b ^ 0xFF for b in data[at:at + 16])
    patch = ips((at, new))
    r = keep(ada, cart["id"], patch, "tile one, inverted")
    assert r.status_code == 201, r.text
    rev = r.json()
    assert rev["seq"] == 1 and rev["message"] == "tile one, inverted"
    assert rev["patch_bytes"] == len(patch) and rev["ranges"] == 1 and rev["changed"] == 16
    image = bytearray(data)
    image[at:at + 16] = new
    assert rev["sha256"] == hashlib.sha256(image).hexdigest()
    # The patch comes back as it went; the image is made and matches.
    got = ada.get(f"/api{rev['patch']}".replace("/api", ""))
    assert got.status_code == 200 and got.content == patch and got.headers["cache-control"] == "private, no-store"
    rom = ada.get(rev["rom"])
    assert rom.status_code == 200 and rom.content == bytes(image)
    # The cartridge counts it; the list has it, oldest first.
    assert ada.get("/v1/me/carts").json()["carts"][0]["revisions"] == 1
    listed = ada.get(f"/v1/me/carts/{cart['id']}/revisions").json()
    assert [x["id"] for x in listed["revisions"]] == [rev["id"]] and listed["max"] == carts.revisions_max()
    # A message change touches only the message; a stranger field is refused.
    assert ada.patch(f"/v1/me/carts/{cart['id']}/revisions/{rev['id']}", json={"message": "hat"}).json()["message"] == "hat"
    assert ada.patch(f"/v1/me/carts/{cart['id']}/revisions/{rev['id']}", json={"seq": 9}).status_code == 422
    # The file is beside the ROM, ours, closed to everyone else.
    f = carts._rev_file(ada.get("/v1/me").json()["user"]["id"], cart["sha256"], 1)
    assert f.exists() and (f.stat().st_mode & 0o777) == 0o600


def test_a_patch_that_changes_nothing_grows_the_file_or_touches_the_header_is_refused(shelf):
    ada, cart, data = shelf
    at = 16 + 32768 + 16
    same = keep(ada, cart["id"], ips((at, data[at:at + 16])))
    assert same.status_code == 422 and "changes nothing" in same.json()["detail"]
    grow = keep(ada, cart["id"], ips((len(data) - 4, bytes(8))))
    assert grow.status_code == 422 and "cannot grow" in grow.json()["detail"]
    head = keep(ada, cart["id"], ips((4, b"\x08")))
    assert head.status_code == 422 and "header" in head.json()["detail"]
    assert keep(ada, cart["id"], b"NOTAPATCH").status_code == 422
    assert keep(ada, cart["id"], b"PATCH" + bytes([0, 1, 0, 0, 4]) + b"ab").status_code == 422
    assert keep(ada, cart["id"], b"PATCH" + bytes([0, 1, 0, 0, 1, 7])).status_code == 422  # no EOF
    assert keep(ada, cart["id"], b"").status_code == 422
    assert keep(ada, cart["id"], ips((at, b"\x00" * 16)), "x" * 241).status_code == 422
    assert ada.get(f"/v1/me/carts/{cart['id']}/revisions").json()["revisions"] == []


def test_a_run_record_applies_and_counts_what_it_changed(shelf):
    ada, cart, data = shelf
    at = 16 + 32768 + 64
    # An RLE record: length 0, then a two-byte count and the byte.
    patch = b"PATCH" + at.to_bytes(3, "big") + b"\x00\x00" + (32).to_bytes(2, "big") + b"\x5a" + b"EOF"
    r = keep(ada, cart["id"], patch)
    assert r.status_code == 201, r.text
    already = sum(1 for b in data[at:at + 32] if b == 0x5A)
    assert r.json()["changed"] == 32 - already and r.json()["ranges"] == 1
    assert ada.get(r.json()["rom"]).content[at:at + 32] == b"\x5a" * 32


def test_the_same_image_twice_is_one_revision_and_the_limit_holds(shelf, monkeypatch):
    ada, cart, data = shelf
    at = 16 + 32768 + 16
    first = keep(ada, cart["id"], ips((at, b"\x11" * 16)))
    assert first.status_code == 201
    twin = keep(ada, cart["id"], ips((at, b"\x11" * 16)))
    assert twin.status_code == 409 and "revision 1" in twin.json()["detail"]
    monkeypatch.setenv("TM_CART_REVISIONS", "2")
    assert keep(ada, cart["id"], ips((at, b"\x22" * 16))).status_code == 201
    full = keep(ada, cart["id"], ips((at, b"\x33" * 16)))
    assert full.status_code == 409 and "limit of 2" in full.json()["detail"]
    # Delete the first: the number is not reused.
    revs = ada.get(f"/v1/me/carts/{cart['id']}/revisions").json()["revisions"]
    assert ada.delete(f"/v1/me/carts/{cart['id']}/revisions/{revs[0]['id']}").status_code == 204
    third = keep(ada, cart["id"], ips((at, b"\x33" * 16)))
    assert third.status_code == 201 and third.json()["seq"] == 3
    assert [x["seq"] for x in ada.get(f"/v1/me/carts/{cart['id']}/revisions").json()["revisions"]] == [2, 3]


def test_somebody_else_s_revision_does_not_exist_and_a_cart_delete_takes_its_patches(shelf):
    ada, cart, data = shelf
    at = 16 + 32768 + 16
    rev = keep(ada, cart["id"], ips((at, b"\x11" * 16))).json()
    bob = signed_in("bob", 3)
    for path in (f"/v1/me/carts/{cart['id']}/revisions", f"/v1/me/carts/{cart['id']}/revisions/{rev['id']}", rev["rom"], rev["patch"]):
        assert bob.get(path).status_code == 404, path
    assert bob.delete(f"/v1/me/carts/{cart['id']}/revisions/{rev['id']}").status_code == 404
    assert ada.get(f"/v1/me/carts/{cart['id']}/revisions/rv_nothing").status_code == 404
    uid = ada.get("/v1/me").json()["user"]["id"]
    f = carts._rev_file(uid, cart["sha256"], 1)
    assert f.exists()
    assert ada.delete(f"/v1/me/carts/{cart['id']}").status_code == 204
    assert not f.exists()
    assert ada.get(f"/v1/me/carts/{cart['id']}/revisions").status_code == 404


def test_a_rotted_patch_is_refused_on_the_way_out(shelf):
    ada, cart, data = shelf
    at = 16 + 32768 + 16
    rev = keep(ada, cart["id"], ips((at, b"\x11" * 16))).json()
    uid = ada.get("/v1/me").json()["user"]["id"]
    f = carts._rev_file(uid, cart["sha256"], 1)
    f.write_bytes(ips((at, b"\x12" * 16)))
    r = ada.get(rev["rom"])
    assert r.status_code == 410 and "digest" in r.json()["detail"]
    f.unlink()
    assert ada.get(rev["rom"]).status_code == 410
    assert ada.get(rev["patch"]).status_code == 410
