"""tinypeek#23: kinds and media types. Every read says what it is in its
media type; a link may carry its target's; the registry at kinds/ lists what
has been served, counted; and ?as=set on the entity mount reads a set and
its members in one, which was the bend the lens had left standing.

The fixtures are test_tm's: a small checkout (`repo`, `ns`), and the built
one with the two records (`ents`)."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

import tm
from tm import ROOT, Namespace, TmError
from test_tm import AUTOPSY, built, canned_fetch, ents, gits, read, refusal, rels, repo, ns, run, site  # noqa: F401

E = f"{ROOT}entity/"
K = f"{ROOT}kinds/"


# ---------------------------------------------------------------------------
# Every read says what it is
# ---------------------------------------------------------------------------


def test_a_listing_is_a_listing_on_every_mount_and_the_roots_are_too(ents):
    for uri in (tm.TOP, ROOT, f"{ROOT}fs/", f"{ROOT}fs/docs/", f"{ROOT}git/", f"{ROOT}git/public/", f"{ROOT}http/", f"{ROOT}http/tinymachines.ai/",
                f"{ROOT}offbox/", E, f"{E}pattern/", f"{ROOT}mcp/", K):
        c, _ = read(ents, uri)
        assert c["mimeType"] == tm.T_LISTING == "application/vnd.tm.listing+json", uri
    # And every collection a listing names claims the listing type for it.
    body = json.loads(read(ents, f"{ROOT}fs/")[0]["text"])
    assert {k["mimeType"] for k in body["children"] if k["isCollection"]} == {tm.T_LISTING}


def test_a_file_keeps_its_own_type_a_json_file_is_a_record_and_a_trail_is_a_trail(ents):
    assert read(ents, f"{ROOT}fs/docs/nes/pile.md")[0]["mimeType"] == "text/markdown"
    assert read(ents, f"{ROOT}fs/data/autopsy.json")[0]["mimeType"] == tm.T_RECORD == "application/vnd.tm.record+json"
    assert read(ents, f"{ROOT}git/public/data/autopsy.json")[0]["mimeType"] == tm.T_RECORD
    # The stat and the listing say the same.
    assert json.loads(read(ents, f"{ROOT}fs/data/autopsy.json?as=stat")[0]["text"])["mimeType"] == tm.T_RECORD
    kids = {k["name"]: k for k in json.loads(read(ents, f"{ROOT}fs/data/")[0]["text"])["children"]}
    assert kids["autopsy.json"]["mimeType"] == tm.T_RECORD
    # A record is JSON to every rule: a pointer reads into it.
    c, _ = read(ents, f"{ROOT}fs/data/autopsy.json?pointer=/games/0/key")
    assert json.loads(c["text"]) == AUTOPSY["games"][0]["key"] and c["mimeType"] == tm.T_RECORD
    # A trail is a JSON file the server recognises by its shape (tinypeek#18): it says so.
    (ents.repo / "notes" / "trails").mkdir()
    (ents.repo / "notes" / "trails" / "walk.json").write_text(json.dumps({"title": "A walk", "steps": [{"uri": f"{E}pattern/pad-poll"}]}))
    (ents.repo / "notes" / "trails" / "notes.json").write_text(json.dumps({"not": "a trail"}))
    assert read(ents, f"{ROOT}fs/notes/trails/walk.json")[0]["mimeType"] == tm.T_TRAIL
    assert read(ents, f"{ROOT}fs/notes/trails/notes.json")[0]["mimeType"] == tm.T_RECORD, "a file there that is not of the shape is a record"
    kids = {k["name"]: k["mimeType"] for k in json.loads(read(ents, f"{ROOT}fs/notes/trails/")[0]["text"])["children"]}
    assert kids == {"walk.json": tm.T_TRAIL, "notes.json": tm.T_RECORD}


def test_the_facets_and_the_composed_things_each_say_their_kind(ents):
    f = f"{ROOT}git/public/data/autopsy.json"
    assert read(ents, f"{f}?as=stat")[0]["mimeType"] == tm.T_STAT
    assert read(ents, f"{f}?as=links")[0]["mimeType"] == tm.T_LINKS
    assert read(ents, f"{f}?as=log")[0]["mimeType"] == tm.T_LOG
    assert read(ents, f"{f}?as=blame")[0]["mimeType"] == tm.T_BLAME == "text/vnd.tm.blame"
    page = f"{ROOT}http/tinymachines.ai/docs/nes/pile"
    assert read(ents, page)[0]["mimeType"] == tm.T_PAGE == "text/vnd.tm.page"
    assert read(ents, f"{page}?as=text&lines=1-1")[0]["mimeType"] == tm.T_PAGE
    assert read(ents, f"{page}?as=rendered")[0]["mimeType"] == "text/html", "the HTML a visitor gets is itself"
    assert read(ents, f"{ROOT}http/tinymachines.ai/robots.txt")[0]["mimeType"] == "text/plain", "not a page: reads as itself"
    st = json.loads(read(ents, f"{page}?as=stat")[0]["text"])
    assert st["mimeType"] == tm.T_PAGE and st["contentType"].startswith("text/html"), "the stat says what it reads as, and what the front door said"
    assert read(ents, f"{E}pattern/pad-poll")[0]["mimeType"] == "application/vnd.tm.pattern+json"
    assert read(ents, f"{E}game/{AUTOPSY['games'][0]['key']}")[0]["mimeType"] == "application/vnd.tm.game+json"
    assert read(ents, f"{E}lesson/jump")[0]["mimeType"] == "application/vnd.tm.lesson+json"
    rid = tm.Entities.rid(AUTOPSY["games"][0]["routine_list"][0])
    assert read(ents, f"{E}game/{AUTOPSY['games'][0]['key']}/routine/{rid}")[0]["mimeType"] == "application/vnd.tm.routine+json"
    # No read of anything the server composes is bare application/json any more.
    for uri in (tm.TOP, ROOT, f"{ROOT}offbox/", f"{f}?as=stat", f"{E}pattern/pad-poll?as=stat", K):
        assert read(ents, uri)[0]["mimeType"] != "application/json", uri


def test_the_vocabulary_names_every_kind_and_a_kind_is_read_back_from_a_type():
    for kind in ("listing", "file", "record", "trail", "page", "stat", "links", "log", "blame", "submodule", "offbox",
                 "pattern", "game", "routine", "lesson", "server", "tool", "resource", "prompt", "set", "kind"):
        assert kind in tm.KINDS and tm.KINDS[kind], kind
    assert tm.kind_of("application/vnd.tm.tool+json") == "tool"
    assert tm.kind_of("text/vnd.tm.page") == "page"
    assert tm.kind_of("text/markdown") == "file" and tm.kind_of("image/png") == "file"
    assert tm.tm_type("stat") == "application/vnd.tm.stat+json" and tm.tm_type("page", text=True) == "text/vnd.tm.page"
    assert tm.is_json(tm.T_RECORD) and tm.is_text(tm.T_PAGE) and tm.is_text(tm.T_BLAME)


# ---------------------------------------------------------------------------
# A link carries its target's type
# ---------------------------------------------------------------------------


def test_a_link_carries_the_type_of_its_target_where_the_address_says_it(ents):
    _, links = read(ents, f"{E}pattern/pad-poll")
    by = {(ln["rel"], ln["href"]): ln.get("type") for ln in links}
    assert by[("up", f"{E}pattern/")] == tm.T_LISTING
    assert by[("describedby", f"{E}pattern/pad-poll?as=stat")] == tm.T_STAT
    found = [ln for ln in links if ln["rel"] == "tm:found-in"]
    assert found and all(ln["type"] == "application/vnd.tm.game+json" for ln in found)
    inst = [ln for ln in links if ln["rel"] == "tm:instance"]
    assert inst and all(ln["type"] == "application/vnd.tm.routine+json" for ln in inst)
    data = [ln for ln in links if ln["rel"] == "tm:data"]
    assert data and data[0]["type"] == tm.T_RECORD, "a piece of a record reads as the record"
    assert [ln for ln in links if ln["rel"] == "version-history"][0]["type"] == tm.T_LOG
    # A page's links: its HTML, its text, its source file, and the entity it is about.
    _, links = read(ents, f"{ROOT}http/tinymachines.ai/docs/nes/pile")
    by = {(ln["rel"], ln["href"]): ln.get("type") for ln in links}
    assert by[("alternate", f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=rendered")] == "text/html"
    assert by[("tm:source", f"{ROOT}fs/docs/nes/pile.md")] == "text/markdown"
    _, links = read(ents, f"{E}game/{AUTOPSY['games'][0]['key']}")
    page_links = [ln for ln in links if ln["rel"] == "tm:renders-as"]
    assert page_links and all(ln["type"] == tm.T_PAGE for ln in page_links), "the page a game is shown on is a page"
    # What the address does not settle carries no type: the field is optional.
    assert ents.target_type(f"{ROOT}git/public/notes/odd.zzz") is None
    assert ents.target_type("https://example.com/") is None
    # link() takes it as a keyword, so a mount can say it outright.
    assert tm.link("up", ROOT, mime=tm.T_LISTING) == {"rel": "up", "href": ROOT, "type": tm.T_LISTING}


def test_the_type_a_link_says_is_the_type_the_target_reads_as(ents):
    """The rule behind the crawler's check, on a sample of every shape of
    address: a facet, a piece, a leaf, a collection, a page, a submodule."""
    seen = 0
    for start in (ROOT, f"{E}pattern/pad-poll", f"{ROOT}http/tinymachines.ai/docs/nes/pile", f"{ROOT}git/public/data/autopsy.json", f"{ROOT}offbox/", K):
        _, links = read(ents, start)
        for ln in links:
            if "type" not in ln or "{" in ln["href"]:
                continue
            try:
                c, _ = read(ents, ln["href"])
            except TmError:
                continue
            mime = json.loads(c["text"])["mimeType"] if c["mimeType"] == tm.T_STAT and "as=stat" not in ln["href"] else c["mimeType"]
            assert mime == ln["type"], (start, ln)
            seen += 1
    assert seen > 20, "a check that can pass on nothing is not a check"


# ---------------------------------------------------------------------------
# The registry, measured
# ---------------------------------------------------------------------------


def test_the_registry_lists_only_what_has_been_served_and_counts_it(ents):
    reg = json.loads(read(ents, K)[0]["text"])
    assert reg["children"] == [] and reg["served"] == 0 and reg["since"], "a fresh server has served nothing when it is first asked"
    read(ents, f"{E}pattern/pad-poll")
    read(ents, f"{E}pattern/pad-poll")
    read(ents, f"{E}pattern/pad-poll?as=stat")
    reg = json.loads(read(ents, K)[0]["text"])
    names = {c["name"]: c for c in reg["children"]}
    assert set(names) == {"listing", "pattern", "stat"}, "the first read of the registry was a listing, and counted"
    assert names["pattern"]["served"] == 2 and names["pattern"]["mimeType"] == tm.T_KIND and names["pattern"]["title"] == tm.KINDS["pattern"]
    c, links = read(ents, f"{K}pattern")
    body = json.loads(c["text"])
    assert c["mimeType"] == tm.T_KIND == "application/vnd.tm.kind+json"
    assert (body["kind"], body["served"], body["mediaTypes"]) == ("pattern", 2, {"application/vnd.tm.pattern+json": 2})
    assert body["first"] <= body["last"] and body["since"] == reg["since"] and body["what"] == tm.KINDS["pattern"]
    assert body["rels"]["tm:found-in"] >= 2 and body["rels"]["up"] == 2, "the links such a thing carried here, counted"
    assert rels(links)["up"] == [K] and rels(links)["describedby"] == [f"{K}pattern?as=stat"]
    st = json.loads(read(ents, f"{K}pattern?as=stat")[0]["text"])
    assert st["mimeType"] == tm.T_KIND and st["last"] == body["last"]
    # A file is a kind too, by the types it was served as.
    read(ents, f"{ROOT}fs/docs/nes/pile.md")
    body = json.loads(read(ents, f"{K}file")[0]["text"])
    assert body["mediaTypes"] == {"text/markdown": 1}
    # The registry keeps no address: nothing in it names what was read.
    assert "pad-poll" not in json.dumps(json.loads(read(ents, f"{K}pattern")[0]["text"]))


def test_a_kind_never_served_is_not_there_and_the_refusal_says_which_it_is(ents):
    read(ents, f"{E}pattern/pad-poll")
    e = refusal(ents, f"{K}tool")
    assert e.reason == "not-found" and "has not served" in str(e) and "tool" in str(e)
    assert e.data["nearest"] and all(n.startswith(K) for n in e.data["nearest"])
    e = refusal(ents, f"{K}widget")
    assert e.reason == "not-found" and "no kind of that name" in str(e)
    assert refusal(ents, f"{K}pattern/").reason == "not-found"
    assert refusal(ents, f"{K}pattern/more").reason == "not-found"
    e = refusal(ents, f"{K}pattern?as=log")
    assert e.reason == "bad-facet" and "stat, links" in str(e)
    e = refusal(ents, f"{K}pattern?at=HEAD")
    assert e.reason == "bad-facet" and "keeps no past" in str(e)
    assert refusal(ents, f"{K}?as=stat").reason == "bad-facet"


def test_the_registry_persists_outside_the_checkout_and_refuses_a_place_inside_it(ents, tmp_path, monkeypatch, capsys):
    f = tmp_path / "state" / "tm-kinds.json"
    a = Namespace(ents.repo, fetch=canned_fetch, git_repos=dict(ents.git), kinds_file=f)
    read(a, f"{E}pattern/pad-poll")
    assert f.is_file(), "a new kind is written at once"
    assert json.loads(f.read_text())["kinds"]["pattern"]["served"] == 1
    read(a, f"{E}pattern/pad-poll")
    assert json.loads(f.read_text())["kinds"]["pattern"]["served"] == 1, "a count alone waits for the next save, a minute at most"
    a.kinds.now = lambda: time.time() + tm.Kinds.SAVE_EVERY_S + 1
    read(a, f"{E}pattern/pad-poll?as=stat")
    on_disk = json.loads(f.read_text())
    assert on_disk["kinds"]["pattern"]["served"] == 2 and on_disk["kinds"]["stat"]["served"] == 1 and on_disk["since"]
    b = Namespace(ents.repo, fetch=canned_fetch, git_repos=dict(ents.git), kinds_file=f)
    body = json.loads(read(b, f"{K}pattern")[0]["text"])
    assert body["served"] == 2 and body["since"] == on_disk["since"], "a restart keeps the count and when the record began"
    read(b, f"{E}lesson/jump")
    assert json.loads(f.read_text())["kinds"]["lesson"]["served"] == 1
    # Where the service finds it: the state directory, never the checkout.
    monkeypatch.delenv("TM_KINDS_FILE", raising=False)
    state = ents.repo.parent / "state"   # beside the checkout, as the service's state directory is
    monkeypatch.setenv("STATE_DIRECTORY", str(state))
    assert tm.kinds_file_from_env(ents.repo) == state / "tm-kinds.json"
    monkeypatch.setenv("STATE_DIRECTORY", str(ents.repo / "svc"))
    assert tm.kinds_file_from_env(ents.repo) is None, "the checkout is the repo here, and a place under it is refused"
    monkeypatch.setenv("TM_KINDS_FILE", str(ents.repo / "notes" / "kinds.json"))
    assert tm.kinds_file_from_env(ents.repo) is None and "not be kept under the checkout" in capsys.readouterr().out
    monkeypatch.delenv("TM_KINDS_FILE")
    monkeypatch.delenv("STATE_DIRECTORY")
    assert tm.kinds_file_from_env(ents.repo) is None, "nowhere to write: counts from this start"


def test_the_registry_is_a_mount_the_grammar_already_fits(ents):
    r = tm.parse(f"{K}pattern?as=stat")
    assert (r.mount, r.path, r.facets, r.is_collection, r.uri) == ("kinds", "pattern", {"as": "stat"}, False, f"{K}pattern")
    body = json.loads(read(ents, ROOT)[0]["text"])
    assert K in {m["uri"] for m in body["mounts"]}
    tmpl = {t["name"]: t for t in ents.templates()}
    assert tmpl["kinds"]["uriTemplate"] == f"{K}{{kind}}{{?as,view,rel,min,cursor}}" and tmpl["kinds"]["mimeType"] == tm.T_KIND
    assert tmpl["hosts"]["mimeType"] == tmpl["root"]["mimeType"] == tm.T_LISTING
    assert "mimeType" not in tmpl["entity"] and "mimeType" not in tmpl["mcp"], "a template whose matches differ in kind claims none"
    assert any(r["uri"] == K for r in ents.list_resources(None)["resources"])
    read(ents, f"{E}pattern/pad-poll")
    got = ents.complete({"ref": {"type": "ref/resource", "uri": tmpl["kinds"]["uriTemplate"]}, "argument": {"name": "kind", "value": "p"}})
    assert got["completion"]["values"] == ["pattern"], "completions are the kinds served, not the vocabulary"
    got = ents.complete({"ref": {"type": "ref/resource", "uri": tmpl["kinds"]["uriTemplate"]}, "argument": {"name": "as", "value": ""}})
    assert got["completion"]["values"] == ["stat", "links", "blocks"]


# ---------------------------------------------------------------------------
# A set and its members in one read
# ---------------------------------------------------------------------------


def test_a_set_reads_the_things_behind_one_rel_inlined(ents):
    one = f"{E}pattern/pad-poll"
    c, links = read(ents, f"{one}?as=set&rel=tm:instance")
    body = json.loads(c["text"])
    assert c["mimeType"] == tm.T_SET == "application/vnd.tm.set+json" and c["uri"] == f"{one}?as=set&rel=tm:instance"
    _, own = read(ents, one)
    want = [ln["href"] for ln in tm.ordered(own) if ln["rel"] == "tm:instance"]
    assert body["rel"] == "tm:instance" and body["total"] == len(want) == body["returned"] > 1
    assert [m["uri"] for m in body["members"]] == want, "the members come in the links' order"
    for m in body["members"]:
        c2, _ = read(ents, m["uri"])
        assert (m["mimeType"], m["body"]) == (c2["mimeType"], json.loads(c2["text"])), "each member is what its own address reads"
        assert "links" not in m, "a member's links are behind its address"
    assert rels(links)["alternate"] == [one] and "tm:instance" in rels(links), "the set carries the thing's links and points back at it"
    # min= narrows it as it narrows ?as=links, and rides in the echo.
    c, _ = read(ents, f"{one}?as=set&rel=tm:found-in&min=2")
    body = json.loads(c["text"])
    assert c["uri"] == f"{one}?as=set&rel=tm:found-in&min=2" and body["min"] == 2
    assert all(m["body"]["entity"] == "game" for m in body["members"])
    assert body["total"] == len([ln for ln in own if ln["rel"] == "tm:found-in" and ln.get("count", 1) >= 2])


def test_a_collection_set_inlines_its_listing_and_pages(ents, monkeypatch):
    c, _ = read(ents, f"{E}lesson/?as=set")
    body = json.loads(c["text"])
    kids = [k for k in json.loads(read(ents, f"{E}lesson/")[0]["text"])["children"] if not k["isCollection"]]
    assert c["mimeType"] == tm.T_SET and body["total"] == len(kids) == body["returned"] >= 1
    assert [m["uri"] for m in body["members"]] == [k["uri"] for k in kids] and body["members"][0]["body"]["entity"] == "lesson"
    # entity/game/ lists games and their collections; the set is the games.
    body = json.loads(read(ents, f"{E}game/?as=set")[0]["text"])
    assert all(m["body"]["entity"] == "game" for m in body["members"]) and body["total"] == len(AUTOPSY["games"])
    # Paged like a listing, SET_CAP a page, the next page an address.
    monkeypatch.setattr(tm, "SET_CAP", 1)
    c, _ = read(ents, f"{E}game/?as=set")
    body = json.loads(c["text"])
    assert body["returned"] == 1 and body["total"] == len(AUTOPSY["games"]) and body["next"].startswith(f"{E}game/?as=set&cursor=")
    c2, _ = read(ents, body["next"])
    body2 = json.loads(c2["text"])
    assert c2["uri"] == body["next"] and body2["members"][0]["uri"] != body["members"][0]["uri"]


def test_what_a_set_refuses_names_what_would_read(ents):
    one = f"{E}pattern/pad-poll"
    e = refusal(ents, f"{one}?as=set")
    assert e.reason == "bad-facet" and "needs rel=" in str(e) and "tm:instance" in str(e) and "tm:found-in" in str(e)
    e = refusal(ents, f"{one}?as=set&rel=tm:data")
    assert e.reason == "bad-facet" and "no such link to a thing of this mount" in str(e), "a record on fs is not inlined"
    e = refusal(ents, f"{one}?as=set&rel=tm:nothing")
    assert e.reason == "bad-facet" and "tm:instance" in str(e)
    e = refusal(ents, f"{E}lesson/?as=set&rel=tm:measures")
    assert e.reason == "bad-facet" and "a collection's set is its children" in str(e)
    e = refusal(ents, f"{ROOT}fs/docs/nes/pile.md?as=set")
    assert e.reason == "bad-facet" and "fs offers" in str(e), "only the entity mount offers it"
    e = refusal(ents, f"{one}?rel=tm:instance")
    assert e.reason == "bad-facet" and "?as=links or ?as=set" in str(e)
    e = refusal(ents, f"{one}?as=set&rel=tm:instance&lines=1-2")
    assert e.reason == "bad-facet"
    # A page of a set is held to the byte cap like any read.
    saved = tm.READ_CAP
    try:
        tm.READ_CAP = 200
        e = refusal(ents, f"{one}?as=set&rel=tm:instance")
        assert e.reason == "too-large" and e.data["size"] > 200
    finally:
        tm.READ_CAP = saved


def test_a_set_at_a_time_reads_the_members_then(ents):
    one = f"{E}pattern/pad-poll"
    _, now = read(ents, one)
    at = run(ents.read(f"{ROOT}git/public/data/autopsy.json?as=log"))
    commit = json.loads(at["contents"][0]["text"])["commits"][0]["commit"]
    c, _ = read(ents, f"{one}?at={commit}&as=set&rel=tm:instance")
    body = json.loads(c["text"])
    assert c["mimeType"] == tm.T_SET and all(f"at={commit}" in m["uri"] for m in body["members"]), "every member address carries the same at="
    assert body["total"] == len([ln for ln in now if ln["rel"] == "tm:instance"]), "the records have one commit here, so then is now"


# ---------------------------------------------------------------------------
# The crawler holds the types, and fails when one lies
# ---------------------------------------------------------------------------


def test_the_crawler_holds_every_type_and_the_registry_and_is_red_when_one_lies(ents, capsys, monkeypatch):
    """The deploy's last check, over the temp checkout: clean as built, and
    red when a link claims a type its target does not read as, when a thing
    the server composes goes out as bare application/json, and when the
    registry forgets a kind it served. A check that only ever passes is not a
    check."""
    from test_tm import _crawler
    crawler = _crawler()
    (ents.repo / "notes" / "escape.md").unlink()

    def crawl() -> tuple[int, str]:
        n = Namespace(ents.repo, fetch=canned_fetch, sites=tm.SITES[:1], git_repos=dict(ents.git))
        rc = run(crawler.crawl(4000, ents.repo, n))
        return rc, capsys.readouterr().out

    rc, out = crawl()
    assert rc == 0, out
    assert "every typed link reads as it says" in out and "the registry lists every kind served" in out
    followed = int(out.split(" typed links followed")[0].rsplit(" ", 1)[1])
    assert followed > 100, out

    target_type = Namespace.target_type
    monkeypatch.setattr(Namespace, "target_type", lambda self, href: tm.T_LOG if href.endswith("?as=stat") else target_type(self, href))
    rc, out = crawl()
    assert rc == 1 and "the link says application/vnd.tm.log+json, the target reads as application/vnd.tm.stat+json" in out
    monkeypatch.setattr(Namespace, "target_type", target_type)

    # The walk reads a leaf as its stat, so the kinds it is served are the
    # listings, the stats and the pieces; forget one of those.
    record = tm.Kinds.record
    monkeypatch.setattr(tm.Kinds, "record", lambda self, mime, links: None if tm.kind_of(mime) == "record" else record(self, mime, links))
    rc, out = crawl()
    assert rc == 1 and "kinds/: record was served during the walk and is not listed" in out
    monkeypatch.setattr(tm.Kinds, "record", record)

    # A listing is what the walk reads most; send one kind out bare.
    monkeypatch.setattr(tm, "T_LISTING", "application/json")
    rc, out = crawl()
    assert rc == 1 and "reads as bare application/json" in out
