"""tm://, slice one: the grammar, the two mounts, the refusals and the links.

Most of these run over a repository built in a temp directory, so the rules
can be exercised on files that should not exist in the real one (a secret, a
symlink out, a file over the cap). Two run over the real checkout: that the
page rule here agrees with the notebook's loader, and that the server wires
the namespace in.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

import mcp_server
import tm
from tm import ROOT, Namespace, TmError, parse

HERE = Path(__file__).resolve().parent
REPO = HERE.parent


def run(coro):
    import asyncio
    return asyncio.run(coro)


async def canned_fetch(site: str, path: str) -> tuple[int, str, bytes]:
    """The http mount without a network: three pages, a redirect, a 404."""
    if path == "/docs/nes/pile":
        return 200, "text/html; charset=utf-8", (
            b"<html><head><title>x</title><style>p{}</style><script>var a=1</script></head>"
            b"<body><nav>Menu Close</nav><main><h1>What is in the pile</h1><p>Gear  on\n hand.</p>"
            b"<ul><li>one</li><li>two</li></ul></main><footer>foot</footer></body></html>"
        )
    if path == "/ja/docs/nes/pile":
        return 200, "text/html; charset=utf-8", b"<html><body><nav>menu</nav><article><h1>Pile</h1><pre>a  b\n c</pre></article></body></html>"
    if path == "/docs":
        return 200, "text/html; charset=utf-8", b"<html><body><main><nav><ul><li>Contents</li></ul></nav><p>docs</p></main></body></html>"
    if path == "/old":
        return 301, "text/html", b""
    if path == "/robots.txt":
        return 200, "text/plain", b"User-agent: *\n"
    if path == "/big":
        return 200, "text/html", b"<main>" + b"x" * (tm.READ_CAP + 1) + b"</main>"
    return 404, "text/html", b"<html>nope</html>"


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A small checkout with the three roots and the things the rules refuse."""
    (tmp_path / "docs" / "nes").mkdir(parents=True)
    (tmp_path / "docs" / "ja" / "nes").mkdir(parents=True)
    (tmp_path / "docs" / "styles").mkdir()
    (tmp_path / "data").mkdir()
    (tmp_path / "notes").mkdir()
    (tmp_path / "deploy").mkdir()
    (tmp_path / "docs" / "index.md").write_text("---\ntitle: Docs\n---\n# Docs\n")
    (tmp_path / "docs" / "README.md").write_text("not a page\n")
    (tmp_path / "docs" / "nes" / "index.md").write_text("---\ntitle: NES\n---\n# NES\n")
    (tmp_path / "docs" / "nes" / "pile.md").write_text("---\ntitle: Pile\n---\n# Pile\n\nGear on hand.\n")
    (tmp_path / "docs" / "nes" / "alone.md").write_text("---\ntitle: Alone\n---\n# Alone\n")
    (tmp_path / "docs" / "ja" / "nes" / "pile.md").write_text("# 山\n")
    (tmp_path / "docs" / "styles" / "guide.md").write_text("# the owner's\n")
    (tmp_path / "docs" / "big.bin").write_bytes(b"\0" * (tm.READ_CAP + 10))
    (tmp_path / "data" / "figures.json").write_text('{"n": 1}\n')
    (tmp_path / "data" / "secret-key.json").write_text('{"k": "no"}\n')
    (tmp_path / "data" / ".env").write_text("X=1\n")
    (tmp_path / "notes" / "plan.md").write_text("# plan\n")
    (tmp_path / "deploy" / "HOSTING.local.md").write_text("addresses\n")
    os.symlink(tmp_path / "deploy" / "HOSTING.local.md", tmp_path / "notes" / "escape.md")
    return tmp_path


@pytest.fixture
def ns(repo: Path) -> Namespace:
    return Namespace(repo, fetch=canned_fetch)


def read(ns: Namespace, uri: str) -> tuple[dict, list[dict]]:
    r = run(ns.read(uri))
    return r["contents"][0], r["_meta"][tm.META_LINKS]


def refusal(ns: Namespace, uri: str) -> TmError:
    with pytest.raises(TmError) as e:
        run(ns.read(uri))
    return e.value


def rels(links: list[dict]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for ln in links:
        out.setdefault(ln["rel"], []).append(ln["href"])
    return out


# ---------------------------------------------------------------------------
# The grammar
# ---------------------------------------------------------------------------


def test_the_uri_is_mount_then_backend_path_then_facets():
    r = parse("tm://tinymachines/fs/docs/nes/pile.md?as=stat")
    assert (r.mount, r.path, r.facets) == ("fs", "docs/nes/pile.md", {"as": "stat"})
    assert r.uri == "tm://tinymachines/fs/docs/nes/pile.md", "facets are representation, not identity"
    h = parse("tm://tinymachines/http/tinymachines.ai/docs/nes/?cursor=x")
    assert (h.mount, h.site, h.path, h.is_collection) == ("http", "tinymachines.ai", "/docs/nes/", True)
    assert parse("tm://tinymachines/").mount == ""
    assert parse("tm://tinymachines/fs/").is_collection
    assert parse("tm://tinymachines/http/tinymachines.ai/").path == "/"


def test_a_wrong_host_mount_or_site_names_the_right_ones():
    for uri, expect in [
        ("tm://elsewhere/fs/", ROOT),
        ("https://tinymachines.ai/docs", ROOT),
        ("tm://tinymachines/git/x", f"{ROOT}fs/"),
        ("tm://tinymachines/http/example.com/", f"{ROOT}http/tinymachines.ai/"),
    ]:
        with pytest.raises(TmError) as e:
            parse(uri)
        assert e.value.reason == "not-found"
        assert expect in e.value.data["nearest"], uri


def test_a_link_cannot_get_its_confidence_wrong():
    assert tm.link("tm:source", "x", "exact")["confidence"] == "exact"
    assert "confidence" not in tm.link("up", "x")
    with pytest.raises(AssertionError):
        tm.link("tm:source", "x")
    with pytest.raises(AssertionError):
        tm.link("up", "x", "exact")


# ---------------------------------------------------------------------------
# fs
# ---------------------------------------------------------------------------


def test_the_root_lists_the_mounts_and_a_collection_lists_its_children(ns):
    root, links = read(ns, ROOT)
    assert {m["uri"] for m in json.loads(root["text"])["mounts"]} == {f"{ROOT}fs/", f"{ROOT}http/"}
    top, _ = read(ns, f"{ROOT}fs/")
    assert [c["name"] for c in json.loads(top["text"])["children"]] == ["docs/", "data/", "notes/"]
    nes, links = read(ns, f"{ROOT}fs/docs/nes/")
    kids = json.loads(nes["text"])["children"]
    assert [c["name"] for c in kids] == ["alone.md", "index.md", "pile.md"]
    assert all(c["mimeType"] == "text/markdown" and c["size"] > 0 for c in kids)
    assert rels(links)["up"] == [f"{ROOT}fs/docs/"]


def test_a_file_reads_as_text_with_its_type_and_its_page(ns):
    c, links = read(ns, f"{ROOT}fs/docs/nes/pile.md")
    assert c["mimeType"] == "text/markdown" and "Gear on hand." in c["text"]
    r = rels(links)
    assert r["up"] == r["collection"] == [f"{ROOT}fs/docs/nes/"]
    assert r["describedby"] == [f"{ROOT}fs/docs/nes/pile.md?as=stat"]
    assert r["tm:renders-as"] == [f"{ROOT}http/{s}/docs/nes/pile" for s in tm.SITES]
    assert all(ln.get("confidence") == "exact" for ln in links if ln["rel"] == "tm:renders-as")


def test_the_page_rule_matches_the_loader():
    """docs/<p>.md is /docs/<p>; index names its directory; ja/ is the
    language prefix; README.md and docs/styles route nowhere."""
    n = Namespace(REPO, fetch=canned_fetch)
    assert n.page_for("docs/nes/pile.md") == "/docs/nes/pile"
    assert n.page_for("docs/index.md") == "/docs"
    assert n.page_for("docs/nes/index.md") == "/docs/nes"
    assert n.page_for("docs/ja/nes/pile.md") == "/ja/docs/nes/pile"
    assert n.page_for("docs/ja/index.md") == "/ja/docs"
    assert n.page_for("docs/6502/two-ways-in.mdx") == "/docs/6502/two-ways-in"
    assert n.page_for("docs/README.md") is None
    assert n.page_for("docs/styles/x.md") is None
    assert n.page_for("docs/nes-arcade-handoff-v0.1") is None
    assert n.page_for("notes/plan.md") is None


def test_the_page_rule_covers_every_page_the_crawl_found():
    """The crawl in data/site-map.json is a measurement of the served site.
    Every /docs page it saw must be one the rule here produces from the tree;
    the rule can know newer pages, the crawl cannot know wrong ones."""
    n = Namespace(REPO, fetch=canned_fetch)
    crawled = {p for p in json.loads((REPO / "data" / "site-map.json").read_text())["pages"] if p == "/docs" or p.startswith("/docs/")}
    # A /docs path is a notebook page or a route of the app (web/app/[lang]/docs/kinds):
    # the routes are the app's, and only the pages are the rule's to produce.
    routes = {p for p in crawled if (REPO / "web" / "app" / "[lang]" / "docs" / p[len("/docs/"):] / "page.tsx").is_file()}
    assert routes, "no app route under /docs was found; the exclusion below would exclude nothing"
    crawled -= routes
    assert len(crawled) > 20, "the crawl record has too few notebook pages to check anything"
    ours = set()
    for f in (REPO / "docs").rglob("*"):
        page = n.page_for(f.relative_to(REPO).as_posix())
        if page:
            ours.add(page)
    missing = crawled - ours
    assert not missing, f"pages the site serves that the rule does not produce: {sorted(missing)[:10]}"


@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is not on PATH here")
def test_the_page_rule_agrees_with_the_loader_itself():
    """Same thing, against the loader rather than a record of its output."""
    script = 'import("./lib/docs.ts").then(m => console.log(JSON.stringify(m.allPages().map(p => "/" + ["docs", ...p.slug].join("/")))))'
    out = subprocess.run(["bun", "-e", script], cwd=REPO / "web", capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr[-500:]
    theirs = set(json.loads(out.stdout.strip().splitlines()[-1]))
    n = Namespace(REPO, fetch=canned_fetch)
    ours = {
        page for f in (REPO / "docs").rglob("*")
        if (page := n.page_for(f.relative_to(REPO).as_posix())) and not page.startswith("/ja/")
    }
    assert ours == theirs


def test_the_inverse_prefers_the_japanese_shadow_and_falls_back_to_the_english(ns):
    assert ns.source_for("en", "nes/pile") == "docs/nes/pile.md"
    assert ns.source_for("ja", "nes/pile") == "docs/ja/nes/pile.md"
    assert ns.source_for("ja", "nes/alone") == "docs/nes/alone.md", "no shadow: the English body is what the page shows"
    assert ns.source_for("en", "") == "docs/index.md"
    assert ns.source_for("en", "nes") == "docs/nes/index.md"
    assert ns.source_for("en", "nope") is None


def test_a_wrong_path_comes_back_with_its_nearest_siblings(ns):
    e = refusal(ns, f"{ROOT}fs/docs/nes/pil.md")
    assert e.reason == "not-found" and e.code == tm.RESOURCE_NOT_FOUND
    assert e.data["nearest"][0] == f"{ROOT}fs/docs/nes/pile.md"
    assert len(e.data["nearest"]) <= 5


def test_nothing_a_path_can_spell_leaves_the_roots(ns):
    for uri in [
        f"{ROOT}fs/../api/db.py",
        f"{ROOT}fs/docs/../deploy/HOSTING.local.md",
        f"{ROOT}fs/docs/%2e%2e/deploy/HOSTING.local.md",
        f"{ROOT}fs/deploy/HOSTING.local.md",
        f"{ROOT}fs/notes/escape.md",
    ]:
        e = refusal(ns, uri)
        assert e.reason == "out-of-root", uri
    # The escape is a symlink: it is in the listing, since it exists, but
    # reading it was refused above.
    kids = json.loads(read(ns, f"{ROOT}fs/notes/")[0]["text"])["children"]
    assert "escape.md" in {c["name"] for c in kids}


def test_the_deny_list_lists_as_redacted_and_refuses_to_read(ns):
    kids = {c["name"]: c for c in json.loads(read(ns, f"{ROOT}fs/data/")[0]["text"])["children"]}
    assert kids["secret-key.json"]["redacted"] is True and "size" not in kids["secret-key.json"]
    assert kids[".env"]["redacted"] is True
    assert kids["figures.json"]["size"] > 0
    for name in ("secret-key.json", ".env"):
        assert refusal(ns, f"{ROOT}fs/data/{name}").reason == "denied"


def test_a_file_over_the_cap_is_refused_with_a_range_template_and_read_in_ranges(ns):
    e = refusal(ns, f"{ROOT}fs/docs/big.bin")
    assert e.reason == "too-large" and e.data["size"] == tm.READ_CAP + 10
    assert e.data["range"].endswith("?range={start}-{end}")
    c, _ = read(ns, f"{ROOT}fs/docs/big.bin?range=0-4")
    assert c["mimeType"] == "application/octet-stream" and c["blob"] == "AAAAAA=="
    assert c["uri"].endswith("?range=0-4")
    assert refusal(ns, f"{ROOT}fs/docs/big.bin?range=0-{tm.READ_CAP * 2}").reason == "too-large"
    assert refusal(ns, f"{ROOT}fs/docs/big.bin?range=5-5").reason == "bad-facet"


def test_stat_is_metadata_without_content(ns):
    c, links = read(ns, f"{ROOT}fs/docs/nes/pile.md?as=stat")
    st = json.loads(c["text"])
    assert st["size"] > 0 and st["mimeType"] == "text/markdown" and st["modified"].endswith("+00:00")
    assert "Gear" not in c["text"]
    assert f"{ROOT}fs/docs/nes/pile.md" in rels(links)["alternate"]
    assert refusal(ns, f"{ROOT}fs/docs/nes/pile.md?as=blame").reason == "bad-facet"


def test_a_directory_asked_for_as_a_leaf_points_at_its_listing(ns):
    e = refusal(ns, f"{ROOT}fs/docs/nes")
    assert e.data["nearest"] == [f"{ROOT}fs/docs/nes/"]


def test_a_listing_pages_with_an_opaque_cursor(ns, monkeypatch):
    monkeypatch.setattr(tm, "LIST_CAP", 2)
    first = json.loads(read(ns, f"{ROOT}fs/docs/nes/")[0]["text"])
    assert [c["name"] for c in first["children"]] == ["alone.md", "index.md"]
    second = json.loads(read(ns, first["next"])[0]["text"])
    assert [c["name"] for c in second["children"]] == ["pile.md"] and "next" not in second
    assert refusal(ns, f"{ROOT}fs/docs/nes/?cursor=garbage").reason == "bad-cursor"


def test_completion_is_a_listing_filtered_by_what_was_typed(ns):
    def complete(tmpl, name, value, **ctx):
        p = {"ref": {"type": "ref/resource", "uri": tmpl}, "argument": {"name": name, "value": value}}
        if ctx:
            p["context"] = {"arguments": ctx}
        return ns.complete(p)["completion"]["values"]

    fs_t, http_t = f"{ROOT}fs{{/path*}}", f"{ROOT}http/{{site}}{{/path*}}{{?as}}"
    assert complete(fs_t, "path", "") == ["docs/", "data/", "notes/"]
    assert complete(fs_t, "path", "docs/nes/p") == ["docs/nes/pile.md"]
    assert complete(fs_t, "path", "docs/nope/x") == []
    assert complete(http_t, "site", "beta") == ["beta.tinymachines.ai"]
    assert complete(http_t, "as", "t") == ["text"]
    assert complete(fs_t, "as", "") == ["raw", "stat"]
    assert complete(http_t, "path", "/docs/nes/p", site="tinymachines.ai") == ["/docs/nes/pile"]
    assert complete(http_t, "path", "/docs/n", site="tinymachines.ai") == ["/docs/nes", "/docs/nes/"]
    with pytest.raises(TmError):
        complete(fs_t, "nope", "")


# ---------------------------------------------------------------------------
# http
# ---------------------------------------------------------------------------


def test_a_page_reads_as_what_the_visitor_gets_and_links_to_its_source(ns):
    c, links = read(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile")
    assert c["mimeType"] == "text/html" and "<nav>" in c["text"]
    r = rels(links)
    assert r["tm:source"] == [f"{ROOT}fs/docs/nes/pile.md"]
    assert r["alternate"] == [f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=text", f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=rendered"]
    assert r["up"] == r["collection"] == [f"{ROOT}http/tinymachines.ai/docs/nes/"]


def test_text_is_the_main_without_the_chrome(ns):
    c, _ = read(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=text")
    assert c["mimeType"] == "text/plain"
    assert c["text"] == "What is in the pile\nGear on hand.\none\ntwo\n"
    assert "Menu" not in c["text"] and "var a" not in c["text"]
    assert tm.page_text("<p>no  main</p><p>here</p>") == "no main\nhere\n"
    c, _ = read(ns, f"{ROOT}http/tinymachines.ai/docs?as=text")
    assert c["text"] == "docs\n", "a nav inside the main is still the site's, not the page's"


def test_the_japanese_page_links_to_its_shadow(ns):
    c, links = read(ns, f"{ROOT}http/tinymachines.ai/ja/docs/nes/pile?as=text")
    assert rels(links)["tm:source"] == [f"{ROOT}fs/docs/ja/nes/pile.md"]
    assert c["text"] == "Pile\na  b\nc\n", "an article counts as the body, and a pre keeps its spaces"


def test_the_round_trip_page_to_source_to_page(ns):
    """The spec's walkthrough: no path guessed, every hop a link."""
    _, links = read(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=text")
    src = rels(links)["tm:source"][0]
    c, back = read(ns, src)
    assert "Gear on hand." in c["text"]
    assert f"{ROOT}http/tinymachines.ai/docs/nes/pile" in rels(back)["tm:renders-as"]


def test_a_site_collection_is_built_from_the_tree_and_the_crawl(ns):
    kids = json.loads(read(ns, f"{ROOT}http/tinymachines.ai/docs/nes/")[0]["text"])["children"]
    assert [c["name"] for c in kids] == ["alone", "pile"]
    top = json.loads(read(ns, f"{ROOT}http/tinymachines.ai/")[0]["text"])
    names = [c["name"] for c in top["children"]]
    assert "docs" in names and "docs/" in names and "ja/" in names
    assert top["front_page"].endswith("?as=text")
    assert {c["name"] for c in json.loads(read(ns, f"{ROOT}http/")[0]["text"])["children"]} == set(tm.SITES)


def test_http_refusals_are_structured(ns):
    e = refusal(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pil")
    assert e.reason == "not-found" and e.data["nearest"][0] == f"{ROOT}http/tinymachines.ai/docs/nes/pile"
    assert refusal(ns, f"{ROOT}http/tinymachines.ai/old").reason == "redirect"
    assert refusal(ns, f"{ROOT}http/tinymachines.ai/robots.txt?as=text").reason == "binary"
    big = refusal(ns, f"{ROOT}http/tinymachines.ai/big")
    assert big.reason == "too-large" and big.data["text"].endswith("/big?as=text")
    assert refusal(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=blame").reason == "bad-facet"
    c, _ = read(ns, f"{ROOT}http/tinymachines.ai/old?as=stat")
    assert json.loads(c["text"])["status"] == 301, "stat reports the redirect rather than following it"


# ---------------------------------------------------------------------------
# Over MCP
# ---------------------------------------------------------------------------


def test_resources_list_is_the_map_not_the_inventory(ns, monkeypatch):
    monkeypatch.setattr(tm, "RESOURCES_PAGE", 4)
    first = ns.list_resources(None)
    assert [r["name"] for r in first["resources"]] == ["root", "fs", "http", "docs/"]
    rest = ns.list_resources(first["nextCursor"])
    names = [r["name"] for r in rest["resources"]]
    assert "docs/nes/" in names and "docs/ja/nes/" in names
    assert not any(n.endswith(".md") for n in names), "leaves are reached by reading their collection"


def test_the_handler_advertises_the_namespace_and_relays_its_refusals(ns):
    handler = mcp_server.make_handler({t["name"]: (lambda _: {}) for t in mcp_server.TOOLS}, namespace=ns)
    init = run(handler({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}))["result"]
    assert init["capabilities"]["resources"] == {"subscribe": False, "listChanged": False}
    assert "completions" in init["capabilities"]
    assert "tm://tinymachines/" in init["instructions"]
    got = run(handler({"jsonrpc": "2.0", "id": 2, "method": "resources/read", "params": {"uri": f"{ROOT}fs/docs/nes/pile.md"}}))["result"]
    assert got["contents"][0]["mimeType"] == "text/markdown"
    with pytest.raises(mcp_server.RpcError) as e:
        run(handler({"jsonrpc": "2.0", "id": 3, "method": "resources/read", "params": {"uri": f"{ROOT}fs/docs/nes/pil.md"}}))
    assert e.value.code == tm.RESOURCE_NOT_FOUND and e.value.data["reason"] == "not-found"
    tmpl = run(handler({"jsonrpc": "2.0", "id": 4, "method": "resources/templates/list"}))["result"]
    assert [t["name"] for t in tmpl["resourceTemplates"]] == ["root", "fs", "http"]
    bare = mcp_server.make_handler({t["name"]: (lambda _: {}) for t in mcp_server.TOOLS})
    plain = run(bare({"jsonrpc": "2.0", "id": 5, "method": "initialize", "params": {}}))["result"]
    assert "resources" not in plain["capabilities"]
    with pytest.raises(mcp_server.RpcError) as e:
        run(bare({"jsonrpc": "2.0", "id": 6, "method": "resources/list"}))
    assert e.value.code == mcp_server.NO_METHOD
