"""Code blocks of a cartridge: a run of the code window's listing, kept beside the revisions.

The fixture is the colour-bars cartridge, ours, as in test_carts.py. A block
is bytes off the bus with a range and two strings; every figure it carries
back is checked against what was sent, and every refusal is provoked.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import carts
from app import app
from test_carts import BARS, put, shelf_dir, signed_in  # noqa: F401  (the autouse fixture)


def keep(c: TestClient, cid: str, at: int, to: int, data: bytes, **more):
    return c.post(f"/v1/me/carts/{cid}/blocks", json={"at": at, "to": to, "bytes": data.hex(), **more})


@pytest.fixture
def shelf():
    """Ada, signed in, with the colour bars on her shelf."""
    ada = signed_in("ada", 3)
    cart = put(ada, BARS.read_bytes()).json()
    return ada, cart


# The reset handler's opening, as a block would carry it: LDA #0, STA $F6, LDX #8, STX $4016.
CODE = bytes.fromhex("a9 00 85 f6 a2 08 8e 16 40".replace(" ", ""))


def test_nothing_here_answers_without_a_session():
    c = TestClient(app)
    assert c.get("/v1/me/carts/ct_x/blocks").status_code == 401
    assert keep(c, "ct_x", 0x8000, 0x8006, CODE).status_code == 401


def test_a_block_is_kept_with_every_figure_the_server_s_own(shelf):
    ada, cart = shelf
    assert cart["blocks"] == 0
    r = keep(ada, cart["id"], 0x8000, 0x8006, CODE, label="  start  ", note="clears the pad's pointer, strobes the pad")
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["seq"] == 1 and b["at"] == 0x8000 and b["to"] == 0x8006
    assert b["bytes"] == CODE.hex() and b["size"] == len(CODE)
    assert b["label"] == "start", "the label is cleaned as a name is"
    assert b["note"] == "clears the pad's pointer, strobes the pad"
    assert b["id"].startswith("bk_") and b["cart_id"] == cart["id"]
    # The cartridge counts it; the shelf says how many it may keep.
    listed = ada.get("/v1/me/carts").json()
    assert listed["carts"][0]["blocks"] == 1
    assert listed["limits"]["blocks_max"] == carts.blocks_max() > 0
    # Listed by number, and one at a time.
    second = keep(ada, cart["id"], 0x8007, 0x8007, b"\xea").json()
    assert second["seq"] == 2
    got = ada.get(f"/v1/me/carts/{cart['id']}/blocks").json()
    assert [x["seq"] for x in got["blocks"]] == [1, 2] and got["max"] == carts.blocks_max()
    assert ada.get(f"/v1/me/carts/{cart['id']}/blocks/{b['id']}").json() == b


def test_a_range_that_does_not_add_up_or_words_too_long_are_refused(shelf):
    ada, cart = shelf
    # The bytes must reach the last instruction.
    r = keep(ada, cart["id"], 0x8000, 0x8010, CODE)
    assert r.status_code == 422 and "reach" in r.json()["detail"]
    # The block cannot end before it starts.
    r = keep(ada, cart["id"], 0x8006, 0x8000, CODE)
    assert r.status_code == 422 and "before it starts" in r.json()["detail"]
    # Nor run off the bus.
    r = keep(ada, cart["id"], 0xFFFE, 0xFFFE, CODE)
    assert r.status_code == 422 and "end of the bus" in r.json()["detail"]
    # Not hex, an odd digit, nothing at all: the model refuses before the rules do.
    for hexes in ("zz", "abc", ""):
        assert ada.post(f"/v1/me/carts/{cart['id']}/blocks", json={"at": 0x8000, "to": 0x8000, "bytes": hexes}).status_code == 422
    # Off the bus entirely, and a field this route does not know.
    assert keep(ada, cart["id"], 0x10000, 0x10000, b"\xea").status_code == 422
    assert keep(ada, cart["id"], 0x8000, 0x8000, b"\xea", seq=9).status_code == 422
    # Too many bytes.
    r = keep(ada, cart["id"], 0x8000, 0x8000, b"\xea" * (carts.BLOCK_BYTES_MAX + 1))
    assert r.status_code == 413
    assert keep(ada, cart["id"], 0x8000, 0x8000, b"\xea" * carts.BLOCK_BYTES_MAX).status_code == 201, "the limit itself is allowed"
    # Words too long.
    assert keep(ada, cart["id"], 0x8000, 0x8000, b"\xea", label="x" * (carts.NAME_MAX + 1)).status_code == 422
    assert keep(ada, cart["id"], 0x8000, 0x8000, b"\xea", note="x" * (carts.NOTE_MAX + 1)).status_code == 422
    # Nothing above but the one at the limit was kept.
    assert ada.get(f"/v1/me/carts/{cart['id']}/blocks").json()["blocks"][0]["size"] == carts.BLOCK_BYTES_MAX
    assert len(ada.get(f"/v1/me/carts/{cart['id']}/blocks").json()["blocks"]) == 1


def test_a_block_is_redescribed_and_removed_and_the_limit_holds(shelf, monkeypatch):
    ada, cart = shelf
    b = keep(ada, cart["id"], 0x8000, 0x8006, CODE).json()
    url = f"/v1/me/carts/{cart['id']}/blocks/{b['id']}"
    # The label and the note change on their own; the bytes and the range do not.
    r = ada.patch(url, json={"label": "the start"})
    assert r.status_code == 200 and r.json()["label"] == "the start" and r.json()["note"] == ""
    r = ada.patch(url, json={"note": "what runs first"})
    assert r.json()["label"] == "the start" and r.json()["note"] == "what runs first"
    assert r.json()["bytes"] == CODE.hex() and r.json()["updated_at"] >= b["updated_at"]
    assert ada.patch(url, json={"at": 0x9000}).status_code == 422
    assert ada.patch(url, json={"label": "x" * (carts.NAME_MAX + 1)}).status_code == 422
    assert ada.patch(url, json={}).status_code == 200, "nothing to change is not an error"
    # The limit.
    monkeypatch.setenv("TM_CART_BLOCKS", "2")
    assert keep(ada, cart["id"], 0x8007, 0x8007, b"\xea").status_code == 201
    r = keep(ada, cart["id"], 0x8008, 0x8008, b"\xea")
    assert r.status_code == 409 and "limit of 2" in r.json()["detail"]
    # Removed: the row goes, the count goes, the cartridge stays.
    assert ada.delete(url).status_code == 204
    assert ada.get(url).status_code == 404
    assert ada.get("/v1/me/carts").json()["carts"][0]["blocks"] == 1
    assert keep(ada, cart["id"], 0x8008, 0x8008, b"\xea").status_code == 201, "room again under the limit"


def test_somebody_else_s_block_does_not_exist_and_a_cart_delete_takes_its_blocks(shelf):
    ada, cart = shelf
    b = keep(ada, cart["id"], 0x8000, 0x8006, CODE).json()
    bob = signed_in("bob", 3)
    assert bob.get(f"/v1/me/carts/{cart['id']}/blocks").status_code == 404
    assert keep(bob, cart["id"], 0x8000, 0x8006, CODE).status_code == 404
    assert bob.get(f"/v1/me/carts/{cart['id']}/blocks/{b['id']}").status_code == 404
    assert bob.patch(f"/v1/me/carts/{cart['id']}/blocks/{b['id']}", json={"label": "mine"}).status_code == 404
    assert bob.delete(f"/v1/me/carts/{cart['id']}/blocks/{b['id']}").status_code == 404
    assert ada.get(f"/v1/me/carts/{cart['id']}/blocks/{b['id']}").json()["label"] == "", "the stranger changed nothing"
    # The cascade.
    assert ada.delete(f"/v1/me/carts/{cart['id']}").status_code == 204
    import db
    conn = db.connect()
    assert conn.execute("SELECT COUNT(*) FROM cart_blocks").fetchone()[0] == 0
    conn.close()
