"""tm://, slice one: the grammar, the two mounts, the refusals and the links.

Most of these run over a repository built in a temp directory, so the rules
can be exercised on files that should not exist in the real one (a secret, a
symlink out, a file over the cap). Two run over the real checkout: that the
page rule here agrees with the notebook's loader, and that the server wires
the namespace in.
"""

from __future__ import annotations

import base64
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
        ("tm://tinymachines/svn/x", f"{ROOT}fs/"),
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
    assert {m["uri"] for m in json.loads(root["text"])["mounts"]} == {f"{ROOT}fs/", f"{ROOT}git/", f"{ROOT}http/"}
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
    assert [r["name"] for r in first["resources"]] == ["root", "fs", "git", "http"]
    rest = ns.list_resources(first["nextCursor"])
    names = [r["name"] for r in rest["resources"]]
    assert names[0] == "docs/" and "docs/nes/" in names and "docs/ja/nes/" in names
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
    assert [t["name"] for t in tmpl["resourceTemplates"]] == ["root", "fs", "git", "http"]
    bare = mcp_server.make_handler({t["name"]: (lambda _: {}) for t in mcp_server.TOOLS})
    plain = run(bare({"jsonrpc": "2.0", "id": 5, "method": "initialize", "params": {}}))["result"]
    assert "resources" not in plain["capabilities"]
    with pytest.raises(mcp_server.RpcError) as e:
        run(bare({"jsonrpc": "2.0", "id": 6, "method": "resources/list"}))
    assert e.value.code == mcp_server.NO_METHOD



def test_resolve_is_the_same_read_with_the_links_in_the_body(ns):
    handler = mcp_server.make_handler({t["name"]: (lambda _: {}) for t in mcp_server.TOOLS}, namespace=ns)
    listed = run(handler({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))["result"]["tools"]
    assert [t["name"] for t in listed] == ["overview", "piece", "licensing", "resolve"]
    bare = mcp_server.make_handler({t["name"]: (lambda _: {}) for t in mcp_server.TOOLS})
    assert "resolve" not in {t["name"] for t in run(bare({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))["result"]["tools"]}

    def call(uri):
        return run(handler({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "resolve", "arguments": {"uri": uri}}}))["result"]

    got = call(f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=text")
    assert got["isError"] is False
    body = json.loads(got["content"][0]["text"])
    via_resource = run(ns.read(f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=text"))
    assert body["text"] == via_resource["contents"][0]["text"]
    assert body["links"] == via_resource["_meta"][tm.META_LINKS]
    # The round trip, through the tool alone.
    src = next(ln["href"] for ln in body["links"] if ln["rel"] == "tm:source")
    back = json.loads(call(src)["content"][0]["text"])
    assert "Gear on hand." in back["text"]
    assert f"{ROOT}http/tinymachines.ai/docs/nes/pile" in [ln["href"] for ln in back["links"] if ln["rel"] == "tm:renders-as"]
    # A refusal the model can read: isError, with the nearest URIs kept.
    bad = call(f"{ROOT}fs/docs/nes/pil.md")
    assert bad["isError"] is True
    err = json.loads(bad["content"][0]["text"])
    assert err["reason"] == "not-found" and err["nearest"][0] == f"{ROOT}fs/docs/nes/pile.md"
    # Binary comes back as a size, not a blob the model would have to carry.
    blob = json.loads(call(f"{ROOT}fs/docs/big.bin?range=0-4")["content"][0]["text"])
    assert blob["bytes"] == 4 and "blob" not in blob


# ---------------------------------------------------------------------------
# git
# ---------------------------------------------------------------------------


def git(d: Path, *args: str) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@x", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@x", "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null"}
    return subprocess.run(["git", "-C", str(d), *args], capture_output=True, text=True, check=True, env=env).stdout


@pytest.fixture
def gits(repo: Path) -> dict[str, Path]:
    """The temp checkout as a repository with two commits and a tag, and a
    sibling repository that one notebook page is pulled from. The checkout's
    pull script has one row, so the origins map has one entry."""
    (repo / "web" / "scripts").mkdir(parents=True)
    (repo / "web" / "scripts" / "pull-nesdocs.mjs").write_text(
        'const DOCS = [\n  { repo: "bench", file: "pile.md", slug: "pile", code: null, kind: "reference", title: "Pile" },\n];\n'
    )
    git(repo, "init", "-q", "-b", "main")
    git(repo, "add", "docs/index.md", "docs/nes/index.md", "docs/nes/alone.md", "notes/plan.md", "data/figures.json", "data/secret-key.json", "web")
    git(repo, "commit", "-q", "-m", "first")
    git(repo, "tag", "v1")
    (repo / "docs" / "nes" / "alone.md").write_text("---\ntitle: Alone\n---\n# Alone\n\nSecond line.\n")
    git(repo, "add", "docs/nes/alone.md")
    git(repo, "commit", "-q", "-m", "second: alone grows a line")
    bench = repo.parent / (repo.name + "-bench")   # a sibling of the checkout, as the real ones are
    (bench / "docs").mkdir(parents=True)
    (bench / "docs" / "pile.md").write_text("# Pile, at the bench\n")
    git(bench, "init", "-q", "-b", "main")
    git(bench, "add", "docs/pile.md")
    git(bench, "commit", "-q", "-m", "the pile")
    return {"public": repo, "bench": bench}


@pytest.fixture
def gns(gits: dict[str, Path]) -> Namespace:
    return Namespace(gits["public"], fetch=canned_fetch, git_repos=gits)


def test_the_git_root_lists_the_repositories_and_a_tree_lists_at_a_ref(gns):
    top = json.loads(read(gns, f"{ROOT}git/")[0]["text"])
    assert [c["name"] for c in top["children"]] == ["bench/", "public/"]
    tree, links = read(gns, f"{ROOT}git/public/docs/nes/")
    body = json.loads(tree["text"])
    assert [c["name"] for c in body["children"]] == ["alone.md", "index.md"], "pile.md is not committed, so it is not here"
    assert body["at"] == "HEAD" and len(body["commit"]) == 40
    assert rels(links)["up"] == [f"{ROOT}git/public/docs/"]
    at_tag, links = read(gns, f"{ROOT}git/public/docs/nes/?at=v1")
    assert json.loads(at_tag["text"])["commit"] != body["commit"]
    assert rels(links)["up"] == [f"{ROOT}git/public/docs/?at=v1"]
    root_listing = json.loads(read(gns, f"{ROOT}git/public/")[0]["text"])
    assert {c["name"] for c in root_listing["children"]} == {"data/", "docs/", "notes/", "web/"}


def test_a_file_at_head_and_at_a_tag_are_the_same_identity(gns):
    now, links = read(gns, f"{ROOT}git/public/docs/nes/alone.md")
    assert "Second line." in now["text"]
    then, then_links = read(gns, f"{ROOT}git/public/docs/nes/alone.md?at=v1")
    assert "Second line." not in then["text"]
    assert then["uri"] == f"{ROOT}git/public/docs/nes/alone.md?at=v1"
    r = rels(then_links)
    assert r["latest-version"] == [f"{ROOT}git/public/docs/nes/alone.md"]
    assert r["version-history"] == [f"{ROOT}git/public/docs/nes/alone.md?at=v1&as=log"]
    assert "latest-version" not in rels(links)
    assert rels(links)["tm:working-copy"] == [f"{ROOT}fs/docs/nes/alone.md"]


def test_log_blame_and_stat_are_representations_of_the_file(gns):
    log = json.loads(read(gns, f"{ROOT}git/public/docs/nes/alone.md?as=log")[0]["text"])
    assert [c["subject"] for c in log["commits"]] == ["second: alone grows a line", "first"]
    assert all(c["uri"] == f"{ROOT}git/public/docs/nes/alone.md?at={c['commit']}" for c in log["commits"])
    assert "email" not in json.dumps(log) and "t@x" not in json.dumps(log)
    one = json.loads(read(gns, f"{ROOT}git/public/docs/nes/alone.md?as=log&n=1")[0]["text"])
    assert len(one["commits"]) == 1
    blame, _ = read(gns, f"{ROOT}git/public/docs/nes/alone.md?as=blame")
    assert blame["mimeType"] == "text/plain"
    lines = blame["text"].splitlines()
    assert any("Second line." in ln and log["commits"][0]["commit"] in ln for ln in lines)
    assert any("# Alone" in ln and log["commits"][1]["commit"] in ln for ln in lines)
    stat = json.loads(read(gns, f"{ROOT}git/public/docs/nes/alone.md?as=stat")[0]["text"])
    assert stat["type"] == "blob" and stat["size"] > 0 and stat["commit"] == log["commits"][0]["commit"]
    assert refusal(gns, f"{ROOT}git/public/docs/nes/alone.md?as=diff").reason == "bad-facet"
    assert refusal(gns, f"{ROOT}git/public/docs/nes/alone.md?as=log&n=x").reason == "bad-facet"


def test_git_refusals_teach(gns):
    e = refusal(gns, f"{ROOT}git/public/docs/nes/alon.md")
    assert e.reason == "not-found" and e.data["nearest"][0] == f"{ROOT}git/public/docs/nes/alone.md"
    e = refusal(gns, f"{ROOT}git/public/docs/index.md?at=v2")
    assert e.reason == "no-such-ref" and e.data["nearest"] == [f"{ROOT}git/public/?at=v1"]
    for at in ("--output=/tmp/x", "-n", "a..b", "v1 main"):
        assert refusal(gns, f"{ROOT}git/public/docs/index.md?at={at}").reason == "bad-facet", at
    assert refusal(gns, f"{ROOT}git/public/../bench/docs/pile.md").reason == "out-of-root"
    assert refusal(gns, f"{ROOT}git/public/docs/%2e%2e/%2e%2e/etc/passwd").reason == "out-of-root"
    e = refusal(gns, f"{ROOT}git/nope/")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{ROOT}git/bench/", f"{ROOT}git/public/"]
    e = refusal(gns, f"{ROOT}git/public/docs/nes")
    assert e.data["nearest"] == [f"{ROOT}git/public/docs/nes/"]
    bare = json.loads(read(gns, f"{ROOT}git/public")[0]["text"])
    assert bare["uri"] == f"{ROOT}git/public/" and bare["children"], "a repository's root is its tree, slash or no slash"
    assert refusal(gns, f"{ROOT}git/public/data/secret-key.json").reason == "denied"
    kids = {c["name"]: c for c in json.loads(read(gns, f"{ROOT}git/public/data/")[0]["text"])["children"]}
    assert kids["secret-key.json"]["redacted"] is True


def test_a_pulled_page_links_to_the_repository_it_came_from(gns):
    """The spec's build manifest, read from the pull script: the pulled copy,
    its page and the origin file are joined in every direction."""
    assert gns.origins.by_fs == {"docs/nes/pile.md": ("bench", "docs/pile.md")}
    _, links = read(gns, f"{ROOT}fs/docs/nes/pile.md")
    r = rels(links)
    assert r["tm:generated-by"] == [f"{ROOT}git/bench/docs/pile.md"]
    assert r["version-history"] == [f"{ROOT}git/bench/docs/pile.md?as=log"]
    assert "tm:repository" not in r, "a pulled copy is not in this repository"
    _, links = read(gns, f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=text")
    assert rels(links)["tm:generated-by"] == [f"{ROOT}git/bench/docs/pile.md"]
    origin, links = read(gns, f"{ROOT}git/bench/docs/pile.md")
    assert "at the bench" in origin["text"]
    r = rels(links)
    # The copy here and the pages made from it, each naming the origin back.
    assert r["tm:generates"] == [f"{ROOT}fs/docs/nes/pile.md"] + [f"{ROOT}http/{s}/docs/nes/pile" for s in tm.SITES]
    assert "tm:renders-as" not in r, "the origin generates the page; the page's source is the copy"
    # And a file of this repository that is not pulled links to itself in git.
    _, links = read(gns, f"{ROOT}fs/docs/nes/alone.md")
    r = rels(links)
    assert r["tm:repository"] == [f"{ROOT}git/public/docs/nes/alone.md"]
    assert "tm:generated-by" not in r


def test_the_real_pull_scripts_name_repositories_this_server_has():
    """Over the real checkout: every origin row names a repository the git
    mount offers, so no tm:generated-by link points at a mount that is not
    there. Skipped where the siblings are not checked out."""
    n = Namespace(REPO, fetch=canned_fetch)
    assert len(n.origins.by_fs) > 50, "the pull scripts parsed to too few rows to mean anything"
    assert n.origins.by_fs["docs/nes/pile.md"] == ("nes-bench", "docs/pile.md")
    assert n.origins.by_fs["docs/6502/atlas.md"] == ("6502", "docs/atlas.md")
    missing = {r for r, _ in n.origins.by_fs.values()} - set(n.git)
    if missing:
        pytest.skip(f"siblings not checked out here: {sorted(missing)}")


def test_git_completion_offers_refs_and_tree_paths(gns):
    def complete(name, value, **ctx):
        p = {"ref": {"type": "ref/resource", "uri": f"{ROOT}git/{{repo}}{{/path*}}{{?at,as,n}}"}, "argument": {"name": name, "value": value}}
        if ctx:
            p["context"] = {"arguments": ctx}
        return gns.complete(p)["completion"]["values"]

    assert complete("repo", "") == ["bench", "public"]
    assert complete("at", "", repo="public") == ["HEAD", "main", "v1"]
    assert complete("at", "v", repo="public") == ["v1"]
    assert complete("path", "docs/n", repo="public") == ["docs/nes/"]
    assert complete("path", "docs/nes/", repo="public", at="v1") == ["docs/nes/alone.md", "docs/nes/index.md"]
    assert complete("path", "x", repo="nope") == []
    assert complete("as", "b") == ["blame"]


# ---------------------------------------------------------------------------
# Data: what a page reads, what writes a record
# ---------------------------------------------------------------------------


@pytest.fixture
def site(gits: dict[str, Path]) -> Namespace:
    """The temp checkout grows an app: a literal route that imports a library
    module that names a record, a dynamic route, a catch-all; a record whose
    note names its writer, another whose writer is only inferred, and a
    language file that every page reads and no link should mention."""
    repo = gits["public"]
    app = repo / "web" / "app" / "[lang]"
    (app / "autopsy" / "patterns").mkdir(parents=True)
    (app / "autopsy" / "games" / "[game]").mkdir(parents=True)
    (app / "docs" / "[[...slug]]").mkdir(parents=True)
    (app / "autopsy" / "patterns" / "page.tsx").write_text(
        'import { t } from "@/lib/i18n";\nimport { autopsy } from "@/lib/autopsy";\nimport { Shell } from "@/app/components/SiteFrame";\nexport default function Page() { return null; }\n'
    )
    (app / "autopsy" / "games" / "[game]" / "page.tsx").write_text('import { autopsy } from "@/lib/autopsy";\n')
    (app / "docs" / "[[...slug]]" / "page.tsx").write_text('import { docsTree } from "../../../../lib/docs";\n')
    lib = repo / "web" / "lib"
    lib.mkdir()
    (lib / "autopsy.ts").write_text('import { figures } from "./figures";\nconst FILE = path.join(ROOT, "data", "autopsy.json");\n')
    (lib / "figures.ts").write_text('const CHIP = path.join(ROOT, "data", "chip.json");\n')
    (lib / "i18n.ts").write_text('const JA = path.join(ROOT, "data", "ja.json");\n')
    (lib / "docs.ts").write_text('export function docsTree() {}\n')
    (repo / "web" / "app" / "components").mkdir()
    (repo / "web" / "app" / "components" / "SiteFrame.tsx").write_text('import { nav } from "@/lib/nav";\n')
    (lib / "nav.ts").write_text('import { autopsy } from "./autopsy";\nconst DOORS = path.join(ROOT, "data", "doors.json");\n')
    (repo / "data" / "autopsy.json").write_text('{"_": "written only by scripts/board-autopsy.py", "marks": 1}\n')
    (repo / "data" / "chip.json").write_text('{"nodes": 1}\n')
    (repo / "data" / "ja.json").write_text('{}\n')
    (repo / "data" / "doors.json").write_text('{}\n')
    (repo / "scripts").mkdir()
    (repo / "scripts" / "board-autopsy.py").write_text('OUT = "data/autopsy.json"\n')
    (repo / "scripts" / "verify-chip.py").write_text('# reads chip.json and compares\n')
    (repo / "scripts" / "check-figures.py").write_text('# chip.json, a checker, not a writer\n')
    (repo / "scripts" / "deploy.sh").write_text('# mentions chip.json and autopsy.json\n')
    git(repo, "add", "web", "data", "scripts")
    git(repo, "commit", "-q", "-m", "an app")
    return Namespace(repo, fetch=canned_fetch, git_repos=gits)


def test_a_page_links_to_its_route_and_the_records_its_rendering_reaches(site):
    _, links = read(site, f"{ROOT}http/tinymachines.ai/autopsy/patterns?as=stat")
    r = rels(links)
    assert r["tm:source"] == [f"{ROOT}git/public/web/app/%5Blang%5D/autopsy/patterns/page.tsx"]
    assert r["tm:data"] == [f"{ROOT}fs/data/autopsy.json", f"{ROOT}fs/data/chip.json"], "through the library, transitively"
    conf = {ln["href"].rsplit("/", 1)[1]: ln["confidence"] for ln in links if ln["rel"] == "tm:data"}
    assert conf == {"autopsy.json": "exact", "chip.json": "inferred"}, "the page imports the record's reader; the chip record is a module further on"
    assert f"{ROOT}fs/data/ja.json" not in r["tm:data"], "the language file is every page's, not this one's"
    assert f"{ROOT}fs/data/doors.json" not in r["tm:data"], "the site frame's menu is not the page's reading"
    _, ja = read(site, f"{ROOT}http/tinymachines.ai/ja/autopsy/patterns?as=stat")
    assert rels(ja)["tm:source"] == r["tm:source"], "/ja is the language prefix, the same route"


def test_a_dynamic_route_is_a_source_too_and_the_docs_route_is_a_template(site):
    _, links = read(site, f"{ROOT}http/tinymachines.ai/autopsy/games/smb?as=stat")
    src = [ln for ln in links if ln["rel"] == "tm:source"]
    assert src[0]["href"].endswith("/autopsy/games/%5Bgame%5D/page.tsx") and "several" in src[0]["title"]
    _, links = read(site, f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=text")
    hrefs = rels(links)["tm:source"]
    assert f"{ROOT}fs/docs/nes/pile.md" in hrefs, "the markdown stays the source"
    assert any(h.endswith("/docs/%5B%5B...slug%5D%5D/page.tsx") for h in hrefs), "and the route is the template"
    assert site.graph.route_for("/nothing/here") is None, "no catch-all at the root here, so no route"


def test_a_record_links_to_its_writer_and_its_readers(site):
    _, links = read(site, f"{ROOT}fs/data/autopsy.json")
    r = rels(links)
    assert r["tm:generated-by"] == [f"{ROOT}git/public/scripts/board-autopsy.py"]
    assert [ln["confidence"] for ln in links if ln["rel"] == "tm:generated-by"] == ["exact"], "the record's own note names it"
    assert r["tm:read-by"] == sorted(f"{ROOT}http/{x}{p}" for x in tm.SITES for p in ("/autopsy/patterns", "/ja/autopsy/patterns")), \
        "every page that names it back, both languages and both sites; no build here, so the dynamic route's pages are unknown"
    _, links = read(site, f"{ROOT}fs/data/chip.json")
    gen = [ln for ln in links if ln["rel"] == "tm:generated-by"]
    assert [ln["href"] for ln in gen] == [f"{ROOT}git/public/scripts/verify-chip.py"], "deploy.sh and check-* are not writers"
    assert gen[0]["confidence"] == "inferred"
    _, in_git = read(site, f"{ROOT}git/public/data/autopsy.json")
    # The record in git defers to its working copy, which carries the
    # writer: a script's tm:generates names the working copy, so the inverse
    # holds in one place.
    assert rels(in_git)["tm:working-copy"] == [f"{ROOT}fs/data/autopsy.json"]
    assert "tm:generated-by" not in rels(in_git)


def test_a_script_and_a_route_link_forward(site):
    _, links = read(site, f"{ROOT}git/public/scripts/board-autopsy.py")
    assert rels(links)["tm:generates"] == [f"{ROOT}fs/data/autopsy.json"]
    _, links = read(site, f"{ROOT}git/public/web/app/[lang]/autopsy/patterns/page.tsx")
    assert sorted(rels(links)["tm:renders-as"]) == sorted(f"{ROOT}http/{s}{p}" for p in ("/autopsy/patterns", "/ja/autopsy/patterns") for s in tm.SITES)
    _, links = read(site, f"{ROOT}git/public/web/app/[lang]/autopsy/games/[game]/page.tsx")
    assert "tm:renders-as" not in rels(links), "a dynamic route renders many pages; none is named"


def test_the_real_site_graph_joins_the_autopsy_page_to_its_record():
    """Over the real checkout: the patterns page reaches data/autopsy.json
    through lib/autopsy.ts, and the engine record names its writer."""
    n = Namespace(REPO, fetch=canned_fetch)
    assert len(n.graph.routes) > 30, "too few routes read to mean anything"
    route = n.graph.route_for("/autopsy/patterns")
    assert route == ("web/app/[lang]/autopsy/patterns/page.tsx", False)
    reads = n.graph.page_reads(route[0])
    assert reads["autopsy.json"][0] == "exact" and reads["lessons.json"][0] == "exact"
    assert "ja.json" not in reads
    # TM-8 on the real tree: the menu's records are not every page's.
    for page in ("/admin", "/6502/reading"):
        got = n.graph.page_reads(n.graph.route_for(page)[0])
        assert not {"pieces.json", "projects.json"} & set(got), (page, got)
    # The patterns page imports lib/projects.ts itself (its surface), so that
    # one is its own reading; the menu's pieces are still not.
    assert "pieces.json" not in reads and reads["projects.json"] == ("exact", "web/lib/projects.ts")
    assert "autopsy.json" not in n.graph.page_reads(n.graph.route_for("/6502/reading")[0])
    assert "slowppu.json" in n.graph.page_reads(n.graph.route_for("/nes/playground")[0]), "a file beside the page reads it"
    assert ("scripts/board-engine.py", "exact") in n.graph.writers_of("engine.json")
    assert "/autopsy/patterns" in [p for _, p, _ in n.readers("autopsy.json")]
    assert n.graph.route_for("/docs/nes/pile") == ("web/app/[lang]/docs/[[...slug]]/page.tsx", True)


# ---------------------------------------------------------------------------
# The work package of 2026-10-07: TM-1, TM-2, TM-3, TM-6, TM-10
# ---------------------------------------------------------------------------


def test_tm1_sources_and_extensionless_text_read_as_text(site):
    repo = site.repo
    (repo / "lessons" / "jump").mkdir(parents=True)
    (repo / "lessons" / "jump" / "prg.s").write_text("reset:\n    SEI\n")
    (repo / "lessons" / "jump" / "lesson.json").write_text('{"kind": "jump"}\n')
    (repo / "LICENSE").write_text("MIT\n")
    (repo / "notes" / "odd.zzz").write_text("plain words\n")
    (repo / "notes" / "rom.zzz").write_bytes(b"NES\x1a\x00\x01\x02")
    git(repo, "add", "-f", "lessons", "LICENSE", "notes/odd.zzz", "notes/rom.zzz")
    git(repo, "commit", "-q", "-m", "sources")
    for uri, mime in [(f"{ROOT}git/public/lessons/jump/prg.s", "text/x-asm"), (f"{ROOT}git/public/LICENSE", "text/plain"),
                      (f"{ROOT}git/public/notes/odd.zzz", "text/plain"), (f"{ROOT}fs/notes/odd.zzz", "text/plain")]:
        c, _ = read(site, uri)
        assert c["mimeType"] == mime and "text" in c, uri
    assert read(site, f"{ROOT}git/public/notes/rom.zzz")[0]["mimeType"] == "application/octet-stream"
    # The listing says what the read will.
    kids = {k["name"]: k for k in json.loads(read(site, f"{ROOT}git/public/notes/")[0]["text"])["children"]}
    assert kids["odd.zzz"]["mimeType"] == "text/plain" and kids["rom.zzz"]["mimeType"] == "application/octet-stream"


def test_tm2_resolve_returns_the_bytes_on_as_raw(site):
    (site.repo / "notes" / "rom.zzz").write_bytes(b"NES\x1a\x00\x01\x02")
    plain = run(site.resolve({"uri": f"{ROOT}fs/notes/rom.zzz"}))
    assert "blob" not in plain and "?as=raw" in plain["note"]
    raw = run(site.resolve({"uri": f"{ROOT}fs/notes/rom.zzz?as=raw"}))
    assert base64.b64decode(raw["blob"]) == b"NES\x1a\x00\x01\x02" and raw["encoding"] == "base64"


@pytest.fixture
def built(site):
    """A build's prerender manifest and two pages' HTML, as Next writes them."""
    nx = site.repo / "web" / ".next"
    (nx / "server" / "app" / "en" / "autopsy" / "games").mkdir(parents=True)
    routes = {
        "/en": {"srcRoute": "/[lang]"}, "/ja": {"srcRoute": "/[lang]"},
        "/en/autopsy": {"srcRoute": "/[lang]/autopsy"},
        "/en/autopsy/games/abc": {"srcRoute": "/[lang]/autopsy/games/[game]"},
        "/en/autopsy/games/def": {"srcRoute": "/[lang]/autopsy/games/[game]"},
        "/en/autopsy/lessons/jump": {"srcRoute": "/[lang]/autopsy/lessons/[lesson]"},
        "/ja/autopsy/lessons/jump": {"srcRoute": "/[lang]/autopsy/lessons/[lesson]"},
        "/autopsy/lessons/jump.nes": {"srcRoute": "/autopsy/lessons/[file]", "routeType": "route"},
    }
    (nx / "prerender-manifest.json").write_text(json.dumps({"routes": routes}))
    (nx / "server" / "app" / "en" / "autopsy" / "games" / "abc.html").write_text("<html><title>Metroid · tinymachines</title></html>")
    return site


def test_tm3_listings_come_from_the_build_with_titles(built):
    top = {c["name"] for c in json.loads(read(built, f"{ROOT}http/tinymachines.ai/")[0]["text"])["children"]}
    assert {"autopsy", "autopsy/"} <= top
    games = json.loads(read(built, f"{ROOT}http/tinymachines.ai/autopsy/games/")[0]["text"])["children"]
    assert [g["name"] for g in games] == ["abc", "def"]
    assert games[0]["title"] == "Metroid" and "title" not in games[1]
    assert built.built("tinymachines.ai")["/autopsy/games/abc"] == "web/app/[lang]/autopsy/games/[game]/page.tsx"
    # A route renders every page the build made from it, the dynamic ones too.
    assert built.pages_of_route("tinymachines.ai", "web/app/[lang]/autopsy/games/[game]/page.tsx") == ["/autopsy/games/abc", "/autopsy/games/def"]


def test_tm6_a_lesson_page_and_its_cartridge_source_are_one_link_apart_both_ways(built):
    repo = built.repo
    (repo / "lessons" / "jump").mkdir(parents=True, exist_ok=True)
    (repo / "lessons" / "jump" / "prg.s").write_text("reset:\n")
    (repo / "lessons" / "jump" / "lesson.json").write_text('{"kind": "jump"}\n')
    git(repo, "add", "-f", "lessons")
    git(repo, "commit", "-q", "-m", "a lesson")
    _, links = read(built, f"{ROOT}http/tinymachines.ai/autopsy/lessons/jump?as=stat")
    src = rels(links)["tm:source"]
    assert f"{ROOT}git/public/lessons/jump/" in src and f"{ROOT}git/public/lessons/jump/prg.s" in src
    for back in (f"{ROOT}git/public/lessons/jump/prg.s", f"{ROOT}git/public/lessons/jump/"):
        _, bl = read(built, back)
        assert f"{ROOT}http/tinymachines.ai/autopsy/lessons/jump" in rels(bl)["tm:renders-as"], back


def test_tm10_no_mount_root_goes_up_to_itself(ns):
    for uri in (f"{ROOT}fs/", f"{ROOT}http/", f"{ROOT}http/tinymachines.ai/"):
        _, links = read(ns, uri)
        assert rels(links)["up"] != [uri], uri
    assert rels(read(ns, f"{ROOT}fs/")[1])["up"] == [ROOT]


def test_a_file_claims_no_page_a_built_site_does_not_serve(built):
    # A notebook page added since the site was built: the file names the page
    # it becomes only where no build says otherwise, so the build that has not
    # caught up (the beta, between a deploy and its follow) is not promised it.
    (built.repo / "docs" / "nes").mkdir(parents=True, exist_ok=True)
    (built.repo / "docs" / "nes" / "scope.md").write_text("# A scope\n")
    _, links = read(built, f"{ROOT}fs/docs/nes/scope.md?as=stat")
    pages = rels(links).get("tm:renders-as", [])
    assert pages, "the file names no page at all"
    assert not [p for p in pages if p.startswith(f"{ROOT}http/tinymachines.ai/")], pages
    assert built.serves("tinymachines.ai", "/autopsy") and not built.serves("tinymachines.ai", "/docs/nes/scope")


def test_tm8_a_page_reads_what_its_own_code_reads_not_what_the_frame_reads(site):
    repo = site.repo
    lib = repo / "web" / "lib"
    pat = repo / "web" / "app" / "[lang]" / "autopsy" / "patterns"
    # The frame's metadata reads the projects; a page that imports the same
    # metadata helper is not reading them.
    (lib / "seo.ts").write_text('import { surface } from "./projects";\n')
    (lib / "projects.ts").write_text('// the surfaces; pieces.json belongs to api/pieces.py\nconst FILE = path.join(ROOT, "data", "projects.json");\n')
    (repo / "web" / "app" / "components" / "SiteFrame.tsx").write_text('import { nav } from "@/lib/nav";\nimport { abs } from "@/lib/seo";\n')
    (pat / "page.tsx").write_text(
        'import { autopsy } from "@/lib/autopsy";\nimport { abs } from "@/lib/seo";\nimport { Words } from "./words";\n'
        '// the old note named data/doors.json here\nexport default function Page() { return null; }\n'
    )
    (pat / "words.tsx").write_text('const L = path.join(ROOT, "data", "lessons.json");\n')
    for name in ("projects.json", "pieces.json", "lessons.json"):
        (repo / "data" / name).write_text("{}\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "a frame")
    n = site
    n.graph = tm.SiteGraph(repo)
    reads = n.graph.page_reads("web/app/[lang]/autopsy/patterns/page.tsx")
    assert {k: v[0] for k, v in reads.items()} == {"autopsy.json": "exact", "chip.json": "inferred", "lessons.json": "exact"}, reads
    _, links = read(n, f"{ROOT}fs/data/projects.json?as=stat")
    assert "tm:read-by" not in rels(links), "the frame's reading is nobody's page data"


def test_tm14_every_read_by_is_answered_by_a_data_link_and_back(built):
    """With a build: the dynamic route's pages are named, and a page whose
    bundle does not ship a reader module claims nothing from it."""
    nx = built.repo / "web" / ".next"
    gp = nx / "server" / "app" / "[lang]" / "autopsy" / "games" / "[game]"
    gp.mkdir(parents=True)
    (gp / "page.js").write_text('var R=require("x")\nR.c("server/chunks/ssr/a.js")\n')
    (nx / "server" / "chunks" / "ssr").mkdir(parents=True)
    (nx / "server" / "chunks" / "ssr" / "a.js.map").write_text(json.dumps({"version": 3, "sources": ["../../../../../web/lib/i18n.ts"]}))
    _, links = read(built, f"{ROOT}fs/data/autopsy.json?as=stat")
    by = rels(links)["tm:read-by"]
    assert f"{ROOT}http/tinymachines.ai/autopsy/games/abc" not in by, "its bundle does not ship lib/autopsy.ts"
    (nx / "server" / "chunks" / "ssr" / "a.js.map").write_text(json.dumps({"version": 3, "sources": ["../../../../../web/lib/%61utopsy.ts"]}))
    built.__dict__.pop("_shipped", None)
    _, links = read(built, f"{ROOT}fs/data/autopsy.json?as=stat")
    by = rels(links)["tm:read-by"]
    assert f"{ROOT}http/tinymachines.ai/autopsy/games/abc" in by and f"{ROOT}http/tinymachines.ai/autopsy/games/def" in by
    for href in by:
        _, back = read(built, href + "?as=stat")
        mine = [ln for ln in back if ln["rel"] == "tm:data" and ln["href"] == f"{ROOT}fs/data/autopsy.json"]
        theirs = [ln for ln in links if ln["rel"] == "tm:read-by" and ln["href"] == href]
        assert mine and mine[0]["confidence"] == theirs[0]["confidence"], href


def test_tm14_the_beta_bundle_is_read_against_the_beta_tree(built):
    # The beta's build is in its own worktree, and its source maps name that
    # tree's files: read against this checkout, every module would be
    # missing and the beta would claim no data at all.
    bx = built.repo.parent / "public-beta" / "web" / ".next"
    gp = bx / "server" / "app" / "[lang]" / "autopsy" / "games" / "[game]"
    gp.mkdir(parents=True)
    (bx / "prerender-manifest.json").write_text(json.dumps({"routes": {"/en/autopsy/games/abc": {"srcRoute": "/[lang]/autopsy/games/[game]"}}}))
    (gp / "page.js").write_text('R.c("server/chunks/ssr/a.js")\n')
    (bx / "server" / "chunks" / "ssr").mkdir(parents=True)
    (bx / "server" / "chunks" / "ssr" / "a.js.map").write_text(json.dumps({"version": 3, "sources": ["../../../../../web/lib/autopsy.ts"]}))
    assert built.page_reads("beta.tinymachines.ai", "web/app/[lang]/autopsy/games/[game]/page.tsx") == {"autopsy.json": "exact"}
