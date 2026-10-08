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
import html
import json
import mimetypes
import posixpath
import re
import subprocess
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

# The repositories the git mount offers, by their GitHub name, each a sibling
# of this checkout. All public under github.com/tinymachines. "6502" is the
# served worktree when there is one, because that is the commit the site's
# pages were read from (CLAUDE.md: the build reads the served release, never
# the working tree); its HEAD is the boarded commit.
GIT_SIBLINGS = ("nes", "nes-bench", "nes-bus", "ntsc-crt", "halfphi", "2a03", "2c02")
GIT_TIMEOUT_S = 15
LOG_DEFAULT, LOG_MAX = 20, 100

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
AS_GIT = ("raw", "log", "blame", "tree", "stat")

# A ref a client may name: a branch, a tag, a commit. Nothing that git would
# read as an option, nothing that walks.
REF_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")

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
    # TM-1: the box's own sources, which an extension-only table served as
    # binary (the lessons' 6502 assembly above all).
    ".s": "text/x-asm",
    ".asm": "text/x-asm",
    ".inc": "text/x-asm",
    ".lock": "text/plain",
    ".rs": "text/x-rust",
    ".sh": "text/x-shellscript",
    ".c": "text/x-c",
    ".h": "text/x-c",
    ".cfg": "text/plain",
    ".ini": "text/plain",
    ".xml": "text/xml",
    ".log": "text/plain",
    ".service": "text/plain",
    ".nginx": "text/plain",
}

# Text files named without an extension.
TEXT_NAMES = {"LICENSE", "VERSION", "Makefile", "Dockerfile", "README", "COPYING", "NOTICE", "CHANGELOG", "AUTHORS"}

SNIFF = 8192


def looks_text(head: bytes) -> bool:
    """TM-1: the content check behind the table. The first 8 KiB holds no NUL
    and decodes as UTF-8 (a multibyte character cut at the end is allowed)."""
    if b"\0" in head:
        return False
    try:
        head.decode("utf-8")
        return True
    except UnicodeDecodeError as e:
        return e.start >= len(head) - 3


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


def mime_for(name: str, head: bytes | None = None) -> str:
    """By extension or a known name first; failing both, by content when the
    caller has the head of the file; failing that, a guess or binary."""
    base = Path(name).name
    ext = Path(name).suffix.lower()
    if ext in TEXT_TYPES:
        return TEXT_TYPES[ext]
    if base in TEXT_NAMES or base.split(".")[0] in TEXT_NAMES:
        return "text/plain"
    guessed, _ = mimetypes.guess_type(name)
    if guessed:
        return guessed
    if head is not None and looks_text(head):
        return "text/plain"
    return "application/octet-stream"


def needs_sniff(name: str) -> bool:
    """Whether the name alone leaves the type open."""
    base = Path(name).name
    return (Path(name).suffix.lower() not in TEXT_TYPES and base not in TEXT_NAMES
            and base.split(".")[0] not in TEXT_NAMES and mimetypes.guess_type(name)[0] is None)


def fs_mime(path: Path) -> str:
    if not needs_sniff(path.name):
        return mime_for(path.name)
    with path.open("rb") as f:
        return mime_for(path.name, f.read(SNIFF))


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
    mount: str                      # "" (the root), "fs", "git" or "http"
    site: str | None                # http only; the repository name for git
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
        if self.mount == "git":
            return f"{ROOT}git/{self.site}/{quote(self.path)}" if self.site else f"{ROOT}git/"
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
    if mount == "git":
        if not rest:
            return Ref("git", None, "", facets)
        repo, tree = rest[0], rest[1:]
        path = "/".join(tree) + ("/" if trailing and tree else "")
        return Ref("git", repo, path, facets)
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
        nearest=[f"{ROOT}fs/", f"{ROOT}git/", f"{ROOT}http/"],
    )


# ---------------------------------------------------------------------------
# The git mount's one way in: git itself, read-only, on a repository the
# server was told about, with every argument passed as an argument.
# ---------------------------------------------------------------------------


def git_repos_beside(repo: Path) -> dict[str, Path]:
    """The repositories offered: this checkout under its GitHub name, and the
    siblings that are checked out here."""
    out: dict[str, Path] = {"public": repo}
    parent = repo.parent
    for name in GIT_SIBLINGS:
        d = parent / name
        if (d / ".git").exists():
            out[name] = d
    served = parent / "6502-served"
    if (served / ".git").exists():
        out["6502"] = served
    elif (parent / "6502" / ".git").exists():
        out["6502"] = parent / "6502"
    return out


def run_git(repo_dir: Path, *args: str, binary: bool = False) -> bytes | str:
    """One git command, no shell, a timeout, and its failure turned into a
    refusal the client can read."""
    try:
        done = subprocess.run(
            ["git", "-C", str(repo_dir), *args],
            capture_output=True, timeout=GIT_TIMEOUT_S, check=False,
        )
    except subprocess.TimeoutExpired:
        raise TmError(INTERNAL, "timeout", f"git {args[0]} took longer than {GIT_TIMEOUT_S}s") from None
    if done.returncode != 0:
        msg = done.stderr.decode("utf-8", errors="replace").strip().splitlines()
        raise TmError(RESOURCE_NOT_FOUND, "git-error", msg[-1] if msg else f"git {args[0]} failed")
    return done.stdout if binary else done.stdout.decode("utf-8", errors="replace")


class Origins:
    """Which repository a pulled page came from. The pull scripts are the one
    copy of that fact (web/scripts/pull-nesdocs.mjs lists repo, file and slug
    per row; pull-chipdocs.mjs lists the 6502 files), so this reads them
    rather than keeping a second list. A row names where the pull writes:
    docs/nes/<slug>.md, or docs/<section>/<slug>.md, or docs/6502/<file>."""

    NES_ROW = re.compile(r'repo:\s*"([^"]+)"(?:,\s*section:\s*"([^"]+)")?,\s*file:\s*"([^"]+)",\s*slug:\s*"([^"]+)"')
    CHIP_ROW = re.compile(r'^\s*file:\s*"([^"]+)",\s*$', re.M)

    def __init__(self, repo: Path):
        self.by_fs: dict[str, tuple[str, str]] = {}      # "docs/nes/pile.md" -> ("nes-bench", "docs/pile.md")
        self.by_git: dict[tuple[str, str], str] = {}     # the inverse
        nes = repo / "web" / "scripts" / "pull-nesdocs.mjs"
        if nes.is_file():
            for m in self.NES_ROW.finditer(nes.read_text()):
                r, section, file, slug = m.groups()
                self._add(f"docs/{section or 'nes'}/{slug}.md", r, f"docs/{file}")
        chip = repo / "web" / "scripts" / "pull-chipdocs.mjs"
        if chip.is_file():
            for m in self.CHIP_ROW.finditer(chip.read_text()):
                self._add(f"docs/6502/{m[1]}", "6502", f"docs/{m[1]}")

    def _add(self, fs_rel: str, repo: str, git_path: str) -> None:
        self.by_fs[fs_rel] = (repo, git_path)
        self.by_git[(repo, git_path)] = fs_rel


class SiteGraph:
    """What a page reads, and what writes a record: read off the tree rather
    than typed. A URL's route is the Next convention (web/app/[lang]/<path>/
    page.tsx, a bracketed directory for a dynamic segment, a double bracket
    for a catch-all).

    A module reads a record when it builds the record's path (`path.join(
    ..., "data", "<name>.json")`) or imports it; a mention in a comment or a
    message is not a read. Each record has one reader module, which is what
    makes the walk worth doing (TM-8, TM-14 in the owner's work package of
    2026-10-07).

    A page's own code is its route file and the files beside it that it
    imports. What that code reads, and what the library modules it imports
    read, are the page's data: exact for a module the page's own code
    imports, inferred for one further down the imports. The site frame is
    not the page: the library modules the frame imports directly (from
    SiteFrame and every layout) are entered only when the page's own code
    imports them, and never walked through, so the menu's records and the
    metadata's are nobody's page data.

    The writer of a record is the script under scripts/ that names it, exact
    when the record's own note says so, inferred otherwise."""

    # Read by every page for its words, not for its figures.
    LANG_FILES = ("ja.json", "ja-docs.json")
    IMPORT = re.compile(r'(?:from|import)\s*["\']([^"\']+)["\']')
    READS = (re.compile(r'["\']data["\']\s*,\s*["\']([\w.-]+\.json)["\']'),
             re.compile(r'from\s*["\'](?:@/|(?:\.\./)+)data/([\w.-]+\.json)["\']'))
    FRAME = "web/app/components/SiteFrame.tsx"

    def __init__(self, repo: Path):
        self.repo = repo
        self.app = repo / "web" / "app" / "[lang]"
        self.lib = repo / "web" / "lib"
        self.data_names = sorted(p.name for p in (repo / "data").glob("*.json")) if (repo / "data").is_dir() else []
        self._modules: dict[str, tuple[set[str], list[str]]] = {}
        self._page_reads: dict[str, dict[str, tuple[str, str]]] = {}
        self._frame: set[str] | None = None
        self.routes: list[tuple[list[str], str]] = []    # (segments, file rel to repo)
        if self.app.is_dir():
            for f in sorted(self.app.rglob("page.tsx")):
                segs = list(f.relative_to(self.app).parts[:-1])
                self.routes.append((segs, f.relative_to(repo).as_posix()))

    def route_for(self, url_path: str) -> tuple[str, bool] | None:
        """The page file for a URL path, and whether the route is dynamic.
        A literal directory beats a bracketed one; a catch-all takes the
        rest; /ja is the language prefix, which is the [lang] directory."""
        parts = [p for p in url_path.split("/") if p]
        if parts and parts[0] == "ja":
            parts = parts[1:]
        best: tuple[int, str, bool] | None = None
        for segs, file in self.routes:
            score = self._match(segs, parts)
            if score is None:
                continue
            dynamic = any(seg.startswith("[") for seg in segs)
            if best is None or score > best[0]:
                best = (score, file, dynamic)
        return (best[1], best[2]) if best else None

    @staticmethod
    def _match(segs: list[str], parts: list[str]) -> int | None:
        score = 0
        i = 0
        for j, seg in enumerate(segs):
            if seg.startswith("[[...") or seg.startswith("[..."):
                if j != len(segs) - 1:
                    return None
                if seg.startswith("[...") and i >= len(parts):
                    return None
                return score
            if i >= len(parts):
                return None
            if seg.startswith("["):
                score += 1
            elif seg == parts[i]:
                score += 10
            else:
                return None
            i += 1
        return score if i == len(parts) else None

    def pages_for(self, file_rel: str) -> list[str]:
        """The URL paths a literal route file renders (one per language)."""
        for segs, file in self.routes:
            if file == file_rel and not any(seg.startswith("[") for seg in segs):
                path = "/" + "/".join(segs)
                return [path if path != "/" else "/", "/ja" + (path if path != "/" else "")]
        return []

    # -- modules --

    def _module(self, rel: str) -> tuple[set[str], list[str]]:
        """The records a module reads, and the modules it imports that the
        walk follows: the library, and the page's own files beside it."""
        if rel in self._modules:
            return self._modules[rel]
        names: set[str] = set()
        imports: list[str] = []
        f = self.repo / rel
        try:
            text = f.read_text(encoding="utf-8")
        except OSError:
            self._modules[rel] = (names, imports)
            return self._modules[rel]
        for rx in self.READS:
            names.update(n for n in rx.findall(text) if n in self.data_names)
        for spec in self.IMPORT.findall(text):
            target = self._resolve(f, spec)
            if target:
                imports.append(target)
        self._modules[rel] = (names, imports)
        return self._modules[rel]

    def _resolve(self, from_file: Path, spec: str) -> str | None:
        if spec.startswith("@/lib/"):
            base = self.repo / "web" / spec[2:]
        elif spec.startswith("."):
            base = (from_file.parent / spec).resolve()
            inside = [d.resolve() for d in (self.lib, self.app)]
            if not any(d in base.parents or d == base for d in inside):
                return None
        else:
            return None
        for cand in (base, base.with_suffix(".ts"), base.with_suffix(".tsx"), base / "index.ts", base / "index.tsx"):
            if cand.is_file() and cand.suffix in (".ts", ".tsx"):
                try:
                    rel = cand.resolve().relative_to(self.repo).as_posix()
                except ValueError:
                    return None
                return None if cand.name in ("layout.tsx", "page.tsx") else rel
        return None

    def _is_lib(self, rel: str) -> bool:
        return rel.startswith("web/lib/")

    def frame(self) -> set[str]:
        """The library modules the site frame imports directly: SiteFrame and
        every layout. Derived from their imports, so a module that joins the
        frame joins this set."""
        if self._frame is None:
            files = [self.FRAME] + [p.relative_to(self.repo).as_posix() for p in (self.repo / "web" / "app").rglob("layout.tsx")]
            out: set[str] = set()
            for rel in files:
                f = self.repo / rel
                try:
                    text = f.read_text(encoding="utf-8")
                except OSError:
                    continue
                for spec in self.IMPORT.findall(text):
                    t = self._resolve(f, spec)
                    if t and self._is_lib(t):
                        out.add(t)
            self._frame = out
        return self._frame

    def page_reads(self, page_rel: str) -> dict[str, tuple[str, str]]:
        """{record: (confidence, the module that reads it)} for a route file."""
        if page_rel in self._page_reads:
            return self._page_reads[page_rel]
        frame = self.frame()
        out: dict[str, tuple[str, str]] = {}

        def take(names: set[str], conf: str, reader: str) -> None:
            for n in names:
                if n in self.LANG_FILES:
                    continue
                if n not in out or (conf == "exact" and out[n][0] != "exact"):
                    out[n] = (conf, reader)

        # The page's own code: the route file and the files beside it.
        own: set[str] = set()
        todo = [page_rel]
        while todo:
            rel = todo.pop()
            if rel in own:
                continue
            own.add(rel)
            todo.extend(t for t in self._module(rel)[1] if not self._is_lib(t))
        seen: set[str] = set(own)
        first: list[str] = []
        for rel in sorted(own):
            names, imports = self._module(rel)
            take(names, "exact", rel)
            first.extend(t for t in imports if self._is_lib(t))
        # The library: exact where the page's own code imports the module,
        # inferred beyond; never through the frame's modules.
        todo = [(t, "exact") for t in first]
        while todo:
            rel, conf = todo.pop(0)
            if rel in seen:
                continue
            seen.add(rel)
            names, imports = self._module(rel)
            take(names, conf, rel)
            if rel in frame:
                continue
            todo.extend((t, "inferred") for t in imports if self._is_lib(t))
        self._page_reads[page_rel] = out
        return out

    # -- writers --

    def writers_of(self, name: str) -> list[tuple[str, str]]:
        """(script, confidence): the scripts under scripts/ that name the
        record. Exact when the record's own note names the script."""
        stated: set[str] = set()
        rec = self.repo / "data" / name
        try:
            note = json.loads(rec.read_text()).get("_", "")
            if isinstance(note, str):
                stated.update(re.findall(r"scripts/[\w./-]+\.(?:py|mjs|ts|sh)", note))
        except Exception:  # noqa: BLE001
            pass
        out: list[tuple[str, str]] = []
        sdir = self.repo / "scripts"
        if sdir.is_dir():
            for f in sorted(sdir.iterdir()):
                if not f.is_file() or f.name == "deploy.sh" or f.name.startswith("check-"):
                    continue
                try:
                    text = f.read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError):
                    continue
                rel = f"scripts/{f.name}"
                if rel in stated:
                    out.append((rel, "exact"))
                elif re.search(r"\b" + re.escape(name) + r"\b", text):
                    out.append((rel, "inferred"))
        for rel in sorted(stated):
            if rel not in {r for r, _ in out}:
                out.append((rel, "exact"))
        return out


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
    def __init__(
        self,
        repo: Path,
        fetch: Fetch = fetch_loopback,
        sites: tuple[str, ...] = SITES,
        git_repos: dict[str, Path] | None = None,
    ):
        self.repo = repo.resolve()
        self.fetch = fetch
        self.sites = sites
        self.git = {k: v.resolve() for k, v in (git_repos if git_repos is not None else git_repos_beside(self.repo)).items()}
        self.origins = Origins(self.repo)
        self.graph = SiteGraph(self.repo)
        self._built: dict[str, tuple] = {}

    # -- the tool-shaped door --------------------------------------------

    def tool(self) -> dict:
        """The one tool the spec allows: resolve(uri), which is read with the
        links in the body rather than in _meta. For a client that is
        tool-first and never lists resources; it changes nothing about the
        namespace, and the two answer the same thing."""
        return {
            "name": "resolve",
            "title": "Read a tm:// URI, with its links",
            "description": (
                "Read one URI of the tm:// namespace and get its content with typed links to the "
                "things around it. Start with tm://tinymachines/ (the mounts), read any URI ending "
                "in / to list its children, and read a file or page to get it: "
                "tm://tinymachines/fs/docs/nes/pile.md is a file of this checkout, "
                "tm://tinymachines/http/tinymachines.ai/docs/nes/pile?as=text is the page it becomes, "
                "as its readable text. A notebook page links to its markdown (tm:source) and the file "
                "links back (tm:renders-as); up, collection, alternate and describedby are the IANA "
                "relations. ?as=stat gives metadata without content. A URI that does not resolve "
                "is refused with the nearest ones that do, so try the nearest rather than guessing."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {"uri": {"type": "string", "description": "A tm:// URI, with facets in its query string."}},
                "required": ["uri"],
                "additionalProperties": False,
            },
        }

    async def resolve(self, args: dict) -> dict:
        uri = args.get("uri")
        if not isinstance(uri, str):
            raise TmError(BAD_PARAMS, "bad-uri", "resolve needs a uri")
        got = await self.read(uri)
        content = dict(got["contents"][0])
        if "blob" in content:
            raw = parse(uri).facets.get("as") == "raw"
            content["bytes"] = len(base64.b64decode(content["blob"]))
            if raw:
                # TM-2: asked for the bytes, so they come back, base64, within
                # the read cap (?range= beyond it).
                content["encoding"] = "base64"
            else:
                content.pop("blob")
                content["note"] = "binary; add ?as=raw for the bytes, base64 (with ?range=START-END past the cap)"
        content["links"] = got["_meta"][META_LINKS]
        return content

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
                "uriTemplate": f"{ROOT}git/{{repo}}{{/path*}}{{?at,as,n}}",
                "name": "git",
                "title": "A file or tree of a repository, at a ref",
                "description": (
                    f"Repositories: {', '.join(sorted(self.git))}. A path is a tree path; at= is a branch, tag or "
                    "commit (default HEAD; for 6502 that is the commit the site serves). as=log gives the commits "
                    "touching the path (n= how many, default 20), as=blame the file with a commit per line, "
                    "as=tree a directory as JSON, as=stat the object's type, size and resolved commit. A pulled "
                    "notebook page's origin file carries tm:generates to the copy in this checkout and "
                    "tm:renders-as to its page."
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
            {"uri": f"{ROOT}git/", "name": "git", "title": "The repositories, at any ref", "mimeType": "application/json"},
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
        for name in sorted(self.git):
            items.append({"uri": f"{ROOT}git/{name}/", "name": name, "title": f"tinymachines/{name} at HEAD", "mimeType": "application/json"})
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
        elif name == "repo":
            values = [r for r in sorted(self.git) if r.startswith(value)]
        elif name == "as":
            pool = AS_HTTP if "/http/" in tmpl else AS_GIT if "/git/" in tmpl else AS_FS
            values = [a for a in pool if a.startswith(value)]
        elif name == "n":
            values = [str(n) for n in (LOG_DEFAULT, 50, LOG_MAX) if str(n).startswith(value)]
        elif name == "at":
            repo = ctx.get("repo") or "public"
            values = self._git_refs(repo, value) if repo in self.git else []
        elif name == "path" and "/git/" in tmpl:
            repo = ctx.get("repo") or "public"
            values = self._git_complete(repo, ctx.get("at") or "HEAD", value) if repo in self.git else []
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
                {"uri": f"{ROOT}git/", "what": f"the repositories ({', '.join(sorted(self.git))}) at any ref, with history and blame"},
                {"uri": f"{ROOT}http/", "what": "the sites this box serves, page by page"},
            ]}
            return self._result(ROOT, "application/json", json.dumps(body, indent=1), [
                link("collection", f"{ROOT}fs/"), link("collection", f"{ROOT}git/"), link("collection", f"{ROOT}http/"),
            ])
        if ref.mount == "fs":
            return self._read_fs(ref)
        if ref.mount == "git":
            return self._read_git(ref)
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
                out.append({"uri": f"{ROOT}fs/{quote(rel)}", "name": p.name, "mimeType": fs_mime(p), "size": st.st_size, "isCollection": False})
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
        # TM-10: the mount's own root goes up to the namespace's, never to itself.
        links = [link("up", up if clean else ROOT)]
        if not is_dir:
            links.append(link("collection", up))
            links.append(link("describedby", f"{ROOT}fs/{quote(clean)}?as=stat"))
            page = self.page_for(clean)
            if page:
                pages = [page]
                # An English page with no Japanese shadow is the body /ja shows too.
                if not page.startswith("/ja/") and not (self.repo / "docs" / "ja" / clean[len("docs/"):]).exists():
                    pages.append("/ja" + page)
                for site in self.sites:
                    for pg in (q for q in pages if self.serves(site, q)):
                        links.append(link("tm:renders-as", f"{ROOT}http/{site}{pg}", "exact", title=f"the page this file becomes on {site}"))
            links.extend(self._origin_links(clean))
            links.extend(self._record_links(clean))
        return links

    def _record_links(self, rel: str) -> list[dict]:
        """For data/<name>.json: the script that writes it and the pages that
        read it. The same links hang off the file in git."""
        if not rel.startswith("data/") or not rel.endswith(".json") or "/" in rel[len("data/"):]:
            return []
        name = rel[len("data/"):]
        links: list[dict] = []
        if "public" in self.git:
            for script, conf in self.graph.writers_of(name):
                links.append(link("tm:generated-by", f"{ROOT}git/public/{quote(script)}", conf,
                                  title="the script that writes this record" if conf == "exact" else "a script that names this record"))
        # Every page that names this record back as its data, on both sites
        # and in both languages, with the same confidence (TM-14).
        for site, page, conf in self.readers(name):
            links.append(link("tm:read-by", f"{ROOT}http/{site}{page}", conf,
                              title="a page whose own code reads this record" if conf == "exact" else "a page whose library reaches this record"))
        return links

    def _origin_links(self, rel: str) -> list[dict]:
        """From a file of this checkout into git: the tracked file's own
        history, or, for a page the build pulled in, the file in the other
        repository it was pulled from."""
        links: list[dict] = []
        origin = self.origins.by_fs.get(rel)
        if origin and origin[0] in self.git:
            repo, gpath = origin
            there = f"{ROOT}git/{repo}/{quote(gpath)}"
            links.append(link("tm:generated-by", there, "exact", title=f"pulled at build time from {repo}/{gpath}"))
            links.append(link("version-history", f"{there}?as=log"))
        elif "public" in self.git and self._git_has("public", "HEAD", rel):
            here = f"{ROOT}git/public/{quote(rel)}"
            links.append(link("tm:repository", here, "exact", title="this file in the repository, at HEAD"))
            links.append(link("version-history", f"{here}?as=log"))
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
        mime = fs_mime(abs_)
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

    # -- git ---------------------------------------------------------------

    def _git_dir(self, repo: str | None) -> Path:
        if repo is None or repo not in self.git:
            raise TmError(
                RESOURCE_NOT_FOUND, "not-found", f"{repo!r} is not a repository this server offers",
                nearest=[f"{ROOT}git/{r}/" for r in sorted(self.git)],
            )
        return self.git[repo]

    def _git_path(self, path: str) -> str:
        """A tree path, normalised, refused if it would walk up. git would
        refuse it too; this refuses it with the mount's own reason."""
        clean = posixpath.normpath(path.rstrip("/")) if path.rstrip("/") else ""
        if clean == ".":
            clean = ""
        if clean.startswith("../") or clean == ".." or clean.startswith("/"):
            raise TmError(RESOURCE_NOT_FOUND, "out-of-root", f"{path} walks out of the tree")
        if clean and denied(clean):
            raise TmError(RESOURCE_NOT_FOUND, "denied", f"{clean} is on the deny-list; it exists and is not offered")
        return clean

    def _git_at(self, repo: str, at: str) -> str:
        """The ref as given, checked, and its commit."""
        if not REF_OK.match(at) or ".." in at:
            raise TmError(BAD_PARAMS, "bad-facet", f"at={at!r} is not a ref name")
        try:
            return run_git(self._git_dir(repo), "rev-parse", "--verify", "--quiet", f"{at}^{{commit}}").strip()
        except TmError:
            raise TmError(
                RESOURCE_NOT_FOUND, "no-such-ref", f"{repo} has no ref {at!r}",
                nearest=[f"{ROOT}git/{repo}/?at={r}" for r in self._git_refs(repo, at[:1])[:5]],
            ) from None

    def _git_refs(self, repo: str, prefix: str) -> list[str]:
        out = run_git(self._git_dir(repo), "for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/tags")
        refs = ["HEAD"] + [r for r in out.split() if r]
        return [r for r in refs if r.startswith(prefix)]

    def _git_has(self, repo: str, at: str, path: str) -> bool:
        try:
            run_git(self._git_dir(repo), "cat-file", "-e", f"{at}:{path}")
            return True
        except TmError:
            return False

    def _git_children(self, repo: str, at: str, tree: str) -> list[dict]:
        spec = f"{at}:{tree}" if tree else at
        try:
            out = run_git(self._git_dir(repo), "ls-tree", "-l", spec)
        except TmError:
            raise self._git_missing(repo, at, tree) from None
        kids = []
        lines = [l.partition("\t") for l in out.splitlines()]
        unknown = [meta.split()[2] for meta, _, name in lines if meta.split()[1] == "blob" and needs_sniff(name)]
        heads = self._git_heads(repo, unknown)
        for meta, _, name in lines:
            mode, kind, _sha, size = meta.split()
            rel = f"{tree}/{name}" if tree else name
            base = f"{ROOT}git/{repo}/{quote(rel)}"
            if kind == "tree":
                kids.append({"uri": base + "/", "name": name + "/", "mimeType": "application/json", "isCollection": True})
            elif kind == "commit":
                kids.append({"uri": base, "name": name, "submodule": True, "isCollection": False})
            elif denied(rel):
                kids.append({"uri": base, "name": name, "redacted": True, "isCollection": False})
            else:
                kids.append({"uri": base, "name": name, "mimeType": mime_for(name, heads.get(_sha)), "size": int(size), "isCollection": False})
        kids.sort(key=lambda c: (not c["isCollection"], c["name"]))
        return kids

    def _git_heads(self, repo: str, shas: list[str]) -> dict[str, bytes]:
        """The first 8 KiB of each blob, in one git call (cat-file --batch)."""
        if not shas:
            return {}
        done = subprocess.run(["git", "-C", str(self._git_dir(repo)), "cat-file", "--batch"], input="\n".join(shas).encode() + b"\n",
                              capture_output=True, timeout=GIT_TIMEOUT_S, check=False)
        out, i, heads = done.stdout, 0, {}
        for sha in shas:
            nl = out.index(b"\n", i)
            parts = out[i:nl].split()
            i = nl + 1
            if len(parts) < 3:
                continue
            n = int(parts[2])
            heads[sha] = out[i:i + min(n, SNIFF)]
            i += n + 1
        return heads

    def _git_missing(self, repo: str, at: str, path: str) -> TmError:
        clean = path.rstrip("/")
        parent, _, leaf = clean.rpartition("/")
        try:
            sibs = self._git_children(repo, at, parent)
        except TmError:
            sibs = []
        sibs.sort(key=lambda c: (0 if c["name"].rstrip("/").startswith(leaf[:3]) else 1, c["name"]))
        return TmError(
            RESOURCE_NOT_FOUND, "not-found", f"{repo} at {at} has no {clean!r}",
            nearest=[c["uri"] for c in sibs[:5]],
        )

    def _git_complete(self, repo: str, at: str, typed: str) -> list[str]:
        d, _, leaf = typed.rpartition("/")
        try:
            kids = self._git_children(repo, at, d)
        except TmError:
            return []
        prefix = f"{d}/" if d else ""
        return [prefix + c["name"] for c in kids if c["name"].startswith(leaf)]

    def _git_links(self, repo: str, at: str, path: str, is_dir: bool, head: bool) -> list[dict]:
        clean = path.rstrip("/")
        parent = clean.rpartition("/")[0]
        q = "" if head else f"?at={at}"
        up = f"{ROOT}git/{repo}/{quote(parent)}/{q}" if parent else f"{ROOT}git/{repo}/{q}"
        links = [link("up", up if clean else f"{ROOT}git/")]
        base = f"{ROOT}git/{repo}/{quote(clean)}"
        if not head and clean:
            links.append(link("latest-version", base, title="the same path at HEAD"))
        if repo == "public" and head:
            # TM-6: a lesson's directory and every file in it render as the
            # lesson's pages, which name them back as their source.
            key = self.lesson_of(clean)
            if key:
                for site in self.sites:
                    for pg in self.lesson_pages(site, key):
                        links.append(link("tm:renders-as", f"{ROOT}http/{site}{pg}", "exact", title=f"the lesson page this cartridge's source becomes on {site}"))
        if is_dir:
            return links
        sep = "&" if q else "?"
        links.append(link("collection", up))
        links.append(link("describedby", f"{base}{q}{sep}as=stat"))
        links.append(link("version-history", f"{base}{q}{sep}as=log"))
        links.append(link("alternate", f"{base}{q}{sep}as=blame", title="the file with a commit per line"))
        if repo == "public" and clean.split("/")[0] in FS_ROOTS and (self.repo / clean).is_file():
            links.append(link("tm:working-copy", f"{ROOT}fs/{quote(clean)}", "exact", title="the checked-out file"))
        if repo == "public" and head:
            # A route renders every page the site's build made from it (the
            # build's prerender manifest), dynamic routes included.
            for site in self.sites:
                for page in self.pages_of_route(site, clean):
                    links.append(link("tm:renders-as", f"{ROOT}http/{site}{page}", "exact", title=f"a page this route renders on {site}"))
            if clean.startswith("scripts/"):
                for name in self.graph.data_names:
                    for script, conf in self.graph.writers_of(name):
                        if script == clean:
                            links.append(link("tm:generates", f"{ROOT}fs/data/{quote(name)}", conf, title="a record this script writes"))
        pulled = self.origins.by_git.get((repo, clean))
        if pulled and head:
            # The origin of a pulled page generates its copy here and the pages
            # made from that copy, which name it back as what generated them.
            links.append(link("tm:generates", f"{ROOT}fs/{quote(pulled)}", "exact", title=f"the copy the build pulls to {pulled}"))
            page = self.page_for(pulled)
            if page:
                for site in (x for x in self.sites if self.serves(x, page)):
                    links.append(link("tm:generates", f"{ROOT}http/{site}{page}", "exact", title=f"the page it becomes on {site}"))
        return links

    def _read_git(self, ref: Ref) -> dict:
        if ref.site is None:
            body = {"uri": f"{ROOT}git/", "children": [
                {"uri": f"{ROOT}git/{r}/", "name": r + "/", "mimeType": "application/json", "isCollection": True,
                 "title": f"github.com/tinymachines/{r}"} for r in sorted(self.git)
            ]}
            return self._result(f"{ROOT}git/", "application/json", json.dumps(body, indent=1), [link("up", ROOT)])
        repo = ref.site
        as_ = ref.facets.get("as", "tree" if ref.is_collection else "raw")
        if as_ not in AS_GIT:
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; git offers {', '.join(AS_GIT)}")
        at = ref.facets.get("at", "HEAD")
        commit = self._git_at(repo, at)
        head = at == "HEAD"
        path = self._git_path(ref.path)
        q = "" if head else f"?at={at}"
        sep = "&" if q else "?"
        base = f"{ROOT}git/{repo}/{quote(path)}"
        if as_ == "tree" or (ref.is_collection and as_ == "raw"):
            kids = self._git_children(repo, at, path)
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body: dict[str, Any] = {"uri": base + ("/" if path else ""), "at": at, "commit": commit, "children": chunk}
            if nxt:
                body["nextCursor"] = nxt
            return self._result(body["uri"] + q, "application/json", json.dumps(body, indent=1), self._git_links(repo, at, path, True, head))
        if not path:
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"the root of {repo} is a tree; read {ROOT}git/{repo}/", nearest=[f"{ROOT}git/{repo}/"])
        if as_ == "log":
            try:
                n = max(1, min(int(ref.facets.get("n", LOG_DEFAULT)), LOG_MAX))
            except ValueError:
                raise TmError(BAD_PARAMS, "bad-facet", "n= must be a number") from None
            if not self._git_has(repo, at, path):
                raise self._git_missing(repo, at, path)
            out = run_git(self._git_dir(repo), "log", f"-n{n}", "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s", at, "--", path)
            commits = []
            for line in out.splitlines():
                full, short, author, date, subject = line.split("\x1f", 4)
                commits.append({"commit": full, "short": short, "author": author, "date": date, "subject": subject,
                                "uri": f"{base}?at={full}"})
            body = {"uri": f"{base}{q}{sep}as=log", "path": path, "at": at, "n": n, "commits": commits}
            return self._result(body["uri"], "application/json", json.dumps(body, indent=1), self._git_links(repo, at, path, False, head))
        try:
            kind = run_git(self._git_dir(repo), "cat-file", "-t", f"{at}:{path}").strip()
        except TmError:
            raise self._git_missing(repo, at, path) from None
        if kind == "tree":
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"{path} is a tree; its listing is at {base}/", nearest=[f"{base}/{q}"])
        if kind != "blob":
            raise TmError(RESOURCE_NOT_FOUND, "binary", f"{path} is a {kind} (a submodule), not a file", mimeType="application/x-git-" + kind)
        size = int(run_git(self._git_dir(repo), "cat-file", "-s", f"{at}:{path}").strip())
        mime = mime_for(path) if not needs_sniff(path) else mime_for(path, run_git(self._git_dir(repo), "cat-file", "blob", f"{at}:{path}", binary=True)[:SNIFF])
        links = self._git_links(repo, at, path, False, head)
        if as_ == "stat":
            stat = {"uri": base, "path": path, "at": at, "commit": commit, "type": kind, "size": size, "mimeType": mime, "text": is_text(mime)}
            return self._result(f"{base}{q}{sep}as=stat", "application/json", json.dumps(stat, indent=1), links + [link("alternate", base + q)])
        if as_ == "blame":
            out = run_git(self._git_dir(repo), "blame", "-l", "--root", "--date=short", at, "--", path)
            if len(out.encode()) > READ_CAP:
                raise TmError(RESOURCE_NOT_FOUND, "too-large", f"blame of {path} is over the cap; read the file in ranges and the log instead",
                              size=len(out.encode()), log=f"{base}{q}{sep}as=log")
            return self._result(f"{base}{q}{sep}as=blame", "text/plain", out, links)
        rng = ref.facets.get("range")
        start, end = 0, size
        if rng is not None:
            m = re.fullmatch(r"(\d+)-(\d+)", rng)
            if not m or int(m[1]) >= int(m[2]):
                raise TmError(BAD_PARAMS, "bad-facet", "range=START-END, bytes [START, END) with START < END")
            start, end = int(m[1]), min(int(m[2]), size)
            if end - start > READ_CAP:
                raise TmError(BAD_PARAMS, "too-large", f"a range reads at most {READ_CAP} bytes", size=size)
        elif size > READ_CAP:
            raise TmError(RESOURCE_NOT_FOUND, "too-large", f"{path} is {size} bytes at {at}; the cap is {READ_CAP}. Read it in ranges.",
                          size=size, range=f"{base}{q}{sep}range={{start}}-{{end}}", stat=f"{base}{q}{sep}as=stat")
        data = run_git(self._git_dir(repo), "cat-file", "blob", f"{at}:{path}", binary=True)[start:end]
        uri = base + q if rng is None else f"{base}{q}{sep}range={start}-{end}"
        if is_text(mime):
            return self._result(uri, mime, data.decode("utf-8", errors="replace"), links)
        return self._result(uri, mime, None, links, blob=data)

    # -- http --------------------------------------------------------------

    # -- the sites' builds ----------------------------------------------------

    def build_dir(self, site: str) -> Path | None:
        """Where the build that serves a site lives: this checkout for live,
        the beta worktree beside it for beta."""
        d = (self.repo / "web" / ".next") if site == self.sites[0] else (self.repo.parent / "public-beta" / "web" / ".next")
        return d if (d / "prerender-manifest.json").is_file() else None

    def built(self, site: str) -> dict[str, str] | None:
        """TM-3: every page the site's build prerendered, from its prerender
        manifest: the URL path a visitor uses, and the route file that made
        it. None where there is no build to read."""
        d = self.build_dir(site)
        if d is None:
            return None
        key = (site, (d / "prerender-manifest.json").stat().st_mtime)
        if self._built.get(site, (None,))[0] != key:
            routes = json.loads((d / "prerender-manifest.json").read_text())["routes"]
            pages: dict[str, str] = {}
            for p, r in routes.items():
                src = r.get("srcRoute") or p
                if not src.startswith("/[lang]") or r.get("routeType", "page") != "page":
                    continue
                m = re.fullmatch(r"/(en|ja)(/.*)?", p)
                if not m:
                    continue
                url = (m[2] or "/") if m[1] == "en" else "/ja" + (m[2] or "")
                pages[url] = f"web/app{src}/page.tsx".replace("/page.tsx/page.tsx", "/page.tsx")
            self._built[site] = (key, pages)
        return self._built[site][1]

    def page_title(self, site: str, path: str) -> str | None:
        """A page's title, from the HTML its build wrote."""
        d = self.build_dir(site)
        if d is None:
            return None
        rel = ("en" + (path if path != "/" else "")) if not path.startswith("/ja") else ("ja" + path[3:])
        f = d / "server" / "app" / f"{rel or 'en'}.html"
        if not f.is_file():
            return None
        m = re.search(r"<title>([^<]*)</title>", f.read_text(errors="replace")[:4000])
        return html.unescape(m[1]).rsplit(" · ", 1)[0] if m else None

    def serves(self, site: str, page: str) -> bool:
        """Whether a site serves a page, as far as its build says: where the
        build is on this box its prerender manifest decides, so a page added
        since (the beta between a deploy and its follow) is not claimed."""
        b = self.built(site)
        return b is None or page in b

    def shipped(self, site: str, route_file: str) -> set[str] | None:
        """The source modules the site's build put in a route's server
        bundle: the page entry's chunks and each chunk's source map. None
        where there is no build, or no entry for the route, to read."""
        d = self.build_dir(site)
        if d is None or not route_file.startswith("web/app/"):
            return None
        entry = d / "server" / "app" / route_file[len("web/app/"):].replace(".tsx", ".js")
        if not entry.is_file():
            return None
        cache = self.__dict__.setdefault("_shipped", {})
        key = (site, route_file, entry.stat().st_mtime)
        if key not in cache:
            mods: set[str] = set()
            for chunk in re.findall(r'R\.c\("([^"]+)"\)', entry.read_text(errors="replace")):
                m = d / (chunk + ".map")
                try:
                    sm = json.loads(m.read_text())
                except (OSError, ValueError):
                    continue
                sources = list(sm.get("sources", []))
                for sec in sm.get("sections", []):
                    sources.extend(sec.get("map", {}).get("sources", []))
                # Relative to the tree the build was made in: the beta's
                # bundle names the beta worktree's files, not this checkout's.
                tree = d.parent.parent.resolve()
                for src in sources:
                    try:
                        mods.add((m.parent / unquote(src)).resolve().relative_to(tree).as_posix())
                    except ValueError:
                        continue
            cache[key] = mods
        return cache[key]

    def page_reads(self, site: str, route_file: str) -> dict[str, str]:
        """{record: confidence} for a route on a site: the graph's reading,
        less any record whose reader module the site's build did not ship
        with the page."""
        reads = self.graph.page_reads(route_file)
        ship = self.shipped(site, route_file)
        return {n: conf for n, (conf, reader) in sorted(reads.items()) if ship is None or reader in ship}

    def readers(self, name: str) -> list[tuple[str, str, str]]:
        """(site, page, confidence) for every page whose data names the record."""
        out = []
        for site in self.sites:
            for _, file in self.graph.routes:
                conf = self.page_reads(site, file).get(name)
                if conf:
                    out.extend((site, p, conf) for p in self.pages_of_route(site, file))
        return sorted(out)

    def pages_of_route(self, site: str, file_rel: str) -> list[str]:
        b = self.built(site)
        if b is None:
            return self.graph.pages_for(file_rel)
        return sorted(p for p, f in b.items() if f == file_rel)

    def lesson_of(self, rel: str) -> str | None:
        """The lesson a path in lessons/ belongs to (its directory or a file in it)."""
        m = re.fullmatch(r"lessons/([a-z0-9-]+)(?:/[^/]+)?", rel)
        return m[1] if m and (self.repo / "lessons" / m[1] / "lesson.json").is_file() else None

    def lesson_pages(self, site: str, key: str) -> list[str]:
        pages = [f"/autopsy/lessons/{key}", f"/ja/autopsy/lessons/{key}"]
        b = self.built(site)
        return [p for p in pages if b is None or p in b]

    def lesson_files(self, key: str) -> list[str]:
        """The tracked files of a lesson's directory, at HEAD."""
        if "public" not in self.git:
            return []
        try:
            out = run_git(self.git["public"], "ls-tree", "--name-only", "HEAD", f"lessons/{key}/")
        except TmError:
            return []
        return [l for l in out.splitlines() if l]

    def _site_pages(self, site: str) -> list[str]:
        """Every page the site has, as far as this box can know without
        asking it: the notebook's pages from the docs tree, by the loader's
        rule, and the rest from the last crawl recorded in data/site-map.json.
        The crawl is a measurement with a date on it, which is why it is a
        record and not a list typed here. Where the site's build is on this
        box, its prerender manifest is the list instead: every page, the
        dynamic ones included (TM-3)."""
        b = self.built(site)
        if b is not None:
            return sorted(b)
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
                child = {"uri": f"{ROOT}http/{site}{quote(prefix + seg)}", "name": seg, "mimeType": "text/html", "isCollection": False}
                title = self.page_title(site, prefix + seg)
                if title:
                    child["title"] = title
                out.append(child)
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
            route = self.graph.route_for(clean)
            if route and "public" in self.git:
                file, dynamic = route
                links.append(link("tm:source", f"{ROOT}git/public/{quote(file)}", "exact",
                                  title="the route that renders this page" + (" (one of several it renders)" if dynamic else "")))
                for name, conf in self.page_reads(site, file).items():
                    links.append(link("tm:data", f"{ROOT}fs/data/{quote(name)}", conf,
                                      title="a record the page's own code reads" if conf == "exact" else "a record the page's library reaches"))
            lm = re.fullmatch(r"(?:/ja)?/autopsy/lessons/([a-z0-9-]+)", clean)
            if lm and (self.repo / "lessons" / lm[1] / "lesson.json").is_file() and "public" in self.git:
                # TM-6: the cartridge's own source, its directory and each file in it.
                links.append(link("tm:source", f"{ROOT}git/public/lessons/{lm[1]}/", "exact", title="the cartridge's source, in the repository"))
                for f in self.lesson_files(lm[1]):
                    links.append(link("tm:source", f"{ROOT}git/public/{quote(f)}", "exact", title=f"the cartridge's {f.rsplit('/', 1)[1]}"))
            m = re.fullmatch(r"(/ja)?/docs(?:/(.*))?", clean)
            if m:
                src = self.source_for("ja" if m[1] else "en", m[2] or "")
                if src:
                    links.append(link("tm:source", f"{ROOT}fs/{quote(src)}", "exact", title="the markdown this page is rendered from"))
                    origin = self.origins.by_fs.get(src)
                    if origin and origin[0] in self.git:
                        links.append(link("tm:generated-by", f"{ROOT}git/{origin[0]}/{quote(origin[1])}", "exact",
                                          title=f"pulled at build time from {origin[0]}/{origin[1]}"))
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
            # The listing and the front page share this address, so it carries
            # the front page's own links too: its source and its data.
            page = [ln for ln in self._http_links(site, "/", False) if ln["rel"].startswith("tm:")]
            return self._result(ref.uri, "application/json", json.dumps(body, indent=1), self._http_links(site, "/", True) + page)
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
