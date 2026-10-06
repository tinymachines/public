"""tm://: this repository as a read-only URI namespace, spoken over MCP.

The spec is notes/tm-protocol-spec.md. This is its first slice: one host, two
mounts, three verbs, typed links between a served page and the file behind it.
It exists to answer the spec's first open question, whether an MCP client
navigates resources at all, on the server that already exists rather than on
one written for the purpose.

    tm://tinymachines/                       the root: the mounts
    tm://tinymachines/fs/<root>/<path>       files under docs/, data/ and notes/
    tm://tinymachines/http/<site>/<path>     pages of a site this box serves

The grammar is the spec's: the first segment names the mount, the rest is the
backend's own path, and a representation is a query parameter (`?as=stat`,
`?as=text`) rather than a path suffix, so one thing keeps one identity. A
trailing slash is a collection; reading one returns its children as JSON,
which is how a client walks coarse to fine, since MCP's resources/list has no
path argument of its own.

Three things are decided here that the spec left open, each for a reason this
box supplies:

- **The fs roots are an allowlist, not the host.** This box carries the live
  sign-in database, a gitignored hosting runbook and unit files that have held
  keys, and a filename deny-list catches none of them. So the mount is the
  three directories that are public on GitHub anyway, and nothing a path can
  spell reaches outside them: every path is resolved before it is touched and
  refused when it lands elsewhere. The deny-list is kept as a second net, not
  the first.
- **`rendered` is fetched through nginx on loopback**, with the site's name as
  SNI and Host, so the bytes are what a visitor gets: the redirect map, the
  policy headers, the real certificate. Next and uvicorn know none of that.
  Loopback also means the mount cannot be pointed at a site this box does not
  serve, which is what keeps it from being an open proxy.
- **Links ride in `_meta`.** MCP's read result has no link field; the spec's
  typed links go under one namespaced key there, which a client that does not
  know it will ignore, as the spec asks.

The link resolver is the mechanical part of the spec's build manifest: the
notebook's loader turns docs/<path>.md into /docs/<path> by a rule, so the
page-to-source join for every notebook page is exact without a manifest. What
the manifest would add (which repository a pulled page came from, which data
file a page reads) waits for the git mount.
"""

from __future__ import annotations

import base64
import fnmatch
import json
import mimetypes
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import parse_qsl, quote, unquote, urlsplit

import httpx

HOST = "tinymachines"
ROOT = f"tm://{HOST}/"

# The directories the fs mount can see. Public on GitHub already; the rest of
# the checkout (deploy/, the database, the build outputs) is not offered.
FS_ROOTS = ("docs", "data", "notes")

# The sites this box serves, by the name nginx knows them under.
SITES = ("tinymachines.ai", "beta.tinymachines.ai")

# The second net under the roots: a file that matches is listed as redacted
# and refused on read, so the client knows it exists and does not get it.
DENY = ("*.env", ".env*", "*.pem", "*.key", "id_*", "*secret*", "*.local.md", "*.db", "__pycache__", ".git", ".*")

READ_CAP = 256 * 1024   # bytes per read without ?range=
LIST_CAP = 500          # children per listing page
RESOURCES_PAGE = 100    # entries per resources/list page
COMPLETE_CAP = 100      # values per completion

# What the notebook's loader counts as a page (web/lib/docs.ts PAGE_EXT).
PAGE_EXT = (".md", ".mdx")

AS_FS = ("raw", "stat")
AS_HTTP = ("rendered", "text", "stat")

META_LINKS = "tinymachines.ai/links"

# JSON-RPC codes. -32002 is what the MCP spec reserves for a resource that
# does not exist; the rest are the standard ones.
RESOURCE_NOT_FOUND = -32002
BAD_PARAMS = -32602
INTERNAL = -32603

TEXT_TYPES = {
    ".md": "text/markdown",
    ".mdx": "text/markdown",
    ".txt": "text/plain",
    ".py": "text/x-python",
    ".json": "application/json",
    ".csv": "text/csv",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".svg": "image/svg+xml",
    ".yml": "text/yaml",
    ".yaml": "text/yaml",
    ".toml": "text/toml",
}


class TmError(Exception):
    """A structured refusal: a JSON-RPC code, a reason the client can switch
    on, and whatever helps it try again (nearest siblings, a range template,
    a stat link)."""

    def __init__(self, code: int, reason: str, message: str, **data: Any):
        super().__init__(message)
        self.code, self.reason, self.message = code, reason, message
        self.data = {"reason": reason, **data}


def link(rel: str, href: str, confidence: str | None = None, title: str | None = None) -> dict:
    """One typed link. `confidence` is mandatory on tm: relations and absent
    on IANA ones, which are exact by construction; the asymmetry is checked
    here so no caller can get it wrong quietly."""
    ours = rel.startswith("tm:")
    assert ours == (confidence is not None), f"{rel}: confidence {'required' if ours else 'not allowed'}"
    out: dict[str, Any] = {"rel": rel, "href": href}
    if confidence:
        out["confidence"] = confidence
    if title:
        out["title"] = title
    return out


def is_text(mime: str) -> bool:
    return mime.startswith("text/") or mime in ("application/json", "image/svg+xml")


def mime_for(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext in TEXT_TYPES:
        return TEXT_TYPES[ext]
    guessed, _ = mimetypes.guess_type(name)
    return guessed or "application/octet-stream"


def denied(rel_path: str) -> bool:
    return any(fnmatch.fnmatch(part, pat) for part in rel_path.split("/") for pat in DENY)


def _cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


def _offset(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        n = int(base64.urlsafe_b64decode(cursor.encode()).decode())
    except Exception:  # noqa: BLE001
        raise TmError(BAD_PARAMS, "bad-cursor", "the cursor is not one this server issued") from None
    if n < 0:
        raise TmError(BAD_PARAMS, "bad-cursor", "the cursor is not one this server issued")
    return n


def _page(items: list, cursor: str | None, size: int) -> tuple[list, str | None]:
    start = _offset(cursor)
    chunk = items[start:start + size]
    nxt = _cursor(start + size) if start + size < len(items) else None
    return chunk, nxt


# ---------------------------------------------------------------------------
# The URI
# ---------------------------------------------------------------------------


@dataclass
class Ref:
    mount: str                      # "" (the root), "fs" or "http"
    site: str | None                # http only
    path: str                       # the backend's path: "docs/nes/pile.md", "/docs/nes/pile"
    facets: dict[str, str] = field(default_factory=dict)

    @property
    def is_collection(self) -> bool:
        return self.path == "" or self.path.endswith("/")

    @property
    def uri(self) -> str:
        """The identity: no facets."""
        if self.mount == "":
            return ROOT
        if self.mount == "fs":
            return f"{ROOT}fs/{quote(self.path)}"
        return f"{ROOT}http/{self.site}{quote(self.path)}"


def parse(uri: str) -> Ref:
    if not isinstance(uri, str):
        raise TmError(BAD_PARAMS, "bad-uri", "uri must be a string")
    parts = urlsplit(uri)
    if parts.scheme != "tm" or parts.netloc != HOST:
        raise TmError(
            RESOURCE_NOT_FOUND, "not-found",
            f"{uri!r} is not under {ROOT}; this server knows one host, {HOST}",
            nearest=[ROOT],
        )
    facets = {k: v for k, v in parse_qsl(parts.query, keep_blank_values=True)}
    segs = [unquote(s) for s in parts.path.split("/") if s != ""] if parts.path not in ("", "/") else []
    trailing = parts.path.endswith("/")
    if not segs:
        return Ref("", None, "", facets)
    mount, rest = segs[0], segs[1:]
    if mount == "fs":
        path = "/".join(rest) + ("/" if trailing and rest else "")
        return Ref("fs", None, path, facets)
    if mount == "http":
        if not rest:
            return Ref("http", None, "", facets)
        site, pages = rest[0], rest[1:]
        if site not in SITES:
            raise TmError(
                RESOURCE_NOT_FOUND, "not-found",
                f"{site!r} is not a site this box serves",
                nearest=[f"{ROOT}http/{s}/" for s in SITES],
            )
        path = "/" + "/".join(pages) + ("/" if trailing and pages else "")
        if not pages:
            path = "/"
        return Ref("http", site, path, facets)
    raise TmError(
        RESOURCE_NOT_FOUND, "not-found",
        f"no mount named {mount!r}",
        nearest=[f"{ROOT}fs/", f"{ROOT}http/"],
    )


# ---------------------------------------------------------------------------
# The http mount's fetch: loopback nginx, the site's name as SNI and Host.
# ---------------------------------------------------------------------------

Fetch = Callable[[str, str], Awaitable[tuple[int, str, bytes]]]


async def fetch_loopback(site: str, path: str) -> tuple[int, str, bytes]:
    """GET one path of one served site through the front door on loopback.
    Returns (status, content-type, body). Never follows a redirect: a redirect
    is part of what the visitor gets, and the client can follow the Location
    itself."""
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as c:
        req = c.build_request(
            "GET", f"https://127.0.0.1{path}",
            headers={"Host": site, "Accept": "text/html,*/*"},
            extensions={"sni_hostname": site},
        )
        r = await c.send(req)
        return r.status_code, r.headers.get("content-type", ""), r.content


class _Text(HTMLParser):
    """The readable text of a page: what is between the tags, scripts and
    styles left out, whitespace folded. A heading or a paragraph ends a line."""

    BLOCK = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "br", "section", "article",
             "header", "footer", "table", "pre", "blockquote", "figcaption", "dt", "dd"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.main: list[str] = []
        self.skip = 0
        self.in_main = 0
        self.in_pre = 0

    # The page's own body, as the site marks it: <main> where there is one,
    # else <article>. The menu, the strip and the footer are the site's.
    BODY = ("main", "article")

    # Not the page's text: code and style, and navigation, which the site
    # puts inside <main> on a notebook page (the contents list).
    SKIP = ("script", "style", "noscript", "template", "nav", "aside")

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.BODY:
            self.in_main += 1
        elif tag in self.BLOCK:
            if tag == "pre":
                self.in_pre += 1
            self._put("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif tag in self.BODY and self.in_main:
            self.in_main -= 1
        elif tag in self.BLOCK:
            if tag == "pre" and self.in_pre:
                self.in_pre -= 1
            self._put("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self._put(data if self.in_pre else re.sub(r"\s+", " ", data))

    def _put(self, s: str) -> None:
        self.parts.append(s)
        if self.in_main:
            self.main.append(s)

    def text(self) -> str:
        # A page with a <main> is its main: the menu, the strip and the
        # footer are the site's, not the page's, and a reader who wants them
        # has ?as=rendered.
        raw = "".join(self.main or self.parts)
        lines = [ln.strip() for ln in raw.split("\n")]
        return "\n".join(ln for ln in lines if ln) + "\n"


def page_text(html: str) -> str:
    p = _Text()
    p.feed(html)
    return p.text()


# ---------------------------------------------------------------------------
# The namespace
# ---------------------------------------------------------------------------


class Namespace:
    def __init__(self, repo: Path, fetch: Fetch = fetch_loopback, sites: tuple[str, ...] = SITES):
        self.repo = repo.resolve()
        self.fetch = fetch
        self.sites = sites

    # -- what the server advertises --------------------------------------

    def templates(self) -> list[dict]:
        return [
            {
                "uriTemplate": ROOT,
                "name": "root",
                "title": "The mounts",
                "description": "Start here. Reading it lists the mounts; reading any collection (a URI ending in /) lists its children with a cursor.",
                "mimeType": "application/json",
            },
            {
                "uriTemplate": f"{ROOT}fs{{/path*}}",
                "name": "fs",
                "title": "A file or directory of this repository",
                "description": (
                    f"Files under {', '.join(FS_ROOTS)}/ of the tinymachines checkout that serves the site. "
                    "A trailing slash lists a directory. ?as=stat gives size, time and type without content; "
                    "?range=START-END reads bytes [START, END) of a file over the 256 KiB cap. "
                    "A notebook page's file carries a tm:renders-as link to the page it becomes."
                ),
            },
            {
                "uriTemplate": f"{ROOT}http/{{site}}{{/path*}}{{?as}}",
                "name": "http",
                "title": "A page of a site this box serves",
                "description": (
                    "What a visitor gets, fetched through the front door on loopback. as=rendered (the default) is the "
                    "HTML with the headers nginx adds; as=text is its readable text; as=stat is the status and size "
                    "without the body. A notebook page carries a tm:source link to the markdown behind it."
                ),
            },
        ]

    def list_resources(self, cursor: str | None) -> dict:
        """Flat, as MCP wants it: the root, the mounts, and every collection.
        Leaves are reached by reading their collection, which keeps this list
        a map rather than an inventory."""
        items: list[dict] = [
            {"uri": ROOT, "name": "root", "title": "The mounts", "mimeType": "application/json"},
            {"uri": f"{ROOT}fs/", "name": "fs", "title": "The repository's files", "mimeType": "application/json"},
            {"uri": f"{ROOT}http/", "name": "http", "title": "The sites this box serves", "mimeType": "application/json"},
        ]
        for root in FS_ROOTS:
            base = self.repo / root
            if not base.is_dir():
                continue
            dirs = [base] + sorted(p for p in base.rglob("*") if p.is_dir() and not denied(p.relative_to(self.repo).as_posix()))
            for d in dirs:
                rel = d.relative_to(self.repo).as_posix() + "/"
                items.append({"uri": f"{ROOT}fs/{quote(rel)}", "name": rel, "mimeType": "application/json"})
        for site in self.sites:
            items.append({"uri": f"{ROOT}http/{site}/", "name": site, "title": f"{site}, page by page", "mimeType": "application/json"})
        chunk, nxt = _page(items, cursor, RESOURCES_PAGE)
        out: dict[str, Any] = {"resources": chunk}
        if nxt:
            out["nextCursor"] = nxt
        return out

    # -- completion/complete ---------------------------------------------

    def complete(self, params: dict) -> dict:
        ref = params.get("ref") or {}
        arg = params.get("argument") or {}
        name, value = arg.get("name"), arg.get("value", "")
        if ref.get("type") != "ref/resource":
            raise TmError(BAD_PARAMS, "bad-ref", "this server completes resource template arguments only")
        if not isinstance(value, str):
            raise TmError(BAD_PARAMS, "bad-argument", "argument.value must be a string")
        tmpl = ref.get("uri", "")
        ctx = ((params.get("context") or {}).get("arguments") or {})
        if name == "site":
            values = [s for s in self.sites if s.startswith(value)]
        elif name == "as":
            pool = AS_HTTP if "/http/" in tmpl else AS_FS
            values = [a for a in pool if a.startswith(value)]
        elif name == "path" and "/fs" in tmpl:
            values = self._fs_complete(value)
        elif name == "path" and "/http/" in tmpl:
            site = ctx.get("site") or self.sites[0]
            if site not in self.sites:
                values = []
            else:
                values = self._http_complete(site, value)
        else:
            raise TmError(BAD_PARAMS, "bad-argument", f"no template argument named {name!r}")
        return {"completion": {"values": values[:COMPLETE_CAP], "total": len(values), "hasMore": len(values) > COMPLETE_CAP}}

    # -- resources/read ----------------------------------------------------

    async def read(self, uri: str) -> dict:
        ref = parse(uri)
        if ref.mount == "":
            body = {"uri": ROOT, "mounts": [
                {"uri": f"{ROOT}fs/", "what": f"the repository's files under {', '.join(FS_ROOTS)}/"},
                {"uri": f"{ROOT}http/", "what": "the sites this box serves, page by page"},
            ]}
            return self._result(ROOT, "application/json", json.dumps(body, indent=1), [
                link("collection", f"{ROOT}fs/"), link("collection", f"{ROOT}http/"),
            ])
        if ref.mount == "fs":
            return self._read_fs(ref)
        return await self._read_http(ref)

    def _result(self, uri: str, mime: str, text: str | None, links: list[dict], blob: bytes | None = None) -> dict:
        content: dict[str, Any] = {"uri": uri, "mimeType": mime}
        if blob is not None:
            content["blob"] = base64.b64encode(blob).decode()
        else:
            content["text"] = text
        return {"contents": [content], "_meta": {META_LINKS: links}}

    # -- fs ----------------------------------------------------------------

    def _fs_abs(self, rel: str) -> Path:
        """The one place a path becomes a filesystem call. Resolved first,
        then required to sit under one of the roots; a symlink that leaves is
        refused rather than followed."""
        clean = rel.rstrip("/")
        if clean == "":
            return self.repo
        top = clean.split("/", 1)[0]
        if top not in FS_ROOTS:
            raise TmError(
                RESOURCE_NOT_FOUND, "out-of-root",
                f"fs/{top} is not offered; the roots are {', '.join(FS_ROOTS)}",
                nearest=[f"{ROOT}fs/{r}/" for r in FS_ROOTS],
            )
        root = (self.repo / top).resolve()
        abs_ = (self.repo / clean).resolve()
        if abs_ != root and root not in abs_.parents:
            raise TmError(RESOURCE_NOT_FOUND, "out-of-root", f"fs/{clean} resolves outside fs/{top}")
        if denied(clean):
            raise TmError(RESOURCE_NOT_FOUND, "denied", f"fs/{clean} is on the deny-list; it exists and is not offered")
        return abs_

    def _fs_children(self, rel_dir: str) -> list[dict]:
        base = self.repo if rel_dir == "" else self._fs_abs(rel_dir)
        if rel_dir == "":
            names = [(self.repo / r) for r in FS_ROOTS if (self.repo / r).is_dir()]
        else:
            if not base.is_dir():
                raise self._fs_missing(rel_dir)
            names = sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name))
        out = []
        for p in names:
            rel = p.relative_to(self.repo).as_posix()
            if p.is_dir():
                out.append({"uri": f"{ROOT}fs/{quote(rel)}/", "name": p.name + "/", "mimeType": "application/json", "isCollection": True})
            elif denied(rel):
                out.append({"uri": f"{ROOT}fs/{quote(rel)}", "name": p.name, "redacted": True, "isCollection": False})
            else:
                st = p.stat()
                out.append({"uri": f"{ROOT}fs/{quote(rel)}", "name": p.name, "mimeType": mime_for(p.name), "size": st.st_size, "isCollection": False})
        return out

    def _fs_missing(self, rel: str) -> TmError:
        """not-found that teaches: the nearest siblings of the deepest
        ancestor that exists, closest names first."""
        clean = rel.rstrip("/")
        parent, _, leaf = clean.rpartition("/")
        try:
            sibs = self._fs_children(parent)
        except TmError:
            sibs = []
        sibs.sort(key=lambda c: (0 if c["name"].rstrip("/").startswith(leaf[:3]) else 1, c["name"]))
        return TmError(
            RESOURCE_NOT_FOUND, "not-found", f"fs/{clean} does not exist",
            nearest=[c["uri"] for c in sibs[:5]],
        )

    def _fs_complete(self, typed: str) -> list[str]:
        d, _, leaf = typed.rpartition("/")
        try:
            kids = self._fs_children(d)
        except TmError:
            return []
        prefix = f"{d}/" if d else ""
        return [prefix + c["name"] for c in kids if c["name"].startswith(leaf)]

    def _fs_links(self, rel: str, is_dir: bool) -> list[dict]:
        clean = rel.rstrip("/")
        parent = clean.rpartition("/")[0]
        up = f"{ROOT}fs/{quote(parent)}/" if parent else f"{ROOT}fs/"
        links = [link("up", up)]
        if not is_dir:
            links.append(link("collection", up))
            links.append(link("describedby", f"{ROOT}fs/{quote(clean)}?as=stat"))
            page = self.page_for(clean)
            if page:
                for site in self.sites:
                    links.append(link("tm:renders-as", f"{ROOT}http/{site}{page}", "exact", title=f"the page this file becomes on {site}"))
        return links

    def page_for(self, rel: str) -> str | None:
        """docs/<path>.md becomes /docs/<path>; docs/ja/<path>.md becomes
        /ja/docs/<path>; index.md names its directory. The same rule the
        notebook's loader applies (web/lib/docs.ts), restated here; the test
        checks the two against the tree."""
        if not rel.startswith("docs/") or Path(rel).name == "README.md":
            return None
        ext = next((e for e in PAGE_EXT if rel.endswith(e)), None)
        if ext is None:
            return None
        inner = rel[len("docs/"):-len(ext)]
        lang = ""
        if inner == "ja" or inner.startswith("ja/"):
            lang, inner = "/ja", inner[3:]
        if inner == "index":
            inner = ""
        elif inner.endswith("/index"):
            inner = inner[:-len("/index")]
        # A directory with no page anywhere below it is storage, not a section:
        # docs/styles holds the owner's material and routes nowhere.
        if inner.split("/")[0] == "styles":
            return None
        return f"{lang}/docs" + (f"/{inner}" if inner else "")

    def source_for(self, lang: str, slug: str) -> str | None:
        """The inverse: the file a page is rendered from. For a Japanese page
        the shadow if one exists, else the English file (its body is what the
        page shows, with a notice)."""
        stems = [f"{slug}" if slug else "index"] + ([f"{slug}/index"] if slug else [])
        dirs = ["docs/ja", "docs"] if lang == "ja" else ["docs"]
        for d in dirs:
            for stem in stems:
                for ext in PAGE_EXT:
                    c = f"{d}/{stem}{ext}"
                    if (self.repo / c).is_file():
                        return c
        return None

    def _read_fs(self, ref: Ref) -> dict:
        as_ = ref.facets.get("as", "raw")
        if as_ not in AS_FS:
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; fs offers {', '.join(AS_FS)}")
        rel = ref.path
        if ref.is_collection:
            kids = self._fs_children(rel)
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body: dict[str, Any] = {"uri": ref.uri, "children": chunk}
            if nxt:
                body["nextCursor"] = nxt
                body["next"] = f"{ref.uri}?cursor={nxt}"
            return self._result(ref.uri, "application/json", json.dumps(body, indent=1), self._fs_links(rel, True))
        abs_ = self._fs_abs(rel)
        if abs_.is_dir():
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"fs/{rel} is a directory; its listing is at {ref.uri}/", nearest=[ref.uri + "/"])
        if not abs_.is_file():
            raise self._fs_missing(rel)
        st = abs_.stat()
        mime = mime_for(abs_.name)
        links = self._fs_links(rel, False)
        if as_ == "stat":
            stat = {
                "uri": ref.uri, "name": abs_.name, "size": st.st_size, "mimeType": mime,
                "modified": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(timespec="seconds"),
                "isCollection": False, "text": is_text(mime),
            }
            return self._result(f"{ref.uri}?as=stat", "application/json", json.dumps(stat, indent=1), links + [link("alternate", ref.uri)])
        rng = ref.facets.get("range")
        start, end = 0, st.st_size
        if rng is not None:
            m = re.fullmatch(r"(\d+)-(\d+)", rng)
            if not m or int(m[1]) >= int(m[2]):
                raise TmError(BAD_PARAMS, "bad-facet", "range=START-END, bytes [START, END) with START < END")
            start, end = int(m[1]), min(int(m[2]), st.st_size)
            if end - start > READ_CAP:
                raise TmError(BAD_PARAMS, "too-large", f"a range reads at most {READ_CAP} bytes", size=st.st_size)
        elif st.st_size > READ_CAP:
            raise TmError(
                RESOURCE_NOT_FOUND, "too-large",
                f"fs/{rel} is {st.st_size} bytes; the cap is {READ_CAP}. Read it in ranges.",
                size=st.st_size, range=f"{ref.uri}?range={{start}}-{{end}}", stat=f"{ref.uri}?as=stat",
            )
        if not is_text(mime) and as_ != "raw":
            raise TmError(RESOURCE_NOT_FOUND, "binary", f"fs/{rel} is {mime}", mimeType=mime, stat=f"{ref.uri}?as=stat")
        with abs_.open("rb") as f:
            f.seek(start)
            data = f.read(end - start)
        uri = ref.uri if rng is None else f"{ref.uri}?range={start}-{end}"
        if is_text(mime):
            return self._result(uri, mime, data.decode("utf-8", errors="replace"), links)
        return self._result(uri, mime, None, links, blob=data)

    # -- http --------------------------------------------------------------

    def _site_pages(self, site: str) -> list[str]:
        """Every page the site has, as far as this box can know without
        asking it: the notebook's pages from the docs tree, by the loader's
        rule, and the rest from the last crawl recorded in data/site-map.json.
        The crawl is a measurement with a date on it, which is why it is a
        record and not a list typed here."""
        pages: set[str] = set()
        for p in (self.repo / "docs").rglob("*"):
            rel = p.relative_to(self.repo).as_posix()
            page = self.page_for(rel)
            if page:
                pages.add(page)
                if not page.startswith("/ja/"):
                    pages.add("/ja" + page)
        rec = self.repo / "data" / "site-map.json"
        if rec.is_file() and site == self.sites[0]:
            try:
                pages.update(json.loads(rec.read_text())["pages"].keys())
            except Exception:  # noqa: BLE001
                pass
        pages.add("/")
        return sorted(pages)

    def _http_children(self, site: str, prefix: str) -> list[dict]:
        """Direct children of a collection path, from the page list. A
        segment with pages beneath it is a collection whether or not it is a
        page itself, and a page with pages beneath it is both."""
        if not prefix.endswith("/"):
            prefix += "/"
        kids: dict[str, dict] = {}
        for page in self._site_pages(site):
            if page == "/" or not page.startswith(prefix):
                continue
            rest = page[len(prefix):]
            seg, _, deeper = rest.partition("/")
            if not seg:
                continue
            entry = kids.setdefault(seg, {"name": seg, "page": False, "below": False})
            if deeper:
                entry["below"] = True
            else:
                entry["page"] = True
        out = []
        for seg, e in sorted(kids.items()):
            if e["page"]:
                out.append({"uri": f"{ROOT}http/{site}{quote(prefix + seg)}", "name": seg, "mimeType": "text/html", "isCollection": False})
            if e["below"]:
                out.append({"uri": f"{ROOT}http/{site}{quote(prefix + seg)}/", "name": seg + "/", "mimeType": "application/json", "isCollection": True})
        return out

    def _http_complete(self, site: str, typed: str) -> list[str]:
        d, _, leaf = typed.rpartition("/")
        kids = self._http_children(site, d + "/")
        return [f"{d}/{c['name']}" for c in kids if c["name"].startswith(leaf)]

    def _http_links(self, site: str, path: str, is_dir: bool) -> list[dict]:
        clean = path.rstrip("/") or "/"
        parent = clean.rpartition("/")[0]
        up = f"{ROOT}http/{site}{quote(parent)}/" if parent else f"{ROOT}http/{site}/"
        base = f"{ROOT}http/{site}{quote(clean)}"
        links = [link("up", up if clean != "/" else f"{ROOT}http/")]
        if not is_dir:
            links.append(link("collection", up))
            links.append(link("describedby", f"{base}?as=stat"))
            links.append(link("alternate", f"{base}?as=text", title="readable text"))
            links.append(link("alternate", f"{base}?as=rendered", title="the HTML a visitor gets"))
            m = re.fullmatch(r"(/ja)?/docs(?:/(.*))?", clean)
            if m:
                src = self.source_for("ja" if m[1] else "en", m[2] or "")
                if src:
                    links.append(link("tm:source", f"{ROOT}fs/{quote(src)}", "exact", title="the markdown this page is rendered from"))
        return links

    async def _read_http(self, ref: Ref) -> dict:
        if ref.site is None:
            body = {"uri": f"{ROOT}http/", "children": [
                {"uri": f"{ROOT}http/{s}/", "name": s, "mimeType": "application/json", "isCollection": True} for s in self.sites
            ]}
            return self._result(f"{ROOT}http/", "application/json", json.dumps(body, indent=1), [link("up", ROOT)])
        as_ = ref.facets.get("as", "rendered")
        if as_ not in AS_HTTP:
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; http offers {', '.join(AS_HTTP)}")
        site, path = ref.site, ref.path
        if ref.is_collection and path != "/":
            kids = self._http_children(site, path)
            if not kids:
                raise self._http_missing(site, path)
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body = {"uri": ref.uri, "children": chunk}
            if nxt:
                body["nextCursor"] = nxt
            return self._result(ref.uri, "application/json", json.dumps(body, indent=1), self._http_links(site, path, True))
        if path == "/" and ref.facets.get("as") is None and ref.uri.endswith("/") and not ref.facets:
            # The site root is both the front page and the top collection;
            # the collection is what a cold client wants first.
            kids = self._http_children(site, "/")
            body = {"uri": ref.uri, "children": kids, "front_page": f"{ref.uri}?as=text"}
            return self._result(ref.uri, "application/json", json.dumps(body, indent=1), self._http_links(site, "/", True))
        status, ctype, data = await self.fetch(site, path)
        base = f"{ROOT}http/{site}{quote(path)}"
        links = self._http_links(site, path, False)
        if as_ == "stat":
            stat = {"uri": base, "status": status, "contentType": ctype, "size": len(data),
                    "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            return self._result(f"{base}?as=stat", "application/json", json.dumps(stat, indent=1), links)
        if status == 404:
            raise self._http_missing(site, path)
        if status >= 400:
            raise TmError(RESOURCE_NOT_FOUND, "unreachable", f"{site}{path} answered {status}", status=status)
        if 300 <= status < 400:
            raise TmError(RESOURCE_NOT_FOUND, "redirect", f"{site}{path} redirects; the visitor would be sent on", status=status)
        mime = ctype.split(";")[0].strip() or "application/octet-stream"
        if as_ == "text":
            if mime != "text/html":
                raise TmError(RESOURCE_NOT_FOUND, "binary", f"{site}{path} is {mime}, not a page", mimeType=mime, stat=f"{base}?as=stat")
            return self._result(f"{base}?as=text", "text/plain", page_text(data.decode("utf-8", errors="replace")), links)
        if len(data) > READ_CAP:
            raise TmError(RESOURCE_NOT_FOUND, "too-large", f"{site}{path} is {len(data)} bytes rendered; ?as=text is smaller",
                          size=len(data), stat=f"{base}?as=stat", text=f"{base}?as=text")
        if not is_text(mime):
            raise TmError(RESOURCE_NOT_FOUND, "binary", f"{site}{path} is {mime}", mimeType=mime, stat=f"{base}?as=stat")
        return self._result(base, mime, data.decode("utf-8", errors="replace"), links)

    def _http_missing(self, site: str, path: str) -> TmError:
        clean = path.rstrip("/") or "/"
        parent = clean.rpartition("/")[0] + "/"
        leaf = clean.rpartition("/")[2]
        sibs = self._http_children(site, parent)
        sibs.sort(key=lambda c: (0 if c["name"].rstrip("/").startswith(leaf[:3]) else 1, c["name"]))
        return TmError(RESOURCE_NOT_FOUND, "not-found", f"{site}{path} is not a page this box knows", nearest=[c["uri"] for c in sibs[:5]])
