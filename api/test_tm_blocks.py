"""The manifest and ?as=blocks (tinylens#2, spec section 15): the visual
language as data at one address, and a composition of any read into a closed
vocabulary of blocks, so a host with no modules renders every kind."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

import tm
from tm import ROOT, Namespace, TmError

from test_tm import canned_fetch, read, refusal, rels, repo, ns, gits, gns, site, built, ents, run  # noqa: F401

MANIFEST = {"version": 1,
            "shapes": {"tm": "star", "host": "ring", "fs": "square", "git": "chamfer", "http": "round", "entity": "pill", "offbox": "dashed", "mcp": "hex", "kinds": "round", "default": "round"},
            "families": {"plumbing": ["up", "collection"], "listed": ["listed"], "nearest": ["nearest"], "by_confidence": {"inferred": "inferred", "default": "exact"}},
            "handles": {"history": {"rel": "version-history"}, "views": {"rel": "alternate", "same_base": True}, "listing": {"collection": True}}}


def write_manifest(repo: Path, body=MANIFEST) -> None:
    (repo / "notes").mkdir(exist_ok=True)
    (repo / tm.MANIFEST_FILE).write_text(json.dumps(body, indent=1))


def blocks(n: Namespace, uri: str) -> tuple[dict, list[dict], dict]:
    c, links = read(n, uri + ("&" if "?" in uri else "?") + "as=blocks")
    assert c["mimeType"] == tm.T_BLOCKS
    body = json.loads(c["text"])
    for b in body["blocks"]:
        assert b["type"] in tm.BLOCK_TYPES, b
        assert b["from"].startswith("tm://"), b
    return c, links, body


def of_type(body: dict, t: str) -> list[dict]:
    return [b for b in body["blocks"] if b["type"] == t]


# -- the manifest ------------------------------------------------------------

def test_the_manifest_is_a_file_served_at_one_address_and_linked_both_ways(ns, repo):
    e = refusal(ns, f"{ROOT}manifest")
    assert e.reason == "not-found" and "no manifest" in e.message and ROOT in e.data["nearest"]
    root = json.loads(read(ns, ROOT)[0]["text"])
    assert "manifest" not in root, "nothing is offered that does not read"
    write_manifest(repo)
    c, links = read(ns, f"{ROOT}manifest")
    assert c["mimeType"] == tm.T_MANIFEST
    body = json.loads(c["text"])
    assert body["uri"] == f"{ROOT}manifest" and body["source"] == f"{ROOT}fs/notes/manifest.json"
    assert body["shapes"]["fs"] == "square" and body["version"] == 1
    r = rels(links)
    assert r["tm:data"] == [f"{ROOT}fs/notes/manifest.json"] and r["up"] == [ROOT] and r["describedby"] == [f"{ROOT}manifest?as=stat"]
    _, flinks = read(ns, f"{ROOT}fs/notes/manifest.json")
    assert rels(flinks)["tm:read-by"] == [f"{ROOT}manifest"], "the file knows what reads it"
    c, rlinks = read(ns, ROOT)
    assert json.loads(c["text"])["manifest"] == f"{ROOT}manifest"
    assert f"{ROOT}manifest" in rels(rlinks)["describedby"]
    stat = json.loads(read(ns, f"{ROOT}manifest?as=stat")[0]["text"])
    assert stat["mimeType"] == tm.T_MANIFEST
    assert ns.target_type(f"{ROOT}manifest") == tm.T_MANIFEST
    assert any(x["uri"] == f"{ROOT}manifest" for x in ns.list_resources(None)["resources"])
    write_manifest(repo, {"version": 2, "shapes": {}})
    e = refusal(ns, f"{ROOT}manifest")
    assert e.reason == "not-found" and "families" in e.message, "a file without the three keys is not a manifest"


# -- blocks, every kind ----------------------------------------------------------

def test_blocks_on_a_listing_the_root_and_the_hosts(ns):
    c, links, body = blocks(ns, f"{ROOT}fs/docs/")
    assert c["uri"] == f"{ROOT}fs/docs/?as=blocks" and body["of"] == f"{ROOT}fs/docs/" and body["mimeType"] == tm.T_LISTING
    assert body["reads"] == [f"{ROOT}fs/docs/"]
    assert of_type(body, "heading")[0]["text"] == "docs/"
    items = of_type(body, "list")[0]["items"]
    assert any(i["href"] == f"{ROOT}fs/docs/nes/" and i["type"] == tm.T_LISTING for i in items)
    assert any(i["href"] == f"{ROOT}fs/docs/index.md" for i in items)
    placed = {i["href"] for i in items}
    assert all(b["href"] not in placed for b in of_type(body, "link")), "a link block only for what no block placed"
    assert {b["rel"] for b in of_type(body, "link")} >= {"up"}
    assert rels(links)["up"] == [f"{ROOT}fs/"], "the blocks carry the thing's own links"
    _, _, root = blocks(ns, ROOT)
    assert {i["href"] for i in of_type(root, "list")[0]["items"]} >= {f"{ROOT}fs/", f"{ROOT}mcp/"}
    _, _, top = blocks(ns, tm.TOP)
    assert of_type(top, "list")[0]["items"][0]["href"] == ROOT


def test_blocks_on_files_pages_and_pieces(ns):
    _, _, md = blocks(ns, f"{ROOT}fs/docs/nes/pile.md")
    code = of_type(md, "code")[0]
    assert "Gear on hand" in code["text"] and code["lang"] == "markdown" and code["from"] == f"{ROOT}fs/docs/nes/pile.md"
    _, _, rec = blocks(ns, f"{ROOT}fs/data/figures.json")
    assert rec["mimeType"] == tm.T_RECORD
    kv = of_type(rec, "kv")[0]
    assert kv["rows"] == [{"key": "n", "value": 1, "from": f"{ROOT}fs/data/figures.json?pointer=/n"}]
    (ns.repo / "data" / "nested.json").write_text(json.dumps({"a": 1, "types": {"x": 2, "y": 3}, "deep": {"z": {"w": 1}}}))
    _, _, nested = blocks(ns, f"{ROOT}fs/data/nested.json")
    kvs = of_type(nested, "kv")
    assert kvs[1]["rows"][0] == {"key": "x", "value": 2, "from": f"{ROOT}fs/data/nested.json?pointer=/types/x"}, "a dict of scalars is a kv, not code"
    assert of_type(nested, "code")[0]["lang"] == "json", "a deeper dict stays code"
    _, _, page = blocks(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile")
    assert page["mimeType"] == tm.T_PAGE
    assert of_type(page, "heading")[0]["text"] == "What is in the pile" and of_type(page, "note")[0]["text"] == "Gear on hand."
    _, _, piece = blocks(ns, f"{ROOT}fs/docs/nes/pile.md?lines=1-2")
    assert piece["of"] == f"{ROOT}fs/docs/nes/pile.md?lines=1-2" and f"{ROOT}fs/docs/nes/pile.md?lines=1-2" in piece["reads"]
    assert of_type(piece, "code")[0]["text"].count("\n") <= 2
    _, _, big = blocks(ns, f"{ROOT}fs/docs/big.bin")
    media = of_type(big, "media")[0]
    assert media["href"] == f"{ROOT}fs/docs/big.bin?as=raw" and media["mimeType"] == "application/octet-stream"


def test_blocks_on_a_file_at_a_ref_and_a_trail(gns, ents):
    _, _, at = blocks(gns, f"{ROOT}git/public/docs/nes/alone.md?at=HEAD")
    assert at["of"] == f"{ROOT}git/public/docs/nes/alone.md" and of_type(at, "code")[0]["lang"] == "markdown", "HEAD is the default, so the identity drops it"
    assert any(b["rel"] == "version-history" for b in of_type(at, "link")), "the log is a link, not composed: blocks are of the thing"
    (ents.repo / "notes" / "trails").mkdir(exist_ok=True)
    (ents.repo / "notes" / "trails" / "t.json").write_text(json.dumps({"title": "A walk", "note": "two steps", "steps": [
        {"uri": f"{ROOT}entity/pattern/pad-poll", "note": "the pattern"}, {"uri": f"{ROOT}entity/game/abc", "note": "a game"}]}))
    _, _, tr = blocks(ents, f"{ROOT}fs/notes/trails/t.json")
    assert tr["mimeType"] == tm.T_TRAIL and of_type(tr, "heading")[0]["text"] == "A walk"
    assert [s["href"] for s in of_type(tr, "trail")[0]["steps"]] == [f"{ROOT}entity/pattern/pad-poll", f"{ROOT}entity/game/abc"]
    assert of_type(tr, "note")[0]["text"] == "two steps"


def test_blocks_compose_a_pattern_a_game_and_a_lesson_as_the_lens_did(ents):
    pat = json.loads(read(ents, f"{ROOT}entity/pattern/pad-poll")[0]["text"])
    _, _, p = blocks(ents, f"{ROOT}entity/pattern/pad-poll")
    assert p["mimeType"] == tm.T_PATTERN if hasattr(tm, "T_PATTERN") else p["mimeType"].endswith("pattern+json")
    assert of_type(p, "heading")[0]["text"] == "pad-poll"
    notes = [b["text"] for b in of_type(p, "note")]
    assert notes[0].startswith(f"Found {pat['count']:,} times in {pat['routines']:,} routines across {pat['games']:,} games"), notes
    table = of_type(p, "table")[0]
    assert table["columns"][:3] == ["game", "routine", "where"] and len(table["rows"]) == len(table["hrefs"]) == pat["routines"]
    assert any(r.endswith("?as=set&rel=tm:instance") for r in p["reads"]), "the members came from the set, one read"
    assert all(h.startswith(f"{ROOT}entity/routine/") or "/routine/" in h for h in table["hrefs"])
    _, _, g = blocks(ents, f"{ROOT}entity/game/abc")
    gt = of_type(g, "table")[0]
    assert gt["columns"] == ["pattern", "count"] and gt["rows"][0][1] >= gt["rows"][-1][1]
    assert any(b["text"].startswith("A game the autopsy played, mapper 1") for b in of_type(g, "note"))
    _, _, l = blocks(ents, f"{ROOT}entity/lesson/jump")
    assert any("Super Mario Bros." in b["text"] for b in of_type(l, "note")), "what it was measured against"
    assert not of_type(l, "diff"), "no measures in this lesson, so no diff is invented"
    rows = tm.pair_up({"a": 1, "b": [1, 2]}, {"a": 1, "b": [1, 3]})
    assert rows == [{"path": "a", "ours": 1, "theirs": 1, "same": True}, {"path": "b 1", "ours": 1, "theirs": 1, "same": True}, {"path": "b 2", "ours": 2, "theirs": 3, "same": False}]
    media = of_type(l, "media")
    assert all(m["href"].startswith(f"{ROOT}fs/data/") and "?pointer=/" in m["href"] for m in media), "a picture is a piece of the record"


def test_blocks_on_the_mcp_mount_and_the_registry(ents):
    read(ents, f"{ROOT}entity/pattern/pad-poll")
    _, _, k = blocks(ents, f"{ROOT}kinds/")
    assert of_type(k, "list")
    _, _, one = blocks(ents, f"{ROOT}kinds/pattern")
    assert any(r["key"] == "served" for r in of_type(one, "kv")[0]["rows"])
    assert len(of_type(one, "kv")) >= 2, "the media types, a kv of their own"


def test_blocks_are_capped_and_close_with_the_thing_itself(ns, repo, monkeypatch):
    (repo / "data" / "deep.json").write_text(json.dumps({f"part{i}": {"n": i} for i in range(12)}))
    monkeypatch.setattr(tm, "BLOCK_CAP", 6)
    _, _, body = blocks(ns, f"{ROOT}fs/data/deep.json")
    assert len(body["blocks"]) == 6
    last = body["blocks"][-1]
    assert last["type"] == "link" and last["href"] == f"{ROOT}fs/data/deep.json" and "cut" in last["title"]


def test_blocks_pass_a_refusal_through_and_are_a_kind(ns):
    e = refusal(ns, f"{ROOT}fs/docs/none.md?as=blocks")
    assert e.reason == "not-found" and e.data["nearest"]
    e = refusal(ns, f"{ROOT}fs/docs/nes/pile.md?as=blocks&bogus=1")
    assert e.reason == "bad-facet"
    blocks(ns, f"{ROOT}fs/docs/nes/pile.md")
    assert ns.target_type(f"{ROOT}fs/docs/nes/pile.md?as=blocks") == tm.T_BLOCKS
    reg = json.loads(read(ns, f"{ROOT}kinds/")[0]["text"])
    assert "blocks" in {c["name"] for c in reg["children"]}
    got = ns.complete({"ref": {"type": "ref/resource", "uri": "tm://{host}/fs{/path*}{?as}"}, "argument": {"name": "as", "value": "b"}})
    assert got["completion"]["values"] == ["blocks"]


def test_the_crawler_reads_blocks_and_holds_the_vocabulary(repo, monkeypatch, capsys):
    from test_tm import _crawler
    mod = _crawler()
    (repo / "notes" / "escape.md").unlink()
    write_manifest(repo)
    n = Namespace(repo, fetch=canned_fetch, git_repos={}, sites=tm.SITES[:1], sitemap_sites={})
    assert run(mod.crawl(2000, repo, n)) == 0, capsys.readouterr().out
    out = capsys.readouterr().out
    assert "kinds read as blocks" in out and " 0 kinds read as blocks" not in out, out
    n = Namespace(repo, fetch=canned_fetch, git_repos={}, sites=tm.SITES[:1], sitemap_sites={})
    orig = tm.Blocks.heading
    monkeypatch.setattr(tm.Blocks, "heading", staticmethod(lambda text, frm, level=1: {"type": "banner", "text": text, "from": frm}))
    assert run(mod.crawl(2000, repo, n)) == 1
    out = capsys.readouterr().out
    assert "banner" in out and "vocabulary" in out, out
    del orig


# -- the bends the second host logged (tinylens#2, 2026-10-23) ---------------------

def test_a_view_composes_with_view_and_nothing_else_composes_twice(gns, ns):
    _, _, log = blocks(gns, f"{ROOT}git/public/docs/nes/alone.md?view=log")
    assert log["of"] == f"{ROOT}git/public/docs/nes/alone.md?as=log" and log["mimeType"] == tm.T_LOG
    tl = of_type(log, "timeline")[0]
    assert tl["events"] and all(set(e) >= {"at", "text", "href"} for e in tl["events"]) and tl["events"][0]["at"] <= tl["events"][-1]["at"]
    c, _ = read(gns, f"{ROOT}git/public/docs/nes/alone.md?as=blocks&view=log")
    assert c["uri"] == f"{ROOT}git/public/docs/nes/alone.md?as=blocks&view=log", "the echo spells the view"
    _, _, st = blocks(ns, f"{ROOT}fs/docs/nes/pile.md?view=stat")
    assert any(r["key"] == "size" for r in of_type(st, "kv")[0]["rows"])
    _, _, lk = blocks(ns, f"{ROOT}fs/docs/nes/pile.md?view=links")
    assert of_type(lk, "list") and all(i.get("rel") for i in of_type(lk, "list")[0]["items"])
    _, _, bl = blocks(gns, f"{ROOT}git/public/docs/nes/alone.md?view=blame")
    assert of_type(bl, "code")
    e = refusal(ns, f"{ROOT}fs/docs/nes/pile.md?view=log")
    assert e.reason == "bad-facet" and "as=blocks" in e.message, "view says which facet to compose, so it goes with as=blocks"
    e = refusal(ns, f"{ROOT}fs/docs/nes/pile.md?as=blocks&view=raw")
    assert e.reason == "bad-facet"
    e = refusal(ns, f"{ROOT}fs/docs/nes/pile.md?as=log&as=blocks")
    assert e.reason == "bad-facet" and "twice" in e.message, "a parameter given twice is refused, not the last one taken"


def test_a_lesson_picture_is_one_pointer_and_says_it_is_base64(ents):
    _, _, l = blocks(ents, f"{ROOT}entity/lesson/jump")
    m = of_type(l, "media")[0]
    assert m["href"].count("pointer=") == 1 and m["href"].endswith("/pictures/0/png"), m["href"]
    assert m["encoding"] == "base64" and m["mimeType"] == "image/png"
    c, _ = read(ents, m["href"])
    assert json.loads(c["text"]) == "iVBORw0KGgo=", "the piece is the base64 string, as the block says"


def test_a_game_names_each_lesson_and_tm_links_is_a_block(ents, monkeypatch):
    _, links = read(ents, f"{ROOT}entity/game/def")
    assert any(l["rel"] == "tm:measured-by" for l in links), "the Zelda lesson measures this game"
    _, _, g = blocks(ents, f"{ROOT}entity/game/def")
    lessons = [i for b in of_type(g, "list") for i in b["items"] if "/lesson/" in i["href"]]
    assert lessons and all(i["text"] != "a lesson measured beside this game" for i in lessons), lessons
    monkeypatch.setattr(tm, "LINK_CAP", 3)
    _, _, p = blocks(ents, f"{ROOT}entity/pattern/pad-poll")
    assert any(b["rel"] == "tm:links" for b in of_type(p, "link")), "past the cap, the way to the rest is a block"


def test_a_too_large_thing_links_a_first_range_and_keeps_its_links(ns, repo):
    (repo / "data" / "huge.json").write_text(json.dumps({"x": "y" * (tm.READ_CAP + 10)}))
    _, links, body = blocks(ns, f"{ROOT}fs/data/huge.json")
    hrefs = [b["href"] for b in of_type(body, "link")]
    assert not any("{" in h for h in hrefs), "a link block is an address, not a template"
    assert f"{ROOT}fs/data/huge.json?range=0-{tm.READ_CAP - 1}" in hrefs
    assert any(b["rel"] == "up" for b in of_type(body, "link")), "its own links, from its stat"


def test_a_page_keeps_its_headings_lists_tables_and_code(ns):
    _, _, page = blocks(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile")
    assert of_type(page, "heading")[0]["text"] == "What is in the pile"
    assert of_type(page, "note")[0]["text"] == "Gear on hand."
    assert [i["text"] for i in of_type(page, "list")[0]["items"]] == ["one", "two"]
    assert f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=rendered" in page["reads"]
    _, _, ja = blocks(ns, f"{ROOT}http/tinymachines.ai/ja/docs/nes/pile")
    assert of_type(ja, "code")[0]["text"] == "a  b\n c", "a listing keeps its spacing"
    assert "menu" not in json.dumps(ja), "the site's navigation is not the page"


def test_a_missed_pointer_offers_an_address_not_the_document(ns):
    e = refusal(ns, f"{ROOT}fs/data/figures.json?pointer=/nope")
    assert e.data["nearest"] == [f"{ROOT}fs/data/figures.json"], e.data["nearest"]


def test_a_page_table_is_a_table(ns, monkeypatch):
    monkeypatch.setattr(ns, "serves", lambda site, page: True)
    monkeypatch.setattr(ns, "_site_pages", lambda site: ["/", "/docs/nes/table"])
    c, _ = read(ns, f"{ROOT}http/tinymachines.ai/docs/nes/table?as=blocks")
    t = of_type(json.loads(c["text"]), "table")[0]
    assert t["columns"] == ["a", "b"] and t["rows"] == [["1", "2"]]
