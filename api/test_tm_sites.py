"""A second site on the http mount, listed from its sitemap and fenced by its
robots (tinypeek#24, spec sections 5 and 8). Nothing of the site's build is
on this box; the list is what the site publishes, and a path it does not
list, or robots disallows, is never fetched."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

import tm
from tm import ROOT, Namespace, TmError

from test_tm import canned_fetch, git, read, refusal, rels, repo, run  # noqa: F401  (repo is the fixture)

SITE = "example.site"

SITEMAP = b"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://example.site</loc><lastmod>2026-10-23T03:41:34.210Z</lastmod></url>
<url><loc>https://example.site/about</loc><lastmod>2026-10-20T00:00:00Z</lastmod></url>
<url><loc>https://example.site/projects</loc><lastmod>2026-10-21T00:00:00Z</lastmod></url>
<url><loc>https://example.site/projects/alpha</loc><lastmod>2026-10-22T00:00:00Z</lastmod></url>
<url><loc>https://example.site/visitors</loc><lastmod>2026-10-22T00:00:00Z</lastmod></url>
<url><loc>https://elsewhere.example/other</loc></url>
</urlset>
"""

ROBOTS = b"User-Agent: *\nAllow: /\nDisallow: /api/\nDisallow: /visitors\n\nSitemap: https://example.site/sitemap.xml\n"


class Site:
    """The second site as its front door would answer, every request kept."""

    def __init__(self):
        self.calls: list[str] = []
        self.sitemap = SITEMAP
        self.sitemap_status = 200
        self.robots = ROBOTS
        self.manifest: bytes | None = None   # /.well-known/tm-manifest.json, none unless a test gives one

    async def fetch(self, site: str, path: str):
        if site != SITE:
            return await canned_fetch(site, path)
        self.calls.append(path)
        if path == "/sitemap.xml":
            return self.sitemap_status, "application/xml", self.sitemap if self.sitemap_status == 200 else b"down"
        if path == "/robots.txt":
            return 200, "text/plain", self.robots
        if path == tm.SITE_MANIFEST:
            return (200, "application/json", self.manifest) if self.manifest is not None else (404, "text/html", b"<html>nope</html>")
        if path.startswith("/api/"):
            return 200, "application/json", b'{"entropy": "spent"}'
        if path in ("/", "/about", "/projects", "/projects/alpha", "/visitors", "/hidden"):
            name = path.strip("/") or "home"
            return 200, "text/html; charset=utf-8", f"<html><head><title>{name} · example</title></head><body><main><h1>{name}</h1><p>text of {name}</p></main></body></html>".encode()
        return 404, "text/html", b"<html>nope</html>"


def make(repo: Path, **kw) -> tuple[Namespace, Site]:
    site = Site()
    ns = Namespace(repo, fetch=site.fetch, sitemap_sites={SITE: {"what": "a site served here, built elsewhere"}}, **kw)
    return ns, site


def test_the_site_is_listed_beside_the_built_ones(repo):
    ns, site = make(repo)
    body = json.loads(read(ns, f"{ROOT}http/")[0]["text"])
    assert {c["name"] for c in body["children"]} == set(tm.SITES) | {SITE}
    listed = [r for r in ns.list_resources(None)["resources"] if r["uri"] == f"{ROOT}http/{SITE}/"]
    assert listed and listed[0]["title"] == f"{SITE}, page by page"
    got = ns.complete({"ref": {"type": "ref/resource", "uri": "tm://{host}/http/{site}{/path*}"}, "argument": {"name": "site", "value": "ex"}})
    assert got["completion"]["values"] == [SITE]
    assert site.calls == [], "listing the sites asks the site nothing"


def test_the_root_lists_the_sitemap_pages(repo):
    ns, site = make(repo)
    c, links = read(ns, f"{ROOT}http/{SITE}/")
    body = json.loads(c["text"])
    kids = {k["name"]: k for k in body["children"]}
    assert set(kids) == {"about", "projects", "projects/", "visitors"}, "a page, a page that is also a collection, and a disallowed page"
    assert kids["projects"]["isCollection"] is False and kids["projects/"]["isCollection"] is True
    assert kids["visitors"]["redacted"] is True, "robots disallows it: listed, never read"
    assert "title" not in kids["about"], "no build here, so no title until the manifest"
    assert body["front_page"] == f"{ROOT}http/{SITE}/?as=text"
    r = rels(links)
    assert r["describedby"] == [f"{ROOT}http/{SITE}/sitemap.xml"], "the list the site publishes"
    assert "tm:data" not in r, "no record of this checkout is read by a page built elsewhere"
    assert sorted(site.calls) == sorted(["/robots.txt", "/sitemap.xml", tm.SITE_MANIFEST]), "the list costs the site three reads, and no page"
    deeper = json.loads(read(ns, f"{ROOT}http/{SITE}/projects/")[0]["text"])
    assert [k["uri"] for k in deeper["children"]] == [f"{ROOT}http/{SITE}/projects/alpha"]
    assert sorted(site.calls) == sorted(["/robots.txt", "/sitemap.xml", tm.SITE_MANIFEST]), "the second listing came from the cached list"
    assert all("elsewhere" not in k["uri"] for k in body["children"]), "a URL on another host is not a page of this site"


def test_a_listed_page_reads_with_the_links_a_page_has_and_no_more(repo):
    ns, site = make(repo)
    c, links = read(ns, f"{ROOT}http/{SITE}/projects/alpha")
    assert c["mimeType"] == tm.T_PAGE and "text of projects/alpha" in c["text"]
    r = rels(links)
    assert r["up"] == [f"{ROOT}http/{SITE}/projects/"] and r["collection"] == r["up"]
    assert r["describedby"] == [f"{ROOT}http/{SITE}/projects/alpha?as=stat"]
    assert r["alternate"] == [f"{ROOT}http/{SITE}/projects/alpha?as=rendered"], "no other language, no other site"
    assert set(r) == {"up", "collection", "describedby", "alternate"}, "no tm:source: this checkout did not build it"
    c, _ = read(ns, f"{ROOT}http/{SITE}/projects/alpha?as=stat")
    stat = json.loads(c["text"])
    assert stat["mimeType"] == tm.T_PAGE and stat["lastmod"] == "2026-10-22T00:00:00Z", "the sitemap's lastmod rides on the stat"
    _, links = read(ns, f"{ROOT}http/{tm.SITES[0]}/docs/nes/pile")
    assert not any(SITE in ln["href"] for ln in links), "a built page has no version on a site built elsewhere"
    _, links = read(ns, f"{ROOT}http/{SITE}/about?as=stat")
    assert tm.SITES[0] not in json.dumps(links)


def test_nothing_unlisted_or_disallowed_is_ever_fetched(repo):
    ns, site = make(repo)
    e = refusal(ns, f"{ROOT}http/{SITE}/hidden")
    assert e.reason == "not-found" and f"{ROOT}http/{SITE}/about" in e.data["nearest"]
    e = refusal(ns, f"{ROOT}http/{SITE}/api/trng")
    assert e.reason == "denied" and "Disallow: /api/" in e.message, "the rule that denied it"
    e = refusal(ns, f"{ROOT}http/{SITE}/visitors?as=stat")
    assert e.reason == "denied", "listed and disallowed: robots wins, before any facet"
    e = refusal(ns, f"{ROOT}http/{SITE}/api/")
    assert e.reason == "denied"
    assert sorted(site.calls) == sorted(["/robots.txt", "/sitemap.xml", tm.SITE_MANIFEST]), f"only the three lists were asked for, not {site.calls}"
    c, _ = read(ns, f"{ROOT}http/{SITE}/robots.txt")
    assert c["mimeType"] == "text/plain" and "Disallow" in c["text"]
    c, _ = read(ns, f"{ROOT}http/{SITE}/sitemap.xml")
    assert c["mimeType"] == "application/xml"


def test_the_list_is_kept_and_re_read_on_its_interval(repo, monkeypatch):
    ns, site = make(repo)
    read(ns, f"{ROOT}http/{SITE}/about")
    read(ns, f"{ROOT}http/{SITE}/")
    assert site.calls.count("/sitemap.xml") == 1
    site.sitemap = SITEMAP.replace(b"</urlset>", b"<url><loc>https://example.site/new</loc></url></urlset>")
    now = ns.sitemaps[SITE].read_at
    monkeypatch.setattr(tm.Sitemap, "clock", staticmethod(lambda: now + tm.SITEMAP_TTL_S + 1))
    kids = json.loads(read(ns, f"{ROOT}http/{SITE}/")[0]["text"])["children"]
    assert "new" in {k["name"] for k in kids} and site.calls.count("/sitemap.xml") == 2
    site.sitemap_status = 500
    monkeypatch.setattr(tm.Sitemap, "clock", staticmethod(lambda: now + 2 * tm.SITEMAP_TTL_S + 2))
    kids = json.loads(read(ns, f"{ROOT}http/{SITE}/")[0]["text"])["children"]
    assert "new" in {k["name"] for k in kids}, "a list that stops answering keeps the last one read"
    fresh, fresh_site = make(repo)
    fresh_site.sitemap_status = 500
    e = refusal(fresh, f"{ROOT}http/{SITE}/")
    assert e.reason == "unreachable" and "sitemap.xml answered 500" in e.message
    assert fresh.sitemaps[SITE].read_at is None, "nothing kept, so the next read asks again"


def test_a_sitemap_index_is_followed_on_the_same_host(repo):
    ns, site = make(repo)
    site.sitemap = (b'<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                    b"<sitemap><loc>https://example.site/sitemap-pages.xml</loc></sitemap>"
                    b"<sitemap><loc>https://elsewhere.example/sitemap.xml</loc></sitemap></sitemapindex>")
    inner = SITEMAP
    orig = site.fetch

    async def fetch(s, p):
        if s == SITE and p == "/sitemap-pages.xml":
            site.calls.append(p)
            return 200, "application/xml", inner
        return await orig(s, p)
    ns.fetch = fetch
    kids = json.loads(read(ns, f"{ROOT}http/{SITE}/")[0]["text"])["children"]
    assert "about" in {k["name"] for k in kids}
    assert "/sitemap-pages.xml" in site.calls and not any("elsewhere" in c for c in site.calls)


def test_the_sites_file_names_the_site(repo):
    (repo / "api").mkdir()
    (repo / "api" / tm.SITES_FILE.rsplit("/", 1)[1]).write_text(json.dumps({
        "_": "note", "tinymachines.ai": {"pages": "build", "what": "here"}, SITE: {"pages": "sitemap", "what": "there"}}))
    site = Site()
    ns = Namespace(repo, fetch=site.fetch)
    assert set(ns.sitemaps) == {SITE} and ns.sites == tm.SITES, "a build site stays a build site; the sitemap one is read from the file"
    e = refusal(ns, f"{ROOT}http/nowhere.example/")
    assert e.reason == "not-found" and f"{ROOT}http/{SITE}/" in e.data["nearest"]
    assert ns.target_type(f"{ROOT}http/{SITE}/about") == tm.T_PAGE


def test_the_crawler_reads_the_site_and_holds_the_fence(repo, monkeypatch, capsys):
    from test_tm import _crawler
    mod = _crawler()
    (repo / "notes" / "escape.md").unlink()
    # One built site, as the other crawler tests do: a test earlier in the
    # suite leaves a beta build beside the temp checkouts, which the beta
    # site would otherwise read.
    ns, site = make(repo, git_repos={}, sites=tm.SITES[:1])
    assert run(mod.crawl(2000, repo, ns)) == 0, capsys.readouterr().out
    out = capsys.readouterr().out
    assert f"{SITE}: 3 pages read, 2 rules held" in out, out
    assert not any(c.startswith("/api/") or c == "/visitors" for c in site.calls), site.calls
    ns, site = make(repo, git_repos={}, sites=tm.SITES[:1])
    monkeypatch.setattr(tm.Sitemap, "denied", lambda self, path: None)
    assert run(mod.crawl(2000, repo, ns)) == 1
    out = capsys.readouterr().out
    assert "robots disallows" in out, out


MANIFEST = {
    "tm_manifest": 1, "site": SITE, "repository": "someone/example.site", "commit": "abc123",
    "pages": {
        "/about": {"title": "About me", "source": ["app/about/page.tsx"], "reads": ["data/about.json"], "x-mine": 1},
        "/projects/alpha": {"title": "Alpha", "source": ["app/projects/[p]/page.tsx", "../../etc/passwd", "/abs"]},
        "/hidden": {"title": "Not in the sitemap"},
        "/visitors": {"title": "Disallowed", "source": ["app/visitors/page.tsx"]},
    },
}


def with_manifest(repo: Path, manifest) -> tuple[Namespace, Site]:
    ns, site = make(repo)
    site.manifest = manifest if isinstance(manifest, bytes) else json.dumps(manifest).encode()
    return ns, site


def test_the_manifest_titles_a_page_and_names_its_files(repo):
    ns, site = with_manifest(repo, MANIFEST)
    c, links = read(ns, f"{ROOT}http/{SITE}/")
    kids = {k["name"]: k for k in json.loads(c["text"])["children"]}
    assert kids["about"]["title"] == "About me" and "title" not in kids["projects"]
    assert f"{ROOT}http/{SITE}{tm.SITE_MANIFEST}" in rels(links)["describedby"], "the root links the manifest, as it links the sitemap"
    st = json.loads(read(ns, f"{ROOT}http/{SITE}/about?as=stat")[0]["text"])
    assert st["title"] == "About me"
    assert st["source"] == ["app/about/page.tsx"] and st["reads"] == ["data/about.json"]
    assert st["repository"] == "someone/example.site" and st["commit"] == "abc123"
    assert "x-mine" not in st, "a key of the site's own is not carried"
    alpha = json.loads(read(ns, f"{ROOT}http/{SITE}/projects/alpha?as=stat")[0]["text"])
    assert alpha["source"] == ["app/projects/[p]/page.tsx"], "a path out of the repository, or absolute, is dropped"
    _, plinks = read(ns, f"{ROOT}http/{SITE}/about?as=stat")
    assert "tm:source" not in rels(plinks) and "tm:data" not in rels(plinks), "with no git mount for the repository, fields, not links"
    c, _ = read(ns, f"{ROOT}http/{SITE}{tm.SITE_MANIFEST}")
    assert json.loads(c["text"])["tm_manifest"] == 1, "the file reads as itself"


def test_the_manifest_cannot_add_a_page_or_open_a_fence(repo):
    ns, site = with_manifest(repo, MANIFEST)
    assert refusal(ns, f"{ROOT}http/{SITE}/hidden?as=stat").reason == "not-found"
    assert "/hidden" not in site.calls, "a page only the manifest names is not fetched"
    assert refusal(ns, f"{ROOT}http/{SITE}/visitors?as=stat").reason == "denied"
    kids = json.loads(read(ns, f"{ROOT}http/{SITE}/")[0]["text"])["children"]
    assert "title" not in next(k for k in kids if k["name"] == "visitors"), "a disallowed page's entry is not used"


@pytest.mark.parametrize("bad", [
    {**MANIFEST, "tm_manifest": 2},
    {**MANIFEST, "site": "elsewhere.example"},
    {**MANIFEST, "pages": ["/about"]},
    b"{not json",
    json.dumps({**MANIFEST, "pad": "x" * tm.SITE_MANIFEST_CAP}).encode(),
])
def test_a_manifest_the_reader_does_not_take_is_ignored_whole(repo, bad):
    ns, site = with_manifest(repo, bad)
    kids = json.loads(read(ns, f"{ROOT}http/{SITE}/")[0]["text"])["children"]
    assert not any("title" in k for k in kids)
    st = json.loads(read(ns, f"{ROOT}http/{SITE}/about?as=stat")[0]["text"])
    assert "title" not in st and "source" not in st
    _, links = read(ns, f"{ROOT}http/{SITE}/")
    assert f"{ROOT}http/{SITE}{tm.SITE_MANIFEST}" not in rels(links).get("describedby", [])


def test_the_manifest_is_read_with_the_lists(repo):
    ns, site = with_manifest(repo, MANIFEST)
    read(ns, f"{ROOT}http/{SITE}/")
    read(ns, f"{ROOT}http/{SITE}/about?as=stat")
    assert site.calls.count(tm.SITE_MANIFEST) == 1, "kept as long as the sitemap is"


def site_repo(repo: Path) -> Path:
    """The site's own repository, checked out beside the namespace's."""
    d = repo.parent / SITE
    for f, text in (("app/about/page.tsx", "export default 1\n"), ("data/about.json", "{}\n"),
                    ("app/projects/[p]/page.tsx", "export default 2\n")):
        (d / f).parent.mkdir(parents=True, exist_ok=True)
        (d / f).write_text(text)
    git(d, "init", "-q", "-b", "main")
    git(d, "add", ".")
    git(d, "commit", "-q", "-m", "the site")
    return d


def mounted(repo: Path) -> tuple[Namespace, Site]:
    site = Site()
    m = {**MANIFEST, "pages": {**MANIFEST["pages"], "/projects": {"source": ["app/gone.tsx"]}}}
    site.manifest = json.dumps(m).encode()
    ns = Namespace(repo, fetch=site.fetch, sitemap_sites={SITE: {"what": "w"}}, git_repos={"public": repo, SITE: site_repo(repo)})
    return ns, site


def test_with_the_repository_mounted_the_files_are_links_both_ways(repo):
    ns, site = mounted(repo)
    _, links = read(ns, f"{ROOT}http/{SITE}/about?as=stat")
    r = rels(links)
    assert r["tm:source"] == [f"{ROOT}git/{SITE}/app/about/page.tsx"]
    assert r["tm:data"] == [f"{ROOT}git/{SITE}/data/about.json"]
    assert all(ln.get("confidence") == "exact" for ln in links if ln["rel"] in ("tm:source", "tm:data"))
    _, back = read(ns, f"{ROOT}git/{SITE}/app/about/page.tsx")
    assert f"{ROOT}http/{SITE}/about" in rels(back)["tm:renders-as"], "the file names its page back"
    _, data = read(ns, f"{ROOT}git/{SITE}/data/about.json")
    assert f"{ROOT}http/{SITE}/about" in rels(data)["tm:read-by"]
    _, alpha = read(ns, f"{ROOT}http/{SITE}/projects/alpha?as=stat")
    assert rels(alpha)["tm:source"] == [f"{ROOT}git/{SITE}/app/projects/%5Bp%5D/page.tsx"]


def test_a_file_the_repository_does_not_track_is_named_not_linked(repo):
    ns, site = mounted(repo)
    c, links = read(ns, f"{ROOT}http/{SITE}/projects?as=stat")
    assert json.loads(c["text"])["source"] == ["app/gone.tsx"], "the field says what the manifest said"
    assert "tm:source" not in rels(links), "a link would not resolve"


def test_a_git_read_of_the_site_repository_reads_the_manifest_first(repo):
    ns, site = mounted(repo)
    _, back = read(ns, f"{ROOT}git/{SITE}/app/about/page.tsx")
    assert f"{ROOT}http/{SITE}/about" in rels(back)["tm:renders-as"], "the inverse does not wait on a read of the site"
    listing = json.loads(read(ns, f"{ROOT}git/")[0]["text"])["children"]
    assert next(c for c in listing if c["name"] == SITE + "/")["title"] == "github.com/someone/example.site", "named as the manifest names it"


def test_the_crawler_holds_the_manifest_links_both_ways(repo, capsys):
    from test_tm import _crawler
    mod = _crawler()
    (repo / "notes" / "escape.md").unlink()
    site = Site()
    site.manifest = json.dumps(MANIFEST).encode()
    ns = Namespace(repo, fetch=site.fetch, sitemap_sites={SITE: {"what": "w"}}, sites=tm.SITES[:1],
                   git_repos={SITE: site_repo(repo)})
    assert run(mod.crawl(4000, repo, ns)) == 0, capsys.readouterr().out
