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
    assert {m["uri"] for m in json.loads(root["text"])["mounts"]} == {f"{ROOT}fs/", f"{ROOT}git/", f"{ROOT}http/", f"{ROOT}offbox/", f"{ROOT}entity/"}
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
    assert r["tm:renders-as"] == sorted(f"{ROOT}http/{s}/docs/nes/pile" for s in tm.SITES), "by href, the order every link set comes in"
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
    assert complete(fs_t, "as", "") == ["raw", "stat", "links"]
    assert complete(http_t, "path", "/docs/nes/p", site="tinymachines.ai") == ["/docs/nes/pile"]
    assert complete(http_t, "path", "/docs/n", site="tinymachines.ai") == ["/docs/nes", "/docs/nes/"]
    with pytest.raises(TmError):
        complete(fs_t, "nope", "")


# ---------------------------------------------------------------------------
# http
# ---------------------------------------------------------------------------


def test_a_page_reads_as_what_the_visitor_gets_and_links_to_its_source(ns):
    c, links = read(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=rendered")
    assert c["mimeType"] == "text/html" and "<nav>" in c["text"]
    r = rels(links)
    assert r["tm:source"] == [f"{ROOT}fs/docs/nes/pile.md"]
    facets = [h for h in r["alternate"] if "?as=" in h]
    assert facets == [f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=rendered"], "the page itself is its text; the HTML is the alternate"
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
    big = refusal(ns, f"{ROOT}http/tinymachines.ai/big?as=rendered")
    assert big.reason == "too-large" and big.data["text"].endswith("/big?as=text")
    assert refusal(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=blame").reason == "bad-facet"
    c, _ = read(ns, f"{ROOT}http/tinymachines.ai/old?as=stat")
    assert json.loads(c["text"])["status"] == 301, "stat reports the redirect rather than following it"


# ---------------------------------------------------------------------------
# Over MCP
# ---------------------------------------------------------------------------


def test_resources_list_is_the_map_not_the_inventory(ns, monkeypatch):
    monkeypatch.setattr(tm, "RESOURCES_PAGE", 6)
    first = ns.list_resources(None)
    assert [r["name"] for r in first["resources"]] == ["root", "fs", "git", "http", "offbox", "entity"]
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
    assert [t["name"] for t in tmpl["resourceTemplates"]] == ["root", "fs", "git", "http", "offbox", "entity", "routine"]
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
    assert e.reason == "no-such-ref" and e.data["nearest"][0] == f"{ROOT}git/public/?at=v1"
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
    assert r["tm:generates"] == sorted([f"{ROOT}fs/docs/nes/pile.md"] + [f"{ROOT}http/{s}/docs/nes/pile" for s in tm.SITES])
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
    assert r["tm:read-by"] == [f"{ROOT}entity/game/", f"{ROOT}entity/pattern/", f"{ROOT}http/{tm.SITES[0]}/autopsy/patterns"], \
        "one link a route: the English page on the canonical site; no build here, so the dynamic route's pages are unknown. And one for each kind of entity read from it (TM-16)"
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
    readers = dict(n.readers("autopsy.json"))
    assert readers.get("/autopsy/patterns") == "exact" and "/autopsy/games/" in readers, readers
    assert len(readers) <= 10, "TM-18: about ten, one a route"
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
    by = rels(links).get("tm:read-by", [])
    assert f"{ROOT}http/tinymachines.ai/autopsy/games/" not in by, "its bundle does not ship lib/autopsy.ts"
    (nx / "server" / "chunks" / "ssr" / "a.js.map").write_text(json.dumps({"version": 3, "sources": ["../../../../../web/lib/%61utopsy.ts"]}))
    built.__dict__.pop("_shipped", None)
    _, links = read(built, f"{ROOT}fs/data/autopsy.json?as=stat")
    by = rels(links)["tm:read-by"]
    assert f"{ROOT}http/tinymachines.ai/autopsy/games/" in by, "the dynamic route's pages, as the collection that lists them"
    for href in by:
        _, back = read(built, href if href.endswith("/") else href + "?as=stat")
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


def test_tm4_a_page_with_no_facet_reads_as_its_text(ns):
    plain, _ = read(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile")
    text, _ = read(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pile?as=text")
    assert plain["text"] == text["text"] == "What is in the pile\nGear on hand.\none\ntwo\n"
    assert plain["mimeType"] == "text/plain"
    assert plain["uri"] == f"{ROOT}http/tinymachines.ai/docs/nes/pile", "the identity answers for itself"
    # Something that is not a page reads as itself, not as a refusal.
    robots, _ = read(ns, f"{ROOT}http/tinymachines.ai/robots.txt")
    assert robots["text"] == "User-agent: *\n" and robots["mimeType"] == "text/plain"


def test_tm5_a_wrong_guess_teaches_the_right_one(ns, gns):
    # A typo is ranked by how close it is, not by the alphabet.
    e = refusal(ns, f"{ROOT}fs/docs/nes/pyle.md")
    assert e.data["nearest"][0] == f"{ROOT}fs/docs/nes/pile.md", e.data["nearest"]
    # A missing directory answers from the nearest one that exists.
    e = refusal(ns, f"{ROOT}fs/docs/nse/pile.md")
    assert e.data["nearest"][0] == f"{ROOT}fs/docs/nes/", e.data["nearest"]
    e = refusal(gns, f"{ROOT}git/public/docs/nse/pile.md")
    assert e.data["nearest"][0] == f"{ROOT}git/public/docs/nes/", e.data["nearest"]
    e = refusal(gns, f"{ROOT}git/public/docs/nes/ndex.md")
    assert e.data["nearest"][0] == f"{ROOT}git/public/docs/nes/index.md", e.data["nearest"]
    # A ref that shares no letter with a real one still lists the real ones.
    e = refusal(gns, f"{ROOT}git/public/docs/index.md?at=does-not-exist")
    assert e.reason == "no-such-ref" and f"{ROOT}git/public/?at=v1" in e.data["nearest"] and f"{ROOT}git/public/?at=HEAD" in e.data["nearest"]
    e = refusal(ns, f"{ROOT}http/tinymachines.ai/docs/nes/pyle")
    assert e.data["nearest"][0] == f"{ROOT}http/tinymachines.ai/docs/nes/pile", e.data["nearest"]
    assert tm.closest("pyle.md", ["a0-report.md", "pile.md", "alone.md"])[0] == "pile.md"


def test_tm18_a_record_names_each_route_that_reads_it_once(built):
    """One tm:read-by a route, on the canonical site in English: a literal
    route by its page, a dynamic one by the collection its pages are listed
    in, which carries the tm:data back. Every page that reads the record is
    one hop from one of them."""
    _, links = read(built, f"{ROOT}fs/data/autopsy.json?as=stat")
    by = rels(links)["tm:read-by"]
    assert by == [f"{ROOT}entity/game/", f"{ROOT}entity/pattern/", f"{ROOT}http/tinymachines.ai/autopsy/games/"], by
    _, coll = read(built, f"{ROOT}http/tinymachines.ai/autopsy/games/")
    assert f"{ROOT}fs/data/autopsy.json" in rels(coll)["tm:data"], "the collection answers for the pages it lists"
    kids = json.loads(read(built, f"{ROOT}http/tinymachines.ai/autopsy/games/")[0]["text"])["children"]
    assert {k["name"] for k in kids} >= {"abc", "def"}, "and every reading page is listed there"
    # Any page that reads it, on any site and in either language, stands
    # for itself through that one link.
    for page in ("http/tinymachines.ai/autopsy/games/abc", "http/beta.tinymachines.ai/autopsy/games/def", "http/tinymachines.ai/ja/autopsy/games/abc"):
        assert built.reader_uri(f"{ROOT}{page}") == f"{ROOT}http/tinymachines.ai/autopsy/games/", page
    assert built.reader_uri(f"{ROOT}http/beta.tinymachines.ai/ja/autopsy/lessons/jump") is None, "no route here renders it, so nothing stands for it"


def test_tm18_a_dynamic_route_at_the_root_names_its_pages(built):
    # /watch, /read and /build share only the root, and the root collection
    # is the front page too: the record names those pages one by one.
    repo = built.repo
    door = repo / "web" / "app" / "[lang]" / "[door]"
    door.mkdir(parents=True)
    (door / "page.tsx").write_text('import { autopsy } from "@/lib/autopsy";\n')
    nx = repo / "web" / ".next"
    m = json.loads((nx / "prerender-manifest.json").read_text())
    for d in ("read", "watch"):
        for lang in ("en", "ja"):
            m["routes"][f"/{lang}/{d}"] = {"srcRoute": "/[lang]/[door]"}
    (nx / "prerender-manifest.json").write_text(json.dumps(m))
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "doors")
    built.graph = tm.SiteGraph(repo)
    built._built.clear()
    by = rels(read(built, f"{ROOT}fs/data/autopsy.json?as=stat")[1])["tm:read-by"]
    assert f"{ROOT}http/tinymachines.ai/read" in by and f"{ROOT}http/tinymachines.ai/watch" in by, by
    assert f"{ROOT}http/tinymachines.ai/" not in by, "not the root, which is the front page"
    assert built.reader_uri(f"{ROOT}http/beta.tinymachines.ai/ja/watch") == f"{ROOT}http/tinymachines.ai/watch"


def test_tm7_the_build_chain_is_walkable_and_says_where_it_leaves_the_box(gns):
    repo = gns.repo
    (repo / "data" / "autopsy.json").write_text('{"note": "Written only by scripts/board-autopsy.py from the models tools/autopsy.py wrote."}\n')
    (repo / "scripts").mkdir(exist_ok=True)
    (repo / "scripts" / "board-autopsy.py").write_text('OUT = "data/autopsy.json"\n')
    (repo / "tools").mkdir(exist_ok=True)
    (repo / "tools" / "autopsy.py").write_text("# writes model.json\n")
    (repo / "api").mkdir(exist_ok=True)
    (repo / "api" / "lineage.json").write_text(json.dumps({"offbox": {
        "models": {"what": "each game's model", "why": "kept with the cartridges", "generated_by": ["tools/autopsy.py"], "input_of": ["scripts/board-autopsy.py"]},
        "carts": {"what": "the dumps", "why": "commercial ROMs", "input_of": ["tools/autopsy.py"]},
    }}))
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "a chain")
    n = Namespace(repo, fetch=canned_fetch, git_repos=dict(gns.git))
    # The record's own note names its writer, so the link is exact, under
    # either key a record keeps its note in.
    _, links = read(n, f"{ROOT}fs/data/autopsy.json?as=stat")
    gen = [ln for ln in links if ln["rel"] == "tm:generated-by"]
    assert [(ln["href"], ln["confidence"]) for ln in gen] == [(f"{ROOT}git/public/scripts/board-autopsy.py", "exact")]
    # The writer reads something no repository holds; the chain says so.
    _, links = read(n, f"{ROOT}git/public/scripts/board-autopsy.py")
    assert rels(links)["tm:input"] == [f"{ROOT}offbox/models"]
    c, links = read(n, f"{ROOT}offbox/models")
    body = json.loads(c["text"])
    assert body["exposed"] is False and body["reason"] == "not-exposed" and body["what"] and body["why"]
    assert rels(links)["tm:generated-by"] == [f"{ROOT}git/public/tools/autopsy.py"]
    assert rels(links)["tm:input-of"] == [f"{ROOT}git/public/scripts/board-autopsy.py"]
    assert all(ln["confidence"] == "exact" for ln in links if ln["rel"].startswith("tm:"))
    _, links = read(n, f"{ROOT}git/public/tools/autopsy.py")
    assert rels(links)["tm:generates"] == [f"{ROOT}offbox/models"] and rels(links)["tm:input"] == [f"{ROOT}offbox/carts"]
    kids = json.loads(read(n, f"{ROOT}offbox/")[0]["text"])["children"]
    assert [k["name"] for k in kids] == ["carts", "models"]
    assert f"{ROOT}offbox/" in [m["uri"] for m in json.loads(read(n, ROOT)[0]["text"])["mounts"]]
    assert refusal(n, f"{ROOT}offbox/nothing").reason == "not-found"


def test_tm7_the_lineage_manifest_names_what_is_there():
    """Over the real checkout: every path the manifest names is tracked at
    HEAD, so the chain cannot point at a script that has gone."""
    m = json.loads((REPO / "api" / "lineage.json").read_text())
    tracked = set(subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True).stdout.split())
    paths = [p for node in m["offbox"].values() for k in ("generated_by", "input_of") for p in node.get(k, [])]
    assert paths, "a manifest that names nothing checks nothing"
    assert not [p for p in paths if p not in tracked], [p for p in paths if p not in tracked]


def test_tm9_the_repository_files_that_hold_no_secrets_are_readable(gns):
    repo = gns.repo
    (repo / ".gitignore").write_text("build/\n")
    (repo / ".gitmodules").write_text('[submodule "extern/x"]\n\tpath = extern/x\n')
    (repo / ".npmrc").write_text("//registry/:_authToken=no\n")
    git(repo, "add", "-f", ".gitignore", ".gitmodules", ".npmrc")
    git(repo, "commit", "-q", "-m", "dotfiles")
    c, _ = read(gns, f"{ROOT}git/public/.gitignore")
    assert c["text"] == "build/\n"
    c, _ = read(gns, f"{ROOT}git/public/.gitmodules")
    assert "extern/x" in c["text"], "how a client learns a repository's submodules"
    kids = {k["name"]: k for k in json.loads(read(gns, f"{ROOT}git/public/")[0]["text"])["children"]}
    assert not kids[".gitmodules"].get("redacted") and not kids[".gitignore"].get("redacted")
    # Every other dotfile stays denied without anyone having to name it:
    # a token in .npmrc, an .env, anything under .git.
    assert kids[".npmrc"]["redacted"] is True
    assert refusal(gns, f"{ROOT}git/public/.npmrc").reason == "denied"
    for p in (".env", "data/.env", ".git/config", ".gitconfig", ".git-credentials"):
        assert tm.denied(p), p
    assert not tm.denied(".gitignore") and not tm.denied("extern/x/.gitmodules")


def _pin(repo: Path, path: str, sha: str, url: str) -> None:
    """A submodule as git stores it: a gitlink entry (mode 160000) whose commit
    lives in another repository, and its row in .gitmodules."""
    name = path.rsplit("/", 1)[-1]
    with (repo / ".gitmodules").open("a") as f:
        f.write(f'[submodule "{path}"]\n\tpath = {path}\n\turl = {url}\n')
    git(repo, "add", "-f", ".gitmodules")
    git(repo, "update-index", "--add", "--cacheinfo", f"160000,{sha},{path}")
    git(repo, "commit", "-q", "-m", f"pin {name}")


def test_tm19_a_submodule_reads_as_what_it_pins_not_as_a_dead_end(gns, gits):
    bench_sha = git(gits["bench"], "rev-parse", "HEAD").strip()
    elsewhere = "1" * 40
    _pin(gns.repo, "extern/bench", bench_sha, "https://github.com/tinymachines/bench.git")
    _pin(gns.repo, "extern/pretext", elsewhere, "https://github.com/chenglou/pretext.git")
    _pin(gns.repo, "extern/lookalike", elsewhere, "https://github.com/someone/bench.git")
    kids = {k["name"]: k for k in json.loads(read(gns, f"{ROOT}git/public/extern/")[0]["text"])["children"]}
    assert kids["bench"]["submodule"] is True and kids["bench"]["mimeType"] == "application/json"
    for uri in (f"{ROOT}git/public/extern/bench", f"{ROOT}git/public/extern/bench/", f"{ROOT}git/public/extern/bench?as=stat"):
        c, links = read(gns, uri)
        body = json.loads(c["text"])
        assert body["type"] == "submodule" and body["pinned"] == bench_sha, uri
        assert body["url"] == "https://github.com/tinymachines/bench.git"
        assert rels(links)["tm:pins"] == [f"{ROOT}git/bench/?at={bench_sha}"], "one link to the repository, at the pinned commit"
        assert rels(links)["up"] == [f"{ROOT}git/public/extern/"]
    # Where the link goes resolves, at the commit the submodule pins.
    pinned = json.loads(read(gns, f"{ROOT}git/bench/?at={bench_sha}")[0]["text"])
    assert pinned["commit"] == bench_sha
    # A submodule this box does not serve still says what it is and where it
    # lives; it just has nowhere in the namespace to send the reader.
    c, links = read(gns, f"{ROOT}git/public/extern/pretext")
    body = json.loads(c["text"])
    assert body["type"] == "submodule" and body["url"] == "https://github.com/chenglou/pretext.git" and body["repository"] is None
    assert "tm:pins" not in rels(links)
    # Someone else's repository named like one of ours is not ours.
    assert json.loads(read(gns, f"{ROOT}git/public/extern/lookalike")[0]["text"])["repository"] is None
    # The pin's own history: the commits that moved it.
    log = json.loads(read(gns, f"{ROOT}git/public/extern/bench?as=log")[0]["text"])
    assert [x["subject"] for x in log["commits"]] == ["pin bench"]
    # Its links offer only what a submodule answers: no blame, which it refuses.
    for ln in read(gns, f"{ROOT}git/public/extern/bench?as=log")[1]:
        assert "as=blame" not in ln["href"], ln
    assert refusal(gns, f"{ROOT}git/public/extern/bench?as=blame").reason == "bad-facet"


def test_tm19_no_refusal_offers_the_uri_it_refused(gns, monkeypatch):
    # The loop TM-19 found, forced: a refusal whose nearest names the address
    # it refused. The read drops it on the way out.
    loop = f"{ROOT}git/public/docs/nes/nope.md"
    monkeypatch.setattr(gns, "_git_missing", lambda repo, at, path: TmError(tm.RESOURCE_NOT_FOUND, "not-found", "x", nearest=[loop, loop + "/"]))
    assert refusal(gns, loop).data["nearest"] == [loop + "/"], "x/ for x is a different address, and stays"
    monkeypatch.undo()
    # A file asked for as a directory, and a name with a near twin: the
    # nearest list may name a sibling, never the address that just failed.
    for uri in (f"{ROOT}git/public/docs/nes/nope.md", f"{ROOT}git/public/docs/nes/alone.md/x", f"{ROOT}fs/docs/nes/pyle.md"):
        e = refusal(gns, uri)
        assert uri not in e.data.get("nearest", []), uri


def test_tm20_a_page_links_to_itself_in_the_other_language_and_on_the_other_site(built):
    repo = built.repo
    (repo / "lessons" / "jump").mkdir(parents=True, exist_ok=True)
    (repo / "lessons" / "jump" / "lesson.json").write_text('{"kind": "jump"}\n')
    en, ja = "/autopsy/lessons/jump", "/ja/autopsy/lessons/jump"
    # The beta's own build, beside the checkout as on the box (written here,
    # since the temp directories' parent is shared between tests): it has the
    # lesson in both languages and not the games.
    bx = repo.parent / "public-beta" / "web" / ".next"
    bx.mkdir(parents=True, exist_ok=True)
    (bx / "prerender-manifest.json").write_text(json.dumps({"routes": {
        "/en/autopsy/lessons/jump": {"srcRoute": "/[lang]/autopsy/lessons/[lesson]"},
        "/ja/autopsy/lessons/jump": {"srcRoute": "/[lang]/autopsy/lessons/[lesson]"},
    }}))
    alt = lambda path, site="tinymachines.ai": rels(read(built, f"{ROOT}http/{site}{path}?as=stat")[1])["alternate"]
    assert f"{ROOT}http/tinymachines.ai{ja}" in alt(en), "English to Japanese"
    assert f"{ROOT}http/tinymachines.ai{en}" in alt(ja), "and back"
    assert f"{ROOT}http/beta.tinymachines.ai{en}" in alt(en), "live to beta"
    assert f"{ROOT}http/tinymachines.ai{en}" in alt(en, "beta.tinymachines.ai"), "and back"
    # Only versions a build made: this game page is English only, and live only.
    assert not any("/ja/" in h or "beta." in h for h in alt("/autopsy/games/abc"))
    # Every cross-version alternate carries a title saying which version it is.
    titled = [ln for ln in read(built, f"{ROOT}http/tinymachines.ai{en}?as=stat")[1] if ln["rel"] == "alternate" and "?as=" not in ln["href"]]
    assert titled and all(ln.get("title") for ln in titled)


def test_tm11_a_facet_a_collection_has_no_use_for_is_refused_not_dropped(built):
    # Unknown facets were already refused everywhere; a facet a page has but a
    # listing does not was answered with the listing, and the facet dropped.
    for uri in (f"{ROOT}http/tinymachines.ai/autopsy/?as=rendered", f"{ROOT}http/tinymachines.ai/autopsy/?as=text"):
        e = refusal(built, uri)
        assert e.reason == "bad-facet" and "collection" in e.message, uri
    # The same on the other mounts: an fs directory is a listing (raw is the
    # listing itself), and a git tree offers its listing and its log.
    for uri in (f"{ROOT}fs/docs/?as=stat", f"{ROOT}git/public/docs/?as=stat", f"{ROOT}git/public/docs/?as=blame"):
        e = refusal(built, uri)
        assert e.reason == "bad-facet" and "collection" in e.message, uri
    assert json.loads(read(built, f"{ROOT}fs/docs/?as=raw")[0]["text"])["children"]
    assert json.loads(read(built, f"{ROOT}git/public/docs/?as=log")[0]["text"])["commits"]
    # The listing itself, and a site's front page (its root is both), still read.
    assert json.loads(read(built, f"{ROOT}http/tinymachines.ai/autopsy/")[0]["text"])["children"]
    assert read(built, f"{ROOT}http/tinymachines.ai/?as=stat")[0]["mimeType"] == "application/json"


def _crawler():
    """The deploy's link crawler, for its own idea of a file's stat URI."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("check_tm_links", REPO / "scripts" / "check-tm-links.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_tm19_the_crawl_faults_a_submodule_record_states_its_type_and_its_pin_resolves(gns, gits):
    # Found by the crawler at deploy, 2026-10-10: the listing said
    # application/json and the stat had no mimeType; and the pin's link, a
    # collection at a ref, was read by the crawler as a file's stat.
    bench_sha = git(gits["bench"], "rev-parse", "HEAD").strip()
    _pin(gns.repo, "extern/bench", bench_sha, "https://github.com/tinymachines/bench.git")
    c, links = read(gns, f"{ROOT}git/public/extern/bench?as=stat")
    assert json.loads(c["text"])["mimeType"] == "application/json", "what the listing claimed"
    crawl = _crawler()
    pin = rels(links)["tm:pins"][0]
    assert crawl.stat_of(pin) == pin, "a collection at a ref is a collection: no ?as=stat added"
    assert json.loads(read(gns, crawl.stat_of(pin))[0]["text"])["commit"] == bench_sha
    # A pin this server's copy of the repository does not have is not linked:
    # a link that would not resolve is worse than none.
    _pin(gns.repo, "extern/ahead", "2" * 40, "https://github.com/tinymachines/bench.git")
    c, links = read(gns, f"{ROOT}git/public/extern/ahead")
    assert "tm:pins" not in rels(links) and json.loads(c["text"])["repository"] is None


def test_tm20_the_crawl_faults_the_front_page_answers_its_other_versions(built):
    # Found by the crawler at deploy: /ja links to the site root, which reads
    # as a listing and carried no alternate back.
    _, ja = read(built, f"{ROOT}http/tinymachines.ai/ja?as=stat")
    assert f"{ROOT}http/tinymachines.ai/" in rels(ja)["alternate"]
    _, root = read(built, f"{ROOT}http/tinymachines.ai/")
    assert f"{ROOT}http/tinymachines.ai/ja" in rels(root)["alternate"], "the root is the front page too"
    # Every cross-version alternate is answered from where it lands, read the
    # way the crawler reads it. A page the build did not make (served
    # dynamically) gets none, so nothing is left unanswered.
    crawl = _crawler()
    for page in ("/", "/ja", "/autopsy/lessons/jump", "/ja/autopsy/lessons/jump", "/autopsy/games/abc"):
        uri = f"{ROOT}http/tinymachines.ai{page}"
        _, links = read(built, crawl.stat_of(uri) if page != "/" else uri)
        for ln in links:
            if ln["rel"] == "alternate" and crawl.identity(ln["href"]) != crawl.identity(uri):
                t = crawl.identity(ln["href"])
                _, back = read(built, crawl.stat_of(t))
                assert crawl.identity(uri) in {crawl.identity(b["href"]) for b in back if b["rel"] == "alternate"}, (uri, t)


# ---------------------------------------------------------------------------
# TM-12: the orientation documents, named at connect and at the root
# ---------------------------------------------------------------------------


def test_tm12_the_root_and_the_connect_instructions_name_the_orientation_documents(gns):
    repo = gns.repo
    # Nothing is named that is not there: a link that would not resolve is
    # worse than none.
    assert json.loads(read(gns, ROOT)[0]["text"])["start_here"] == []
    assert "help" not in rels(read(gns, ROOT)[1])
    (repo / "START-HERE.md").write_text("# Start here\n")
    (repo / "CLAUDE.md").write_text("# House rules\n")
    git(repo, "add", "START-HERE.md", "CLAUDE.md")
    git(repo, "commit", "-q", "-m", "orientation")
    c, links = read(gns, ROOT)
    start = json.loads(c["text"])["start_here"]
    assert [s["uri"] for s in start] == [f"{ROOT}git/public/START-HERE.md", f"{ROOT}git/public/CLAUDE.md"], "the 6502 project is not mounted here, so its document is not named"
    assert all(s["what"] for s in start)
    assert rels(links)["help"] == sorted(s["uri"] for s in start), "the body keeps the reading order; links come by href like any others"
    for s in start:
        assert read(gns, s["uri"])[0]["mimeType"] == "text/markdown", "each one reads"
    handler = mcp_server.make_handler({t["name"]: (lambda _: {}) for t in mcp_server.TOOLS}, namespace=gns)
    init = run(handler({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}))["result"]
    for s in start:
        assert s["uri"] in init["instructions"], "a fresh session's first message points at them"
    assert "git/6502/CLAUDE.md" not in init["instructions"]


def test_tm12_the_real_orientation_documents_are_there():
    """Over the real checkout: the three documents the ticket names resolve
    wherever their repository is checked out beside this one."""
    n = Namespace(REPO, fetch=canned_fetch)
    named = [s["uri"] for s in n.start_here()]
    assert f"{ROOT}git/public/START-HERE.md" in named and f"{ROOT}git/public/CLAUDE.md" in named
    if "6502" in n.git:
        assert f"{ROOT}git/6502/CLAUDE.md" in named
    assert len(named) <= 3, "two or three, not a reading list"


# ---------------------------------------------------------------------------
# TM-16: the entity mount, the first application on the platform
# ---------------------------------------------------------------------------


def _mark(pattern: str) -> dict:
    return {"pattern": pattern, "evidence": {"by": "match", "frames": 3}}


AUTOPSY = {
    "note": "Written only by scripts/board-autopsy.py. Shape only; no byte of any ROM.",
    "patterns": ["frame-wait", "pad-poll", "sprite-writer"],
    "games": [
        {"key": "abc", "name": "Metroid (USA)", "mapper": 1, "patterns": {"pad-poll": 1, "sprite-writer": 2},
         "routine_list": [
             {"name": "b0_poll_8E5C", "bank": "prg0", "addr": 0x8E5C, "kind": "call", "entered": 5, "is": [_mark("pad-poll"), _mark("pad-poll"), _mark("sprite-writer")]},
             {"name": "b0_routine_9000", "bank": "prg0", "addr": 0x9000, "kind": "call", "entered": 2, "is": []},
             {"name": "b1_sprites_A000", "bank": "prg1", "addr": 0xA000, "kind": "call", "entered": 9, "is": [_mark("sprite-writer")]},
         ],
         "loop_list": [], "variable_list": [{"addr": "$0010"}]},
        {"key": "def", "name": "Legend of Zelda, The (USA) (Rev 1)", "mapper": 1, "patterns": {"pad-poll": 1, "frame-wait": 1},
         "routine_list": [{"name": "b7_poll_E000", "bank": "prg7", "addr": 0xE000, "kind": "call", "entered": 1, "is": [_mark("pad-poll")]}],
         "loop_list": [{"name": "b7_wait_C150", "bank": "prg7", "addr": 0xC150, "is": [_mark("frame-wait")]}]},
    ],
}

LESSONS = {
    "note": "Written only by scripts/board-lessons.py.",
    "topics": [{"key": "moving", "title": "How a character moves", "lessons": ["jump"]}],
    "lessons": [
        {"key": "jump", "kind": "jump", "title": "A jump", "patterns": {"pad-poll": 1, "frame-wait": 1}, "rom": "TkVTGg==",
         "against": {"game": "Super Mario Bros.", "full_speed": 1.5}, "pictures": [{"frame": 100, "png": "iVBORw0KGgo="}]},
        {"key": "rooms", "kind": "rooms", "title": "Rooms", "patterns": {"pad-poll": 2}, "rom": "TkVTGg==",
         "against": {"game": "The Legend of Zelda"}, "pictures": []},
    ],
}


@pytest.fixture
def ents(built) -> Namespace:
    """The built temp checkout with the two records in their real shape and
    one lesson's cartridge committed (the other lesson has no directory)."""
    repo = built.repo
    (repo / "data" / "autopsy.json").write_text(json.dumps(AUTOPSY))
    (repo / "data" / "lessons.json").write_text(json.dumps(LESSONS))
    (repo / "lessons" / "jump").mkdir(parents=True)
    (repo / "lessons" / "jump" / "prg.s").write_text("reset:\n")
    (repo / "lessons" / "jump" / "lesson.json").write_text('{"kind": "jump"}\n')
    (repo / "scripts" / "board-lessons.py").write_text('OUT = "data/lessons.json"\n')
    git(repo, "add", "-f", "lessons", "data/autopsy.json", "data/lessons.json", "scripts/board-lessons.py")
    git(repo, "commit", "-q", "-m", "the records, their writer and a lesson")
    return Namespace(repo, fetch=canned_fetch, git_repos=dict(built.git))


E = f"{ROOT}entity/"


def test_tm16_an_entity_fits_the_grammar_the_other_mounts_use(ents):
    r = parse(f"{E}game/abc/routine/b0-8E5C?as=stat")
    assert (r.mount, r.path, r.facets, r.is_collection) == ("entity", "game/abc/routine/b0-8E5C", {"as": "stat"}, False)
    assert r.uri == f"{E}game/abc/routine/b0-8E5C"
    assert parse(E).is_collection and parse(f"{E}pattern/").is_collection
    c, links = read(ents, ROOT)
    assert E in [m["uri"] for m in json.loads(c["text"])["mounts"]] and E in rels(links)["collection"]
    with pytest.raises(TmError) as e:
        parse("tm://tinymachines/entities/")
    assert e.value.data["nearest"][0] == E, "the closest mount first"
    top, links = read(ents, E)
    assert [k["name"] for k in json.loads(top["text"])["children"]] == ["game/", "lesson/", "pattern/"]
    assert rels(links)["up"] == [ROOT]


def test_tm16_from_a_pattern_a_client_reaches_its_games_routines_and_lessons(ents):
    c, links = read(ents, f"{E}pattern/pad-poll")
    body = json.loads(c["text"])
    assert c["mimeType"] == "application/json" and (body["entity"], body["key"]) == ("pattern", "pad-poll")
    r = rels(links)
    assert r["tm:found-in"] == [f"{E}game/abc", f"{E}game/def"]
    assert r["tm:instance"] == [f"{E}game/abc/routine/b0-8E5C", f"{E}game/def/routine/b7-E000"]
    assert r["tm:demonstrated-by"] == [f"{E}lesson/jump", f"{E}lesson/rooms"]
    assert r["up"] == [f"{E}pattern/"] and r["collection"] == [f"{E}pattern/"] and r["describedby"] == [f"{E}pattern/pad-poll?as=stat"]
    assert [(g["key"], g["count"]) for g in body["found_in"]] == [("abc", 2), ("def", 1)], "the count is in the body: marks, and one routine here has two"
    assert (body["games"], body["count"], body["routines"]) == (2, 3, 2)
    titles = {ln["href"]: ln["title"] for ln in links if ln["rel"] == "tm:found-in"}
    assert titles[f"{E}game/abc"] == "found 2 times in Metroid (USA)" and titles[f"{E}game/def"] == "found once in Legend of Zelda, The (USA) (Rev 1)", "and in the link's title"
    assert all(ln["confidence"] == "exact" for ln in links if ln["rel"].startswith("tm:"))
    # sprite-writer marks two routines of one game.
    sw = json.loads(read(ents, f"{E}pattern/sprite-writer")[0]["text"])
    assert [(g["key"], g["count"]) for g in sw["found_in"]] == [("abc", 2)] and sw["routines"] == 2
    # Each link is answered from the other end.
    _, links = read(ents, f"{E}game/abc/routine/b0-8E5C")
    assert rels(links)["tm:instance-of"] == [f"{E}pattern/pad-poll", f"{E}pattern/sprite-writer"]
    assert rels(links)["up"] == [f"{E}game/abc/routine/"]
    _, links = read(ents, f"{E}game/abc")
    assert rels(links)["tm:exhibits"] == [f"{E}pattern/pad-poll", f"{E}pattern/sprite-writer"]
    _, links = read(ents, f"{E}lesson/jump")
    assert rels(links)["tm:demonstrates"] == [f"{E}pattern/frame-wait", f"{E}pattern/pad-poll"]


def test_tm16_an_entity_reads_as_its_record_and_carries_no_rom_byte(ents):
    game = json.loads(read(ents, f"{E}game/abc")[0]["text"])
    assert game["name"] == "Metroid (USA)" and game["mapper"] == 1 and game["variable_list"] == [{"addr": "$0010"}]
    assert "routine_list" not in game and "loop_list" not in game, "the routines are addressed, not inlined"
    assert game["routines_named"] == 2 and game["routines_measured"] == 3 and game["routines_at"] == f"{E}game/abc/routine/"
    rt = json.loads(read(ents, f"{E}game/abc/routine/b0-8E5C")[0]["text"])
    assert (rt["name"], rt["bank"], rt["addr"], rt["address"], rt["entered"]) == ("b0_poll_8E5C", "prg0", 0x8E5C, "$8E5C", 5)
    assert rt["game"] == {"uri": f"{E}game/abc", "key": "abc", "name": "Metroid (USA)"}
    assert [m["pattern"] for m in rt["is"]] == ["pad-poll", "pad-poll", "sprite-writer"] and rt["is"][0]["evidence"]["by"] == "match"
    loop = json.loads(read(ents, f"{E}game/def/routine/b7-C150")[0]["text"])
    assert (loop["entity"], loop["kind"], loop["name"]) == ("routine", "loop", "b7_wait_C150"), "a loop the rules named is a routine here"
    assert rt["entity"] == "routine" and rt["kind"] == "call", "the record's own kind is how it is entered"
    c, _ = read(ents, f"{E}lesson/jump")
    lesson = json.loads(c["text"])
    assert lesson["title"] == "A jump" and lesson["topic"] == "moving" and lesson["against"]["game"] == "Super Mario Bros."
    assert (lesson["entity"], lesson["kind"]) == ("lesson", "jump")
    assert "rom" not in lesson and "TkVT" not in c["text"], "the cartridge's bytes stay in the record"
    assert lesson["pictures"] == [{"frame": 100}] and "iVBOR" not in c["text"]


def test_tm16_listings_name_only_what_the_rules_named_and_refusals_teach(ents):
    games = json.loads(read(ents, f"{E}game/")[0]["text"])["children"]
    assert [(k["name"], k["isCollection"]) for k in games] == [("abc", False), ("abc/", True), ("def", False), ("def/", True)]
    assert games[0]["title"] == "Metroid (USA)" and games[0]["mimeType"] == "application/json"
    assert [k["name"] for k in json.loads(read(ents, f"{E}game/abc/")[0]["text"])["children"]] == ["routine/"]
    c, links = read(ents, f"{E}game/abc/routine/")
    kids = json.loads(c["text"])["children"]
    assert [k["name"] for k in kids] == ["b0-8E5C", "b1-A000"], "b0-9000 ran and carries no pattern"
    assert "pad-poll" in kids[0]["title"] and rels(links)["up"] == [f"{E}game/abc/"]
    e = refusal(ents, f"{E}game/abc/routine/b0-9000")
    assert e.reason == "not-found" and "no pattern" in e.message, "it exists in the record; say why it has no address"
    assert set(e.data["nearest"]) == {f"{E}game/abc/routine/b0-8E5C", f"{E}game/abc/routine/b1-A000"}, "the ones that have an address"
    e = refusal(ents, f"{E}pattern/pad-pol")
    assert e.reason == "not-found" and e.data["nearest"][0] == f"{E}pattern/pad-poll"
    e = refusal(ents, f"{E}game/metroid")
    assert e.data["nearest"][0] == f"{E}game/abc", "a game asked for by name is offered by key"
    e = refusal(ents, f"{E}pattern")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{E}pattern/"]
    e = refusal(ents, f"{E}pattern/pad-poll/")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{E}pattern/pad-poll"]
    e = refusal(ents, f"{E}tune/x")
    assert e.reason == "not-found" and set(e.data["nearest"]) == {f"{E}game/", f"{E}lesson/", f"{E}pattern/"}
    e = refusal(ents, f"{E}game/abc/routine")
    assert e.data["nearest"] == [f"{E}game/abc/routine/"]
    # Facets: stat and nothing else; a listing offers none (TM-11).
    st, links = read(ents, f"{E}pattern/pad-poll?as=stat")
    stat = json.loads(st["text"])
    assert st["uri"] == f"{E}pattern/pad-poll?as=stat" and stat["mimeType"] == "application/json" and stat["isCollection"] is False and stat["size"] > 0
    assert rels(links)["alternate"] == [f"{E}pattern/pad-poll"] and f"{E}game/abc" in rels(links)["tm:found-in"]
    assert refusal(ents, f"{E}pattern/pad-poll?as=raw").reason == "bad-facet"
    assert refusal(ents, f"{E}pattern/?as=stat").reason == "bad-facet"
    assert refusal(ents, f"{E}?as=stat").reason == "bad-facet"
    # A listing pages like any other.
    first = json.loads(run(ents.read(f"{E}game/"))["contents"][0]["text"])
    assert "nextCursor" not in first


def test_tm16_an_entity_and_the_things_it_names_in_other_mounts_answer_each_other(ents):
    # A game and its page.
    _, links = read(ents, f"{E}game/abc")
    page = f"{ROOT}http/tinymachines.ai/autopsy/games/abc"
    assert page in rels(links)["tm:renders-as"]
    assert f"{ROOT}http/tinymachines.ai/ja/autopsy/games/abc" not in rels(links)["tm:renders-as"], "the build made no Japanese page"
    _, back = read(ents, f"{page}?as=stat")
    assert f"{E}game/abc" in rels(back)["tm:source"]
    _, other = read(ents, f"{ROOT}http/tinymachines.ai/autopsy/patterns?as=stat")
    assert not any(h.startswith(E) for h in rels(other).get("tm:source", [])), "only a game's own page"
    # A lesson and its cartridge.
    _, links = read(ents, f"{E}lesson/jump")
    assert rels(links)["tm:cartridge"] == [f"{ROOT}git/public/lessons/jump/"]
    _, back = read(ents, f"{ROOT}git/public/lessons/jump/")
    assert rels(back)["tm:cartridge-of"] == [f"{E}lesson/jump"]
    assert "tm:cartridge-of" not in rels(read(ents, f"{ROOT}git/public/lessons/jump/prg.s")[1]), "the directory, as the lesson names it"
    assert "tm:cartridge" not in rels(read(ents, f"{E}lesson/rooms")[1]), "no directory is tracked for it, so none is named"
    # An entity and its record: the record names each kind once (TM-18's rule).
    for uri, pointer in [(f"{E}pattern/pad-poll", "autopsy.json#/patterns/1"), (f"{E}game/def", "autopsy.json#/games/1"),
                         (f"{E}game/abc/routine/b1-A000", "autopsy.json#/games/0/routine_list/2"),
                         (f"{E}game/def/routine/b7-C150", "autopsy.json#/games/1/loop_list/0"), (f"{E}lesson/rooms", "lessons.json#/lessons/1")]:
        assert rels(read(ents, uri)[1])["tm:data"] == [f"{ROOT}fs/data/{pointer}"], uri
    by = rels(read(ents, f"{ROOT}fs/data/autopsy.json?as=stat")[1])["tm:read-by"]
    assert f"{E}pattern/" in by and f"{E}game/" in by and f"{E}lesson/" not in by
    assert not any("/routine/" in h for h in by), "nineteen games' routines are stood for by the games' collection"
    assert rels(read(ents, f"{ROOT}fs/data/lessons.json?as=stat")[1])["tm:read-by"] == [f"{E}lesson/"]
    assert rels(read(ents, f"{E}pattern/")[1])["tm:data"] == [f"{ROOT}fs/data/autopsy.json"]
    assert rels(read(ents, f"{E}lesson/")[1])["tm:data"] == [f"{ROOT}fs/data/lessons.json"]
    assert "tm:data" not in rels(read(ents, f"{E}game/abc/routine/")[1]), "the games' collection stands for these"
    for uri, stands in [(f"{E}pattern/pad-poll", f"{E}pattern/"), (f"{E}game/abc/routine/b0-8E5C", f"{E}game/"), (f"{E}lesson/", f"{E}lesson/")]:
        assert ents.reader_uri(uri) == stands
    assert read(ents, f"{ROOT}fs/data/autopsy.json#/games/1?as=stat")[0]["uri"].startswith(f"{ROOT}fs/data/autopsy.json"), "a pointer names a place in the file and the file still reads"


def test_a_lesson_names_its_game_exactly_by_the_key_its_record_keeps(ents):
    """public#7: with the game's key in the record the join is exact, whatever
    the names are. The name-only record is the test below, and it gives this
    lesson no game at all."""
    assert "tm:measures" not in rels(read(ents, f"{E}lesson/jump")[1]), "name only: Super Mario Bros. is no game's whole name here"
    rec = json.loads(json.dumps(LESSONS))
    rec["lessons"][0]["against"]["key"] = "abc"      # a name no game here has, and the key of one that is
    rec["lessons"][1]["against"]["key"] = "def"
    (ents.repo / "data" / "lessons.json").write_text(json.dumps(rec))
    os.utime(ents.repo / "data" / "lessons.json", (2_000_000_000, 2_000_000_000))
    for lesson, game in (("jump", "abc"), ("rooms", "def")):
        m = [ln for ln in read(ents, f"{E}lesson/{lesson}")[1] if ln["rel"] == "tm:measures"]
        assert [(ln["href"], ln["confidence"]) for ln in m] == [(f"{E}game/{game}", "exact")], lesson
        back = [ln for ln in read(ents, f"{E}game/{game}")[1] if ln["rel"] == "tm:measured-by"]
        assert [(ln["href"], ln["confidence"]) for ln in back] == [(f"{E}lesson/{lesson}", "exact")], game
    assert json.loads(read(ents, f"{E}lesson/jump")[0]["text"])["against"] == {"game": "Super Mario Bros.", "full_speed": 1.5, "key": "abc"}
    # A key that names no game here is not followed, and the name is not tried in its place.
    rec["lessons"][1]["against"]["key"] = "000000000000"
    (ents.repo / "data" / "lessons.json").write_text(json.dumps(rec))
    os.utime(ents.repo / "data" / "lessons.json", (2_000_000_100, 2_000_000_100))
    assert "tm:measures" not in rels(read(ents, f"{E}lesson/rooms")[1]), "a refusal beats a plausible answer"
    assert "tm:measured-by" not in rels(read(ents, f"{E}game/def")[1])


def test_the_real_lessons_all_name_their_game_exactly():
    """Over the real checkout: every lesson that names a game links to it."""
    n = Namespace(REPO, fetch=canned_fetch)
    lessons = json.loads((REPO / "data" / "lessons.json").read_text())["lessons"]
    named = [x for x in lessons if (x.get("against") or {}).get("game")]
    assert len(named) >= 25
    for x in named:
        m = [ln for ln in read(n, f"{E}lesson/{x['key']}")[1] if ln["rel"] == "tm:measures"]
        assert [(ln["href"], ln["confidence"]) for ln in m] == [(f"{E}game/{x['against']['key']}", "exact")], x["key"]


def test_tm16_a_lesson_names_its_game_only_where_the_names_agree(ents):
    c, links = read(ents, f"{E}lesson/rooms")
    m = [ln for ln in links if ln["rel"] == "tm:measures"]
    assert [(ln["href"], ln["confidence"]) for ln in m] == [(f"{E}game/def", "inferred")], "the record keeps the game's name, not its key"
    _, back = read(ents, f"{E}game/def")
    assert [(ln["href"], ln["confidence"]) for ln in back if ln["rel"] == "tm:measured-by"] == [(f"{E}lesson/rooms", "inferred")]
    c, links = read(ents, f"{E}lesson/jump")
    assert "tm:measures" not in rels(links), "no game here is named Super Mario Bros. and nothing else"
    assert json.loads(c["text"])["against"]["game"] == "Super Mario Bros."


def test_tm16_templates_resources_and_completions_know_the_mount(ents):
    names = [t["name"] for t in ents.templates()]
    assert names == ["root", "fs", "git", "http", "offbox", "entity", "routine"]
    listed = []
    cur = None
    while True:
        page = ents.list_resources(cur)
        listed += [r["uri"] for r in page["resources"]]
        cur = page.get("nextCursor")
        if not cur:
            break
    assert {E, f"{E}pattern/", f"{E}game/", f"{E}lesson/", f"{E}game/abc/routine/"} <= set(listed)
    assert f"{E}pattern/pad-poll" not in listed, "leaves are reached by reading their collection"

    def comp(tmpl: str, name: str, value: str, **ctx: str) -> list[str]:
        return ents.complete({"ref": {"type": "ref/resource", "uri": tmpl}, "argument": {"name": name, "value": value},
                              "context": {"arguments": ctx}})["completion"]["values"]

    et = next(t["uriTemplate"] for t in ents.templates() if t["name"] == "entity")
    rt = next(t["uriTemplate"] for t in ents.templates() if t["name"] == "routine")
    assert comp(et, "kind", "") == ["game", "lesson", "pattern"] and comp(et, "kind", "p") == ["pattern"]
    assert comp(et, "key", "pad", kind="pattern") == ["pad-poll"]
    assert comp(et, "key", "", kind="lesson") == ["jump", "rooms"]
    assert comp(et, "key", "a", kind="game") == ["abc"]
    assert comp(rt, "key", "") == ["abc", "def"]
    assert comp(rt, "routine", "b1", key="abc") == ["b1-A000"]
    assert comp(et, "as", "") == ["stat", "links"]


def test_tm16_a_checkout_without_the_records_has_an_empty_mount_not_a_broken_one(gns):
    assert json.loads(read(gns, f"{E}pattern/")[0]["text"])["children"] == []
    assert "tm:data" not in rels(read(gns, f"{E}pattern/")[1])
    assert refusal(gns, f"{E}pattern/pad-poll").reason == "not-found"


def test_tm16_the_real_records_hold_what_the_spec_says_of_them():
    """Over the real checkout: the counts the spec states, measured."""
    n = Namespace(REPO, fetch=canned_fetch)
    auto = json.loads((REPO / "data" / "autopsy.json").read_text())
    ix = n.entities.index()
    assert sorted(ix["patterns"]) == sorted(auto["patterns"])
    named = sum(len(g["routines"]) for g in ix["games"].values())
    marks = sum(len(r["rec"]["is"]) for g in ix["games"].values() for r in g["routines"].values())
    assert marks == auto["totals"]["marks"], "every mark has a routine with an address"
    assert named <= marks and sum(len(g["all"]) for g in ix["games"].values()) >= auto["totals"]["routines"]
    for key, g in ix["games"].items():
        assert g["marks"] == g["rec"]["patterns"], f"{key}: the record's own counts are the ones counted here, mark by mark"
    poll = json.loads(read(n, f"{E}pattern/pad-poll")[0]["text"])
    assert len(poll["found_in"]) == sum(1 for g in auto["games"] if "pad-poll" in g["patterns"])
    lessons = json.loads((REPO / "data" / "lessons.json").read_text())["lessons"]
    assert sorted(ix["lessons"]) == sorted(x["key"] for x in lessons)
    for x in lessons:
        assert set(x["patterns"]) <= set(ix["patterns"]), x["key"]
    c, _ = read(n, f"{E}lesson/jump")
    assert x["rom"][:24] not in "".join(read(n, f"{E}lesson/{y['key']}")[0]["text"] for y in lessons), "no lesson entity carries its cartridge"


def _crawler():
    import importlib.util
    spec = importlib.util.spec_from_file_location("check_tm_links", REPO / "scripts" / "check-tm-links.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_tm16_the_crawler_holds_the_entity_pairs_and_fails_when_one_end_goes_quiet(ents, capsys, monkeypatch):
    """The deploy's last check, run here over the temp checkout: clean as
    built, and red when a pair loses an end, a confidence disagrees or the
    budget runs out. A check that only ever passes is not a check."""
    crawler = _crawler()
    (ents.repo / "notes" / "escape.md").unlink()   # the symlink out of the root, there for another test to refuse

    def crawl(budget: int = 4000) -> tuple[int, str]:
        # One site: the temp checkout has a build for the live site and none
        # for the beta, and a site with no build claims pages it cannot check.
        n = Namespace(ents.repo, fetch=canned_fetch, sites=tm.SITES[:1], git_repos=dict(ents.git))
        rc = run(crawler.crawl(budget, ents.repo, n))
        return rc, capsys.readouterr().out

    rc, out = crawl()
    assert rc == 0, out
    assert "every pair has its inverse" in out
    rc, out = crawl(budget=10)
    assert rc == 1 and "budget of 10 reads ran out" in out, "what was not reached was not checked"
    inbound = tm.Entities.inbound
    for mount, lost in [("http", "tm:renders-as"), ("git", "tm:cartridge"), ("fs", "tm:data")]:
        monkeypatch.setattr(tm.Entities, "inbound", lambda self, m, *a, _x=mount, **k: [] if m == _x else inbound(self, m, *a, **k))
        rc, out = crawl()
        assert rc == 1 and lost in out, f"{mount} stopped answering and the crawl passed:\n{out}"
    monkeypatch.setattr(tm.Entities, "inbound", inbound)
    game = tm.Entities._game
    monkeypatch.setattr(tm.Entities, "_game", lambda self, key: (game(self, key)[0], [ln for ln in game(self, key)[1] if ln["rel"] != "tm:exhibits"]))
    rc, out = crawl()
    assert rc == 1 and "tm:found-in" in out and "no tm:exhibits back" in out, out
    monkeypatch.setattr(tm.Entities, "_game", lambda self, key: (game(self, key)[0], [dict(ln, confidence="exact") if ln["rel"] == "tm:measured-by" else ln for ln in game(self, key)[1]]))
    rc, out = crawl()
    assert rc == 1 and "inferred one way, exact back" in out, out
    monkeypatch.setattr(tm.Entities, "_game", game)
    lesson = tm.Entities._lesson
    monkeypatch.setattr(tm.Entities, "_lesson", lambda self, key: (lesson(self, key)[0], [ln for ln in lesson(self, key)[1] if ln["rel"] != "tm:data"]))
    rc, out = crawl()
    assert rc == 1 and "an entity with no tm:data to its record" in out, "no pair misses this link, so the crawl asks for it"


# ---------------------------------------------------------------------------
# tinypeek#3: a count on a link. tinypeek#2: a large link set, a page at a time
# ---------------------------------------------------------------------------


def test_a_link_can_say_how_many_and_the_entity_links_that_count_do(ents):
    assert tm.link("tm:found-in", "x", "exact", count=3)["count"] == 3
    assert "count" not in tm.link("tm:found-in", "x", "exact"), "optional: most links stand for one thing"
    assert tm.link("up", "x", count=0)["count"] == 0, "zero is a count, and any rel may carry one"
    for bad in (-1, 1.5, "2", True):
        with pytest.raises(AssertionError):
            tm.link("tm:found-in", "x", "exact", count=bad)
    # The number is the occurrences in the record: pad-poll is marked twice on
    # one routine of abc and once in def; jump's cartridge has it once, rooms' twice.
    marks = {g["key"]: sum(m["pattern"] == "pad-poll" for lst in ("routine_list", "loop_list") for r in g[lst] for m in r["is"]) for g in AUTOPSY["games"]}
    _, links = read(ents, f"{E}pattern/pad-poll")
    assert {ln["href"]: ln["count"] for ln in links if ln["rel"] == "tm:found-in"} == {f"{E}game/abc": marks["abc"], f"{E}game/def": marks["def"]} == {f"{E}game/abc": 2, f"{E}game/def": 1}
    assert {ln["href"]: ln["count"] for ln in links if ln["rel"] == "tm:demonstrated-by"} == {f"{E}lesson/jump": 1, f"{E}lesson/rooms": 2}
    assert all(ln["title"] for ln in links if "count" in ln), "the title stays, for people"
    assert not any("count" in ln for ln in links if ln["rel"] in ("tm:instance", "tm:data", "up")), "one routine, one record: nothing to count"
    # The other end of each pair says the same number.
    assert {ln["href"]: ln["count"] for ln in read(ents, f"{E}game/abc")[1] if ln["rel"] == "tm:exhibits"} == {f"{E}pattern/pad-poll": 2, f"{E}pattern/sprite-writer": 2}
    assert {ln["href"]: ln["count"] for ln in read(ents, f"{E}lesson/rooms")[1] if ln["rel"] == "tm:demonstrates"} == {f"{E}pattern/pad-poll": 2}


def _order_key(ln: dict) -> tuple:
    return ({None: 0, "exact": 1, "inferred": 2}.get(ln.get("confidence"), 3), ln["rel"], ln["href"])


def test_links_come_in_one_stated_order_on_every_mount(ents):
    for uri in (ROOT, f"{ROOT}fs/data/autopsy.json", f"{ROOT}fs/docs/", f"{ROOT}git/public/lessons/jump/", f"{ROOT}git/public/docs/nes/alone.md",
                f"{ROOT}http/tinymachines.ai/autopsy/games/abc?as=stat", f"{ROOT}offbox/", f"{E}pattern/pad-poll", f"{E}game/def", f"{E}lesson/rooms"):
        _, links = read(ents, uri)
        assert links == sorted(links, key=_order_key), f"{uri}: IANA rels, then exact, then inferred; by rel, then by href"
    confs = [ln.get("confidence") for ln in read(ents, f"{E}lesson/rooms")[1]]
    assert confs.index("inferred") > max(i for i, c in enumerate(confs) if c == "exact"), "the surer links first"


def _walk(ns: Namespace, uri: str) -> tuple[list[dict], int]:
    """Every link behind ?as=links, following next, and how many reads it took."""
    out, reads, at = [], 0, uri + ("&" if "?" in uri else "?") + "as=links"
    while at:
        c, links = read(ns, at)
        reads += 1
        assert len(links) <= tm.LINK_CAP, f"{at}: {len(links)} links in one read"
        nxt = [ln for ln in links if ln["rel"] == "next"]
        out += [ln for ln in links if ln["rel"] != "next"]
        body = json.loads(c["text"])
        assert body["returned"] == len(links) - len(nxt) and (("nextCursor" in body) == bool(nxt))
        at = nxt[0]["href"] if nxt else None
        assert reads < 50
    return out, reads


def test_a_large_link_set_is_capped_inline_and_whole_behind_as_links(ents, monkeypatch):
    uri = f"{E}pattern/pad-poll"
    _, full = read(ents, uri)
    assert len(full) == 10 and "tm:links" not in rels(full), "under the cap a read is whole and says nothing of paging"
    monkeypatch.setattr(tm, "LINK_CAP", 4)
    c, inline = read(ents, uri)
    assert len(inline) == 4, "no single read returns more than the cap"
    assert inline[:3] == full[:3], "the first page, in the stated order"
    more = inline[-1]
    assert (more["rel"], more["href"], more["confidence"], more["count"]) == ("tm:links", f"{uri}?as=links", "exact", 10), "and the way to the rest, with how many there are"
    assert json.loads(c["text"])["key"] == "pad-poll", "the content is untouched"
    walked, reads = _walk(ents, uri)
    assert reads == 4 and walked == full, "three a page, and the same ten in the same order as the read under no cap"
    assert sorted(map(json.dumps, walked)) == sorted(set(map(json.dumps, walked))), "every link exactly once"
    assert all(ln in walked for ln in full), "nothing is unreachable"
    first, _ = read(ents, f"{uri}?as=links")
    body = json.loads(first["text"])
    assert first["uri"] == f"{uri}?as=links" and first["mimeType"] == "application/json" and (body["uri"], body["total"]) == (uri, 10) and "key" not in body
    assert read(ents, f"{uri}?as=links") == read(ents, f"{uri}?as=links"), "stable across reads"
    # Through the tool the same page comes back in the body.
    got = run(ents.resolve({"uri": uri}))
    assert len(got["links"]) == 4 and got["links"][-1]["rel"] == "tm:links"
    # Its stat is over the cap too, and counts the same ten: the pointer a
    # stat keeps back to its thing is the stat's, not one of the thing's.
    _, st = read(ents, f"{uri}?as=stat")
    assert len(st) == 4 and (st[-1]["rel"], st[-1]["href"], st[-1]["count"]) == ("tm:links", f"{uri}?as=links", 10)
    assert refusal(ents, f"{uri}?as=links&cursor=nonsense").reason == "bad-cursor"
    assert refusal(ents, f"{E}pattern/nope?as=links").reason == "not-found", "links of nothing are refused as the thing is"


def test_as_links_is_one_rule_on_every_mount(ents, monkeypatch):
    monkeypatch.setattr(tm, "LINK_CAP", 3)
    for uri in (ROOT, f"{ROOT}fs/data/autopsy.json", f"{ROOT}fs/docs/", f"{ROOT}git/public/data/autopsy.json", f"{ROOT}git/public/docs/nes/alone.md?at=v1",
                f"{ROOT}git/public/lessons/jump/", f"{ROOT}http/tinymachines.ai/autopsy/games/abc?as=stat", f"{ROOT}http/tinymachines.ai/autopsy/games/",
                f"{ROOT}http/tinymachines.ai/", f"{ROOT}offbox/", f"{E}", f"{E}game/abc", f"{E}game/abc/routine/"):
        _, inline = read(ents, uri)
        assert len(inline) <= 3, uri
        walked, _ = _walk(ents, uri)
        assert walked, uri
        if "tm:links" in rels(inline):
            assert len(walked) > 2 and [ln for ln in inline[:-1] if ln not in walked] == [], uri
        else:
            assert [ln for ln in inline if ln not in walked] == [], uri
    # A ref is part of what a thing is, so it stays on the way to its links.
    _, inline = read(ents, f"{ROOT}git/public/docs/nes/alone.md?at=v1")
    assert rels(inline)["tm:links"] == [f"{ROOT}git/public/docs/nes/alone.md?at=v1&as=links"]
    # A file over the byte cap still gives up its links.
    big = ents.repo / "data" / "huge.json"
    big.write_text('{"x": "' + "y" * (tm.READ_CAP + 10) + '"}')
    assert refusal(ents, f"{ROOT}fs/data/huge.json").reason == "too-large"
    assert _walk(ents, f"{ROOT}fs/data/huge.json")[0]
    # And the facet is offered where facets are offered.
    for tmpl in ("fs{/path*}", "git/{repo}{/path*}{?at,as,n}", "http/{site}{/path*}{?as}", "entity/{kind}/{key}{?as}"):
        got = ents.complete({"ref": {"type": "ref/resource", "uri": ROOT + tmpl}, "argument": {"name": "as", "value": "l"}})["completion"]["values"]
        assert "links" in got, tmpl


def test_the_crawler_walks_the_pages_and_fails_on_a_read_over_the_cap(ents, capsys, monkeypatch):
    crawler = _crawler()
    (ents.repo / "notes" / "escape.md").unlink()
    monkeypatch.setattr(tm, "LINK_CAP", 5)

    def crawl() -> tuple[int, str]:
        n = Namespace(ents.repo, fetch=canned_fetch, sites=tm.SITES[:1], git_repos=dict(ents.git))
        rc = run(crawler.crawl(4000, ents.repo, n))
        return rc, capsys.readouterr().out

    rc, out = crawl()
    assert rc == 0, out   # every inverse is still seen, though most reads here are over a cap of five
    # An inverse on a later page still counts: lose one that only paging reaches and the crawl is red.
    game = tm.Entities._game
    monkeypatch.setattr(tm.Entities, "_game", lambda self, key: (game(self, key)[0], [ln for ln in game(self, key)[1] if ln["rel"] != "tm:renders-as"]))
    rc, out = crawl()
    assert rc == 1 and "no tm:renders-as back" in out, out
    monkeypatch.setattr(tm.Entities, "_game", game)
    # A count that disagrees with the other end is caught (tinypeek#3).
    monkeypatch.setattr(tm.Entities, "_game", lambda self, key: (game(self, key)[0], [dict(ln, count=ln["count"] + 1) if ln["rel"] == "tm:exhibits" else ln for ln in game(self, key)[1]]))
    rc, out = crawl()
    assert rc == 1 and "count 2 one way, 3 back" in out, out
    monkeypatch.setattr(tm.Entities, "_game", game)
    # A read that ignores the cap is caught.
    bounded = tm.Namespace._bounded
    monkeypatch.setattr(tm.Namespace, "_bounded", lambda self, got, ref: got)
    rc, out = crawl()
    assert rc == 1 and "links in one read" in out, out
    monkeypatch.setattr(tm.Namespace, "_bounded", bounded)
    # So is a walk that drops a link, by the total each page states.
    page = tm.Namespace._links_page
    monkeypatch.setattr(tm.Namespace, "_links_page", lambda self, links, off: (lambda p, n: (p[:-1] if len(p) > 1 else p, n))(*page(self, links, off)))
    rc, out = crawl()
    assert rc == 1 and "walked" in out, out


# ---------------------------------------------------------------------------
# tinypeek#8: a page's text is held to the byte cap like everything else
# ---------------------------------------------------------------------------


def test_a_page_whose_text_is_over_the_cap_is_refused_with_a_range_that_reads(ns):
    page = f"{ROOT}http/tinymachines.ai/big"
    want = tm.page_text("<main>" + "x" * (tm.READ_CAP + 1) + "</main>")   # the canned page's text
    size = len(want.encode())
    assert size > tm.READ_CAP
    for uri in (page, f"{page}?as=text"):
        e = refusal(ns, uri)
        assert e.reason == "too-large" and e.data["size"] == size, "the default read is capped, not only the HTML"
        assert e.data["range"] == f"{page}?as=text&range={{start}}-{{end}}" and e.data["stat"] == f"{page}?as=stat"
    # Each range reads, and together they are the whole text.
    got, at = "", 0
    while at < size:
        end = min(at + tm.READ_CAP, size)
        c, links = read(ns, refusal(ns, page).data["range"].format(start=at, end=end))
        assert c["mimeType"] == "text/plain" and c["uri"] == f"{page}?as=text&range={at}-{end}"
        assert rels(links)["up"], "a range carries the page's links"
        got, at = got + c["text"], end
    assert got == want
    c, _ = read(ns, f"{page}?range=0-4")
    assert c["text"] == "xxxx", "text is the default, so a bare range is of the text"
    assert read(ns, f"{page}?as=text&range={size - 4}-{size + 500}")[0]["text"] == want[-4:], "an end past the text stops at its end"
    assert refusal(ns, f"{page}?as=text&range=0-{tm.READ_CAP + 1}").reason == "too-large", "a range reads at most the cap"
    for bad in ("5-5", "9-2", "abc", "-4"):
        assert refusal(ns, f"{page}?as=text&range={bad}").reason == "bad-facet", bad
    # A page under the cap is untouched, and a range of it reads too.
    small = f"{ROOT}http/tinymachines.ai/docs/nes/pile"
    whole = read(ns, small)[0]["text"]
    assert whole.startswith("What is in the pile") and read(ns, f"{small}?range=0-4")[0]["text"] == whole[:4]
    # A range is of a page's text and nothing else: refused elsewhere, not dropped (TM-11).
    assert refusal(ns, f"{small}?as=rendered&range=0-4").reason == "bad-facet"
    assert refusal(ns, f"{small}?as=stat&range=0-4").reason == "bad-facet"
    assert refusal(ns, f"{ROOT}http/tinymachines.ai/robots.txt?range=0-4").reason == "bad-facet", "not a page"
    assert refusal(ns, f"{ROOT}http/tinymachines.ai/docs/nes/?range=0-4").reason == "bad-facet", "a listing"
    # The HTML's refusal still points at something that works.
    big = refusal(ns, f"{page}?as=rendered")
    assert big.reason == "too-large" and big.data["text"].endswith("/big?as=text") and "range" in big.message


def test_a_range_does_not_cut_a_character_in_two_silently(ns):
    """Ranges are bytes of UTF-8, as on fs. A cut inside a character reads
    as the replacement mark at the edge, never as an error."""
    async def fetch(site: str, path: str):
        return 200, "text/html; charset=utf-8", "<main><p>山山山</p></main>".encode()
    n = Namespace(ns.repo, fetch=fetch)
    page = f"{ROOT}http/tinymachines.ai/x"
    assert read(n, f"{page}?range=0-3")[0]["text"] == "山"
    assert read(n, f"{page}?range=0-4")[0]["text"] == "山�"


# ---------------------------------------------------------------------------
# tinypeek#4: a git tree to a stated depth, in one read
# ---------------------------------------------------------------------------


def _tree(ns: Namespace, uri: str) -> dict:
    return json.loads(read(ns, uri)[0]["text"])


def test_a_git_tree_reads_to_a_stated_depth_in_one_git_call(gns, monkeypatch):
    top = f"{ROOT}git/public/"
    one = _tree(gns, top)
    assert _tree(gns, f"{top}?depth=1")["children"] == one["children"] == _tree(gns, f"{top}?as=tree&depth=1")["children"], "depth 1 is the listing there always was"
    assert "depth" not in one["children"][0]
    two = _tree(gns, f"{top}?depth=2")
    names = [c["name"] for c in two["children"]]
    assert two["depth"] == 2 and {"docs/", "docs/index.md", "docs/nes/", "notes/plan.md"} <= set(names)
    assert "docs/nes/alone.md" not in names, "two levels, not three"
    assert names == sorted(names), "in path order, a directory just before what is in it"
    by = {c["name"]: c for c in two["children"]}
    assert by["docs/nes/"] == {"uri": f"{top}docs/nes/", "name": "docs/nes/", "mimeType": "application/json", "isCollection": True, "depth": 2}, "a directory at the last level is listed, to be read on"
    assert by["docs/index.md"]["uri"] == f"{top}docs/index.md" and by["docs/index.md"]["mimeType"] == "text/markdown" and by["docs/index.md"]["size"] > 0 and by["docs"+"/"]["depth"] == 1
    three = _tree(gns, f"{top}?depth=3")
    assert "docs/nes/alone.md" in [c["name"] for c in three["children"]]
    assert read(gns, f"{top}?depth=3")[0]["uri"] == f"{top}?as=tree&depth=3"
    # A denied name stays redacted however deep it is listed.
    assert by["data/secret-key.json"] == {"uri": f"{top}data/secret-key.json", "name": "data/secret-key.json", "redacted": True, "isCollection": False, "depth": 2}
    # From a directory the names are relative to it, and a ref still applies.
    sub = _tree(gns, f"{top}docs/?depth=2")
    assert [c["name"] for c in sub["children"]] == ["index.md", "nes/", "nes/alone.md", "nes/index.md"]
    assert sub["children"][2]["uri"] == f"{top}docs/nes/alone.md"
    old = _tree(gns, f"{top}docs/?at=v1&depth=2")
    assert old["at"] == "v1" and old["children"][2]["uri"] == f"{top}docs/nes/alone.md?at=v1"
    assert read(gns, f"{top}docs/?at=v1&depth=2")[0]["uri"] == f"{top}docs/?at=v1&as=tree&depth=2"
    # One git ls-tree, however deep.
    calls = []
    real = tm.run_git
    monkeypatch.setattr(tm, "run_git", lambda d, *a, **k: (calls.append(a[0]), real(d, *a, **k))[1])
    _tree(gns, f"{top}?depth={tm.TREE_DEPTH_MAX}")
    assert calls.count("ls-tree") == 1, calls
    monkeypatch.setattr(tm, "run_git", real)
    # The depth is bounded, and a depth where there is no tree is refused, not dropped.
    for bad in ("0", str(tm.TREE_DEPTH_MAX + 1), "-1", "two", ""):
        e = refusal(gns, f"{top}?depth={bad}")
        assert e.reason == "bad-facet" and str(tm.TREE_DEPTH_MAX) in e.message, bad
    assert refusal(gns, f"{top}docs/index.md?depth=2").reason == "bad-facet"
    assert refusal(gns, f"{top}docs/?as=log&depth=2").reason == "bad-facet"
    got = gns.complete({"ref": {"type": "ref/resource", "uri": next(t["uriTemplate"] for t in gns.templates() if t["name"] == "git")},
                        "argument": {"name": "depth", "value": ""}})["completion"]["values"]
    assert got == [str(n) for n in range(1, tm.TREE_DEPTH_MAX + 1)]


def test_a_deep_tree_pages_and_does_not_enter_a_submodule(gns, gits, monkeypatch):
    bench_sha = git(gits["bench"], "rev-parse", "HEAD").strip()
    _pin(gns.repo, "extern/bench", bench_sha, "https://github.com/tinymachines/bench.git")
    top = f"{ROOT}git/public/"
    whole = _tree(gns, f"{top}?depth=4")["children"]
    by = {c["name"]: c for c in whole}
    assert by["extern/bench"]["submodule"] is True and by["extern/bench"]["isCollection"] is False
    assert not any(n.startswith("extern/bench/") for n in by), "what a submodule pins is another repository's to list"
    monkeypatch.setattr(tm, "LIST_CAP", 3)
    walked, uri, reads = [], f"{top}?depth=4", 0
    while uri:
        body = _tree(gns, uri)
        assert len(body["children"]) <= 3
        walked += body["children"]
        uri = f"{top}?depth=4&cursor={body['nextCursor']}" if "nextCursor" in body else None
        reads += 1
    assert walked == whole and reads > 2, "every entry once, in the same order"


# ---------------------------------------------------------------------------
# tinypeek#6: a caller cannot make unbounded requests
# ---------------------------------------------------------------------------


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _limited(ns, **kw):
    clock = _Clock()
    limiter = mcp_server.RateLimit(clock=clock, **kw)
    handler = mcp_server.make_handler({t["name"]: (lambda _: {}) for t in mcp_server.TOOLS}, namespace=ns, limiter=limiter)
    return handler, limiter, clock


def _read_msg(uri: str, mid: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": mid, "method": "resources/read", "params": {"uri": uri}}


def test_a_caller_over_the_limit_is_refused_with_when_to_come_back(ns):
    handler, limiter, clock = _limited(ns, capacity=5, per_second=0.5)
    page = f"{ROOT}fs/docs/nes/pile.md"
    for i in range(5):
        assert run(handler(_read_msg(page), caller="203.0.113.7"))["result"]["contents"], f"read {i + 1} of a burst of five"
    with pytest.raises(mcp_server.RpcError) as e:
        run(handler(_read_msg(page), caller="203.0.113.7"))
    assert e.value.code == mcp_server.RATE_LIMITED and e.value.data["reason"] == "rate-limited"
    assert e.value.data["retryAfter"] == 2, "one unit at half a unit a second"
    assert "203.0.113.7" not in json.dumps(e.value.data) + e.value.message, "the refusal does not hand an address back"
    # Somebody else is untouched, and so is a call made in-process with no caller at all.
    assert run(handler(_read_msg(page), caller="203.0.113.8"))["result"]
    for _ in range(20):
        assert run(handler(_read_msg(page)))["result"], "the box's own crawl is not a caller"
    # The tool door is the same limit, and its refusal is one a model can read.
    got = run(handler({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "resolve", "arguments": {"uri": page}}}, caller="203.0.113.7"))["result"]
    body = json.loads(got["content"][0]["text"])
    assert got["isError"] is True and body["reason"] == "rate-limited" and body["retryAfter"] == 2
    # A refused call costs nothing, so waiting the time it named is enough.
    clock.now += 1.9
    with pytest.raises(mcp_server.RpcError):
        run(handler(_read_msg(page), caller="203.0.113.7"))
    clock.now += 0.2
    assert run(handler(_read_msg(page), caller="203.0.113.7"))["result"]
    # And it fills back to the burst, no further.
    clock.now += 10_000
    assert sum(1 for _ in range(9) if _ok(handler, page, "203.0.113.7")) == 5


def _ok(handler, uri: str, caller: str) -> bool:
    try:
        run(handler(_read_msg(uri), caller=caller))
        return True
    except mcp_server.RpcError as e:
        assert e.code == mcp_server.RATE_LIMITED
        return False


def test_a_read_that_costs_the_box_more_counts_for_more(gns):
    handler, limiter, clock = _limited(gns, capacity=10, per_second=1)
    cost = mcp_server.cost
    assert cost(_read_msg(f"{ROOT}fs/docs/nes/pile.md")) == 1
    assert cost(_read_msg(f"{ROOT}http/tinymachines.ai/docs/nes/pile")) == mcp_server.COST_HTTP > 1, "a page is fetched through the front door"
    assert cost(_read_msg(f"{ROOT}git/public/docs/nes/alone.md?as=log")) == mcp_server.COST_GIT > 1, "git is a process"
    assert cost({"method": "tools/call", "params": {"name": "resolve", "arguments": {"uri": f"{ROOT}http/tinymachines.ai/docs"}}}) == mcp_server.COST_HTTP
    assert cost({"method": "tools/call", "params": {"name": "overview"}}) == 1
    for free in ("initialize", "ping", "notifications/initialized", "tools/list", "resources/templates/list"):
        assert cost({"method": free}) == 0, f"{free}: a limited client can still connect and learn the grammar"
    assert cost({"method": "resources/read", "params": {"uri": 7}}) == 1 and cost("not a message") == 1, "nonsense is counted, not crashed on"
    # Two pages are the whole burst of ten at five each; two files are not.
    assert _ok(handler, f"{ROOT}http/tinymachines.ai/docs/nes/pile", "a") and _ok(handler, f"{ROOT}http/tinymachines.ai/docs/nes/pile", "a")
    assert not _ok(handler, f"{ROOT}fs/docs/nes/alone.md", "a")
    assert _ok(handler, f"{ROOT}fs/docs/nes/alone.md", "b") and _ok(handler, f"{ROOT}fs/docs/nes/alone.md", "b")
    # A free call goes through for a caller with nothing left.
    assert run(handler({"jsonrpc": "2.0", "id": 9, "method": "initialize", "params": {}}, caller="a"))["result"]["serverInfo"]
    # A call over the limit that also fails still names the limit, not the failure.
    with pytest.raises(mcp_server.RpcError) as e:
        run(handler(_read_msg(f"{ROOT}fs/docs/nes/nope.md"), caller="a"))
    assert e.value.data["reason"] == "rate-limited"


def test_the_limiter_keeps_no_more_callers_than_it_says(ns):
    limiter = mcp_server.RateLimit(capacity=3, per_second=1, clock=_Clock(), max_callers=4)
    for i in range(50):
        assert limiter.take(f"198.51.100.{i}", 1) is None
    assert len(limiter) <= 4, "a flood of addresses does not grow the table without end"
    assert limiter.take("198.51.100.49", 1) is None and limiter.take("198.51.100.49", 1) is None and limiter.take("198.51.100.49", 1) is not None, "and the newest caller is still being counted"
    assert mcp_server.RateLimit().capacity == mcp_server.RATE_BURST and mcp_server.RateLimit().per_second == mcp_server.RATE_PER_SECOND


def test_the_server_limits_by_the_address_the_front_door_names(monkeypatch):
    """Over the real app: the route hands the caller's address to the handler,
    and it is the one nginx sets, not one a client can choose."""
    from fastapi.testclient import TestClient
    import app as service
    limiter = service._MCP.limiter
    assert isinstance(limiter, mcp_server.RateLimit), "the app's handler is built with a limit"
    assert (limiter.capacity, limiter.per_second) == (mcp_server.RATE_BURST, mcp_server.RATE_PER_SECOND)
    monkeypatch.setattr(limiter, "clock", _Clock())     # no time passes, so nothing is earned back mid-test
    body = {"jsonrpc": "2.0", "id": 1, "method": "resources/read", "params": {"uri": ROOT}}
    with TestClient(service.app) as client:
        me = {"X-Real-IP": "203.0.113.50", "X-Forwarded-For": "198.51.100.1"}
        limiter.forget("203.0.113.50")
        seen = []
        for _ in range(int(limiter.capacity) + 1):
            r = client.post("/mcp", json=body, headers=me).json()
            seen.append("error" in r)
        assert seen[:-1] == [False] * int(limiter.capacity) and seen[-1] is True, "the burst, then a refusal"
        r = client.post("/mcp", json=body, headers=me).json()
        assert r["error"]["code"] == mcp_server.RATE_LIMITED and r["error"]["data"]["reason"] == "rate-limited" and r["error"]["data"]["retryAfter"] >= 1
        # Changing the header a client controls does not reset it; another real address is another caller.
        assert "error" in client.post("/mcp", json=body, headers={**me, "X-Forwarded-For": "192.0.2.9"}).json()
        assert "result" in client.post("/mcp", json=body, headers={"X-Real-IP": "203.0.113.51"}).json()
        # A batch is counted message by message.
        limiter.forget("203.0.113.52")
        batch = [dict(body, id=i) for i in range(int(limiter.capacity) + 2)]
        got = client.post("/mcp", json=batch, headers={"X-Real-IP": "203.0.113.52"}).json()
        assert sum("error" in g for g in got) == 2
        limiter.forget("203.0.113.50"), limiter.forget("203.0.113.51"), limiter.forget("203.0.113.52")


# ---------------------------------------------------------------------------
# tinypeek#7: every read leaves one record, and the record is never served
# ---------------------------------------------------------------------------


@pytest.fixture
def outside(tmp_path_factory) -> Path:
    """A directory that is not under the temp checkout, as the service's state directory is not."""
    return tmp_path_factory.mktemp("state")


def _audited(ns, outside, **kw):
    clock = _Clock()
    log = mcp_server.AuditLog(outside / "audit", repo=ns.repo, now=lambda: 1_760_000_000 + clock.now, **kw)
    handler = mcp_server.make_handler({t["name"]: (lambda _: {"fine": True}) for t in mcp_server.TOOLS}, namespace=ns,
                                      limiter=mcp_server.RateLimit(capacity=3, per_second=1, clock=clock), audit=log)
    return handler, log, clock


def _lines(log) -> list[dict]:
    out = []
    for f in sorted(log.dir.glob("tm-audit-*.jsonl")):
        out += [json.loads(l) for l in f.read_text().splitlines()]
    return out


def test_every_read_and_every_refusal_leaves_one_record(ns, outside):
    handler, log, clock = _audited(ns, outside)
    page = f"{ROOT}fs/docs/nes/pile.md"
    got = run(handler(_read_msg(page), caller="203.0.113.7"))
    with pytest.raises(mcp_server.RpcError):
        run(handler(_read_msg(f"{ROOT}fs/docs/nes/pil.md"), caller="203.0.113.7"))
    run(handler({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "resolve", "arguments": {"uri": f"{page}?as=stat"}}}, caller="203.0.113.7"))
    with pytest.raises(mcp_server.RpcError):
        run(handler(_read_msg(page), caller="203.0.113.7"))          # the fourth of a burst of three
    run(handler({"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "resolve", "arguments": {"uri": f"{ROOT}fs/nope/x"}}}))
    run(handler({"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "overview"}}))
    run(handler({"jsonrpc": "2.0", "method": "notifications/initialized"}))
    with pytest.raises(mcp_server.RpcError):
        run(handler({"jsonrpc": "2.0", "id": 8, "method": "no/such"}))
    recs = _lines(log)
    assert [(r["method"], r.get("tool"), r.get("uri"), r["result"]) for r in recs] == [
        ("resources/read", None, page, "ok"),
        ("resources/read", None, f"{ROOT}fs/docs/nes/pil.md", "not-found"),
        ("tools/call", "resolve", f"{page}?as=stat", "ok"),
        ("resources/read", None, page, "rate-limited"),
        ("tools/call", "resolve", f"{ROOT}fs/nope/x", "out-of-root"),
        ("tools/call", "overview", None, "ok"),
        ("no/such", None, None, "error"),
    ], "one record each, a refusal by its reason, and a notification none: it has no answer"
    first = recs[0]
    assert first["bytes"] == len(json.dumps(got["result"])) and first["bytes"] > 0 and isinstance(first["ms"], int) and first["ms"] >= 0
    assert first["time"].endswith("Z") and first["token"] is None, "the token id's place, empty until there are tokens"
    assert set(first) == {"time", "method", "uri", "result", "bytes", "ms", "token"}, "and nothing else: no address"
    assert "203.0.113.7" not in "".join(f.read_text() for f in log.dir.iterdir()), "who asked is not kept"
    assert recs[3]["bytes"] == 0, "a refusal sends no content"


def test_the_log_is_a_file_a_day_kept_thirty_days_and_private(ns, outside):
    handler, log, clock = _audited(ns, outside, days=3)
    for day in range(6):
        run(handler(_read_msg(f"{ROOT}fs/docs/"), caller="a"))
        clock.now += 86_400
    names = sorted(f.name for f in log.dir.iterdir())
    assert len(names) == 3 and names == sorted(names) and all(n.startswith("tm-audit-20") and n.endswith(".jsonl") for n in names), names
    assert (log.dir.stat().st_mode & 0o077) == 0 and all((f.stat().st_mode & 0o077) == 0 for f in log.dir.iterdir()), "the owner's and nobody else's"
    assert mcp_server.AuditLog(outside / "x", repo=ns.repo).days == mcp_server.AUDIT_DAYS == 30
    # A URI is whatever a client sends: it is cut to a length and stays one line.
    with pytest.raises(mcp_server.RpcError):
        run(handler(_read_msg("tm://tinymachines/fs/docs/" + "a" * 5000 + '\n{"forged": true}'), caller="b"))
    last = _lines(log)[-1]
    assert len(last["uri"]) <= mcp_server.AUDIT_URI_MAX and "forged" not in last and last["result"] == "not-found", last["result"]
    assert all(len(f.read_text().splitlines()) == f.read_text().count("\n") for f in log.dir.iterdir()), "a newline in a URI does not make a second record"


def test_the_namespace_cannot_serve_its_own_log(ns, outside):
    # Anywhere under the checkout is refused outright, the served roots above all.
    for inside in (ns.repo / "notes" / "audit", ns.repo / "data", ns.repo / "deploy" / "audit", ns.repo):
        with pytest.raises(ValueError) as e:
            mcp_server.AuditLog(inside, repo=ns.repo)
        assert "checkout" in str(e.value)
    # A symlink into the checkout is seen through.
    (outside / "sneaky").symlink_to(ns.repo / "notes")
    with pytest.raises(ValueError):
        mcp_server.AuditLog(outside / "sneaky" / "audit", repo=ns.repo)
    # And from the namespace's side there is no way to spell a path that reaches it.
    handler, log, _ = _audited(ns, outside)
    run(handler(_read_msg(f"{ROOT}fs/docs/"), caller="a"))
    name = next(log.dir.iterdir()).name
    up = os.path.relpath(log.dir, ns.repo / "notes")
    for uri in (f"{ROOT}fs/notes/{up}/{name}", f"{ROOT}fs/notes/{up.replace('..', '%2e%2e')}/{name}", f"{ROOT}fs{log.dir}/{name}", f"{ROOT}git/public/{up}/{name}"):
        with pytest.raises(mcp_server.RpcError) as e:
            run(handler(_read_msg(uri)))
        assert e.value.data["reason"] in ("out-of-root", "not-found", "bad-facet", "git-error"), uri
        assert "tm-audit" not in json.dumps(e.value.data.get("nearest", [])), uri


def test_a_log_that_cannot_be_written_never_fails_the_read(ns, outside):
    handler, log, _ = _audited(ns, outside)
    assert run(handler(_read_msg(f"{ROOT}fs/docs/"), caller="a"))["result"]
    shutil.rmtree(log.dir)
    log.dir.write_text("a file where the directory should be")
    assert run(handler(_read_msg(f"{ROOT}fs/docs/"), caller="a"))["result"], "the read is the point; the record is not"
    assert log.failed == 1 and log.last_error, "and the failure is counted, where the owner can find it"
    # No log configured is no log, and nothing else changes.
    plain = mcp_server.make_handler({t["name"]: (lambda _: {}) for t in mcp_server.TOOLS}, namespace=ns)
    assert run(plain(_read_msg(f"{ROOT}fs/docs/")))["result"] and plain.audit is None


def test_where_the_log_goes_is_configuration_not_code(ns, outside, monkeypatch):
    monkeypatch.delenv("TM_AUDIT_DIR", raising=False)
    monkeypatch.delenv("STATE_DIRECTORY", raising=False)
    assert mcp_server.AuditLog.from_env(ns.repo) is None, "nowhere to write is no log: a test, a dev run"
    monkeypatch.setenv("STATE_DIRECTORY", f"{outside / 'state'}:{outside / 'other'}")
    assert mcp_server.AuditLog.from_env(ns.repo).dir == outside / "state" / "tm-audit"
    monkeypatch.setenv("TM_AUDIT_DIR", str(outside / "chosen"))
    assert mcp_server.AuditLog.from_env(ns.repo).dir == outside / "chosen"
    monkeypatch.setenv("TM_AUDIT_DIR", str(ns.repo / "notes"))
    assert mcp_server.AuditLog.from_env(ns.repo) is None, "a place the namespace serves is refused, and the service still starts"
    import app as service
    assert service._MCP.audit is None or not str(service._MCP.audit.dir).startswith(str(REPO)), "the app's log, where there is one, is outside the checkout"
    src = (HERE / "app.py").read_text()
    assert "audit=mcp_server.AuditLog.from_env(" in src, "and the app asks for one"


def test_the_log_is_bounded_in_bytes_and_says_what_it_dropped(ns, outside):
    """The disk the log sits on also holds the service's database."""
    handler, log, clock = _audited(ns, outside, day_bytes=600, total_bytes=1500)
    for _ in range(12):
        clock.now += 2
        run(handler(_read_msg(f"{ROOT}fs/docs/"), caller="a"))
    day1 = next(log.dir.iterdir())
    written = len(day1.read_text().splitlines())
    assert day1.stat().st_size <= 600 and 0 < written < 12 and log.dropped == 12 - written, "a day's file stops at its cap and the rest are counted"
    assert log.failed == 0, "full is not broken"
    clock.now += 86_400
    run(handler(_read_msg(f"{ROOT}fs/docs/"), caller="a"))
    first = json.loads(sorted(log.dir.iterdir())[-1].read_text().splitlines()[0])
    assert (first["method"], first["result"], first["dropped"]) == ("audit", "dropped", 12 - written) and log.dropped == 0, "the next day opens by saying so"
    for _ in range(8):
        clock.now += 86_400
        for _ in range(12):
            clock.now += 2
            run(handler(_read_msg(f"{ROOT}fs/docs/"), caller="a"))
        assert sum(f.stat().st_size for f in log.dir.iterdir()) <= 1500, "every file together stays under the overall cap"
    assert 1 <= len(list(log.dir.iterdir())) <= 3, "the oldest days went first"
    assert mcp_server.AUDIT_DAY_BYTES == 8 * 2**20 and mcp_server.AUDIT_TOTAL_BYTES == 64 * 2**20
    assert mcp_server.AUDIT_DAY_BYTES * mcp_server.AUDIT_DAYS > mcp_server.AUDIT_TOTAL_BYTES, "so it is the byte cap, not the days, that binds under load"


def test_no_refusal_says_where_the_checkout_is_on_the_host(ns, monkeypatch):
    """Found while testing the audit log: a name too long for the filesystem
    came back as an internal error quoting the checkout's absolute path."""
    where = str(ns.repo)
    handler = mcp_server.make_handler({t["name"]: (lambda _: {}) for t in mcp_server.TOOLS}, namespace=ns)
    for uri in (f"{ROOT}fs/docs/" + "a" * 5000, f"{ROOT}fs/docs/" + "a/" * 3000 + "x", f"{ROOT}fs/docs/" + "a" * 5000 + "/", f"{ROOT}fs/docs/" + "a" * 5000 + "?as=stat"):
        e = refusal(ns, uri)
        assert e.reason == "not-found" and where not in e.message and where not in json.dumps(e.data), "a path the filesystem will not look up is a path that is not there"
        with pytest.raises(mcp_server.RpcError) as r:
            run(handler(_read_msg(uri)))
        assert where not in r.value.message + json.dumps(r.value.data)
        got = run(handler({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "resolve", "arguments": {"uri": uri}}}))["result"]
        assert got["isError"] and where not in got["content"][0]["text"], "nor through the tool"
    # Anything else that goes wrong says what kind of thing it was and no more.
    def broken(self, ref):
        raise RuntimeError(f"could not open {where}/deploy/HOSTING.local.md")
    monkeypatch.setattr(Namespace, "_read_fs", broken)
    e = refusal(ns, f"{ROOT}fs/docs/")
    assert (e.code, e.reason) == (tm.INTERNAL, "internal") and "RuntimeError" in e.message and where not in e.message and "HOSTING" not in e.message
