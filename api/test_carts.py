"""An account's own shelf of cartridges.

The fixture is one of our own ROMs, the colour bars the site already serves,
so nothing anybody else holds the rights to is ever in this repository. The
headers the refusals need are built here a byte at a time.

GitHub is replaced by the two functions test_auth.py replaces; sessions, the
database and the files on disk are the real code against temp directories.
"""

from __future__ import annotations

import hashlib
import zlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import auth
import carts
import db
import keys as keys_mod
from app import app

BARS = Path(__file__).resolve().parent.parent / "web" / "public" / "nes" / "bars.nes"


def ines(prg_units: int = 1, chr_units: int = 1, f6: int = 0, f7: int = 0, tail: bytes = bytes(8), fill: int = 0xEA) -> bytes:
    """A well-formed file of the declared size. The contents are one byte repeated."""
    head = b"NES\x1a" + bytes([prg_units & 0xFF, chr_units & 0xFF, f6, f7]) + tail
    assert len(head) == 16
    trainer = 512 if f6 & 4 else 0
    return head + bytes([fill]) * (trainer + prg_units * 16384 + chr_units * 8192)


@pytest.fixture(autouse=True)
def shelf_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("TM_CARTS", str(tmp_path / "carts"))
    monkeypatch.setenv("TM_MINT_SECRET", "test-secret")
    monkeypatch.setenv("TM_GITHUB_CLIENT_ID", "cid")
    monkeypatch.setenv("TM_GITHUB_CLIENT_SECRET", "csec")
    monkeypatch.setattr(auth, "github_exchange", lambda code: code)
    # The code IS the person, so two clients can be two people.
    monkeypatch.setattr(auth, "github_user", lambda access: {
        "id": {"ada": 1, "bob": 2}[access], "login": access, "name": access.title(),
        "avatar_url": None, "email": None,
    })
    return tmp_path / "carts"


def signed_in(who: str, shelf: int | None = None) -> TestClient:
    c = TestClient(app, follow_redirects=False)
    loc = c.get("/v1/auth/github").headers["location"]
    state = loc.split("state=")[1].split("&")[0]
    assert c.get("/v1/auth/github/callback", params={"code": who, "state": state}).status_code == 302
    assert c.get("/v1/me").json()["user"]["handle"] == who
    if shelf is not None:
        assert carts.grant(who, shelf) == who
    return c


def put(c: TestClient, data: bytes, name: str = "bars.nes", **params):
    return c.post("/v1/me/carts", params={"name": name, **params}, content=data,
                  headers={"content-type": "application/octet-stream"})


# ---------------------------------------------------------------------------
# Who may
# ---------------------------------------------------------------------------


def test_nothing_here_answers_without_a_session():
    c = TestClient(app)
    assert c.get("/v1/me/carts").status_code == 401
    assert put(c, BARS.read_bytes()).status_code == 401
    assert c.get("/v1/me/carts/ct_x/rom").status_code == 401
    assert c.patch("/v1/me/carts/ct_x", json={"name": "x"}).status_code == 401
    assert c.delete("/v1/me/carts/ct_x").status_code == 401


def test_an_account_has_no_shelf_until_it_is_given_one(shelf_dir):
    c = signed_in("ada")
    j = c.get("/v1/me/carts").json()
    assert j["carts"] == [] and j["limits"]["max"] == 0 and j["limits"]["remaining"] == 0
    r = put(c, BARS.read_bytes())
    assert r.status_code == 403, r.text
    assert "granted" in r.json()["detail"]
    assert not shelf_dir.exists(), "a refused upload wrote something to disk"


def test_an_admin_gives_a_shelf_through_the_user():
    c = signed_in("ada")
    conn = db.connect()
    key, _ = keys_mod.mint(conn, scope="admin", note="test")
    uid = conn.execute("SELECT id FROM users WHERE handle = 'ada'").fetchone()[0]
    conn.close()
    hdr = {"Authorization": f"Bearer {key}"}
    r = c.patch(f"/v1/admin/users/{uid}", json={"carts_max": 3}, headers=hdr)
    assert r.status_code == 200, r.text
    assert r.json()["carts_max"] == 3
    assert c.get("/v1/me/carts").json()["limits"]["max"] == 3
    assert put(c, BARS.read_bytes()).status_code == 201
    for bad in (-1, 1001, True, None, "3"):
        assert c.patch(f"/v1/admin/users/{uid}", json={"carts_max": bad}, headers=hdr).status_code == 422, bad


# ---------------------------------------------------------------------------
# What is kept is what was measured
# ---------------------------------------------------------------------------


def test_a_cartridge_goes_on_and_comes_back_byte_for_byte(shelf_dir):
    data = BARS.read_bytes()
    assert len(data) > 16, "the fixture is empty; every comparison below would pass on nothing"
    c = signed_in("ada", shelf=5)
    r = put(c, data, note="  the colour   bars ")
    assert r.status_code == 201, r.text
    cart = r.json()
    assert cart["name"] == "bars"
    assert cart["note"] == "the colour bars"
    assert cart["size"] == len(data)
    assert cart["sha256"] == hashlib.sha256(data).hexdigest()
    assert cart["crc32"] == f"{zlib.crc32(data[16:]):08x}"
    assert (cart["mapper"], cart["prg_bytes"], cart["chr_bytes"]) == (data[6] >> 4, data[4] * 16384, data[5] * 8192)
    assert 16 + cart["prg_bytes"] + cart["chr_bytes"] == len(data)

    listed = c.get("/v1/me/carts").json()
    assert [x["id"] for x in listed["carts"]] == [cart["id"]]
    assert listed["limits"] == {"max": 5, "held": 1, "remaining": 4, "bytes_max": carts.bytes_max()}

    rom = c.get(cart["rom"])
    assert rom.status_code == 200
    assert rom.content == data
    assert rom.headers["cache-control"] == "private, no-store"

    on_disk = list(shelf_dir.rglob("*.nes"))
    assert len(on_disk) == 1 and on_disk[0].read_bytes() == data
    assert on_disk[0].stat().st_mode & 0o077 == 0, "the file is readable by somebody other than the service"
    for d in (shelf_dir, on_disk[0].parent):
        assert d.stat().st_mode & 0o077 == 0, f"{d} is open to somebody other than the service"
    assert not list(shelf_dir.rglob("*.part")), "a temporary file was left behind"


def test_somebody_elses_cartridge_does_not_exist():
    ada, bob = signed_in("ada", shelf=5), signed_in("bob", shelf=5)
    cid = put(ada, BARS.read_bytes()).json()["id"]
    never = "ct_0000000000000000"
    for c, ident in ((bob, cid), (bob, never)):
        assert c.get(f"/v1/me/carts/{ident}/rom").status_code == 404
        assert c.patch(f"/v1/me/carts/{ident}", json={"name": "mine now"}).status_code == 404
        assert c.delete(f"/v1/me/carts/{ident}").status_code == 404
    # The two 404s say the same thing, so an id cannot be probed for.
    assert bob.get(f"/v1/me/carts/{cid}/rom").json() == bob.get(f"/v1/me/carts/{never}/rom").json()
    assert bob.get("/v1/me/carts").json()["carts"] == []
    # And none of that touched it.
    assert ada.get(f"/v1/me/carts/{cid}/rom").content == BARS.read_bytes()
    assert ada.get("/v1/me/carts").json()["carts"][0]["name"] == "bars"


def test_the_same_dump_on_two_shelves_is_two_files(shelf_dir):
    ada, bob = signed_in("ada", shelf=5), signed_in("bob", shelf=5)
    a, b = put(ada, BARS.read_bytes()).json(), put(bob, BARS.read_bytes()).json()
    assert a["sha256"] == b["sha256"] and a["id"] != b["id"]
    assert len(list(shelf_dir.rglob("*.nes"))) == 2
    assert ada.delete(f"/v1/me/carts/{a['id']}").status_code == 204
    assert bob.get(b["rom"]).content == BARS.read_bytes(), "deleting one account's copy took the other's"


# ---------------------------------------------------------------------------
# Refusals
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("data, says", [
    (b"NES\x1a", "shorter than an iNES header"),
    (b"\x00" * 40976, "iNES signature"),
    # A bare PRG dump: exactly the file somebody with PRG+CHR pairs would try.
    (bytes([0xEA]) * 32768, "PRG or CHR file is not a cartridge"),
    (ines(2, 1)[:-100], "100 bytes short"),
    (ines(2, 1) + b"\xff" * 7, "7 bytes after the end"),
    (ines(0, 1), "declares no program ROM"),
    (ines(1, 1, f7=0x08, tail=bytes([0, 0x0F]) + bytes(6)), "exponent form"),
])
def test_a_file_that_does_not_add_up_is_refused_with_the_reason(shelf_dir, data, says):
    c = signed_in("ada", shelf=5)
    r = put(c, data)
    assert r.status_code == 422, r.text
    assert says in r.json()["detail"], r.json()["detail"]
    assert c.get("/v1/me/carts").json()["carts"] == []
    assert not list(shelf_dir.rglob("*.nes")), "a refused file reached the disk"


def test_an_empty_body_is_refused_before_it_is_read():
    # FastAPI's own answer, since no body is a missing field rather than a bad file.
    assert put(signed_in("ada", shelf=5), b"").status_code == 422


def test_the_header_is_read_the_way_loaders_read_it():
    assert carts.read_header(ines(1, 1, f6=0x10, f7=0x00)).mapper == 1
    assert carts.read_header(ines(1, 1, f6=0x20, f7=0x40)).mapper == 66
    # "DiskDude!" across bytes 7 to 15 is an old tool's signature, not a mapper.
    dude = ines(1, 1, f6=0x10, f7=ord("D"), tail=b"iskDude!")
    assert carts.read_header(dude).mapper == 1
    # NES 2.0: twelve bits of mapper, and sizes with a high nibble.
    assert carts.read_header(ines(1, 1, f6=0x30, f7=0x08, tail=bytes([0x01]) + bytes(7))).mapper == 0x103
    h = carts.read_header(ines(1, 0, f6=0x04))
    assert (h.trainer, h.payload_at, h.chr_bytes) == (True, 528, 0)


def test_the_crc_skips_the_trainer_as_well_as_the_header():
    data = ines(1, 1, f6=0x04, fill=0x5A)
    c = signed_in("ada", shelf=5)
    assert put(c, data).json()["crc32"] == f"{zlib.crc32(data[528:]):08x}"


def test_too_large_a_duplicate_and_a_full_shelf(monkeypatch):
    c = signed_in("ada", shelf=2)
    assert put(c, ines(1, 1), name="one").status_code == 201

    twin = put(c, ines(1, 1), name="the same bytes under another name")
    assert twin.status_code == 409 and "'one'" in twin.json()["detail"]

    assert put(c, ines(1, 1, fill=0x01), name="two").status_code == 201
    full = put(c, ines(1, 1, fill=0x02), name="three")
    assert full.status_code == 409 and "limit of 2" in full.json()["detail"]

    monkeypatch.setenv("TM_CART_BYTES", "1000")
    big = put(c, ines(1, 1, fill=0x03), name="big")
    assert big.status_code == 413 and "1000" in big.json()["detail"]
    assert [x["name"] for x in c.get("/v1/me/carts").json()["carts"]] == ["one", "two"]


def test_a_shelf_shrunk_under_its_contents_still_lists_and_deletes():
    c = signed_in("ada", shelf=2)
    a = put(c, ines(1, 1), name="a").json()
    put(c, ines(1, 1, fill=1), name="b")
    carts.grant("ada", 0)
    j = c.get("/v1/me/carts").json()
    assert len(j["carts"]) == 2 and j["limits"]["remaining"] == 0
    assert c.get(a["rom"]).status_code == 200
    assert put(c, ines(1, 1, fill=2), name="c").status_code == 403
    assert c.delete(f"/v1/me/carts/{a['id']}").status_code == 204


@pytest.mark.parametrize("name", ["", "   ", ".nes", "\x00\x07", "x" * 81])
def test_a_name_is_needed_and_is_bounded(name):
    c = signed_in("ada", shelf=5)
    assert put(c, ines(1, 1), name=name).status_code == 422


# ---------------------------------------------------------------------------
# Rename, delete, and a file that rotted
# ---------------------------------------------------------------------------


def test_a_patch_touches_only_what_it_names():
    c = signed_in("ada", shelf=5)
    cart = put(c, ines(1, 1), name="Zelda", note="first read").json()
    url = f"/v1/me/carts/{cart['id']}"
    r = c.patch(url, json={"name": "The Legend of Zelda"})
    assert r.status_code == 200 and r.json()["name"] == "The Legend of Zelda"
    assert r.json()["note"] == "first read", "renaming blanked the note"
    assert c.patch(url, json={"note": ""}).json()["note"] == ""
    assert c.patch(url, json={"name": None}).status_code == 422
    assert c.patch(url, json={"sha256": "0" * 64}).status_code == 422
    assert c.patch(url, json={"nmae": "typo"}).status_code == 422
    assert c.get("/v1/me/carts").json()["carts"][0]["sha256"] == cart["sha256"]


def test_delete_takes_the_file_as_well_as_the_row(shelf_dir):
    c = signed_in("ada", shelf=5)
    cart = put(c, ines(1, 1)).json()
    assert len(list(shelf_dir.rglob("*.nes"))) == 1, "nothing was written, so nothing below proves a deletion"
    assert c.delete(f"/v1/me/carts/{cart['id']}").status_code == 204
    assert list(shelf_dir.rglob("*.nes")) == []
    assert c.get("/v1/me/carts").json()["carts"] == []
    assert c.get(cart["rom"]).status_code == 404
    assert put(c, ines(1, 1)).status_code == 201, "a deleted cartridge could not be added again"


def test_a_file_that_changed_on_disk_is_not_served_as_the_real_thing(shelf_dir):
    c = signed_in("ada", shelf=5)
    cart = put(c, ines(1, 1)).json()
    (path,) = shelf_dir.rglob("*.nes")
    path.chmod(0o600)
    path.write_bytes(ines(1, 1, fill=0x66))
    r = c.get(cart["rom"])
    assert r.status_code == 410 and "no longer matches" in r.json()["detail"]
    path.unlink()
    r = c.get(cart["rom"])
    assert r.status_code == 410 and "gone from disk" in r.json()["detail"]
    assert c.delete(f"/v1/me/carts/{cart['id']}").status_code == 204


def test_a_write_from_another_site_is_refused():
    c = signed_in("ada", shelf=5)
    evil = {"origin": "https://evil.example", "content-type": "application/octet-stream"}
    assert c.post("/v1/me/carts", params={"name": "x"}, content=ines(1, 1), headers=evil).status_code == 403
    cart = put(c, ines(1, 1)).json()
    assert c.delete(f"/v1/me/carts/{cart['id']}", headers={"origin": "https://evil.example"}).status_code == 403
    assert len(c.get("/v1/me/carts").json()["carts"]) == 1


# ---------------------------------------------------------------------------
# From the box: the same rules, without a browser
# ---------------------------------------------------------------------------


def test_the_command_line_adds_under_the_same_rules_as_an_upload(shelf_dir, tmp_path, capsys):
    c = signed_in("ada", shelf=2)
    f = tmp_path / "Colour Bars (Ours).nes"
    f.write_bytes(BARS.read_bytes())

    assert carts._main(["add", "nobody", str(f)]) == 1
    assert "no account" in capsys.readouterr().err

    assert carts._main(["add", "ada", str(f), "--note", "from the box"]) == 0
    said = capsys.readouterr().out
    listed = c.get("/v1/me/carts").json()["carts"]
    assert [x["name"] for x in listed] == ["Colour Bars (Ours)"]
    assert listed[0]["note"] == "from the box" and listed[0]["crc32"] in said
    # It is the same file the route would have taken, at the same address.
    assert c.get(listed[0]["rom"]).content == BARS.read_bytes()

    # And the same refusals: a twin, a bad file, then a full shelf.
    assert carts._main(["add", "ada", str(f)]) == 1
    assert "already on the shelf" in capsys.readouterr().err
    bad = tmp_path / "bad.nes"
    bad.write_bytes(b"NES\x1a" + bytes(12) + b"x")
    assert carts._main(["add", "ada", str(bad)]) == 1
    assert "declares no program ROM" in capsys.readouterr().err
    two = tmp_path / "two.nes"
    two.write_bytes(ines(1, 1, fill=0x01))
    assert carts._main(["add", "ada", str(two), "--name", "two"]) == 0
    three = tmp_path / "three.nes"
    three.write_bytes(ines(1, 1, fill=0x02))
    assert carts._main(["add", "ada", str(three)]) == 1
    assert "limit of 2" in capsys.readouterr().err
    assert len(c.get("/v1/me/carts").json()["carts"]) == 2
