"""tm://: this repository as a read-only URI namespace, spoken over MCP.

The spec is extern/tinypeek/spec/tm-protocol-spec.md (tinymachines/tinypeek).
This is its reference deployment: one host, four mounts over what is on the
box (fs, git, http and offbox) and one application built on them (entity),
three verbs, typed links between a served page and the file behind it.
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
import os
import re
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlsplit

import httpx

HOST = "tinymachines"
ROOT = f"tm://{HOST}/"
# tm:// with no host: the hosts this server answers for (tinypeek#10). Here
# that is one, and a list of one is still the list.
TOP = "tm://"

# The mounts, in the order the root lists them.
MOUNTS = ("fs", "git", "http", "offbox", "entity", "mcp", "kinds")

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
# tinypeek is the protocol's own repository (public since 2026-10-09), so the
# namespace serves its spec.
GIT_SIBLINGS = ("nes", "nes-bench", "nes-bus", "ntsc-crt", "halfphi", "2a03", "2c02", "tinypeek")
GIT_TIMEOUT_S = 15
LOG_DEFAULT, LOG_MAX = 20, 100
TREE_DEPTH_MAX = 8      # levels a git tree lists in one read (?depth=); 1 is the plain listing

# The second net under the roots: a file that matches is listed as redacted
# and refused on read, so the client knows it exists and does not get it.
DENY = ("*.env", ".env*", "*.pem", "*.key", "id_*", "*secret*", "*.local.md", "*.db", "__pycache__", ".git", ".*")
# Dotfiles are denied as a class, so one nobody thought to list (.npmrc and
# its token, .netrc, .git-credentials) stays out. These few are named back
# in because they hold no secrets and tell a client how a repository is put
# together: what it ignores, its submodules, its attributes (TM-9).
DOT_OK = (".gitignore", ".gitmodules", ".gitattributes", ".editorconfig")

READ_CAP = 256 * 1024   # bytes per read without ?range=
LIST_CAP = 500          # children per listing page
RESOURCES_PAGE = 100    # entries per resources/list page
COMPLETE_CAP = 100      # values per completion
LINK_CAP = 100          # links per read; past it, the rest is behind ?as=links

# What the notebook's loader counts as a page (web/lib/docs.ts PAGE_EXT).
PAGE_EXT = (".md", ".mdx")

# `links` is every mount's: the namespace answers it before a mount is asked
# (tinypeek#2), so it is listed here for what a client is told and offered.
AS_FS = ("raw", "stat", "links")
AS_HTTP = ("rendered", "text", "stat", "links")
AS_GIT = ("raw", "log", "blame", "tree", "stat", "links")
AS_ENTITY = ("stat", "links", "set")
AS_MCP = ("stat", "links")
AS_KINDS = ("stat", "links")
# tinypeek#13: what each mount's URI can say after the ?. The templates name
# these and a read refuses any other, so the two are one fact. The root and
# the list of hosts take ?as=links only; cursor= rides with ?as=links anywhere.
# tinypeek#16: range, lines and pointer are the three spans, a readable piece
# of a thing's content; a read takes one of them (SPANS, check_params).
SPANS = ("range", "lines", "pointer")
# tinypeek#17: rel= and min= filter the set behind ?as=links, on every mount,
# and ride only with it (LINKS_ONLY, check_params), as cursor= does there.
PARAMS: dict[str, tuple[str, ...]] = {
    "tm": ("as", "rel", "min"), "": ("as", "rel", "min"),
    "fs": ("at", "as", "range", "lines", "pointer", "rel", "min", "cursor"),
    "git": ("at", "as", "n", "depth", "range", "lines", "pointer", "rel", "min", "cursor"),
    "http": ("as", "range", "lines", "rel", "min", "cursor"),
    "offbox": ("as", "rel", "min"),
    "entity": ("at", "as", "rel", "min", "cursor"),
    "mcp": ("as", "range", "lines", "pointer", "rel", "min", "cursor"),
    "kinds": ("as", "rel", "min", "cursor"),
}
# rel= and min= narrow a set of links; they ride with ?as=links and, on the
# entity mount, with ?as=set (tinypeek#23), which inlines what they keep.
LINKS_ONLY = ("rel", "min")
SETS = ("links", "set")

# tinypeek#18: where a trail (a named, ordered list of addresses) is a file.
# A trail is read through fs like any file; what makes it a trail is the
# links the server adds, to each step and from each step back.
TRAILS_DIR = "notes/trails"

# The kinds of thing the entity mount addresses (TM-16). A routine is
# addressed under its game.
ENTITY_KINDS = ("game", "lesson", "pattern")

# The box's own orientation documents (TM-12): named at connect and at the
# root, each only where its repository is mounted and the file is there.
ORIENTATION = (
    ("public", "START-HERE.md", "the brief: what this site is and the order the work goes in"),
    ("public", "CLAUDE.md", "the house rules of the repository that serves the site"),
    ("6502", "CLAUDE.md", "the 6502 project's own rules, the chip work the site is the front door for"),
)

# A ref a client may name: a branch, a tag, a commit. Nothing that git would
# read as an option, nothing that walks.
REF_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")

# tinypeek#15: at= is one axis with two spellings. A value shaped like an ISO
# 8601 date or instant is a time, and names the newest commit on the main
# line made at or before it; anything else is a ref. A date alone is the
# start of that day, UTC; an instant with no offset is UTC. A ref that
# happens to be spelled like a date is reached by its commit instead.
TIME_OK = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$")

# Why a mount refuses at=: the mounts with no past of their own, and where
# their past is (tinypeek#15).
NO_PAST = {
    "http": "a page keeps no past of its own; the route that renders it does, at the page's tm:source link",
    "offbox": "what is kept off this box has no past here",
    "mcp": "an MCP server's answers have no past here; its tools are read as it lists them now",
    "kinds": "the registry counts what has been served since its record began, and keeps no past",
}

# tinypeek#22: the mcp mount. The servers it reads are named in a file of the
# checkout (endpoint, transport, what; auth names the variable in the
# service's environment that holds the Authorization header's value, never
# the value). What a server lists is kept for a while, so a walk of its
# tools asks it once; a failure stands for less, so a server that comes back
# is seen to.
MCP_SERVERS_FILE = "api/mcp_servers.json"
MCP_TTL_S = 300
MCP_RETRY_S = 60
MCP_TIMEOUT_S = 10.0
MCP_PROTOCOL = "2025-03-26"
MCP_KINDS = ("tools", "resources", "prompts")
MCP_TYPE = {k: f"application/vnd.tm.{k}+json" for k in ("server", "tool", "resource", "prompt")}
# tinyhelper#6: a server's map (spec 13.1). The derived map is
# notes/maps/<server>.json, written by tinyhelper's index driver; the
# override beside it, notes/maps/<server>.override.json, is the one
# hand-written thing. The mount's own paths under a server, which no map may
# claim; the body fields a server's answer carries as provenance, lifted into
# _meta untouched; how many tool answers are kept MCP_TTL_S each.
MAPS_DIR = "notes/maps"
MCP_OWN = MCP_KINDS + ("map",)
PROVENANCE = ("sources", "licence_basis", "source", "citation", "checked_at")
MCP_CALL_CAP = 2000


# tinypeek#23: what a thing is, said in its media type. A thing the server
# composes is application/vnd.tm.<kind>+json, or text/vnd.tm.<kind> when it is
# a text; a file the server merely holds keeps the file's own type, except
# that a JSON file reads as a record. KINDS is the vocabulary, every kind this
# server can say with one line each; what it has served is measured, not
# asserted, by the Kinds class, and the registry at kinds/ lists only that.
def tm_type(kind: str, text: bool = False) -> str:
    return f"text/vnd.tm.{kind}" if text else f"application/vnd.tm.{kind}+json"


def kind_of(mime: str) -> str:
    """The kind a media type names: the vendor part, or `file` for a type
    the server did not mint."""
    m = re.fullmatch(r"(?:application|text)/vnd\.tm\.([a-z-]+)(?:\+json)?", mime.split(";", 1)[0].strip())
    return m[1] if m else "file"


T_LISTING = tm_type("listing")
T_STAT = tm_type("stat")
T_LINKS = tm_type("links")
T_LOG = tm_type("log")
T_SUBMODULE = tm_type("submodule")
T_OFFBOX = tm_type("offbox")
T_RECORD = tm_type("record")
T_TRAIL = tm_type("trail")
T_SET = tm_type("set")
T_KIND = tm_type("kind")
T_MAP = tm_type("map")
T_PAGE = tm_type("page", text=True)
T_BLAME = tm_type("blame", text=True)

KINDS: dict[str, str] = {
    "listing": "a collection's children, a page at a time; the hosts and the root are listings too",
    "file": "a file the server holds, read as its own type",
    "record": "a JSON file the server did not compose",
    "trail": "a named, ordered list of addresses, a JSON file under notes/trails/",
    "page": "a page's readable text",
    "stat": "metadata and links, no content (?as=stat)",
    "links": "a thing's links and no content, a page at a time (?as=links)",
    "log": "the commits touching a path (?as=log)",
    "blame": "a file with a commit per line (?as=blame)",
    "submodule": "a submodule of a repository: what it pins",
    "offbox": "a place a build chain leaves the box, named and never served",
    "pattern": "a pattern the autopsy's rules find",
    "game": "a game the autopsy measured",
    "routine": "a routine of a game that a rule named",
    "lesson": "a lesson, with its cartridge",
    "server": "an MCP server the box reads: its record and its collections",
    "tool": "a tool of an MCP server, as the server described it",
    "resource": "a resource or resource template of an MCP server, as described",
    "prompt": "a prompt of an MCP server, as described",
    "set": "a set and its members in one read (?as=set)",
    "kind": "one kind this host has served: its media types, how often, and the links it carried",
    "map": "an MCP server's map: which of its tools read as addresses, derived from its schemas and corrected by an override",
}
SET_CAP = 25            # members a page of ?as=set inlines

META_LINKS = "tinymachines.ai/links"
META_MAP = "tinymachines.ai/map"                # a mapped read: the map, the entry, the tool, how sure
META_PROVENANCE = "tinymachines.ai/provenance"  # a mapped read: the server's provenance fields, untouched

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
    ".json": T_RECORD,
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


def link(rel: str, href: str, confidence: str | None = None, title: str | None = None, count: int | None = None, mime: str | None = None) -> dict:
    """One typed link. `confidence` is mandatory on tm: relations and absent
    on IANA ones, which are exact by construction; the asymmetry is checked
    here so no caller can get it wrong quietly. `count` is for a link that
    stands for several occurrences (a pattern found 41 times in a game): a
    whole number a client can sort on, where the title says it for a person
    (tinypeek#3). `mime` is the target's media type, RFC 8288's `type`
    (tinypeek#23): the namespace fills it in for every target whose kind the
    address itself says, so a caller rarely needs to."""
    ours = rel.startswith("tm:")
    assert ours == (confidence is not None), f"{rel}: confidence {'required' if ours else 'not allowed'}"
    out: dict[str, Any] = {"rel": rel, "href": href}
    if confidence:
        out["confidence"] = confidence
    if title:
        out["title"] = title
    if count is not None:
        assert type(count) is int and count >= 0, f"{rel}: count is a whole number, not {count!r}"
        out["count"] = count
    if mime:
        out["type"] = mime
    return out


CONFIDENCE_ORDER = {None: 0, "exact": 1, "inferred": 2, "low": 3}


def ordered(links: list[dict]) -> list[dict]:
    """The one order links come in, on every mount (tinypeek#2): the IANA
    relations first (they are how a client moves), then what is exact, then
    what is inferred; within each by rel, then by href. Stated, so a page of
    a large set is the same page on the next read."""
    return sorted(links, key=lambda ln: (CONFIDENCE_ORDER.get(ln.get("confidence"), 9), ln["rel"], ln["href"]))


def is_json(mime: str) -> bool:
    """application/json, or a vendor type that says it is JSON underneath
    (application/vnd.tm.tool+json), which every generic client can parse."""
    bare = mime.split(";", 1)[0].strip()
    return bare == "application/json" or (bare.startswith("application/") and bare.endswith("+json"))


def is_text(mime: str) -> bool:
    return mime.startswith("text/") or is_json(mime) or mime == "image/svg+xml"


def http_type(mime: str) -> str:
    """What something fetched through the front door reads as when it is not
    a page: itself, a JSON answer being a record (tinypeek#23)."""
    return T_RECORD if mime == "application/json" else mime


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
    return any(part not in DOT_OK and fnmatch.fnmatch(part, pat) for part in rel_path.split("/") for pat in DENY)


def byte_range(rng: str, size: int) -> tuple[int, int]:
    """?range=START-END: bytes [START, END) of something `size` long, the end
    stopping at its end, and never more than the cap in one read."""
    m = re.fullmatch(r"(\d+)-(\d+)", rng)
    if not m or int(m[1]) >= int(m[2]):
        raise TmError(BAD_PARAMS, "bad-facet", "range=START-END, bytes [START, END) with START < END")
    start, end = int(m[1]), min(int(m[2]), size)
    if end - start > READ_CAP:
        raise TmError(BAD_PARAMS, "too-large", f"a range reads at most {READ_CAP} bytes", size=size)
    return start, end


def line_span(spec: str, text: str, here: str) -> tuple[int, int, str]:
    """?lines=FIRST-LAST: lines FIRST to LAST of a text, counted from 1 and
    both included, the end stopping at the last line (tinypeek#16). A span
    that starts past the last line is not there, and the answer says how
    many lines there are, and names the whole."""
    m = re.fullmatch(r"(\d+)-(\d+)", spec)
    if not m or int(m[1]) < 1 or int(m[1]) > int(m[2]):
        raise TmError(BAD_PARAMS, "bad-facet", "lines=FIRST-LAST, lines FIRST to LAST counted from 1, both included, FIRST <= LAST")
    lines = text.splitlines(keepends=True)
    first, last = int(m[1]), min(int(m[2]), len(lines))
    if first > len(lines):
        raise TmError(RESOURCE_NOT_FOUND, "not-found", f"lines {spec}: the text has {len(lines)} lines", lines=len(lines), nearest=[here])
    return first, last, "".join(lines[first - 1:last])


def json_pointer(spec: str, doc, here: str) -> object:
    """?pointer=/a/0/b: the value a JSON pointer (RFC 6901) names in a
    document (tinypeek#16). The empty pointer is the whole document. Where
    the pointer leaves the document, the refusal says how far it got and
    what was there: an object's keys or an array's length, and names the
    piece that is there."""
    if spec and not spec.startswith("/"):
        raise TmError(BAD_PARAMS, "bad-facet", "pointer=/a/0/b, a JSON pointer (RFC 6901): empty, or starting with /")
    here, at = doc, ""
    for raw in spec.split("/")[1:]:
        token = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(here, dict) and token in here:
            here = here[token]
        elif isinstance(here, list) and re.fullmatch(r"0|[1-9]\d*", token) and int(token) < len(here):
            here = here[int(token)]
        else:
            data: dict = {"at": at, "nearest": [here if not at else f"{here}{'&' if '?' in here else '?'}pointer={at}"]}
            if isinstance(here, dict):
                data["keys"] = list(here)[:LIST_CAP]
            elif isinstance(here, list):
                data["length"] = len(here)
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"pointer {spec}: nothing at {raw!r} below {at or 'the document'}", **data)
        at += "/" + raw
    return here


def span_of(ref: "Ref") -> tuple[str, str] | None:
    """The one span a read asks for, if any: range, lines or pointer."""
    found = [(k, ref.facets[k]) for k in SPANS if k in ref.facets]
    if len(found) > 1:
        raise TmError(BAD_PARAMS, "bad-facet", f"one span a read: {' and '.join(k for k, _ in found)} do not combine")
    return found[0] if found else None


def cut(span: tuple[str, str], data: bytes, mime: str, here: str) -> tuple[str, str, bytes]:
    """A piece of a text by lines or by pointer: the echo (the span as it
    was used), the type and the bytes (tinypeek#16). A byte range is cut
    where the bytes are read, since it need not read the whole thing."""
    kind, spec = span
    sep = "&" if "?" in here else "?"
    if not is_text(mime):
        raise TmError(BAD_PARAMS, "bad-facet", f"{kind} reads a piece of a text, and this is {mime}; range reads its bytes")
    text = data.decode("utf-8", errors="replace")
    if kind == "lines":
        first, last, piece = line_span(spec, text, here)
        out = piece.encode()
        uri = f"{here}{sep}lines={first}-{last}"
    else:
        if not is_json(mime):
            raise TmError(BAD_PARAMS, "bad-facet", f"pointer reads into a JSON document, and this is {mime}; lines reads a piece of it")
        value = json_pointer(spec, json.loads(text), here)
        out = json.dumps(value, indent=1, ensure_ascii=False).encode()
        uri = here if spec == "" else f"{here}{sep}pointer={spec}"
    if len(out) > READ_CAP:
        raise TmError(BAD_PARAMS, "too-large", f"{kind} {spec} is {len(out)} bytes; a read is at most {READ_CAP}", size=len(out))
    return uri, mime, out


def _too_large(what: str, size: int, here: str, stat: str | None = None) -> TmError:
    """The refusal of a text over the cap: its size, and the three spans
    that read a piece of it (range on any file, lines and pointer on text)."""
    sep = "&" if "?" in here else "?"
    return TmError(RESOURCE_NOT_FOUND, "too-large", f"{what} is {size} bytes; the cap is {READ_CAP}. Read it in ranges or in lines.",
                   size=size, range=f"{here}{sep}range={{start}}-{{end}}", lines=f"{here}{sep}lines={{first}}-{{last}}", stat=stat or f"{here}{sep}as=stat")


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


def check_params(ref: "Ref", own: tuple[tuple[str, ...], bool] | None = None) -> None:
    """tinypeek#13: a parameter a mount does not take is refused, naming the
    ones it takes, where before it was dropped and the answer looked like the
    one asked for (a page at a date it has no notion of, a file without the
    lines asked for). A cursor continues a listing or ?as=links; anywhere else
    it would be dropped too, so it is refused there. `own` is a mapped mcp
    collection's query (tinyhelper#6): the names its map entry lists, and
    whether it passes any other name through to the tool; the mount's own
    names are never passed through, so they keep their meaning everywhere."""
    takes = PARAMS[ref.mount]
    names, star = own or ((), False)
    as_ = ref.facets.get("as")
    where = {"tm": "the list of hosts", "": "the root"}.get(ref.mount, ref.mount)
    for k, v in ref.facets.items():
        if k in takes or k in names or (star and k != "at"):
            continue
        if not (k in ("cursor",) + LINKS_ONLY and as_ in SETS):
            why = f"; {NO_PAST[ref.mount]}" if k == "at" and ref.mount in NO_PAST else ""
            more = f" and this collection's own query takes {', '.join(names) if names else 'nothing'}" if own else ""
            raise TmError(BAD_PARAMS, "bad-facet", f"{k}={v!r} is not a parameter {where} takes; it takes {', '.join(takes)}{more}{why}")
    if "cursor" in ref.facets and as_ not in SETS and not (ref.is_collection and as_ in (None, "raw", "tree")):
        raise TmError(BAD_PARAMS, "bad-facet", f"cursor={ref.facets['cursor']!r} continues a listing, ?as=links or ?as=set, and this read is none of them")
    for k in LINKS_ONLY:
        if k in ref.facets and as_ not in SETS:
            raise TmError(BAD_PARAMS, "bad-facet", f"{k}={ref.facets[k]!r} narrows the set behind ?as=links or ?as=set, and this read is neither")
    # tinypeek#16: a span is a piece of a file's or a page's content. On a
    # listing, or with a facet that is not the content (stat, log, blame,
    # tree, rendered, links), it is refused, as range was (tinypeek#8).
    span = span_of(ref)
    if span and (ref.is_collection or as_ not in (None, "raw", "text")):
        what = "a listing" if ref.is_collection else f"?as={as_}"
        raise TmError(BAD_PARAMS, "bad-facet", f"{span[0]} reads a piece of a file's or a page's content, and {what} is not the content")


def _q(mount: str) -> str:
    """A template's query part, from the one table: {?at,as,n,depth,range,cursor}."""
    return "{?" + ",".join(PARAMS[mount]) + "}"


def _cursored(uri: str, cursor: str | None) -> str:
    """The address of one page of a listing: the listing's, with the cursor
    that reached it, so the echo says which page this is."""
    return uri if not cursor else f"{uri}{'&' if '?' in uri else '?'}cursor={cursor}"


def _page(items: list, cursor: str | None, size: int) -> tuple[list, str | None]:
    start = _offset(cursor)
    chunk = items[start:start + size]
    nxt = _cursor(start + size) if start + size < len(items) else None
    return chunk, nxt


# ---------------------------------------------------------------------------
# The URI
# ---------------------------------------------------------------------------


def as_time(at: str) -> datetime | None:
    """The instant an at= names, when it is spelled as one (TIME_OK), else
    None. A spelling that is time-shaped but not a time is refused here."""
    if not TIME_OK.match(at):
        return None
    try:
        t = datetime.fromisoformat(at.replace("Z", "+00:00"))
    except ValueError:
        raise TmError(BAD_PARAMS, "bad-facet", f"at={at!r} is shaped like a time and is not one") from None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


@dataclass
class Ref:
    mount: str                      # "" (the root), "tm" (the list of hosts), "fs", "git", "http", "offbox", "entity", "mcp" or "kinds"
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
        if self.mount == "tm":
            return TOP
        if self.mount == "fs":
            return f"{ROOT}fs/{quote(self.path)}"
        if self.mount == "git":
            return f"{ROOT}git/{self.site}/{quote(self.path)}" if self.site else f"{ROOT}git/"
        if self.mount in ("offbox", "entity", "mcp", "kinds"):
            return f"{ROOT}{self.mount}/{quote(self.path)}"
        return f"{ROOT}http/{self.site}{quote(self.path)}"


def parse(uri: str) -> Ref:
    if not isinstance(uri, str):
        raise TmError(BAD_PARAMS, "bad-uri", "uri must be a string")
    parts = urlsplit(uri)
    facets = {k: v for k, v in parse_qsl(parts.query, keep_blank_values=True)}
    if parts.scheme == "tm" and uri.startswith(TOP) and parts.netloc == "" and parts.path in ("", "/"):
        return Ref("tm", None, "", facets)
    # A host compares without case (RFC 3986); a path keeps its own.
    if parts.scheme != "tm" or parts.netloc.lower() != HOST:
        # A host is a name, not a place to look: nothing in the URI says where
        # another host's server is, so this one can only say whom it answers for.
        raise TmError(
            RESOURCE_NOT_FOUND, "not-found",
            f"{uri!r} is not under {ROOT}; this server answers for one host, {HOST}",
            nearest=[ROOT, TOP],
        )
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
    if mount == "offbox":
        return Ref("offbox", None, "/".join(rest) + ("/" if trailing and rest else ""), facets)
    if mount == "entity":
        return Ref("entity", None, "/".join(rest) + ("/" if trailing and rest else ""), facets)
    if mount == "mcp":
        return Ref("mcp", None, "/".join(rest) + ("/" if trailing and rest else ""), facets)
    if mount == "kinds":
        return Ref("kinds", None, "/".join(rest) + ("/" if trailing and rest else ""), facets)
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
        nearest=[f"{ROOT}{m}/" for m in closest(mount, list(MOUNTS))],
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


def edit_distance(a: str, b: str) -> int:
    """Levenshtein: the fewest single-letter inserts, deletes and swaps."""
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def closest(wanted: str, names: list[str]) -> list[str]:
    """Names ranked by how close they are to a wrong guess (TM-5): edit
    distance on the name (a directory's slash left off), then a shared
    start, then the alphabet only for ties."""
    w = wanted.rstrip("/").lower()
    return sorted(names, key=lambda n: (edit_distance(w, n.rstrip("/").lower()), 0 if n.lower().startswith(w[:3]) else 1, n))


def rank_children(wanted: str, kids: list[dict]) -> list[dict]:
    order = {n: i for i, n in enumerate(closest(wanted, [c["name"] for c in kids]))}
    return sorted(kids, key=lambda c: order[c["name"]])


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

    def is_dynamic(self, file_rel: str) -> bool:
        return any(any(seg.startswith("[") for seg in segs) for segs, file in self.routes if file == file_rel)

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
            d = json.loads(rec.read_text())
            note = (d.get("_") or d.get("note") or "") if isinstance(d, dict) else ""
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
# Layer 5: the entity mount (TM-16)
# ---------------------------------------------------------------------------


def plain_name(name: str) -> str:
    """A game's name as a person says it: no region or revision in brackets,
    the article back at the front, case aside. "Legend of Zelda, The (USA)
    (Rev 1)" and "The Legend of Zelda" are one name; "Super Mario Bros. +
    Duck Hunt (USA)" and "Super Mario Bros." are two."""
    s = re.sub(r"\s*\([^)]*\)", "", name).strip()
    m = re.fullmatch(r"(.*), (The|A|An)", s)
    return (f"{m[2]} {m[1]}" if m else s).lower()


def times(n: int) -> str:
    return "once" if n == 1 else f"{n} times"


def _entity_href(href: str) -> bool:
    """Whether a link's target is a thing of the entity mount, which a set
    can inline (tinypeek#23)."""
    try:
        ref = parse(href)
    except TmError:
        return False
    return ref.mount == "entity" and not ref.is_collection


class Entities:
    """The first application on the platform: patterns, games, routines and
    lessons as things with addresses of their own, read from the two records
    the site already publishes (data/autopsy.json, data/lessons.json). No new
    data, and no byte of any cartridge.

        entity/pattern/<key>                       pad-poll
        entity/game/<key>                          ded208cee37d
        entity/game/<key>/routine/<bank>-<addr>    b0-8E5C
        entity/lesson/<key>                        jump

    Identity is the key the record already keeps, so it survives a page or a
    file moving. A routine has an address only when a rule named it (it
    carries a pattern); a loop the rules named is a routine here.

    It is written as its own class so the cut is visible: the namespace hands
    it a path and gets a result back, and where a link from here needs its
    inverse on something another mount serves (a game's page, a lesson's
    directory, a record), that mount asks `inbound` rather than knowing what
    an entity is."""

    RECORDS = {"autopsy": "data/autopsy.json", "lessons": "data/lessons.json"}
    # What stands for each kind's entities on the record they are read from
    # (TM-18's rule: a record names each reader once). A game's routines are
    # stood for by the games' collection, which they are listed under.
    READS = {"pattern": "autopsy", "game": "autopsy", "lesson": "lessons"}
    # Kept out of a body: a game's routines are addressed one by one, and a
    # lesson's cartridge and pictures are bytes, which stay in the record.
    GAME_LISTS = ("routine_list", "loop_list")

    def __init__(self, ns: "Namespace"):
        self.ns = ns
        self._stamp: tuple | None = None
        self._ix: dict[str, Any] = {}
        self._views: dict[str, "EntitiesAt"] = {}

    # -- the records ---------------------------------------------------------

    def _load(self, which: str) -> tuple[float | None, dict]:
        f = self.ns.repo / self.RECORDS[which]
        try:
            got = json.loads(f.read_text())
            return f.stat().st_mtime, got if isinstance(got, dict) else {}
        except (OSError, ValueError):
            return None, {}

    @staticmethod
    def rid(r: dict) -> str:
        """A routine's name in a URI: its bank and its address, b0-8E5C."""
        bank = str(r.get("bank", ""))
        return f"{'b' + bank[3:] if bank.startswith('prg') else bank}-{int(r.get('addr', 0)):04X}"

    def index(self) -> dict[str, Any]:
        """Both records, keyed by identity and joined. Rebuilt when either
        file changes, so a deploy's new record is served without a restart."""
        stamp = tuple((self.ns.repo / p).stat().st_mtime if (self.ns.repo / p).is_file() else None for p in self.RECORDS.values())
        if stamp == self._stamp and self._ix:
            return self._ix
        _, auto = self._load("autopsy")
        _, less = self._load("lessons")
        self._stamp, self._ix = stamp, self._build(auto, less, {which: s is not None for which, s in zip(self.RECORDS, stamp)})
        return self._ix

    def _build(self, auto: dict, less: dict, has: dict[str, bool]) -> dict[str, Any]:
        """The index from the two records' contents, wherever they were read."""
        patterns: dict[str, dict] = {
            p: {"i": i, "games": {}, "instances": [], "lessons": {}}
            for i, p in enumerate(auto.get("patterns") or []) if isinstance(p, str)
        }
        games: dict[str, dict] = {}
        for gi, g in enumerate(auto.get("games") or []):
            if not isinstance(g, dict) or not isinstance(g.get("key"), str):
                continue
            entry = {"i": gi, "rec": g, "routines": {}, "all": set(), "lessons": [], "marks": {}}
            for lst in self.GAME_LISTS:
                for ri, r in enumerate(g.get(lst) or []):
                    rid = self.rid(r)
                    entry["all"].add(rid)
                    marks = [m["pattern"] for m in r.get("is") or [] if m.get("pattern") in patterns]
                    if not marks:
                        continue
                    entry["routines"][rid] = {"list": lst, "i": ri, "rec": r, "patterns": sorted(set(marks))}
                    # A rule can mark one routine twice (two polls in one
                    # routine): the count is of marks, as the record's own
                    # is, and a routine is one instance however many it has.
                    for p in marks:
                        patterns[p]["games"][g["key"]] = patterns[p]["games"].get(g["key"], 0) + 1
                        entry["marks"][p] = entry["marks"].get(p, 0) + 1
                    for p in sorted(set(marks)):
                        patterns[p]["instances"].append((g["key"], rid))
            games[g["key"]] = entry
        by_name: dict[str, list[str]] = {}
        for k, g in games.items():
            by_name.setdefault(plain_name(str(g["rec"].get("name", ""))), []).append(k)
        topic = {k: t.get("key") for t in less.get("topics") or [] for k in t.get("lessons") or []}
        lessons: dict[str, dict] = {}
        for li, x in enumerate(less.get("lessons") or []):
            if not isinstance(x, dict) or not isinstance(x.get("key"), str):
                continue
            # The record says which game a lesson was measured beside by its
            # key (public#7), and that join is exact. A record that keeps
            # only the game's name is joined by it when one game here has
            # that name and no other, and that is inferred; anything looser
            # is a guess. A key that names no game here is not followed.
            against = x.get("against") or {}
            game, how = (against["key"], "exact") if against.get("key") in games else (None, None)
            if game is None and "key" not in against:
                named = by_name.get(plain_name(str(against.get("game") or "")), [])
                game, how = (named[0], "inferred") if len(named) == 1 else (None, None)
            lessons[x["key"]] = {"i": li, "rec": x, "topic": topic.get(x["key"]), "game": game, "how": how}
            if game:
                games[game]["lessons"].append((x["key"], how))
            for p, n in (x.get("patterns") or {}).items():
                if p in patterns:
                    patterns[p]["lessons"][x["key"]] = n
        return {"patterns": patterns, "games": games, "lessons": lessons, "has": has}

    # -- an entity at a time (tinypeek#21) --------------------------------------

    def at(self, at: str) -> "EntitiesAt":
        """The entity mount as its records were at the commit a ref or a time
        names, on the repository that holds them. Kept by commit, a few at a
        time, since a commit's records never change."""
        if "public" not in self.ns.git:
            raise TmError(BAD_PARAMS, "bad-facet", "at= reads the records as their repository had them, and no repository holds them here")
        commit = self.ns._git_at("public", at)
        view = self._views.pop(commit, None) or EntitiesAt(self, commit)
        self._views[commit] = view
        while len(self._views) > 8:
            self._views.pop(next(iter(self._views)))
        return view

    def history(self, kind: str) -> list[dict]:
        """version-history: an entity's times are its record's, whose log is
        in git. Every entity carries it, now or at a time (tinypeek#21)."""
        rec = self.RECORDS[self.READS["game" if kind == "routine" else kind]]
        if "public" in self.ns.git and self.ns._git_has("public", "HEAD", rec):
            return [link("version-history", f"{ROOT}git/public/{rec}?as=log", title="the record's commits: this entity's times")]
        return []

    def _mark(self, uri: str) -> str:
        """An entity's address in this answer: itself, now."""
        return uri

    def _then(self, kind: str, parts: list[str]) -> list[dict]:
        return []

    # -- addresses ---------------------------------------------------------

    @staticmethod
    def uri(*parts: str, collection: bool = False) -> str:
        return f"{ROOT}entity/" + "/".join(quote(p) for p in parts) + ("/" if collection and parts else "")

    def stands_for(self, ref: "Ref") -> str | None:
        """The collection a record names for an entity, or for itself."""
        kind = ref.path.split("/", 1)[0]
        return self.uri(kind, collection=True) if kind in ENTITY_KINDS else None

    def _record(self, which: str, pointer: str) -> str:
        # tinypeek#16: the pointer is a facet, so the link reads the piece.
        return f"{ROOT}fs/{self.RECORDS[which]}?pointer={pointer}"

    def game_pages(self, site: str, key: str) -> list[str]:
        """A game's page in each language, where the site's build made it."""
        pages = [f"/autopsy/games/{key}", f"/ja/autopsy/games/{key}"]
        b = self.ns.built(site)
        return [p for p in pages if b is None or p in b]

    def cartridge(self, key: str) -> str | None:
        """A lesson's directory in the repository, when one is tracked."""
        if "public" in self.ns.git and self.ns._git_has("public", "HEAD", f"lessons/{key}/lesson.json"):
            return f"{ROOT}git/public/lessons/{quote(key)}/"
        return None

    # -- links ---------------------------------------------------------------

    def _frame(self, uri: str, coll: str) -> list[dict]:
        return [link("up", coll), link("collection", coll), link("describedby", f"{uri}{'&' if '?' in uri else '?'}as=stat")]

    def _pattern(self, key: str) -> tuple[dict, list[dict]]:
        ix = self.index()
        p = ix["patterns"][key]
        uri = self.uri("pattern", key)
        found = [{"uri": self.uri("game", g), "key": g, "name": ix["games"][g]["rec"].get("name"), "count": n} for g, n in p["games"].items()]
        body = {"uri": uri, "entity": "pattern", "key": key, "games": len(found), "count": sum(f["count"] for f in found),
                "routines": len(p["instances"]), "found_in": found,
                "demonstrated_by": [{"uri": self.uri("lesson", k), "key": k, "title": ix["lessons"][k]["rec"].get("title"), "count": n}
                                    for k, n in p["lessons"].items()]}
        links = self._frame(uri, self.uri("pattern", collection=True))
        for f in found:
            links.append(link("tm:found-in", f["uri"], "exact", title=f"found {times(f['count'])} in {f['name']}", count=f["count"]))
        for g, rid in p["instances"]:
            links.append(link("tm:instance", self.uri("game", g, "routine", rid), "exact",
                              title=f"{ix['games'][g]['routines'][rid]['rec'].get('name')} in {ix['games'][g]['rec'].get('name')}"))
        for d in body["demonstrated_by"]:
            links.append(link("tm:demonstrated-by", d["uri"], "exact", title=f"our own cartridge, where it is found {times(d['count'])}: {d['title']}", count=d["count"]))
        links.append(link("tm:data", self._record("autopsy", f"/patterns/{p['i']}"), "exact", title="where the record names this pattern"))
        return body, links

    def _game(self, key: str) -> tuple[dict, list[dict]]:
        ix = self.index()
        g = ix["games"][key]
        uri = self.uri("game", key)
        body = {"uri": uri, "entity": "game", **{k: v for k, v in g["rec"].items() if k not in self.GAME_LISTS},
                "routines_measured": len(g["all"]), "routines_named": len(g["routines"]),
                "routines_at": self.uri("game", key, "routine", collection=True)}
        links = self._frame(uri, self.uri("game", collection=True))
        for p, n in sorted(g["marks"].items()):
            links.append(link("tm:exhibits", self.uri("pattern", p), "exact", title=f"found {times(n)} here", count=n))
        for k, how in g["lessons"]:
            links.append(link("tm:measured-by", self.uri("lesson", k), how,
                              title="a lesson measured beside this game" if how == "exact" else "a lesson measured beside a game of this name"))
        for site in self.ns.sites:
            for pg in self.game_pages(site, key):
                links.append(link("tm:renders-as", f"{ROOT}http/{site}{quote(pg)}", "exact", title=f"this game's page on {site}"))
        links.append(link("tm:data", self._record("autopsy", f"/games/{g['i']}"), "exact", title="the record this game is read from"))
        return body, links

    def _routine(self, key: str, rid: str) -> tuple[dict, list[dict]]:
        g = self.index()["games"][key]
        r = g["routines"][rid]
        uri = self.uri("game", key, "routine", rid)
        rec = r["rec"]
        body = {"uri": uri, "entity": "routine", "key": rid,
                "game": {"uri": self.uri("game", key), "key": key, "name": g["rec"].get("name")},
                # A loop's record has no kind of its own; a routine's says how it is entered.
                "kind": "loop", **rec, "address": f"${int(rec.get('addr', 0)):04X}"}
        links = self._frame(uri, self.uri("game", key, "routine", collection=True))
        for p in r["patterns"]:
            links.append(link("tm:instance-of", self.uri("pattern", p), "exact", title="what a rule named this routine"))
        links.append(link("tm:data", self._record("autopsy", f"/games/{g['i']}/{r['list']}/{r['i']}"), "exact", title="the record this routine is read from"))
        return body, links

    def _lesson(self, key: str) -> tuple[dict, list[dict]]:
        ix = self.index()
        x = ix["lessons"][key]
        uri = self.uri("lesson", key)
        rec = {k: v for k, v in x["rec"].items() if k != "rom"}
        if isinstance(rec.get("pictures"), list):
            rec["pictures"] = [{k: v for k, v in p.items() if k != "png"} for p in rec["pictures"] if isinstance(p, dict)]
        body = {"uri": uri, "entity": "lesson", "topic": x["topic"], **rec}
        links = self._frame(uri, self.uri("lesson", collection=True))
        cart = self.cartridge(key)
        if cart:
            links.append(link("tm:cartridge", cart, "exact", title="the cartridge's source, in the repository"))
        for p, n in sorted((x["rec"].get("patterns") or {}).items()):
            if p in ix["patterns"]:
                links.append(link("tm:demonstrates", self.uri("pattern", p), "exact", title=f"found {times(n)} in this cartridge", count=n))
        if x["game"]:
            links.append(link("tm:measures", self.uri("game", x["game"]), x["how"],
                              title="the game this lesson was measured beside, by the key its record keeps" if x["how"] == "exact"
                              else f"the one game here named {(x['rec'].get('against') or {}).get('game')}; the record keeps the name, not the key"))
        links.append(link("tm:data", self._record("lessons", f"/lessons/{x['i']}"), "exact", title="the record this lesson is read from"))
        return body, links

    def inbound(self, mount: str, site: str | None, path: str, is_dir: bool = False) -> list[dict]:
        """The other end of each pair this mount starts: what a page, a
        directory or a record says back about the entity that names it. Each
        condition is the one the entity's own link was made under, so no
        inverse is offered for a link that is not there."""
        ix = self.index()
        out: list[dict] = []
        if mount == "http" and site and not is_dir:
            m = re.fullmatch(r"(?:/ja)?/autopsy/games/([^/]+)", path)
            if m and m[1] in ix["games"] and path in self.game_pages(site, m[1]):
                out.append(link("tm:source", self.uri("game", m[1]), "exact", title="the game this page is about, as an entity"))
        elif mount == "git" and site == "public" and is_dir:
            m = re.fullmatch(r"lessons/([^/]+)", path)
            if m and m[1] in ix["lessons"] and self.cartridge(m[1]):
                out.append(link("tm:cartridge-of", self.uri("lesson", m[1]), "exact", title="the lesson this cartridge is, as an entity"))
        elif mount == "fs":
            for kind in sorted(self.READS):
                which = self.READS[kind]
                if path == self.RECORDS[which] and ix["has"][which]:
                    out.append(link("tm:read-by", self.uri(kind, collection=True), "exact", title=f"the {kind} entities, each read from this record"))
        return out

    # -- listings ------------------------------------------------------------

    def _kids(self, parts: list[str]) -> list[dict] | None:
        """The children of a collection, or None when it is not one."""
        ix = self.index()

        def leaf(uri: str, name: str, title: Any, kind: str) -> dict:
            out = {"uri": uri, "name": name, "mimeType": tm_type(kind), "isCollection": False}
            if title:
                out["title"] = str(title)
            return out

        def coll(uri: str, name: str) -> dict:
            return {"uri": uri, "name": name, "mimeType": T_LISTING, "isCollection": True}

        if not parts:
            return [coll(self.uri(k, collection=True), f"{k}/") for k in ENTITY_KINDS]
        if parts == ["pattern"]:
            return [leaf(self.uri("pattern", k), k, f"found {times(sum(p['games'].values()))} in {len(p['games'])} of the games", "pattern") for k, p in sorted(ix["patterns"].items())]
        if parts == ["lesson"]:
            return [leaf(self.uri("lesson", k), k, x["rec"].get("title"), "lesson") for k, x in sorted(ix["lessons"].items())]
        if parts == ["game"]:
            out = []
            for k, g in sorted(ix["games"].items()):
                out.append(leaf(self.uri("game", k), k, g["rec"].get("name"), "game"))
                out.append(coll(self.uri("game", k, collection=True), f"{k}/"))
            return out
        if len(parts) == 2 and parts[0] == "game" and parts[1] in ix["games"]:
            return [coll(self.uri("game", parts[1], "routine", collection=True), "routine/")]
        if len(parts) == 3 and parts[0] == "game" and parts[1] in ix["games"] and parts[2] == "routine":
            rs = ix["games"][parts[1]]["routines"]
            return [leaf(self.uri("game", parts[1], "routine", rid), rid, f"{r['rec'].get('name')}: {', '.join(r['patterns'])}", "routine") for rid, r in sorted(rs.items())]
        return None

    def keys(self, kind: str) -> list[str]:
        return sorted(self.index().get(f"{kind}s", {}))

    def routines(self, game: str) -> list[str]:
        g = self.index()["games"].get(game)
        return sorted(g["routines"]) if g else []

    # -- read ----------------------------------------------------------------

    def _missing(self, parts: list[str], coll: bool) -> TmError:
        """not-found that teaches: the right spelling of the address when it
        is a slash away, else the nearest names at the first wrong step."""
        ix = self.index()
        said = "entity/" + "/".join(parts) + ("/" if coll else "")

        def no(msg: str, nearest: list[str]) -> TmError:
            return TmError(RESOURCE_NOT_FOUND, "not-found", msg, nearest=nearest[:5])

        if parts[0] not in ENTITY_KINDS:
            return no(f"{said}: no entities of kind {parts[0]!r}; the kinds are {', '.join(ENTITY_KINDS)}",
                      [self.uri(k, collection=True) for k in closest(parts[0], list(ENTITY_KINDS))])
        kind = parts[0]
        if len(parts) == 1:
            return no(f"{said} is a collection; its listing is at {self.uri(kind, collection=True)}", [self.uri(kind, collection=True)])
        pool = ix[f"{kind}s"]
        if parts[1] not in pool:
            want = parts[1].lower()
            ranked = closest(parts[1], sorted(pool))
            if kind == "game":
                # A game asked for by its name is offered by its key.
                ranked.sort(key=lambda k: want not in str(pool[k]["rec"].get("name", "")).lower())
            return no(f"{said}: no {kind} with the key {parts[1]!r}", [self.uri(kind, k) for k in ranked])
        here = self.uri(kind, parts[1])
        if len(parts) == 2:
            return no(f"{said} is not a collection; the {kind} is at {here}", [here])
        listing = self.uri("game", parts[1], "routine", collection=True)
        if kind != "game" or parts[2] != "routine" or len(parts) > 4:
            return no(f"{said}: nothing is addressed there", [listing] if kind == "game" else [here])
        if len(parts) == 3:
            return no(f"{said} is a collection; its listing is at {listing}", [listing])
        g = pool[parts[1]]
        near = [self.uri("game", parts[1], "routine", r) for r in closest(parts[3], sorted(g["routines"]))]
        if coll:
            return no(f"{said} is not a collection", near if parts[3] not in g["routines"] else [self.uri("game", parts[1], "routine", parts[3])])
        if parts[3] in g["all"]:
            return no(f"{said} is a routine of {g['rec'].get('name')} that ran and carries no pattern; only the routines a rule named have an address", near)
        return no(f"{said}: {g['rec'].get('name')} has no routine at that bank and address", near)

    def read(self, ref: "Ref") -> dict:
        as_ = ref.facets.get("as")
        if as_ not in (None, *AS_ENTITY):
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; entity offers {', '.join(AS_ENTITY)}")
        if "at" in ref.facets and not isinstance(self, EntitiesAt):
            return self.at(ref.facets["at"]).read(ref)
        parts = [p for p in ref.path.split("/") if p]
        ix = self.index()
        me = self._mark(ref.uri)
        sep = "&" if "?" in me else "?"
        if as_ == "set":
            return self._set(ref, parts, me, sep)
        if ref.is_collection:
            kids = self._kids(parts)
            if kids is None:
                raise self._missing(parts, True)
            if as_:
                # TM-11: a listing has one representation (and, since tinypeek#23, its set).
                raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; an entity collection is a listing and offers no facet but set; read {ref.uri} without ?as")
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body: dict[str, Any] = {"uri": me, "children": chunk}
            if nxt:
                body["nextCursor"] = nxt
                body["next"] = f"{me}{sep}cursor={nxt}"
            links = [link("up", self.uri(*parts[:-1], collection=True) if parts else ROOT)]
            if len(parts) == 1 and ix["has"][self.READS[parts[0]]]:
                # The record itself, as an http collection names it: the
                # entities listed here each carry their own place in it.
                links.append(link("tm:data", self._whole(self.RECORDS[self.READS[parts[0]]]), "exact", title="the record the entities listed here are read from"))
            return self.ns._result(_cursored(me, ref.facets.get("cursor")), T_LISTING, json.dumps(body, indent=1), links)
        if len(parts) == 2 and parts[0] == "pattern" and parts[1] in ix["patterns"]:
            body, links = self._pattern(parts[1])
        elif len(parts) == 2 and parts[0] == "game" and parts[1] in ix["games"]:
            body, links = self._game(parts[1])
        elif len(parts) == 2 and parts[0] == "lesson" and parts[1] in ix["lessons"]:
            body, links = self._lesson(parts[1])
        elif len(parts) == 4 and parts[0] == "game" and parts[2] == "routine" and parts[3] in ix["games"].get(parts[1], {"routines": {}})["routines"]:
            body, links = self._routine(parts[1], parts[3])
        else:
            raise self._missing(parts, False)
        links = links + self.history(body["entity"]) + self._then(body["entity"], parts)
        text = json.dumps(body, indent=1)
        mime = tm_type(body["entity"])
        if as_ == "stat":
            stat = {"uri": me, "entity": body["entity"], "key": body["key"], "name": body.get("name") or body.get("title") or body["key"],
                    "mimeType": mime, "size": len(text.encode()), "isCollection": False, "text": True, **self._when()}
            return self.ns._result(f"{me}{sep}as=stat", T_STAT, json.dumps(stat, indent=1), links + [link("alternate", me)])
        return self.ns._result(me, mime, text, links)

    def _set(self, ref: "Ref", parts: list[str], me: str, sep: str) -> dict:
        """tinypeek#23: ?as=set, a set and its members in one read, which is
        the bend the lens had left (a pattern's page took one read a
        routine). On a collection the set is its leaf children; on a thing it
        is the targets of one rel, named by rel= and narrowed by min= as
        ?as=links is, and only a rel whose targets are things of this mount
        can be inlined. Each member is read as its own address would read it,
        body and type, with no links of its own: a client follows the member's
        address for those. Paged, SET_CAP members a page, and held to the byte
        cap like any read."""
        here = f"{me}{sep}as=set"
        if ref.is_collection:
            if "rel" in ref.facets or "min" in ref.facets:
                raise TmError(BAD_PARAMS, "bad-facet", f"a collection's set is its children; rel= and min= narrow a thing's links, so read a thing with ?as=set&rel=<rel>")
            kids = self._kids(parts)
            if kids is None:
                raise self._missing(parts, True)
            hrefs = [k["uri"] for k in kids if not k["isCollection"]]
            said: dict[str, Any] = {}
            whole = self.read(parse(me))
            links = [ln for ln in whole["_meta"][META_LINKS]]
        else:
            whole = self.read(parse(me))
            own = whole["_meta"][META_LINKS]
            inlinable = sorted({ln["rel"] for ln in own if _entity_href(ln["href"])})
            rel = ref.facets.get("rel")
            if not rel:
                raise TmError(BAD_PARAMS, "bad-facet", f"?as=set on a thing needs rel=; the rels here whose targets can be inlined are {', '.join(inlinable) or 'none'}")
            if rel not in inlinable:
                raise TmError(BAD_PARAMS, "bad-facet", f"rel={rel!r}: {me} carries no such link to a thing of this mount; it carries {', '.join(inlinable) or 'none'}")
            chosen, tail, said = Namespace._filter(ref, ordered(own))
            here += tail
            hrefs = [ln["href"] for ln in chosen]
            links = own
        chunk, nxt = _page(hrefs, ref.facets.get("cursor"), SET_CAP)
        members = [self._member(href) for href in chunk]
        body: dict[str, Any] = {"uri": me, **said, "total": len(hrefs), "returned": len(members), "members": members}
        if nxt:
            body["nextCursor"] = nxt
            body["next"] = f"{here}&cursor={nxt}"
        text = json.dumps(body, indent=1)
        if len(text.encode()) > READ_CAP:
            raise TmError(RESOURCE_NOT_FOUND, "too-large", f"this page of the set is {len(text.encode())} bytes, over the cap of {READ_CAP}; read the members one by one", size=len(text.encode()))
        return self.ns._result(_cursored(here, ref.facets.get("cursor")), T_SET, text, links + [link("alternate", me, title="the thing the set is of")])

    def _member(self, href: str) -> dict:
        """One member of a set: what its own address reads, body and type."""
        got = self.read(parse(href))
        c = got["contents"][0]
        return {"uri": c["uri"], "mimeType": c["mimeType"], "body": json.loads(c["text"])}

    def _when(self) -> dict:
        return {}

    def _whole(self, rec: str) -> str:
        return f"{ROOT}fs/{rec}"


class EntitiesAt(Entities):
    """tinypeek#21: the entity mount at one commit. The same reading, from the
    two records as the repository had them there; every entity address it
    gives carries the ?at= it was asked with, so pairs between entities hold
    at that time, and tm:data reads the record at that time. What has no past
    (a game's page, a lesson's cartridge directory) is not named, so those
    pairs are not offered one way. latest-version is the entity now."""

    def __init__(self, now: Entities, commit: str):
        super().__init__(now.ns)
        self.now, self.commit, self.spelled = now, commit, None
        got: dict[str, dict] = {}
        has: dict[str, bool] = {}
        for which, rec in self.RECORDS.items():
            try:
                doc = json.loads(run_git(self.ns._git_dir("public"), "cat-file", "blob", f"{commit}:{rec}"))
                got[which], has[which] = (doc if isinstance(doc, dict) else {}), True
            except (TmError, ValueError):
                got[which], has[which] = {}, False
        self._fixed = self._build(got["autopsy"], got["lessons"], has)

    def read(self, ref: "Ref") -> dict:
        # One view a commit; the spelling of the time is the asker's, so it is set per read.
        self.spelled = ref.facets["at"]
        return super().read(ref)

    def index(self) -> dict[str, Any]:
        return self._fixed

    def _q(self) -> str:
        return f"?at={quote(self.spelled, safe=':')}"

    def uri(self, *parts: str, collection: bool = False) -> str:  # type: ignore[override]
        return Entities.uri(*parts, collection=collection) + self._q()

    def _mark(self, uri: str) -> str:
        return uri + self._q()

    def _record(self, which: str, pointer: str) -> str:
        return f"{ROOT}fs/{self.RECORDS[which]}{self._q()}&pointer={pointer}"

    def _whole(self, rec: str) -> str:
        return f"{ROOT}fs/{rec}{self._q()}"

    def game_pages(self, site: str, key: str) -> list[str]:
        return []

    def cartridge(self, key: str) -> str | None:
        return None

    def _when(self) -> dict:
        return {"at": self.spelled, "commit": self.commit}

    def _then(self, kind: str, parts: list[str]) -> list[dict]:
        try:
            self.now.read(Ref("entity", None, "/".join(parts), {"as": "stat"}))
        except TmError:
            return []
        return [link("latest-version", Entities.uri(*parts), title="this entity in the records now")]

    def _missing(self, parts: list[str], coll: bool) -> TmError:
        err = super()._missing(parts, coll)
        try:
            self.now.read(Ref("entity", None, "/".join(parts) + ("/" if coll else ""), {}))
        except TmError:
            return err
        here = Entities.uri(*parts, collection=coll)
        err.message = f"{err.message}; at {self.spelled} the records did not have it, and it is there now"
        err.data["nearest"] = [here] + [n for n in err.data.get("nearest", []) if n != here][:4]
        return err


# ---------------------------------------------------------------------------
# The namespace
# ---------------------------------------------------------------------------


class Trails:
    """tinypeek#18: the memex trail with no grammar change. A trail is a JSON
    file under TRAILS_DIR, {title, note, steps: [{uri, note}]}, written by
    whoever commits it and read through fs as itself. The server links the
    file to each step as the step is written (tm:step) and every step back to
    the trails it is on (tm:step-of), on whichever mount the step lives. The
    order is the file's and the titles say the position; the links come in
    the namespace's one order like every other link. A file there that is
    not of that shape is a file and nothing more; a step that is not a tm://
    URI stays in the body and gets no link; the copy in git is the file's
    history, not a second trail."""

    def __init__(self, ns: "Namespace"):
        self.ns = ns
        self._stamp: tuple | None = None
        self._ix: dict[str, Any] = {}

    @staticmethod
    def _key(ref: Ref) -> str:
        """What a step matches on: the thing's identity, with a git ref since
        that is part of what the thing is, and no other facet."""
        at = ref.facets.get("at")
        return ref.uri + (f"?at={at}" if at and ref.mount in ("git", "fs") else "")

    def index(self) -> dict[str, Any]:
        """Every trail, and every step's trails, rebuilt when a file there
        changes, so a deploy's trail is served without a restart."""
        d = self.ns.repo / TRAILS_DIR
        files = sorted(p for p in d.glob("*.json") if p.is_file() and not denied(f"{TRAILS_DIR}/{p.name}")) if d.is_dir() else []
        stamp = tuple((p.name, p.stat().st_mtime) for p in files)
        if stamp == self._stamp:
            return self._ix
        trails: dict[str, dict] = {}
        on: dict[str, list[tuple[str, int, int, str]]] = {}
        for p in files:
            try:
                doc = json.loads(p.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            steps = doc.get("steps") if isinstance(doc, dict) else None
            if not isinstance(steps, list) or not steps:
                continue
            here = f"{ROOT}fs/{TRAILS_DIR}/{quote(p.name)}"
            title = doc.get("title") if isinstance(doc.get("title"), str) else p.stem
            links: list[dict] = []
            seen: set[str] = set()
            for i, step in enumerate(steps, 1):
                step = {"uri": step} if isinstance(step, str) else step
                uri = step.get("uri") if isinstance(step, dict) else None
                if not isinstance(uri, str) or uri in seen:
                    continue
                try:
                    ref = parse(uri)
                except TmError:
                    continue
                seen.add(uri)
                note = step.get("note") if isinstance(step.get("note"), str) else None
                where = f"step {i} of {len(steps)}"
                links.append(link("tm:step", uri, "exact", title=f"{where}: {note}" if note else where))
                key = self._key(ref)
                if not any(h == here for h, _, _, _ in on.get(key, [])):
                    on.setdefault(key, []).append((here, i, len(steps), title))
            trails[here] = {"title": title, "links": links}
        self._stamp, self._ix = stamp, {"trails": trails, "on": on}
        return self._ix

    def links_for(self, ref: Ref) -> list[dict]:
        """What a read gains: a trail's steps, and a step's trails."""
        ix = self.index()
        out: list[dict] = []
        if ref.mount == "fs" and "at" not in ref.facets:
            out += ix["trails"].get(ref.uri, {}).get("links", [])
        for here, i, n, title in ix["on"].get(self._key(ref), []):
            out.append(link("tm:step-of", here, "exact", title=f"step {i} of {n} on the trail {title}"))
        return out


# ---------------------------------------------------------------------------
# Layer 5, the second application: the mcp mount (tinypeek#22)
# ---------------------------------------------------------------------------


class _Gate(Exception):
    """The server behind an address wants a token this box did not give."""

    def __init__(self, status: int):
        super().__init__(str(status))
        self.status = status


class _Down(Exception):
    """The server behind an address did not answer as an MCP server does."""

    def __init__(self, reason: str, status: int | None = None):
        super().__init__(reason)
        self.reason, self.status = reason, status


class _Throttle(Exception):
    """The server answered 429: it is rate-limiting this box, for now."""

    def __init__(self, retry_after: int | None):
        super().__init__("429")
        self.retry_after = retry_after


class _Stale(Exception):
    """The server no longer knows the session this box kept (404): open another."""


def sse_events(text: str) -> list[tuple[str, str]]:
    """The (event, data) pairs of an event stream already read whole."""
    out, event, data = [], "message", []
    for line in text.splitlines() + [""]:
        if line == "":
            if data:
                out.append((event, "\n".join(data)))
            event, data = "message", []
        elif line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data.append(line[5:].strip())
    return out


class Map:
    """One server's map (tinyhelper#6, spec 13.1): which of its tools read as
    addresses. Merged from the derived file, whose entries read `inferred`,
    and the override, whose entries read `exact` and whose null removes one.
    A key is a path of segments, each a name or one {argument}, with a
    trailing slash for a collection; an entry names its tool, and may name
    its kind (the media type, with {argument}s substituted), its collection's
    query, which field holds its items and which item field keys them, links
    to fill from the arguments and the body, and a field of edges to lift.
    What a key may not do is claim the mount's own paths. An entry that does
    not parse is dropped and said, never guessed at."""

    def __init__(self, server: str, derived: dict | None, override: dict | None):
        self.server = server
        self.derived = derived if isinstance(derived, dict) else {}
        self.override = override if isinstance(override, dict) else {}
        self.reads: dict[str, dict] = {}
        self.ignored: dict[str, str] = {}
        for src, conf in ((self.derived, "inferred"), (self.override, "exact")):
            reads = src.get("reads")
            for key, entry in (reads.items() if isinstance(reads, dict) else ()):
                if entry is None:
                    self.reads.pop(key, None)
                    continue
                parsed = self.parse(key)
                if parsed is None:
                    self.ignored[key] = "a path is segments, each a name or one {argument}, with a trailing slash for a collection"
                elif parsed[0][0] in MCP_OWN:
                    self.ignored[key] = f"{', '.join(k + '/' for k in MCP_KINDS)} and map are the mount's own paths"
                elif not isinstance(entry, dict) or not isinstance(entry.get("tool"), str):
                    self.ignored[key] = "an entry names its tool"
                else:
                    self.reads[key] = {**entry, "confidence": conf}
        und = self.derived.get("undecided")
        self.undecided = {k: v for k, v in (und.items() if isinstance(und, dict) else ()) if isinstance(v, str)}
        self._parsed: dict[str, tuple[list[str], bool]] = {k: self.parse(k) for k in self.reads}  # type: ignore[misc]

    @staticmethod
    def parse(key: Any) -> tuple[list[str], bool] | None:
        if not isinstance(key, str) or not key or key.startswith("/"):
            return None
        coll = key.endswith("/")
        segs = key.rstrip("/").split("/")
        for seg in segs:
            if not seg or "{" in seg[1:] or "}" in seg[:-1]:
                return None
            if seg.startswith("{") and not re.fullmatch(r"\{[A-Za-z_][A-Za-z0-9_-]*\}", seg):
                return None
        return segs, coll

    @staticmethod
    def arg(seg: str) -> str | None:
        return seg[1:-1] if seg.startswith("{") and seg.endswith("}") else None

    def segments(self, key: str) -> tuple[list[str], bool]:
        return self._parsed[key]

    def match(self, parts: list[str], coll: bool) -> tuple[str, dict, dict[str, str]] | None:
        """The entry a path reads by, and the arguments the path binds; where
        two fit, the one with more names and fewer arguments."""
        best: tuple[int, str, dict[str, str]] | None = None
        for key, (segs, c) in self._parsed.items():
            if c != coll or len(segs) != len(parts):
                continue
            args: dict[str, str] = {}
            for seg, part in zip(segs, parts):
                a = self.arg(seg)
                if a is not None:
                    args[a] = part
                elif seg != part:
                    break
            else:
                lits = len(segs) - len(args)
                if best is None or lits > best[0]:
                    best = (lits, key, args)
        return (best[1], self.reads[best[1]], best[2]) if best else None

    def deeper(self, key: str) -> tuple[str, bool] | None:
        """What a collection lists: the template one segment deeper that
        takes an argument there, a collection before a thing."""
        segs, _ = self._parsed[key]
        found: dict[bool, str] = {}
        for k2, (s2, c2) in self._parsed.items():
            if len(s2) == len(segs) + 1 and s2[:-1] == segs and self.arg(s2[-1]) is not None:
                found.setdefault(c2, k2)
        return (found[True], True) if True in found else ((found[False], False) if False in found else None)

    def above(self, key: str) -> str | None:
        """The collection one segment up, when the map names it: a thing's up."""
        segs, _ = self._parsed[key]
        for k2, (s2, c2) in self._parsed.items():
            if c2 and s2 == segs[:-1]:
                return k2
        return None

    def beside(self, key: str) -> str | None:
        """The same path's other shape (the thing for a collection, the
        collection for a thing), when the map names both."""
        segs, coll = self._parsed[key]
        for k2, (s2, c2) in self._parsed.items():
            if c2 != coll and s2 == segs:
                return k2
        return None

    def roots(self) -> list[tuple[str, bool]]:
        """The templates with no argument, which a server lists as children."""
        return sorted((k, c) for k, (segs, c) in self._parsed.items() if not any(self.arg(x) is not None for x in segs))

    def kinds(self) -> dict[str, str]:
        """Every kind the map names, and the first tool it is read with."""
        out: dict[str, str] = {}
        for key in sorted(self.reads):
            e, (_, coll) = self.reads[key], self._parsed[key]
            k = e.get("kind")
            if coll or not isinstance(k, str) or k == "from-result" or not k:
                continue
            out.setdefault(kind_of(k if "/" in k else f"application/{k}"), e["tool"])
        return out

    @staticmethod
    def fill(template: str, args: dict[str, Any], body: Any = None) -> str | None:
        """A template with its {argument}s substituted from the arguments,
        then from the body's own fields; None while one is left."""
        def sub(m: re.Match) -> str:
            k = m[1]
            if k in args:
                return str(args[k])
            v = body.get(k) if isinstance(body, dict) else None
            return str(v) if isinstance(v, (str, int, float)) and not isinstance(v, bool) else m[0]
        out = re.sub(r"\{([A-Za-z_][A-Za-z0-9_-]*)\}", sub, template)
        return None if "{" in out else out

    def type_at(self, key: str, args: dict[str, Any]) -> str | None:
        """What a path under the entry reads as: a listing for a collection,
        the entry's kind with the path's arguments in it, a record with no
        kind, and nothing for from-result, since only the server knows."""
        if self._parsed[key][1]:
            return T_LISTING
        kind = self.reads[key].get("kind")
        if kind == "from-result":
            return None
        if not isinstance(kind, str) or not kind:
            return T_RECORD
        filled = self.fill(kind, args)
        return None if filled is None else (filled if "/" in filled else f"application/{filled}")


class Mcp:
    """tinypeek#22: an MCP server as a mount. A server is named in a file of
    the checkout (MCP_SERVERS_FILE) and the box keeps the connection; a
    client only ever sees addresses. With no map (tinyhelper#6) a server
    exposes what MCP itself lists:

        mcp/<server>/                   the server: its record, and tools/, resources/, prompts/
        mcp/<server>/tools/<name>       one tool, as the server described it
        mcp/<server>/resources/<name>   one resource or template, as described
        mcp/<server>/prompts/<name>     one prompt

    Each collection is there only where the server declares the capability,
    and a tool's listing is what tools/list answered, so the mount asserts
    nothing it did not measure. What the server lists is kept MCP_TTL_S and
    then asked for again; a server that wanted a token the box does not
    hold reads as gated, one that did not answer as unreachable, each in
    the server's record, and its collections refuse with the same word.
    The token comes from the service's environment and goes in a header,
    never in a URI, a body or a refusal."""

    def __init__(self, ns: "Namespace", servers: dict | None = None, transport: httpx.AsyncBaseTransport | None = None):
        self.ns = ns
        self.transport = transport
        self.servers: dict[str, dict] = {}
        conf = servers if servers is not None else self._load(ns.repo / MCP_SERVERS_FILE)
        for name, s in sorted(conf.items()):
            if name.startswith("_") or not isinstance(s, dict) or not isinstance(s.get("endpoint"), str):
                continue
            self.servers[name] = {"endpoint": s["endpoint"], "transport": s.get("transport", "streamable-http"),
                                  "what": s.get("what", ""), "auth": s.get("auth")}
        self._snap: dict[str, dict] = {}
        self._maps: dict[str, tuple[tuple, Map | None]] = {}
        self._calls: dict[tuple[str, str, str], tuple[float, dict]] = {}
        self._sessions: dict[str, dict] = {}

    @staticmethod
    def _load(f: Path) -> dict:
        try:
            got = json.loads(f.read_text())
            return got if isinstance(got, dict) else {}
        except (OSError, ValueError):
            return {}

    # -- addresses -----------------------------------------------------------

    @staticmethod
    def uri(*parts: str, collection: bool = False) -> str:
        return f"{ROOT}mcp/" + "/".join(quote(p) for p in parts) + ("/" if collection and parts else "")

    @staticmethod
    def path_uri(name: str, segs: list[str], collection: bool) -> str:
        """A mapped path's address; a template's braces stay as they are."""
        return f"{ROOT}mcp/{quote(name)}/" + "/".join(quote(s, safe="{}") for s in segs) + ("/" if collection else "")

    def names(self) -> list[str]:
        return list(self.servers)

    def cached(self, name: str) -> dict | None:
        """The server's lists if they were asked for lately, else nothing:
        completions read this and never wait on a network."""
        snap = self._snap.get(name)
        return snap if snap and snap.get("status") == "up" else None

    # -- the connection -------------------------------------------------------

    def _auth(self, conf: dict) -> tuple[str, str | None]:
        """What the record says about the token, and the header's value."""
        var = conf.get("auth")
        if not var:
            return "none", None
        value = os.environ.get(var)
        return ("held by this box", value) if value else ("named, not held by this box", None)

    async def _connect(self, name: str, work: Callable[[Callable, dict], Awaitable[Any]]) -> Any:
        """One session with a server: open the transport, initialize, then
        run `work` with the way to post and what initialize answered. A
        token it wanted is _Gate, no MCP answer is _Down, and the kind of
        failure is all that is kept: an exception's text can quote the
        endpoint and the answer."""
        conf = self.servers[name]
        _, token = self._auth(conf)
        headers = {"Authorization": token} if token else {}
        try:
            async with httpx.AsyncClient(timeout=MCP_TIMEOUT_S, follow_redirects=False, transport=self.transport) as c:
                if conf["transport"] == "sse":
                    return await self._over_sse(c, conf["endpoint"], headers, work)
                try:
                    return await self._over_streamable(c, conf["endpoint"], headers, work, name)
                except _Stale:
                    # The session the box kept is gone: open one more, once.
                    self._sessions.pop(name, None)
                    return await self._over_streamable(c, conf["endpoint"], headers, work, name, fresh=True)
        except (_Gate, _Down, _Throttle):
            self._sessions.pop(name, None)
            raise
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:
            self._sessions.pop(name, None)
            raise _Down(type(e).__name__) from None

    async def snapshot(self, name: str) -> dict:
        """What the server lists, measured now or lately."""
        snap = self._snap.get(name)
        now = time.monotonic()
        if snap and now - snap["at"] < (MCP_TTL_S if snap["status"] == "up" else MCP_RETRY_S):
            return snap
        said, _ = self._auth(self.servers[name])
        snap = {"at": now, "checked": datetime.now(timezone.utc).isoformat(timespec="seconds"), "auth": said,
                "status": "up", "tools": [], "resources": [], "templates": [], "prompts": []}

        async def lists(post: Callable, init: dict) -> None:
            snap["init"] = init
            for method, field_, keep in self._wants(snap):
                got = await post(method, {})
                snap[keep] = [t for t in got.get(field_, []) if isinstance(t, dict) and isinstance(t.get("name"), str)]

        try:
            await self._connect(name, lists)
        except _Gate as e:
            snap.update(status="gated", statusCode=e.status)
        except _Down as e:
            snap.update(status="unreachable", reason=e.reason, **({"statusCode": e.status} if e.status else {}))
        except _Throttle as e:
            # Not down, throttling: the record says so, and is asked again
            # when the server said to, not a minute from now.
            snap.update(status="unreachable", reason="answered 429, rate-limiting this box", statusCode=429,
                        at=now - MCP_RETRY_S + (e.retry_after or 1))
        self._snap[name] = snap
        return snap

    async def call(self, name: str, tool: str, args: dict) -> dict:
        """One tool's answer, asked for now or lately: a thing and its stat
        cost the server one call, and a crawl's second look costs nothing."""
        key = (name, tool, json.dumps(args, sort_keys=True))
        hit = self._calls.get(key)
        now = time.monotonic()
        if hit and now - hit[0] < MCP_TTL_S:
            return hit[1]

        async def one(post: Callable, init: dict) -> dict:
            return await post("tools/call", {"name": tool, "arguments": args})

        got = await self._connect(name, one)
        while len(self._calls) >= MCP_CALL_CAP:
            del self._calls[next(iter(self._calls))]
        self._calls[key] = (now, got)
        return got

    def _wants(self, snap: dict) -> list[tuple[str, str, str]]:
        """The lists to ask for, by the capabilities the server declared."""
        caps = (snap.get("init") or {}).get("capabilities") or {}
        wants = [("tools/list", "tools", "tools")] if "tools" in caps else []
        if "resources" in caps:
            wants += [("resources/list", "resources", "resources"), ("resources/templates/list", "resourceTemplates", "templates")]
        if "prompts" in caps:
            wants.append(("prompts/list", "prompts", "prompts"))
        return wants

    @staticmethod
    def _msg(id_: int | None, method: str, params: dict | None = None) -> dict:
        msg: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if id_ is not None:
            msg["id"] = id_
        if params is not None:
            msg["params"] = params
        return msg

    @staticmethod
    def _init_params() -> dict:
        return {"protocolVersion": MCP_PROTOCOL, "capabilities": {}, "clientInfo": {"name": "tm", "version": "0.22"}}

    @staticmethod
    def _result(answer: Any, method: str) -> dict:
        if not isinstance(answer, dict):
            raise _Down(f"{method}: not a JSON-RPC answer")
        if "error" in answer:
            err = answer["error"] if isinstance(answer["error"], dict) else {}
            raise _Down(f"{method}: the server answered error {err.get('code')}")
        got = answer.get("result")
        if not isinstance(got, dict):
            raise _Down(f"{method}: no result")
        return got

    async def _over_streamable(self, c: httpx.AsyncClient, endpoint: str, headers: dict, work: Callable, name: str, fresh: bool = False) -> Any:
        """Streamable HTTP: every message is a POST; an answer is JSON or a
        short event stream; the session id rides in a header. A session the
        server gave an id is kept and reused, so a tool call costs one POST
        and not three; a 404 on it means the server forgot it (_Stale); a
        429 means the server is rate-limiting the box (_Throttle), which is
        neither down nor gated."""
        sess = None if fresh else self._sessions.get(name)
        hdrs = dict(sess["hdrs"]) if sess else {**headers, "Accept": "application/json, text/event-stream", "Content-Type": "application/json",
                                                 "MCP-Protocol-Version": MCP_PROTOCOL}
        n = sess["n"] if sess else 0

        async def post(method: str, params: dict | None, notify: bool = False) -> dict | None:
            nonlocal n
            n += 1
            msg = self._msg(None if notify else n, method, params)
            r = await c.post(endpoint, content=json.dumps(msg).encode(), headers=hdrs)
            if r.status_code in (401, 403):
                raise _Gate(r.status_code)
            if r.status_code == 429:
                ra = r.headers.get("retry-after")
                raise _Throttle(int(ra) if ra and ra.isdigit() else None)
            if r.status_code == 404 and sess is not None:
                raise _Stale()
            if r.status_code >= 400:
                raise _Down(f"{method}: answered {r.status_code}", r.status_code)
            sid = r.headers.get("mcp-session-id")
            if sid:
                hdrs["Mcp-Session-Id"] = sid
            if notify or r.status_code == 202 or not r.content:
                return None
            if r.headers.get("content-type", "").startswith("text/event-stream"):
                for _, data in sse_events(r.text):
                    obj = json.loads(data)
                    if isinstance(obj, dict) and obj.get("id") == msg["id"]:
                        return self._result(obj, method)
                raise _Down(f"{method}: no answer in the stream")
            return self._result(r.json(), method)

        if sess:
            init = sess["init"]
        else:
            init = await post("initialize", self._init_params())
            await post("notifications/initialized", None, notify=True)
        out = await work(post, init)
        if "Mcp-Session-Id" in hdrs:
            self._sessions[name] = {"hdrs": hdrs, "n": n, "init": init}
        return out

    async def _over_sse(self, c: httpx.AsyncClient, endpoint: str, headers: dict, work: Callable) -> Any:
        """The older transport: one GET holds an event stream open; its first
        event names where to POST, and every answer comes back on the stream."""
        async with c.stream("GET", endpoint, headers={**headers, "Accept": "text/event-stream"}) as s:
            if s.status_code in (401, 403):
                raise _Gate(s.status_code)
            if s.status_code >= 400:
                raise _Down(f"the stream answered {s.status_code}", s.status_code)
            lines = s.aiter_lines()

            async def event(want_id: int | None) -> str:
                ev, data = "message", []
                async for line in lines:
                    if line == "":
                        if data:
                            if want_id is None and ev == "endpoint":
                                return data[0]
                            if want_id is not None and ev == "message":
                                obj = json.loads("\n".join(data))
                                if isinstance(obj, dict) and obj.get("id") == want_id:
                                    return "\n".join(data)
                        ev, data = "message", []
                    elif line.startswith("event:"):
                        ev = line[6:].strip()
                    elif line.startswith("data:"):
                        data.append(line[5:].strip())
                raise _Down("the stream ended before it answered")

            post_to = urljoin(endpoint, await event(None))
            hdrs = {**headers, "Content-Type": "application/json"}
            n = 0

            async def post(method: str, params: dict | None, notify: bool = False) -> dict | None:
                nonlocal n
                n += 1
                msg = self._msg(None if notify else n, method, params)
                r = await c.post(post_to, content=json.dumps(msg).encode(), headers=hdrs)
                if r.status_code in (401, 403):
                    raise _Gate(r.status_code)
                if r.status_code == 429:
                    ra = r.headers.get("retry-after")
                    raise _Throttle(int(ra) if ra and ra.isdigit() else None)
                if r.status_code >= 400:
                    raise _Down(f"{method}: answered {r.status_code}", r.status_code)
                if notify:
                    return None
                return self._result(json.loads(await event(msg["id"])), method)

            init = await post("initialize", self._init_params())
            await post("notifications/initialized", None, notify=True)
            return await work(post, init)

    # -- the map (tinyhelper#6) ----------------------------------------------

    def map_files(self, name: str) -> tuple[Path, Path]:
        d = self.ns.repo / MAPS_DIR
        return d / f"{name}.json", d / f"{name}.override.json"

    def map(self, name: str) -> Map | None:
        """The server's map as its two files now are, re-read when either
        changes, so a map the driver just wrote is served with no restart.
        No derived file, no map: an override alone corrects nothing."""
        derived, override = self.map_files(name)

        def stamp(f: Path) -> tuple[int, int] | None:
            try:
                st = f.stat()
                return st.st_mtime_ns, st.st_size
            except OSError:
                return None

        key = (stamp(derived), stamp(override))
        hit = self._maps.get(name)
        if hit and hit[0] == key:
            return hit[1]
        m = Map(name, self._load(derived), self._load(override) if key[1] else None) if key[0] else None
        self._maps[name] = (key, m)
        return m

    def takes(self, ref: Ref) -> tuple[tuple[str, ...], bool] | None:
        """A mapped collection's own query, for check_params: the names its
        entry lists and whether * passes the rest through. None elsewhere."""
        if ref.mount != "mcp" or not ref.is_collection:
            return None
        parts = [p for p in ref.path.split("/") if p]
        if len(parts) < 2 or parts[0] not in self.servers or parts[1] in MCP_OWN:
            return None
        m = self.map(parts[0])
        hit = m.match(parts[1:], True) if m else None
        if not hit:
            return None
        q = hit[1].get("query")
        names = [x for x in q if isinstance(x, str)] if isinstance(q, list) else []
        return tuple(sorted(x for x in names if x != "*" and x not in PARAMS["mcp"] and x != "at")), "*" in names

    def type_of(self, name: str, parts: list[str], coll: bool) -> str | None:
        """What a mapped address reads as, from the address alone."""
        if name not in self.servers or not parts or parts[0] in MCP_KINDS:
            return None
        if parts == ["map"]:
            return None if coll else T_MAP
        m = self.map(name)
        hit = m.match(parts, coll) if m else None
        return m.type_at(hit[0], hit[2]) if m and hit else None

    def kinds(self) -> dict[str, dict]:
        """The kinds the maps name that the vocabulary does not: one line
        each, and the address of the schema the server published for it,
        when the tool was seen to have one. The registry points there,
        never at a copy."""
        out: dict[str, dict] = {}
        for name in self.servers:
            m = self.map(name)
            if not m:
                continue
            snap = self.cached(name)
            for kind, tool in m.kinds().items():
                if kind in out or kind in KINDS:
                    continue
                e = {"what": f"a kind the map of {name} names, read with its tool {tool}"}
                t = self._find("tools", tool, snap) if snap else None
                if t and isinstance(t.get("outputSchema"), dict):
                    e["schema"] = f"{self.uri(name, 'tools', tool)}?pointer=/outputSchema"
                out[kind] = e
        return out

    def inbound(self, path: str) -> list[dict]:
        """What a map's file says back: the map read from it."""
        m = re.fullmatch(re.escape(MAPS_DIR) + r"/([^/]+?)(\.override)?\.json", path)
        if m and m[1] in self.servers and self.map(m[1]) is not None:
            return [link("tm:read-by", self.uri(m[1], "map"), "exact", title=f"the map of {m[1]}, read from this file")]
        return []

    # -- read ----------------------------------------------------------------

    def _no(self, msg: str, nearest: list[str]) -> TmError:
        return TmError(RESOURCE_NOT_FOUND, "not-found", msg, nearest=nearest[:5])

    def _closed(self, name: str, snap: dict) -> TmError:
        """The refusal a server's collections and things give while the
        server is not up: the same word its record says, and the record."""
        here = self.uri(name, collection=True)
        if snap["status"] == "gated":
            return TmError(RESOURCE_NOT_FOUND, "gated", f"mcp/{name} wants a token this box did not give; its record says so",
                           status=snap.get("statusCode"), nearest=[here])
        return TmError(RESOURCE_NOT_FOUND, "unreachable", f"mcp/{name} did not answer as an MCP server does ({snap.get('reason')}); its record says so",
                       **({"status": snap["statusCode"]} if snap.get("statusCode") else {}), nearest=[here])

    @staticmethod
    def _title(d: dict) -> str | None:
        t = d.get("title") or (d.get("description") or "").strip().split("\n", 1)[0]
        return t[:120] if t else None

    def _kids(self, name: str, kind: str, snap: dict) -> list[dict]:
        one = kind[:-1]
        return [{"uri": self.uri(name, kind, t["name"]), "name": t["name"], **({"title": self._title(t)} if self._title(t) else {}),
                 "mimeType": MCP_TYPE[one], "isCollection": False}
                for t in (snap[kind] + (snap["templates"] if kind == "resources" else []))]

    def _find(self, kind: str, which: str, snap: dict) -> dict | None:
        pool = snap[kind] + (snap["templates"] if kind == "resources" else [])
        for t in pool:
            if t["name"] == which:
                return t
        return None

    def _server(self, name: str, snap: dict) -> tuple[dict, list[dict]]:
        conf = self.servers[name]
        here = self.uri(name, collection=True)
        init = snap.get("init") or {}
        m = self.map(name)
        map_kid = [{"uri": self.uri(name, "map"), "name": "map", "mimeType": T_MAP, "isCollection": False}] if m else []
        body: dict[str, Any] = {"uri": here, "server": name, "what": conf["what"], "endpoint": conf["endpoint"],
                                "transport": conf["transport"], "auth": snap["auth"], "status": snap["status"], "checked": snap["checked"],
                                "map": self.uri(name, "map") if m else None}
        links = [link("up", f"{ROOT}mcp/")]
        if snap["status"] != "up":
            for k in ("statusCode", "reason"):
                if k in snap:
                    body[k] = snap[k]
            body["children"] = map_kid
            return body, links
        for k in ("protocolVersion", "serverInfo", "capabilities", "instructions"):
            if k in init:
                body[k] = init[k]
        body["counts"] = {k: len(snap[k]) for k in ("tools", "resources", "templates", "prompts")}
        body["counts"]["reads"] = len(m.reads) if m else 0
        caps = init.get("capabilities") or {}
        body["children"] = [{"uri": self.uri(name, k, collection=True), "name": f"{k}/", "mimeType": T_LISTING, "isCollection": True}
                            for k in MCP_KINDS if k in caps] + map_kid
        for key, coll in (m.roots() if m else []):
            segs, _ = m.segments(key)
            t = m.type_at(key, {})
            body["children"].append({"uri": self.path_uri(name, segs, coll), "name": key, **({"mimeType": t} if t else {}), "isCollection": coll})
        for t in snap["tools"]:
            links.append(link("tm:serves", self.uri(name, "tools", t["name"]), "exact", title=f"a tool of {name}: {self._title(t) or t['name']}"))
        return body, links

    def _thing(self, name: str, kind: str, t: dict) -> tuple[dict, list[dict]]:
        """A tool, a resource or a prompt as the server described it, with
        its address and its server's."""
        here = self.uri(name, kind, t["name"])
        coll = self.uri(name, kind, collection=True)
        body: dict[str, Any] = {"uri": here, "server": self.uri(name, collection=True)}
        if kind == "resources":
            body["resource"] = t.get("uri") or t.get("uriTemplate")
            body["template"] = "uriTemplate" in t
        body.update(t)
        links = [link("up", coll), link("collection", coll), link("describedby", f"{here}?as=stat"),
                 link("tm:served-by", self.uri(name, collection=True), "exact", title=f"the server that lists this {kind[:-1]}")]
        if kind == "tools":
            for which in ("inputSchema", "outputSchema"):
                if isinstance(t.get(which), dict):
                    links.append(link("tm:schema", f"{here}?pointer=/{which}", "exact", title=f"its {which[:-6]} schema, as the server published it"))
        return body, links

    async def read(self, ref: Ref) -> dict:
        as_ = ref.facets.get("as")
        if as_ not in (None, *AS_MCP):
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; mcp offers {', '.join(AS_MCP)}")
        parts = [p for p in ref.path.split("/") if p]
        coll = ref.is_collection
        if not parts:
            if as_:
                raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; an mcp collection is a listing and offers no facets; read {ref.uri} without ?as")
            kids = [{"uri": self.uri(n, collection=True), "name": n, "title": self.servers[n]["what"], "mimeType": MCP_TYPE["server"], "isCollection": True}
                    for n in self.servers]
            return self._listing(ref, kids, {}, [link("up", ROOT)])
        name = parts[0]
        if name not in self.servers:
            raise self._no(f"mcp/{name}: no MCP server of that name is read here; the servers are {', '.join(self.servers) or 'none'}",
                           [self.uri(n, collection=True) for n in closest(name, list(self.servers))])
        here = self.uri(name, collection=True)
        if len(parts) == 1 and not coll:
            raise self._no(f"mcp/{name} is a collection; the server is at {here}", [here])
        if coll and as_:
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; an mcp collection is a listing and offers no facets; read {ref.uri} without ?as")
        snap = await self.snapshot(name)
        if len(parts) == 1:
            body, links = self._server(name, snap)
            return self._listing(ref, body.pop("children"), body, links, MCP_TYPE["server"])
        kind = parts[1]
        if kind == "map":
            if len(parts) > 2 or coll:
                raise self._no(f"{ref.uri}: the map is one thing, at {self.uri(name, 'map')}", [self.uri(name, "map")])
            return self._map_read(ref, name, as_)
        if kind not in MCP_KINDS:
            return await self._mapped(ref, name, parts[1:], coll, as_, snap)
        if snap["status"] != "up":
            raise self._closed(name, snap)
        caps = (snap.get("init") or {}).get("capabilities") or {}
        if kind not in caps:
            raise self._no(f"mcp/{name}/{kind}/: this server declares no {kind}; its record says what it has", [here])
        listing = self.uri(name, kind, collection=True)
        if len(parts) == 2:
            if not coll:
                raise self._no(f"mcp/{name}/{kind} is a collection; its listing is at {listing}", [listing])
            extra = {"templates": snap["templates"]} if kind == "resources" else {}
            return self._listing(ref, self._kids(name, kind, snap), extra, [link("up", here), link("collection", here)])
        which = "/".join(parts[2:])
        t = self._find(kind, which, snap)
        if t is None:
            names = [x["name"] for x in snap[kind] + (snap["templates"] if kind == "resources" else [])]
            raise self._no(f"mcp/{name}/{kind}/{which}: {name} lists no {kind[:-1]} of that name", [self.uri(name, kind, n) for n in closest(which, names)] or [listing])
        me = self.uri(name, kind, which)
        if coll:
            raise self._no(f"{me}/ is not a collection; the {kind[:-1]} is at {me}", [me])
        body, links = self._thing(name, kind, t)
        return self._emit(ref, me, MCP_TYPE[kind[:-1]], json.dumps(body, indent=1, ensure_ascii=False).encode(), True, links,
                          {"uri": me, "name": t["name"], "server": self.uri(name, collection=True), "checked": snap["checked"]}, as_)

    def _emit(self, ref: Ref, me: str, mime: str, data: bytes, text: bool, links: list[dict], stat: dict, as_: str | None) -> dict:
        """A thing, its stat or a piece of it: one tail for a tool, a prompt,
        a resource, a map and a mapped read alike."""
        if as_ == "stat":
            st = {**stat, "mimeType": mime, "size": len(data), "isCollection": False, "text": text}
            return self.ns._result(f"{me}?as=stat", T_STAT, json.dumps(st, indent=1), links + [link("alternate", me)])
        span = span_of(ref)
        if span and span[0] == "range":
            start, end = byte_range(span[1], len(data))
            piece = data[start:end]
            return self.ns._result(f"{me}?range={start}-{end}", mime, piece.decode("utf-8", errors="replace") if text else None, links, blob=None if text else piece)
        if span:
            if not text:
                raise TmError(BAD_PARAMS, "bad-facet", f"{span[0]} reads a piece of a text, and this reads as {mime}; range= reads its bytes")
            uri, mime, data = cut(span, data, mime, me)
            return self.ns._result(uri, mime, data.decode("utf-8", errors="replace"), links)
        return self.ns._result(me, mime, data.decode("utf-8", errors="replace") if text else None, links, blob=None if text else data)

    # -- the map and what it makes addressable (tinyhelper#6) -----------------

    def _map_read(self, ref: Ref, name: str, as_: str | None) -> dict:
        """The merged map: every entry with its confidence and its address
        template, what the driver could not decide, what was dropped, and the
        two files it is read from."""
        m = self.map(name)
        me, here = self.uri(name, "map"), self.uri(name, collection=True)
        if m is None:
            raise self._no(f"mcp/{name}/map: no map is derived for {name} yet, so only its tools, resources and prompts are addressed",
                           [here])
        derived_f, override_f = self.map_files(name)
        reads = {}
        for key in sorted(m.reads):
            segs, coll = m.segments(key)
            reads[key] = {**m.reads[key], "uri": self.path_uri(name, segs, coll)}
        counts = {"reads": len(reads), "exact": sum(1 for e in reads.values() if e["confidence"] == "exact"),
                  "inferred": sum(1 for e in reads.values() if e["confidence"] == "inferred"), "undecided": len(m.undecided)}
        src = f"{ROOT}fs/{MAPS_DIR}/{quote(name)}.json"
        ovr = f"{ROOT}fs/{MAPS_DIR}/{quote(name)}.override.json" if override_f.exists() else None
        body = {"uri": me, "server": here, "derived": m.derived.get("derived"), "from": m.derived.get("from"), "source": src, "override": ovr,
                "counts": counts, "reads": reads, "undecided": m.undecided, "ignored": m.ignored}
        links = [link("up", here), link("describedby", f"{me}?as=stat"),
                 link("tm:data", src, "exact", title=f"the derived map of {name}, as the index driver wrote it", mime=T_RECORD)]
        if ovr:
            links.append(link("tm:data", ovr, "exact", title=f"the override for {name}: what a person corrected", mime=T_RECORD))
        return self._emit(ref, me, T_MAP, json.dumps(body, indent=1, ensure_ascii=False).encode(), True, links, {"uri": me, "name": "map", "server": here}, as_)

    def _coerce(self, name: str, k: str, v: str, props: dict) -> Any:
        """An argument as the tool's schema types it; a value that is not
        of that type is refused before the server is asked."""
        t = (props.get(k) or {}).get("type") if isinstance(props.get(k), dict) else None
        try:
            if t == "integer":
                return int(v)
            if t == "number":
                return float(v)
            if t == "boolean":
                if v in ("true", "1"):
                    return True
                if v in ("false", "0"):
                    return False
                raise ValueError(v)
        except ValueError:
            raise self._no(f"mcp/{name}: {k}={v!r} is not {'an' if t == 'integer' else 'a'} {t}, which is what the tool's schema says {k} is", [self.uri(name, "map")]) from None
        return v

    @staticmethod
    def _edge(e: Any) -> tuple[str | int | None, str | None]:
        """One edge of a result: its id and a title. An id stands alone, or
        is the edge's own id, target or node, or sits one level down under
        neighbour, neighbor or to; a title is the first title, label or name
        at either level."""
        if isinstance(e, (str, int)) and not isinstance(e, bool):
            return e, None
        if not isinstance(e, dict):
            return None, None
        levels = [e] + [e[k] for k in ("neighbour", "neighbor", "to") if isinstance(e.get(k), dict)]
        val = next((lv[k] for lv in levels for k in ("id", "target", "node") if isinstance(lv.get(k), (str, int)) and not isinstance(lv.get(k), bool)), None)
        title = next((lv[t] for lv in levels for t in ("title", "label", "name") if isinstance(lv.get(t), str)), None)
        return val, title

    @staticmethod
    def _words(got: dict) -> str:
        for c in got.get("content") or []:
            if isinstance(c, dict) and c.get("type") == "text" and isinstance(c.get("text"), str):
                return c["text"]
        return ""

    @staticmethod
    def _body(got: dict, kind: Any, args: dict) -> tuple[Any, str | None, bytes | None]:
        """What a tool answered, as a thing: structuredContent when the
        server gave it, else its first content; with its type by the map's
        kind, by the server's own for from-result, a record for JSON with no
        kind, and words as words. Bytes come back as bytes."""
        sc = got.get("structuredContent")
        content = got.get("content") or []
        first = content[0] if content and isinstance(content[0], dict) else {}
        own: str | None = None
        if isinstance(sc, (dict, list)):
            data: Any = sc
        elif first.get("type") == "resource" and isinstance(first.get("resource"), dict):
            res = first["resource"]
            own = res.get("mimeType") if isinstance(res.get("mimeType"), str) else None
            if isinstance(res.get("blob"), str):
                return None, own or "application/octet-stream", base64.b64decode(res["blob"])
            data = res.get("text", "")
        else:
            data = first.get("text", "") if first.get("type") == "text" else json.dumps(content)
            own = first.get("mimeType") if isinstance(first.get("mimeType"), str) else None
        if isinstance(data, str) and data[:1] in ("{", "["):
            try:
                data = json.loads(data)
            except ValueError:
                pass
        # A framework that wraps a tool's return as {"result": <value>}, the
        # value sometimes a JSON string: the wrapper is the transport's, not
        # the thing's, so one sole key named result is unwrapped once.
        if isinstance(data, dict) and list(data) == ["result"]:
            inner = data["result"]
            if isinstance(inner, str) and inner[:1] in ("{", "["):
                try:
                    inner = json.loads(inner)
                except ValueError:
                    pass
            if isinstance(inner, (dict, list)):
                data = inner
        structured = isinstance(data, (dict, list))
        if kind == "from-result":
            mime = (T_RECORD if own in (None, "application/json") else own) if structured else (own or "text/plain")
        elif isinstance(kind, str) and kind and structured:
            filled = Map.fill(kind, args)
            mime = (filled if "/" in filled else f"application/{filled}") if filled else T_RECORD
        else:
            mime = T_RECORD if structured else "text/plain"
        return data, mime, None

    def _children(self, m: Map, name: str, key: str, args: dict, data: Any) -> tuple[list[dict], int | None]:
        """What a mapped collection lists: each item of the answer at the
        address one segment deeper, keyed by the field the entry names, else
        the argument's own name, else id. An item with no key is not listed."""
        entry = m.reads[key]
        items: list = []
        if isinstance(data, dict):
            # The field the entry names; failing that (the entry is inferred),
            # the first field that holds a list, which is how a server that
            # wraps a list answer as {"result": [...]} still lists.
            field_ = entry.get("items")
            got = data.get(field_) if isinstance(field_, str) else None
            if not isinstance(got, list):
                got = next((v for v in data.values() if isinstance(v, list)), None)
            items = got if isinstance(got, list) else []
        elif isinstance(data, list):
            items = data
        total = data.get("total") if isinstance(data, dict) and isinstance(data.get("total"), int) else None
        deeper = m.deeper(key)
        if not deeper:
            return [], total
        dkey, dcoll = deeper
        segs, _ = m.segments(dkey)
        argname = Map.arg(segs[-1]) or "id"
        keyfield = entry.get("key") if isinstance(entry.get("key"), str) else argname
        kids = []
        for it in items:
            title = None
            if isinstance(it, dict):
                val = it.get(keyfield, it.get("id"))
                title = next((it[t] for t in ("title", "label") if isinstance(it.get(t), str) and it[t]), None)
            else:
                val = it
            if isinstance(val, bool) or not isinstance(val, (str, int)):
                continue
            a2 = {**args, argname: str(val)}
            t = m.type_at(dkey, a2)
            kids.append({"uri": self.path_uri(name, [Map.fill(x, a2) or x for x in segs], dcoll), "name": str(val),
                         **({"title": title} if title else {}), **({"mimeType": t} if t else {}), "isCollection": dcoll})
        return kids, total

    async def _mapped(self, ref: Ref, name: str, parts: list[str], coll: bool, as_: str | None, snap: dict) -> dict:
        """A path the map names: the tool it names is called with the path's
        arguments (and a collection's own query), and the answer is the thing,
        typed by the entry's kind, linked as the entry says, its provenance
        in _meta untouched and the entry's confidence beside it."""
        here = self.uri(name, collection=True)
        where = f"mcp/{name}/{'/'.join(parts)}{'/' if coll else ''}"
        m = self.map(name)
        if m is None:
            raise self._no(f"{where}: no map is derived for {name} yet, so only its tools, resources and prompts are addressed", [here])
        hit = m.match(parts, coll)
        if hit is None:
            other = m.match(parts, not coll)
            if other:
                me = self.path_uri(name, parts, not coll)
                raise self._no(f"{where} is not {'a collection' if coll else 'a thing'} the map of {name} names; {me} is", [me])
            raise self._no(f"{where}: the map of {name} names no such path; it says what is addressed", [self.uri(name, "map")])
        key, entry, args = hit
        if snap["status"] != "up":
            raise self._closed(name, snap)
        tool = self._find("tools", entry["tool"], snap)
        if tool is None:
            raise self._no(f"{where}: the map reads this with {entry['tool']}, a tool {name} does not list", [self.uri(name, "map")])
        props = (tool.get("inputSchema") or {}).get("properties") if isinstance(tool.get("inputSchema"), dict) else {}
        props = props if isinstance(props, dict) else {}
        call_args = {k: self._coerce(name, k, v, props) for k, v in args.items()}
        query: dict[str, Any] = {}
        if coll:
            for k, v in ref.facets.items():
                if k not in PARAMS["mcp"] and k != "at":
                    query[k] = self._coerce(name, k, v, props)
            call_args.update(query)
        try:
            got = await self.call(name, entry["tool"], call_args)
        except _Gate as e:
            raise self._closed(name, {"status": "gated", "statusCode": e.status}) from None
        except _Down as e:
            raise self._closed(name, {"status": "unreachable", "reason": e.reason, **({"statusCode": e.status} if e.status else {})}) from None
        except _Throttle as e:
            raise TmError(RESOURCE_NOT_FOUND, "throttled", f"mcp/{name} is rate-limiting this box right now (it answered 429); the same read a moment later is the way",
                          status=429, nearest=[here], **({"retryAfter": e.retry_after} if e.retry_after else {})) from None
        above = m.above(key)
        up = self.path_uri(name, [Map.fill(x, args) or x for x in m.segments(above)[0]], True) if above else here
        if got.get("isError"):
            raise self._no(f"{where}: {name} answered an error through {entry['tool']}: {self._words(got)[:200]}", [up])
        data, mime, blob = self._body(got, entry.get("kind"), args)
        me = self.path_uri(name, parts, coll)
        tool_uri = self.uri(name, "tools", entry["tool"])
        conf = entry["confidence"]
        links = [link("up", up)]
        if coll:
            if query:
                me += "?" + urlencode(sorted(query.items()))
            kids, total = self._children(m, name, key, args, data)
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body: dict[str, Any] = {"uri": me, "server": here, "tool": tool_uri, **({"query": query} if query else {}),
                                    **({"total": total} if total is not None else {}), "children": chunk}
            if nxt:
                body["nextCursor"] = nxt
                body["next"] = f"{me}{'&' if '?' in me else '?'}cursor={nxt}"
            body["result"] = data
            beside = m.beside(key)
            if beside:
                links.append(link("describedby", self.path_uri(name, [Map.fill(x, args) or x for x in m.segments(beside)[0]], False)))
            mime, data, blob = T_LISTING, body, None
        else:
            if above:
                links.append(link("collection", up))
            links.append(link("describedby", f"{me}?as=stat"))
        links.append(link("tm:read-with", tool_uri, conf, title=f"the tool of {name} this is read with"))
        more = entry.get("links")
        for rel, tmpl in (more.items() if isinstance(more, dict) else ()):
            filled = Map.fill(tmpl, args, data) if isinstance(tmpl, str) else None
            if filled:
                links.append(link(rel, self.path_uri(name, filled.rstrip("/").split("/"), filled.endswith("/")), conf if rel.startswith("tm:") else None))
        edges = entry.get("edges")
        if isinstance(edges, str) and isinstance(data, dict) and isinstance(data.get(edges), list) and not coll:
            segs, _ = m.segments(key)
            last = Map.arg(segs[-1])
            for e in data[edges]:
                val, title = self._edge(e)
                if val is None or last is None:
                    continue
                a2 = {**args, last: str(val)}
                links.append(link("related", self.path_uri(name, [Map.fill(x, a2) or x for x in segs], False), title=title))
        if blob is not None:
            got_out = self._emit(ref, me, mime, blob, False, links, {"uri": me, "server": here, "checked": snap["checked"]}, as_)
        else:
            text = json.dumps(data, indent=1, ensure_ascii=False) if isinstance(data, (dict, list)) else str(data)
            got_out = self._emit(ref, me, mime, text.encode(), True, links, {"uri": me, "server": here, "checked": snap["checked"]}, as_)
        got_out["_meta"][META_MAP] = {"map": self.uri(name, "map"), "entry": key, "tool": entry["tool"], "confidence": conf}
        prov = {k: data[k] for k in PROVENANCE if isinstance(data, dict) and k in data}
        if prov:
            got_out["_meta"][META_PROVENANCE] = prov
        return got_out

    def _listing(self, ref: Ref, kids: list[dict], extra: dict, links: list[dict], mime: str = T_LISTING) -> dict:
        """A listing, or the server's record, which is a listing whose body is
        the record and whose type says so (tinypeek#23)."""
        chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
        body: dict[str, Any] = {"uri": ref.uri, **extra, "children": chunk}
        if nxt:
            body["nextCursor"] = nxt
            body["next"] = f"{ref.uri}?cursor={nxt}"
        return self.ns._result(_cursored(ref.uri, ref.facets.get("cursor")), mime, json.dumps(body, indent=1, ensure_ascii=False), links)

    def complete(self, server: str | None, typed: str) -> list[str]:
        """The paths under a server: its three collections, and what a
        collection lists when the server was asked lately."""
        if server not in self.servers:
            return []
        snap = self.cached(server)
        caps = ((snap or {}).get("init") or {}).get("capabilities") or {}
        values = [f"{k}/" for k in MCP_KINDS if not snap or k in caps]
        m = self.map(server)
        if m:
            values += ["map"] + [k for k, _ in m.roots()]
        if snap:
            for kind in MCP_KINDS:
                values += [f"{kind}/{t['name']}" for t in snap[kind] + (snap["templates"] if kind == "resources" else [])]
        return [v for v in values if v.startswith(typed)]


# ---------------------------------------------------------------------------
# The kind registry (tinypeek#23): measured, like reachability
# ---------------------------------------------------------------------------


def kinds_file_from_env(repo: Path) -> Path | None:
    """Where the registry keeps its counts between restarts: $TM_KINDS_FILE,
    else tm-kinds.json in the service's state directory, else nowhere (a
    test, a dev run, the crawler), in which case it counts from the start of
    the process. A place under the checkout is refused, as the audit log's
    is: the namespace serves parts of the checkout."""
    explicit, state = os.environ.get("TM_KINDS_FILE"), os.environ.get("STATE_DIRECTORY")
    where = Path(explicit) if explicit else Path(state.split(":")[0]) / "tm-kinds.json" if state else None
    if where is None:
        return None
    here, checkout = where.resolve(), repo.resolve()
    if here == checkout or checkout in here.parents:
        print("kinds: the registry may not be kept under the checkout, which the namespace serves parts of; counting from this start", flush=True)
        return None
    return where


class Kinds:
    """tinypeek#23: the kinds this host has served, counted as they go out.
    Every read that leaves the namespace is recorded by the kind its media
    type names (kind_of), with the type itself, the time, and the rels of the
    links it carried, so `kinds/` lists exactly what has been served and
    `kinds/<kind>` says how often, since when, and which links such a thing
    carries here. A kind the host has never served is not listed: the
    registry is measured, not asserted, like a server's status (§13). It
    keeps no address: what was read is the request log's business, and that
    is not served. The counts persist in one file outside the checkout when
    the service has one, and otherwise from the start of the process; either
    way `since` says when the record began."""

    SAVE_EVERY_S = 60

    def __init__(self, ns: "Namespace", file: Path | None = None, now: Callable[[], float] = time.time):
        self.ns, self.file, self.now = ns, file, now
        self.since = self._iso(now())
        self.data: dict[str, dict[str, Any]] = {}
        self._saved = 0.0
        self._dirty = False
        if file is not None:
            self._load()

    @staticmethod
    def _iso(t: float) -> str:
        return datetime.fromtimestamp(t, timezone.utc).isoformat(timespec="seconds")

    def _load(self) -> None:
        try:
            got = json.loads(self.file.read_text(encoding="utf-8"))
            if isinstance(got, dict) and isinstance(got.get("kinds"), dict):
                self.data = got["kinds"]
                self.since = got.get("since") or self.since
        except (OSError, ValueError):
            pass

    def _save(self, force: bool = False) -> None:
        if self.file is None or not self._dirty or (not force and self.now() - self._saved < self.SAVE_EVERY_S):
            return
        try:
            self.file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.file.with_suffix(".tmp")
            tmp.write_text(json.dumps({"since": self.since, "kinds": self.data}, indent=1), encoding="utf-8")
            os.replace(tmp, self.file)
            self._saved, self._dirty = self.now(), False
        except OSError:
            pass

    def record(self, mime: str, links: list[dict]) -> None:
        """One read went out: count it under its kind."""
        kind = kind_of(mime)
        now = self._iso(self.now())
        e = self.data.get(kind)
        fresh = e is None
        if e is None:
            e = self.data[kind] = {"served": 0, "first": now, "last": now, "types": {}, "rels": {}}
        e["served"] += 1
        e["last"] = now
        fresh = fresh or mime not in e["types"]
        e["types"][mime] = e["types"].get(mime, 0) + 1
        for ln in links:
            rel = ln["rel"]
            fresh = fresh or rel not in e["rels"]
            e["rels"][rel] = e["rels"].get(rel, 0) + 1
        self._dirty = True
        self._save(force=fresh)

    def names(self) -> list[str]:
        return sorted(self.data)

    @staticmethod
    def uri(kind: str | None = None) -> str:
        return f"{ROOT}kinds/" + (quote(kind) if kind else "")

    def read(self, ref: Ref) -> dict:
        as_ = ref.facets.get("as")
        if as_ not in (None, *AS_KINDS):
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; kinds offers {', '.join(AS_KINDS)}")
        parts = [p for p in ref.path.split("/") if p]
        if not parts:
            if as_:
                raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; the registry is a listing and offers no facets; read {self.uri()} without ?as")
            vocab = self.ns.vocabulary()
            kids = [{"uri": self.uri(k), "name": k, **({"title": vocab[k]} if k in vocab else {}), "mimeType": T_KIND, "isCollection": False, "served": self.data[k]["served"]}
                    for k in self.names()]
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body: dict[str, Any] = {"uri": self.uri(), "since": self.since, "served": sum(e["served"] for e in self.data.values()), "children": chunk}
            if nxt:
                body["nextCursor"] = nxt
                body["next"] = f"{self.uri()}?cursor={nxt}"
            return self.ns._result(_cursored(self.uri(), ref.facets.get("cursor")), T_LISTING, json.dumps(body, indent=1), [link("up", ROOT)])
        kind = parts[0]
        if len(parts) > 1 or ref.is_collection:
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"kinds/{ref.path}: a kind has nothing under it; the kind is at {self.uri(kind)}" if kind in self.data else f"kinds/{ref.path}: nothing is addressed there",
                          nearest=[self.uri(kind)] if kind in self.data else [self.uri()])
        if kind not in self.data:
            near = [self.uri(k) for k in closest(kind, self.names())[:5]]
            why = f"kinds/{kind} is a kind this server can say and has not served since {self.since}" if kind in KINDS else f"kinds/{kind}: no kind of that name has been served here"
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"{why}; the registry lists what has been served", nearest=near or [self.uri()])
        e = self.data[kind]
        me = self.uri(kind)
        vocab, schema = self.ns.vocabulary(), self.ns.kind_schema(kind)
        body = {"uri": me, "kind": kind, **({"what": vocab[kind]} if kind in vocab else {}), **({"schema": schema} if schema else {}),
                "mediaTypes": dict(sorted(e["types"].items())),
                "served": e["served"], "first": e["first"], "last": e["last"], "since": self.since, "rels": dict(sorted(e["rels"].items()))}
        links = [link("up", self.uri()), link("collection", self.uri()), link("describedby", f"{me}?as=stat")]
        if schema:
            links.append(link("describedby", schema, title="the schema the server published for this kind, as a piece of its tool"))
        text = json.dumps(body, indent=1)
        if as_ == "stat":
            stat = {"uri": me, "kind": kind, "mimeType": T_KIND, "size": len(text.encode()), "isCollection": False, "text": True, "last": e["last"]}
            return self.ns._result(f"{me}?as=stat", T_STAT, json.dumps(stat, indent=1), links + [link("alternate", me)])
        return self.ns._result(me, T_KIND, text, links)


class Namespace:
    def __init__(
        self,
        repo: Path,
        fetch: Fetch = fetch_loopback,
        sites: tuple[str, ...] = SITES,
        git_repos: dict[str, Path] | None = None,
        mcp_servers: dict | None = None,
        mcp_transport: httpx.AsyncBaseTransport | None = None,
        kinds_file: Path | None = None,
    ):
        self.repo = repo.resolve()
        self.fetch = fetch
        self.sites = sites
        self.git = {k: v.resolve() for k, v in (git_repos if git_repos is not None else git_repos_beside(self.repo)).items()}
        self.origins = Origins(self.repo)
        self.graph = SiteGraph(self.repo)
        self._built: dict[str, tuple] = {}
        self.entities = Entities(self)
        self.trails = Trails(self)
        self.mcp = Mcp(self, mcp_servers, mcp_transport)
        self.kinds = Kinds(self, kinds_file)

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
                "relations. tm://tinymachines/entity/ holds the autopsy's patterns, games, routines and lessons as "
                "things with links between them (entity/pattern/pad-poll names every game and routine it was found in). "
                "tm://tinymachines/mcp/ holds the MCP servers this box reads, each with its tools, resources and prompts as "
                "things with addresses (mcp/<server>/tools/<name> is one tool, its schema as the server published it). "
                "Every read's mimeType says what kind of thing it is (application/vnd.tm.<kind>+json for a thing this server composes, "
                "a file's own type otherwise), tm://tinymachines/kinds/ lists the kinds this host has served, and a link may carry "
                "its target's type. ?as=set on an entity, with rel=, reads a set and its members in one. "
                "?as=stat gives metadata without content, ?as=links every link of a thing a page at a time (a read "
                "with more than a hundred ends in a tm:links link to it). A URI that does not resolve "
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
        """RFC 6570. Each names every parameter its mount takes (PARAMS), so a
        client can learn a mount's whole grammar here (tinypeek#13)."""
        return [
            {
                "uriTemplate": TOP,
                "name": "hosts",
                "title": "The hosts",
                "description": "The hosts this server answers for. Here that is one, and everything is under it.",
                "mimeType": T_LISTING,
            },
            {
                "uriTemplate": ROOT,
                "name": "root",
                "title": "The mounts",
                "description": "Start here. Reading it lists the mounts; reading any collection (a URI ending in /) lists its children with a cursor.",
                "mimeType": T_LISTING,
            },
            {
                "uriTemplate": f"{ROOT}fs{{/path*}}{_q('fs')}",
                "name": "fs",
                "title": "A file or directory of this repository, now or at a ref",
                "description": (
                    f"Files under {', '.join(FS_ROOTS)}/ of the tinymachines checkout that serves the site. "
                    "A trailing slash lists a directory. at= reads it as its repository had it, at a branch, tag, commit "
                    "or time (an ISO date or instant). ?as=stat gives size, time and type without content; "
                    "?range=START-END reads bytes [START, END) of a file over the 256 KiB cap; ?lines=FIRST-LAST reads lines of a text, "
                    "counted from 1; ?pointer=/a/0/b reads what a JSON pointer names in a JSON file. "
                    "A notebook page's file carries a tm:renders-as link to the page it becomes."
                ),
            },
            {
                "uriTemplate": f"{ROOT}git/{{repo}}{{/path*}}{_q('git')}",
                "name": "git",
                "title": "A file or tree of a repository, at a ref or a time",
                "description": (
                    f"Repositories: {', '.join(sorted(self.git))}. A path is a tree path; at= is a branch, tag or "
                    "commit (default HEAD; for 6502 that is the commit the site serves), or a time, an ISO date or instant, "
                    "which names the newest commit made at or before it. as=log gives the commits "
                    "touching the path (n= how many, default 20), as=blame the file with a commit per line, "
                    "as=tree a directory as JSON (depth= how many levels, 1 to 8, default 1), as=stat the object's type, size and resolved commit. "
                    "range=, lines= and pointer= read a piece of a file, as on fs. A pulled "
                    "notebook page's origin file carries tm:generates to the copy in this checkout and "
                    "tm:renders-as to its page."
                ),
            },
            {
                "uriTemplate": f"{ROOT}http/{{site}}{{/path*}}{_q('http')}",
                "name": "http",
                "title": "A page of a site this box serves",
                "description": (
                    "What a visitor gets, fetched through the front door on loopback. as=text (the default for a page) is "
                    "its readable text; as=rendered is the HTML with the headers nginx adds; as=stat is the status and size "
                    "without the body; range= and lines= read a piece of the text. A notebook page carries a tm:source link to the markdown behind it."
                ),
            },
            {
                "uriTemplate": f"{ROOT}offbox/{{name}}{_q('offbox')}",
                "name": "offbox",
                "title": "Where a build chain leaves this box",
                "description": (
                    "A place a script reads from or writes to that no repository holds, such as the cartridges: named "
                    "and described (what it is, why it is not exposed), never served. tm:generated-by names what makes it "
                    "and tm:input-of what reads it."
                ),
            },
            {
                "uriTemplate": f"{ROOT}entity/{{kind}}/{{key}}{_q('entity')}",
                "name": "entity",
                "title": "A pattern, a game or a lesson of the autopsy",
                "description": (
                    f"kind is one of {', '.join(ENTITY_KINDS)}; key is the one the records keep (pad-poll, a game's "
                    "twelve hex digits, jump). Each reads as JSON, its record's fields, with links: a pattern to the games "
                    "it was found in (tm:found-in), each routine a rule named (tm:instance) and the lessons that use it "
                    "(tm:demonstrated-by); a game to its patterns (tm:exhibits) and its page (tm:renders-as); a lesson to "
                    "its cartridge's source (tm:cartridge) and its patterns (tm:demonstrates). entity/<kind>/ lists the keys. "
                    "?as=set&rel=<rel> reads the things behind one rel inlined, a page at a time; ?as=set on entity/<kind>/ inlines the listing."
                ),
            },
            {
                "uriTemplate": f"{ROOT}entity/game/{{key}}/routine/{{routine}}{_q('entity')}",
                "name": "routine",
                "title": "A routine of a game that a rule named",
                "description": (
                    "routine is a bank and an address, b0-8E5C. Only routines that carry a pattern have an address; "
                    "entity/game/<key>/routine/ lists them. Each links to its patterns (tm:instance-of)."
                ),
                "mimeType": tm_type("routine"),
            },
            {
                "uriTemplate": f"{ROOT}mcp/{{server}}{{/path*}}{_q('mcp')}",
                "name": "mcp",
                "title": "An MCP server this box reads, and its tools, resources and prompts",
                "description": (
                    f"server is one of {', '.join(self.mcp.names()) or 'none yet'}. mcp/<server>/ is the server's record (what it is, "
                    "whether it answered, what it declares) and lists tools/, resources/ and prompts/ as the server declares them; "
                    "tools/<name> is one tool as the server described it, with tm:served-by to its server and tm:schema to its "
                    "input schema as a pointer address. pointer=, lines= and range= read a piece of one. There is no past here: a "
                    "server is read as it answers now."
                ),
            },
            {
                "uriTemplate": f"{ROOT}kinds/{{kind}}{_q('kinds')}",
                "name": "kinds",
                "title": "A kind of thing this host has served",
                "description": (
                    "kinds/ lists every kind this host has served since its record began, each named by the vendor part of its media type "
                    "(listing, record, page, stat, pattern, tool, ...; file is anything served as its own type). kinds/<kind> is one: its media "
                    "types and how often each was served, when first and last, and the link relations such a thing carried. Measured, not "
                    "asserted: a kind never served is not listed."
                ),
                "mimeType": T_KIND,
            },
        ]

    def list_resources(self, cursor: str | None) -> dict:
        """Flat, as MCP wants it: the root, the mounts, and every collection.
        Leaves are reached by reading their collection, which keeps this list
        a map rather than an inventory."""
        items: list[dict] = [
            {"uri": TOP, "name": "hosts", "title": "The hosts this server answers for", "mimeType": T_LISTING},
            {"uri": ROOT, "name": "root", "title": "The mounts", "mimeType": T_LISTING},
            {"uri": f"{ROOT}fs/", "name": "fs", "title": "The repository's files", "mimeType": T_LISTING},
            {"uri": f"{ROOT}git/", "name": "git", "title": "The repositories, at any ref", "mimeType": T_LISTING},
            {"uri": f"{ROOT}http/", "name": "http", "title": "The sites this box serves", "mimeType": T_LISTING},
            {"uri": f"{ROOT}offbox/", "name": "offbox", "title": "Where a build chain leaves this box", "mimeType": T_LISTING},
            {"uri": f"{ROOT}entity/", "name": "entity", "title": "The autopsy's patterns, games, routines and lessons", "mimeType": T_LISTING},
            {"uri": f"{ROOT}mcp/", "name": "mcp", "title": "The MCP servers this box reads", "mimeType": T_LISTING},
            {"uri": f"{ROOT}kinds/", "name": "kinds", "title": "The kinds of thing this host has served", "mimeType": T_LISTING},
        ]
        for name in self.mcp.names():
            items.append({"uri": Mcp.uri(name, collection=True), "name": f"mcp/{name}/", "title": self.mcp.servers[name]["what"], "mimeType": MCP_TYPE["server"]})
        for root in FS_ROOTS:
            base = self.repo / root
            if not base.is_dir():
                continue
            dirs = [base] + sorted(p for p in base.rglob("*") if p.is_dir() and not denied(p.relative_to(self.repo).as_posix()))
            for d in dirs:
                rel = d.relative_to(self.repo).as_posix() + "/"
                items.append({"uri": f"{ROOT}fs/{quote(rel)}", "name": rel, "mimeType": T_LISTING})
        for name in sorted(self.git):
            items.append({"uri": f"{ROOT}git/{name}/", "name": name, "title": f"tinymachines/{name} at HEAD", "mimeType": T_LISTING})
        for site in self.sites:
            items.append({"uri": f"{ROOT}http/{site}/", "name": site, "title": f"{site}, page by page", "mimeType": T_LISTING})
        for kind in ENTITY_KINDS:
            items.append({"uri": Entities.uri(kind, collection=True), "name": f"entity/{kind}/", "mimeType": T_LISTING})
        for key in self.entities.keys("game"):
            items.append({"uri": Entities.uri("game", key, "routine", collection=True), "name": f"entity/game/{key}/routine/", "mimeType": T_LISTING})
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
            pool = AS_HTTP if "/http/" in tmpl else AS_GIT if "/git/" in tmpl else AS_ENTITY if "/entity/" in tmpl else AS_MCP if "/mcp/" in tmpl else AS_KINDS if "/kinds/" in tmpl else AS_FS
            values = [a for a in pool if a.startswith(value)]
        elif name == "n":
            values = [str(n) for n in (LOG_DEFAULT, 50, LOG_MAX) if str(n).startswith(value)]
        elif name == "depth":
            values = [str(n) for n in range(1, TREE_DEPTH_MAX + 1) if str(n).startswith(value)]
        elif name == "kind" and "/kinds/" in tmpl:
            values = [k for k in self.kinds.names() if k.startswith(value)]
        elif name == "kind":
            values = [k for k in ENTITY_KINDS if k.startswith(value)]
        elif name == "key" and "/entity/" in tmpl:
            kinds = ["game"] if "/entity/game/" in tmpl else [ctx["kind"]] if ctx.get("kind") in ENTITY_KINDS else list(ENTITY_KINDS)
            values = [k for kind in kinds for k in self.entities.keys(kind) if k.startswith(value)]
        elif name == "routine":
            values = [r for r in self.entities.routines(ctx.get("key") or "") if r.startswith(value)]
        elif name == "server":
            values = [n for n in self.mcp.names() if n.startswith(value)]
        elif name == "path" and "/mcp/" in tmpl:
            values = self.mcp.complete(ctx.get("server"), value)
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
        try:
            ref = parse(uri)
            check_params(ref, self.mcp.takes(ref))
            got = await self._read_links(ref) if ref.facets.get("as") == "links" else self._bounded(await self._read(uri), ref)
            got["_meta"][META_LINKS] = self._typed(got["_meta"][META_LINKS])
            self.kinds.record(got["contents"][0]["mimeType"], got["_meta"][META_LINKS])
            return got
        except OSError as e:
            # A path the filesystem will not even look up (a name too long, a
            # loop of links) is a path that is not there. And nothing the
            # system says about it reaches the client: its message names where
            # the checkout is on this host.
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"that path does not exist ({e.strerror or type(e).__name__})") from None
        except TmError as e:
            # TM-19: a refusal never offers the address it just refused, which a
            # client following nearest would take round forever. (x/ for x is
            # a different address and stays: it is how a directory is offered.)
            if e.data.get("nearest"):
                e.data["nearest"] = [n for n in e.data["nearest"] if n != uri]
            raise
        except Exception as e:  # noqa: BLE001
            # Whatever else goes wrong, the client learns that it did and what
            # kind of thing it was, never the message: an exception's text is
            # written for the box's owner and can hold a path on it.
            raise TmError(INTERNAL, "internal", f"the server failed on this read ({type(e).__name__})") from None

    # -- a link set, bounded and paged (tinypeek#2) ------------------------

    @staticmethod
    def _links_uri(ref: Ref) -> str:
        """Where a thing's whole link set is read. A git ref is part of what
        the thing is, so it stays; every other facet is a representation."""
        at = ref.facets.get("at")
        return ref.uri + (f"?at={quote(at)}&as=links" if at else "?as=links")

    def _bounded(self, got: dict, ref: Ref) -> dict:
        """Every read's links, in the stated order and never more than the
        cap. Past it the read keeps the first page and, in the last place, one
        link to the whole set, so nothing becomes unreachable. Here and not in
        a mount, so the rule is one rule."""
        links = ordered(got["_meta"][META_LINKS])
        if len(links) > LINK_CAP:
            total = len(self._own(links, ref))
            links = links[:LINK_CAP - 1] + [link("tm:links", self._links_uri(ref), "exact", count=total,
                                                 title=f"all {total} links, a page at a time; this read carries the first {LINK_CAP - 1}")]
        got["_meta"][META_LINKS] = links
        return got

    def _typed(self, links: list[dict]) -> list[dict]:
        """tinypeek#23: a link carries its target's media type (`type`, as
        RFC 8288 allows) wherever the address says what the target is, so a
        client can draw a card's shape before following it. Here and not in a
        mount, so the rule is one rule; a link that already says is left as
        it is, and a target whose type the address does not settle (a file
        with no known extension, a page that is not a page) carries none."""
        out = []
        for ln in links:
            if "type" not in ln:
                t = self.target_type(ln["href"])
                if t:
                    ln = {**ln, "type": t}
            out.append(ln)
        return out

    def vocabulary(self) -> dict[str, str]:
        """Every kind this host can say: KINDS, and the kinds its maps name
        (tinyhelper#6), one line each."""
        return {**KINDS, **{k: v["what"] for k, v in self.mcp.kinds().items()}}

    def kind_schema(self, kind: str) -> str | None:
        """Where the server that owns a mapped kind published its schema."""
        return (self.mcp.kinds().get(kind) or {}).get("schema")

    def target_type(self, href: str) -> str | None:
        """What reading an address would come back as, from the address
        alone: its facet, its mount, its path's shape. None where the address
        does not say. The crawler holds every link that says to it."""
        try:
            ref = parse(href)
        except TmError:
            return None
        as_ = ref.facets.get("as")
        if as_:
            return {"stat": T_STAT, "links": T_LINKS, "log": T_LOG, "blame": T_BLAME, "tree": T_LISTING,
                    "rendered": "text/html", "text": T_PAGE, "set": T_SET}.get(as_)
        if ref.mount in ("tm", ""):
            return T_LISTING
        parts = [p for p in ref.path.split("/") if p]
        if ref.mount == "mcp":
            if len(parts) <= 1:
                return (MCP_TYPE["server"] if parts else T_LISTING) if ref.is_collection else None
            if parts[1] in MCP_KINDS:
                return T_LISTING if ref.is_collection else (MCP_TYPE[parts[1][:-1]] if len(parts) >= 3 else None)
            return self.mcp.type_of(parts[0], parts[1:], ref.is_collection)
        if ref.is_collection:
            return T_LISTING
        if ref.mount == "offbox":
            return T_OFFBOX
        if ref.mount == "kinds":
            return T_KIND
        if ref.mount == "entity":
            if len(parts) == 4 and parts[2] == "routine":
                return tm_type("routine")
            return tm_type(parts[0]) if len(parts) == 2 and parts[0] in ENTITY_KINDS else None
        if ref.mount == "http":
            # A built page has no extension; anything with one reads as itself.
            return T_PAGE if "." not in ref.path.rsplit("/", 1)[-1] else None
        if ref.mount == "git" and ref.site and ref.path and self._git_gitlink_quiet(ref.site, ref.facets.get("at", "HEAD"), ref.path):
            return T_SUBMODULE
        mime = mime_for(ref.path)
        if ref.mount == "fs":
            mime = self._fs_type(ref.path, mime)
        return None if mime == "application/octet-stream" else mime

    def _git_gitlink_quiet(self, repo: str, at: str, path: str) -> str | None:
        """A submodule's pinned commit at a ref, or None, with no refusal
        raised: the typed pass asks about addresses it did not make."""
        if repo not in self.git:
            return None
        try:
            return self._git_gitlink(repo, self._git_at(repo, at), path)
        except TmError:
            return None

    def _fs_type(self, rel: str, mime: str) -> str:
        """A file's type on fs, where a JSON file that is a trail is a trail
        (tinypeek#18, #23): what makes it one is the shape the server read."""
        if mime == T_RECORD and f"{ROOT}fs/{quote(rel)}" in self.trails.index()["trails"]:
            return T_TRAIL
        return mime

    def _own(self, links: list[dict], ref: Ref) -> list[dict]:
        """A thing's own links. Its ?as=stat also points back at the thing it
        describes; that is the stat's link, not the thing's, so the set
        behind ?as=links and its count are the same from either read."""
        whole = self._links_uri(ref)[:-len("as=links")].rstrip("?&")
        return [ln for ln in links if not (ln["rel"] == "alternate" and ln["href"] == whole)]

    def _links_page(self, links: list[dict], offset: int) -> tuple[list[dict], int | None]:
        """One page of an ordered set, and where the next one starts. A page
        leaves room for its `next` link under the cap."""
        size = LINK_CAP - 1
        return links[offset:offset + size], (offset + size if offset + size < len(links) else None)

    @staticmethod
    def _filter(ref: Ref, links: list[dict]) -> tuple[list[dict], str, dict]:
        """tinypeek#17: the set behind ?as=links, narrowed. rel= keeps one
        rel; min= keeps a link whose count is at least it, a link with no
        count standing for one thing. The filter rides in the echo and the
        body, so the narrowed set is an address of its own."""
        rel, low = ref.facets.get("rel"), ref.facets.get("min")
        tail, said = "", {}
        if rel is not None:
            if not rel:
                raise TmError(BAD_PARAMS, "bad-facet", "rel=<rel>: one link relation, such as tm:found-in or up")
            links = [ln for ln in links if ln["rel"] == rel]
            tail, said["rel"] = f"&rel={rel}", rel
        if low is not None:
            if not re.fullmatch(r"\d+", low):
                raise TmError(BAD_PARAMS, "bad-facet", "min=<count>: a whole number, zero or more; a link with no count stands for one thing")
            links = [ln for ln in links if ln.get("count", 1) >= int(low)]
            tail, said["min"] = tail + f"&min={low}", int(low)
        return links, tail, said

    async def _read_links(self, ref: Ref) -> dict:
        """?as=links: a thing's links and no content, a page at a time. The
        set is the one its ?as=stat carries (a collection's own, since a
        listing has no stat), so a file over the byte cap and a page that
        would have to be fetched whole still give up their links. rel= and
        min= narrow it (tinypeek#17)."""
        here = self._links_uri(ref)
        whole = here[:-len("as=links")].rstrip("?&")
        leaf = not ref.is_collection and ref.mount != ""
        got = await self._read(whole + (("&" if "?" in whole else "?") + "as=stat" if leaf else ""))
        links, tail, said = self._filter(ref, ordered(self._own(got["_meta"][META_LINKS], ref)))
        here += tail
        offset = _offset(ref.facets.get("cursor"))
        page, nxt = self._links_page(links, offset)
        body: dict[str, Any] = {"uri": whole, "total": len(links), "returned": len(page), **said}
        if nxt is not None:
            body["nextCursor"] = _cursor(nxt)
            page = page + [link("next", f"{here}&cursor={body['nextCursor']}", title=f"{len(links) - nxt} more links")]
        uri = here if offset == 0 else f"{here}&cursor={ref.facets['cursor']}"
        return self._result(uri, T_LINKS, json.dumps(body, indent=1), page)

    async def _read(self, uri: str) -> dict:
        """Every read, before the namespace's own rules on its links: the
        mount answers, and a trail's links are added (tinypeek#18), here so
        that they ride on a thing, its stat and its ?as=links alike."""
        got = await self._read_mount(uri)
        more = self.trails.links_for(parse(uri))
        if more:
            got["_meta"][META_LINKS] = got["_meta"][META_LINKS] + more
        return got

    async def _read_mount(self, uri: str) -> dict:
        ref = parse(uri)
        if ref.mount == "tm":
            if ref.facets:
                raise TmError(BAD_PARAMS, "bad-facet", f"the list of hosts takes no facet but as=links; read {TOP}")
            body = {"uri": TOP, "hosts": [{"uri": ROOT, "name": HOST, "what": "the tinymachines.ai box: its sites, its repositories and its files"}]}
            return self._result(TOP, T_LISTING, json.dumps(body, indent=1), [link("collection", ROOT, title="the one host this server answers for")])
        if ref.mount == "":
            if ref.facets:
                raise TmError(BAD_PARAMS, "bad-facet", f"the root takes no facet but as=links; read {ROOT}")
            body = {"uri": ROOT, "mounts": [
                {"uri": f"{ROOT}fs/", "what": f"the repository's files under {', '.join(FS_ROOTS)}/"},
                {"uri": f"{ROOT}git/", "what": f"the repositories ({', '.join(sorted(self.git))}) at any ref, with history and blame"},
                {"uri": f"{ROOT}http/", "what": "the sites this box serves, page by page"},
                {"uri": f"{ROOT}offbox/", "what": "where a build chain leaves this box: named, described, never exposed"},
                {"uri": f"{ROOT}entity/", "what": "the autopsy's patterns, games, routines and lessons, each with links to the others"},
                {"uri": f"{ROOT}mcp/", "what": "the MCP servers this box reads, each with its tools, resources and prompts as things with addresses"},
                {"uri": f"{ROOT}kinds/", "what": "the kinds of thing this host has served, each with its media type, measured as they go out"},
            ], "start_here": self.start_here()}
            # TM-12: the documents a fresh session should read first.
            return self._result(ROOT, T_LISTING, json.dumps(body, indent=1),
                                [link("up", TOP, title="the hosts this server answers for")]
                                + [link("collection", f"{ROOT}{m}/") for m in MOUNTS]
                                + [link("help", s["uri"], title=s["what"]) for s in body["start_here"]])
        if ref.mount == "offbox":
            return self._read_offbox(ref)
        if ref.mount == "entity":
            return self.entities.read(ref)
        if ref.mount == "mcp":
            return await self.mcp.read(ref)
        if ref.mount == "kinds":
            return self.kinds.read(ref)
        if ref.mount == "fs":
            return self._read_fs(ref)
        if ref.mount == "git":
            return self._read_git(ref)
        return await self._read_http(ref)

    def start_here(self) -> list[dict]:
        """TM-12: the orientation documents that are there to read, as URIs.
        One whose repository is not mounted, or that is not at its HEAD, is
        left out: a pointer that does not resolve is worse than none."""
        return [{"uri": f"{ROOT}git/{repo}/{quote(path)}", "what": what}
                for repo, path, what in ORIENTATION if repo in self.git and self._git_has(repo, "HEAD", path)]

    def lineage(self) -> dict[str, dict]:
        """api/lineage.json (TM-7): what a script reads that it did not make,
        and the places the build chain leaves this box. A record's writer is
        not in it: the record's own note says that."""
        f = self.repo / "api" / "lineage.json"
        try:
            return json.loads(f.read_text()).get("offbox", {})
        except (OSError, ValueError):
            return {}

    def _read_offbox(self, ref: Ref) -> dict:
        nodes = self.lineage()
        name = ref.path.rstrip("/")
        if ref.facets.get("as") not in (None, "stat"):
            raise TmError(BAD_PARAMS, "bad-facet", f"as={ref.facets['as']!r}; offbox offers stat, links")
        if not name:
            kids = [{"uri": f"{ROOT}offbox/{quote(n)}", "name": n, "mimeType": T_OFFBOX, "isCollection": False} for n in sorted(nodes)]
            return self._result(f"{ROOT}offbox/", T_LISTING, json.dumps({"uri": f"{ROOT}offbox/", "children": kids}, indent=1), [link("up", ROOT)])
        if name not in nodes:
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"offbox/{name} is not a place this box names",
                          nearest=[f"{ROOT}offbox/{quote(n)}" for n in closest(name, sorted(nodes))[:5]])
        node = nodes[name]
        uri = f"{ROOT}offbox/{quote(name)}"
        body = {"uri": uri, "mimeType": T_OFFBOX, "exposed": False, "reason": "not-exposed", "what": node.get("what"), "why": node.get("why")}
        links = [link("up", f"{ROOT}offbox/"), link("collection", f"{ROOT}offbox/")]
        for p in node.get("generated_by", []):
            links.append(link("tm:generated-by", f"{ROOT}git/public/{quote(p)}", "exact", title="what makes it, on this box"))
        for p in node.get("input_of", []):
            links.append(link("tm:input-of", f"{ROOT}git/public/{quote(p)}", "exact", title="what reads it, on this box"))
        return self._result(uri if "as" not in ref.facets else f"{uri}?as=stat", T_OFFBOX if "as" not in ref.facets else T_STAT, json.dumps(body, indent=1), links)

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
                out.append({"uri": f"{ROOT}fs/{quote(rel)}/", "name": p.name + "/", "mimeType": T_LISTING, "isCollection": True})
            elif denied(rel):
                out.append({"uri": f"{ROOT}fs/{quote(rel)}", "name": p.name, "redacted": True, "isCollection": False})
            else:
                st = p.stat()
                out.append({"uri": f"{ROOT}fs/{quote(rel)}", "name": p.name, "mimeType": self._fs_type(rel, fs_mime(p)), "size": st.st_size, "isCollection": False})
        return out

    def _fs_missing(self, rel: str) -> TmError:
        """not-found that teaches: the children of the deepest ancestor that
        exists, closest to the first missing name first."""
        clean = rel.rstrip("/")
        parts = clean.split("/")
        sibs: list[dict] = []
        for i in range(len(parts) - 1, 0, -1):
            try:
                sibs = rank_children(parts[i], self._fs_children("/".join(parts[:i])))
                break
            except TmError:
                continue
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
            links.extend(self.mcp.inbound(clean))
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
        # One link a route that reads it (TM-18): a page, or the collection a
        # dynamic route's pages are listed in. The other site and the other
        # language are each page's own alternates.
        for page, conf in self.readers(name):
            what = "the pages listed here" if page.endswith("/") else "a page"
            links.append(link("tm:read-by", f"{ROOT}http/{self.sites[0]}{quote(page)}", conf,
                              title=f"{what} whose own code reads this record" if conf == "exact" else f"{what} whose library reaches this record"))
        return links + self.entities.inbound("fs", None, rel)

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

    # -- fs at a ref (tinypeek#15) ------------------------------------------

    def _fs_behind(self, clean: str) -> tuple[str, str]:
        """The repository and path an fs path's past is kept in: the origin a
        pulled page came from, else this checkout's own repository."""
        top = clean.split("/", 1)[0] if clean else ""
        if clean and top not in FS_ROOTS:
            raise TmError(
                RESOURCE_NOT_FOUND, "out-of-root",
                f"fs/{top} is not offered; the roots are {', '.join(FS_ROOTS)}",
                nearest=[f"{ROOT}fs/{r}/" for r in FS_ROOTS],
            )
        if clean and denied(clean):
            raise TmError(RESOURCE_NOT_FOUND, "denied", f"fs/{clean} is on the deny-list; it exists and is not offered")
        origin = self.origins.by_fs.get(clean)
        if origin and origin[0] in self.git:
            return origin
        if "public" not in self.git:
            raise TmError(BAD_PARAMS, "bad-facet", "at= names a repository's past, and no repository is mounted behind fs here")
        return "public", clean

    @staticmethod
    def _fs_at_uri(rel: str, at: str, collection: bool = False) -> str:
        base = f"{ROOT}fs/{quote(rel)}" if rel else f"{ROOT}fs/"
        return f"{base}{'/' if collection and rel else ''}?at={at}"

    def _fs_children_at(self, rel_dir: str, at: str, commit: str) -> list[dict]:
        """A directory's listing as the checkout's repository had it at a
        ref, addressed through fs at that ref. What the build pulls in is not
        in the repository and is not here."""
        if rel_dir == "":
            return [{"uri": self._fs_at_uri(r, at, True), "name": r + "/", "mimeType": T_LISTING, "isCollection": True}
                    for r in FS_ROOTS if self._git_has("public", commit, r)]
        kids = []
        for k in self._git_children("public", at, rel_dir, rev=commit):
            name = k["name"].rstrip("/")
            kid = {**k, "uri": self._fs_at_uri(f"{rel_dir}/{name}", at, k["isCollection"])}
            kids.append(kid)
        return kids

    def _fs_missing_at(self, clean: str, at: str, commit: str) -> TmError:
        parts = clean.split("/")
        sibs: list[dict] = []
        for i in range(len(parts) - 1, 0, -1):
            try:
                sibs = rank_children(parts[i], self._fs_children_at("/".join(parts[:i]), at, commit))
                break
            except TmError:
                continue
        return TmError(RESOURCE_NOT_FOUND, "not-found", f"fs/{clean} is not in the repository at {at}", nearest=[c["uri"] for c in sibs[:5]])

    def _fs_at_links(self, clean: str, is_dir: bool, at: str, repo: str, gpath: str) -> list[dict]:
        """The links of an fs thing at a ref: its own, at that ref, and the
        checkout as its latest version. The pair into git holds at the ref."""
        parent = clean.rpartition("/")[0]
        up = self._fs_at_uri(parent, at, True) if clean else ROOT
        links = [link("up", up)]
        if clean:
            links.append(link("latest-version", f"{ROOT}fs/{quote(clean)}" + ("/" if is_dir else ""), title="the checked-out file, which is fs without at="))
        if not is_dir:
            there = f"{ROOT}git/{repo}/{quote(gpath)}?at={at}"
            links.append(link("collection", up))
            links.append(link("describedby", f"{self._fs_at_uri(clean, at)}&as=stat"))
            links.append(link("version-history", f"{there}&as=log"))
            if repo == "public" and gpath == clean:
                links.append(link("tm:repository", there, "exact", title=f"this file in the repository, at {at}"))
            else:
                links.append(link("tm:generated-by", there, "exact", title=f"pulled at build time from {repo}/{gpath}, here at {at}"))
        return links

    def _read_fs_at(self, ref: Ref, at: str, as_: str) -> dict:
        """fs at a ref or a time: the file or directory as the repository
        behind it had it. The echo keeps at= whatever it is, since fs's
        default is the checkout and HEAD is not it."""
        clean = ref.path.rstrip("/")
        repo, gpath = ("public", clean) if ref.is_collection else self._fs_behind(clean)
        if ref.is_collection and "public" not in self.git:
            raise TmError(BAD_PARAMS, "bad-facet", "at= names a repository's past, and no repository is mounted behind fs here")
        commit = self._git_at(repo, at)
        if ref.is_collection:
            if as_ != "raw":
                raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; an fs collection is a listing and offers no facets; read {ref.uri}?at={at} without ?as")
            if clean and not self._git_has("public", commit, clean):
                raise self._fs_missing_at(clean, at, commit)
            kids = self._fs_children_at(clean, at, commit)
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body: dict[str, Any] = {"uri": ref.uri, "at": at, "commit": commit, "children": chunk}
            echo = self._fs_at_uri(clean, at, True)
            if nxt:
                body["nextCursor"] = nxt
                body["next"] = f"{echo}&cursor={nxt}"
            return self._result(_cursored(echo, ref.facets.get("cursor")), T_LISTING, json.dumps(body, indent=1), self._fs_at_links(clean, True, at, repo, gpath))
        try:
            kind = run_git(self._git_dir(repo), "cat-file", "-t", f"{commit}:{gpath}").strip()
        except TmError:
            raise self._fs_missing_at(clean, at, commit) from None
        here = self._fs_at_uri(clean, at)
        if kind == "tree":
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"fs/{clean} is a directory at {at}; its listing is at {ref.uri}/", nearest=[self._fs_at_uri(clean, at, True)])
        if kind != "blob":
            raise TmError(RESOURCE_NOT_FOUND, "binary", f"fs/{clean} is a {kind} (a submodule) at {at}, not a file", mimeType="application/x-git-" + kind)
        size = int(run_git(self._git_dir(repo), "cat-file", "-s", f"{commit}:{gpath}").strip())
        mime = mime_for(gpath) if not needs_sniff(gpath) else mime_for(gpath, run_git(self._git_dir(repo), "cat-file", "blob", f"{commit}:{gpath}", binary=True)[:SNIFF])
        links = self._fs_at_links(clean, False, at, repo, gpath)
        if as_ == "stat":
            made = run_git(self._git_dir(repo), "log", "-1", "--format=%cI", commit, "--", gpath).strip()
            stat = {
                "uri": ref.uri, "name": clean.rpartition("/")[2], "at": at, "commit": commit, "size": size, "mimeType": mime,
                "modified": datetime.fromisoformat(made).astimezone(timezone.utc).isoformat(timespec="seconds") if made else None,
                "isCollection": False, "text": is_text(mime),
            }
            return self._result(f"{here}&as=stat", T_STAT, json.dumps(stat, indent=1), links + [link("alternate", here)])
        span = span_of(ref)
        start, end = 0, size
        if span and span[0] == "range":
            start, end = byte_range(span[1], size)
        elif span is None and size > READ_CAP:
            raise _too_large(f"fs/{clean} at {at}", size, here)
        if not is_text(mime) and as_ != "raw" and not span:
            raise TmError(RESOURCE_NOT_FOUND, "binary", f"fs/{clean} is {mime}", mimeType=mime, stat=f"{here}&as=stat")
        data = run_git(self._git_dir(repo), "cat-file", "blob", f"{commit}:{gpath}", binary=True)[start:end]
        uri = here if span is None else f"{here}&range={start}-{end}"
        if span and span[0] != "range":
            uri, mime, data = cut(span, data, mime, here)
        if is_text(mime):
            return self._result(uri, mime, data.decode("utf-8", errors="replace"), links)
        return self._result(uri, mime, None, links, blob=data)

    def _read_fs(self, ref: Ref) -> dict:
        as_ = ref.facets.get("as", "raw")
        if as_ not in AS_FS:
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; fs offers {', '.join(AS_FS)}")
        if "at" in ref.facets:
            return self._read_fs_at(ref, ref.facets["at"], as_)
        rel = ref.path
        if ref.is_collection:
            if as_ != "raw":
                # TM-11: a directory is its listing; raw is that listing itself.
                raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; an fs collection is a listing and offers no facets; read {ref.uri} without ?as")
            kids = self._fs_children(rel)
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body: dict[str, Any] = {"uri": ref.uri, "children": chunk}
            if nxt:
                body["nextCursor"] = nxt
                body["next"] = f"{ref.uri}?cursor={nxt}"
            return self._result(_cursored(ref.uri, ref.facets.get("cursor")), T_LISTING, json.dumps(body, indent=1), self._fs_links(rel, True))
        abs_ = self._fs_abs(rel)
        if abs_.is_dir():
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"fs/{rel} is a directory; its listing is at {ref.uri}/", nearest=[ref.uri + "/"])
        if not abs_.is_file():
            raise self._fs_missing(rel)
        st = abs_.stat()
        mime = self._fs_type(rel, fs_mime(abs_))
        links = self._fs_links(rel, False)
        if as_ == "stat":
            stat = {
                "uri": ref.uri, "name": abs_.name, "size": st.st_size, "mimeType": mime,
                "modified": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(timespec="seconds"),
                "isCollection": False, "text": is_text(mime),
            }
            return self._result(f"{ref.uri}?as=stat", T_STAT, json.dumps(stat, indent=1), links + [link("alternate", ref.uri)])
        span = span_of(ref)
        start, end = 0, st.st_size
        if span and span[0] == "range":
            start, end = byte_range(span[1], st.st_size)
        elif span is None and st.st_size > READ_CAP:
            raise _too_large(f"fs/{rel}", st.st_size, ref.uri)
        if not is_text(mime) and as_ != "raw" and not span:
            raise TmError(RESOURCE_NOT_FOUND, "binary", f"fs/{rel} is {mime}", mimeType=mime, stat=f"{ref.uri}?as=stat")
        with abs_.open("rb") as f:
            f.seek(start)
            data = f.read(end - start)
        uri = ref.uri if span is None else f"{ref.uri}?range={start}-{end}"
        if span and span[0] != "range":
            uri, mime, data = cut(span, data, mime, ref.uri)
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
        """The ref as given, checked, and its commit; or, for a time, the
        newest commit on HEAD's first-parent line made at or before it
        (tinypeek#15). Committer time, which is the order the history is in."""
        when = as_time(at)
        if when is not None:
            iso = when.isoformat(timespec="seconds")
            found = run_git(self._git_dir(repo), "rev-list", "-1", "--first-parent", f"--before={iso}", "HEAD").strip()
            if found:
                return found
            first = run_git(self._git_dir(repo), "log", "--first-parent", "--format=%cI", "HEAD").split()[-1]
            first = datetime.fromisoformat(first).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            raise TmError(
                RESOURCE_NOT_FOUND, "no-such-ref", f"{repo} has nothing at or before {at}; its first commit was made at {first}",
                nearest=[f"{ROOT}git/{repo}/?at={first}"],
            )
        if not REF_OK.match(at) or ".." in at:
            raise TmError(BAD_PARAMS, "bad-facet", f"at={at!r} is not a ref name")
        try:
            return run_git(self._git_dir(repo), "rev-parse", "--verify", "--quiet", f"{at}^{{commit}}").strip()
        except TmError:
            raise TmError(
                RESOURCE_NOT_FOUND, "no-such-ref", f"{repo} has no ref {at!r}",
                nearest=[f"{ROOT}git/{repo}/?at={r}" for r in closest(at, self._git_refs(repo, ""))[:5]],
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

    def _git_gitlink(self, repo: str, at: str, path: str) -> str | None:
        """The commit a submodule pins, when the path is one (a gitlink, mode
        160000), else None. cat-file cannot answer this: the pinned commit
        lives in the other repository, so asking for its type fails."""
        try:
            out = run_git(self._git_dir(repo), "ls-tree", at, "--", path)
        except TmError:
            return None
        meta, _, name = out.partition("\t")
        parts = meta.split()
        if len(parts) == 3 and parts[0] == "160000" and parts[1] == "commit" and name.strip() == path:
            return parts[2]
        return None

    def _git_submodule_url(self, repo: str, at: str, path: str) -> str | None:
        """The url .gitmodules gives a submodule path, at that ref."""
        try:
            out = run_git(self._git_dir(repo), "config", "--blob", f"{at}:.gitmodules", "--get-regexp", r"^submodule\..*\.(path|url)$")
        except TmError:
            return None
        names: dict[str, dict[str, str]] = {}
        for line in out.splitlines():
            key, _, value = line.partition(" ")
            sect, _, field_ = key.rpartition(".")
            names.setdefault(sect, {})[field_] = value.strip()
        for d in names.values():
            if d.get("path") == path:
                return d.get("url")
        return None

    def _served_repo(self, url: str | None) -> str | None:
        """The git mount's name for a submodule's url, when this box serves
        that repository. The mount's repositories are github.com/tinymachines
        ones, so only a url there matches: someone else's repository with a
        name like one of ours is not ours."""
        m = re.fullmatch(r"(?:https://github\.com/|git@github\.com:)tinymachines/([A-Za-z0-9._-]+?)(?:\.git)?/?", url or "")
        return m[1] if m and m[1] in self.git else None

    def _read_submodule(self, repo: str, at: str, commit: str, path: str, pinned: str, as_: str, head: bool) -> dict:
        q = "" if head else f"?at={at}"
        sep = "&" if q else "?"
        base = f"{ROOT}git/{repo}/{quote(path)}"
        if as_ not in ("raw", "tree", "stat"):
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; a submodule offers stat and log")
        url = self._git_submodule_url(repo, commit, path)
        served = self._served_repo(url)
        # Linked only when this server's copy of that repository has the
        # pinned commit: a link that would not resolve is worse than none.
        if served:
            try:
                run_git(self.git[served], "cat-file", "-e", f"{pinned}^{{commit}}")
            except TmError:
                served = None
        target = f"{ROOT}git/{served}/?at={pinned}" if served else None
        body = {"uri": base, "mimeType": T_SUBMODULE, "type": "submodule", "path": path, "at": at, "commit": commit,
                "pinned": pinned, "url": url, "repository": target}
        parent = path.rpartition("/")[0]
        up = f"{ROOT}git/{repo}/{quote(parent)}/{q}" if parent else f"{ROOT}git/{repo}/{q}"
        links = [link("up", up), link("collection", up), link("describedby", f"{base}{q}{sep}as=stat"),
                 link("version-history", f"{base}{q}{sep}as=log")]
        if target:
            links.append(link("tm:pins", target, "exact", title=f"the repository this submodule pins, at {pinned[:12]}"))
        uri = f"{base}{q}{sep}as=stat" if as_ == "stat" else base + q
        return self._result(uri, T_STAT if as_ == "stat" else T_SUBMODULE, json.dumps(body, indent=1), links)

    def _git_children(self, repo: str, at: str, tree: str, depth: int = 1, rev: str | None = None) -> list[dict]:
        """A tree's entries. One level is the listing: directories first, then
        names. Deeper (tinypeek#4) is one `git ls-tree -r` whatever the depth,
        each entry named by its path below the tree and carrying its level, in
        path order so a directory comes just before what is in it. A
        submodule is listed and never entered: what it pins is another
        repository's. A listing at a ref names its children at that ref."""
        # `at` is how the URIs spell the ref; `rev` is what git is asked for
        # (a time is not a revision, tinypeek#15).
        rev = rev or (self._git_at(repo, at) if as_time(at) else at)
        spec = f"{rev}:{tree}" if tree else rev
        try:
            out = run_git(self._git_dir(repo), "ls-tree", "-l", *(("-r", "-t") if depth > 1 else ()), spec)
        except TmError:
            raise self._git_missing(repo, at, tree, rev) from None
        kids = []
        lines = [l.partition("\t") for l in out.splitlines()]
        lines = [(meta, name) for meta, _, name in lines if name.count("/") < depth]
        unknown = [meta.split()[2] for meta, name in lines if meta.split()[1] == "blob" and needs_sniff(name)]
        heads = self._git_heads(repo, unknown)
        q = "" if at == "HEAD" else f"?at={quote(at)}"
        for meta, name in lines:
            mode, kind, _sha, size = meta.split()
            rel = f"{tree}/{name}" if tree else name
            base = f"{ROOT}git/{repo}/{quote(rel)}"
            if kind == "tree":
                kid = {"uri": base + "/" + q, "name": name + "/", "mimeType": T_LISTING, "isCollection": True}
            elif kind == "commit":
                # TM-19: a submodule reads as a record of what it pins.
                kid = {"uri": base + q, "name": name, "submodule": True, "mimeType": T_SUBMODULE, "isCollection": False}
            elif denied(rel):
                kid = {"uri": base + q, "name": name, "redacted": True, "isCollection": False}
            else:
                kid = {"uri": base + q, "name": name, "mimeType": mime_for(name, heads.get(_sha)), "size": int(size), "isCollection": False}
            if depth > 1:
                kid["depth"] = name.count("/") + 1
            kids.append(kid)
        kids.sort(key=(lambda c: c["name"]) if depth > 1 else (lambda c: (not c["isCollection"], c["name"])))
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

    def _git_missing(self, repo: str, at: str, path: str, rev: str | None = None) -> TmError:
        clean = path.rstrip("/")
        parts = clean.split("/")
        sibs: list[dict] = []
        for i in range(len(parts) - 1, -1, -1):
            try:
                sibs = rank_children(parts[i], self._git_children(repo, at, "/".join(parts[:i]), rev=rev))
                break
            except TmError:
                continue
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
            return links + (self.entities.inbound("git", repo, clean, True) if head else [])
        sep = "&" if q else "?"
        links.append(link("collection", up))
        links.append(link("describedby", f"{base}{q}{sep}as=stat"))
        links.append(link("version-history", f"{base}{q}{sep}as=log"))
        links.append(link("alternate", f"{base}{q}{sep}as=blame", title="the file with a commit per line"))
        if repo == "public" and clean.split("/")[0] in FS_ROOTS and (self.repo / clean).is_file():
            # At a ref the pair holds at that ref: fs takes the same at= (tinypeek#15).
            links.append(link("tm:working-copy", f"{ROOT}fs/{quote(clean)}{q}", "exact",
                              title="the checked-out file" if head else f"the checked-out file's path, as the repository had it at {at}"))
        if repo == "public" and head:
            # A route renders every page the site's build made from it (the
            # build's prerender manifest), dynamic routes included.
            for site in self.sites:
                for page in self.pages_of_route(site, clean):
                    links.append(link("tm:renders-as", f"{ROOT}http/{site}{page}", "exact", title=f"a page this route renders on {site}"))
            for node, d in sorted(self.lineage().items()):
                if clean in d.get("generated_by", []):
                    links.append(link("tm:generates", f"{ROOT}offbox/{quote(node)}", "exact", title="what it makes, kept off this box"))
                if clean in d.get("input_of", []):
                    links.append(link("tm:input", f"{ROOT}offbox/{quote(node)}", "exact", title="what it reads that no repository holds"))
            if clean.startswith("scripts/"):
                for name in self.graph.data_names:
                    for script, conf in self.graph.writers_of(name):
                        if script == clean:
                            links.append(link("tm:generates", f"{ROOT}fs/data/{quote(name)}", conf, title="a record this script writes"))
        pulled = self.origins.by_git.get((repo, clean))
        if pulled:
            # The origin of a pulled page generates its copy here and the pages
            # made from that copy, which name it back as what generated them.
            # At a ref, the copy as it was then (tinypeek#15); a page has no then.
            links.append(link("tm:generates", f"{ROOT}fs/{quote(pulled)}{q}", "exact", title=f"the copy the build pulls to {pulled}"))
            page = self.page_for(pulled)
            if page and head:
                for site in (x for x in self.sites if self.serves(x, page)):
                    links.append(link("tm:generates", f"{ROOT}http/{site}{page}", "exact", title=f"the page it becomes on {site}"))
        return links

    def _read_git(self, ref: Ref) -> dict:
        if ref.site is None:
            body = {"uri": f"{ROOT}git/", "children": [
                {"uri": f"{ROOT}git/{r}/", "name": r + "/", "mimeType": T_LISTING, "isCollection": True,
                 "title": f"github.com/tinymachines/{r}"} for r in sorted(self.git)
            ]}
            return self._result(f"{ROOT}git/", T_LISTING, json.dumps(body, indent=1), [link("up", ROOT)])
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
        # TM-19: a submodule is neither a tree nor a blob here, and its commit
        # lives in another repository; it reads as what it pins (and as=log is
        # the commits that moved the pin).
        pinned = self._git_gitlink(repo, commit, path) if path else None
        if pinned and as_ != "log":
            return self._read_submodule(repo, at, commit, path, pinned, as_, head)
        if ref.is_collection and as_ not in ("tree", "raw", "log"):
            # TM-11: a tree is its listing and its history. stat and blame are
            # a file's, refused here rather than answered "not found".
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; a git collection offers tree (its listing) and log; read {base}/ or {base}/?as=log")
        listing = as_ == "tree" or (ref.is_collection and as_ == "raw")
        depth = 1
        if "depth" in ref.facets:
            # tinypeek#4: how many levels a tree lists. Bounded, and refused
            # where there is no tree to list rather than dropped (TM-11).
            d = ref.facets["depth"]
            if not listing or not d.isdigit() or not 1 <= int(d) <= TREE_DEPTH_MAX:
                raise TmError(BAD_PARAMS, "bad-facet", f"depth={d!r}; depth is 1 to {TREE_DEPTH_MAX}, the levels a git tree lists (?as=tree&depth=N on a collection)")
            depth = int(d)
        if listing:
            kids = self._git_children(repo, at, path, depth, rev=commit)
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body: dict[str, Any] = {"uri": base + ("/" if path else ""), "at": at, "commit": commit, "children": chunk}
            deep = f"{'&' if q else '?'}as=tree&depth={depth}" if depth > 1 else ""
            if depth > 1:
                body["depth"] = depth
            if nxt:
                body["nextCursor"] = nxt
            return self._result(_cursored(body["uri"] + q + deep, ref.facets.get("cursor")), T_LISTING, json.dumps(body, indent=1), self._git_links(repo, at, path, True, head))
        if not path:
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"the root of {repo} is a tree; read {ROOT}git/{repo}/", nearest=[f"{ROOT}git/{repo}/"])
        if as_ == "log":
            try:
                n = max(1, min(int(ref.facets.get("n", LOG_DEFAULT)), LOG_MAX))
            except ValueError:
                raise TmError(BAD_PARAMS, "bad-facet", "n= must be a number") from None
            if not pinned and not self._git_has(repo, commit, path):
                raise self._git_missing(repo, at, path, commit)
            out = run_git(self._git_dir(repo), "log", f"-n{n}", "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%cI%x1f%s", commit, "--", path)
            commits = []
            for line in out.splitlines():
                full, short, author, date, made, subject = line.split("\x1f", 5)
                # `date` is the author's; `committed` is when the commit was
                # made, the time at= compares with (tinypeek#15).
                commits.append({"commit": full, "short": short, "author": author, "date": date, "committed": made, "subject": subject,
                                "uri": f"{base}?at={full}"})
            # The echo carries n as it was used; the default spelled out is the identity (tinypeek#13).
            body = {"uri": f"{base}{q}{sep}as=log" + (f"&n={n}" if n != LOG_DEFAULT else ""), "path": path, "at": at, "n": n, "commits": commits}
            links = self._git_links(repo, at, path, False, head)
            if pinned:
                # A submodule answers stat and log, not blame: no link to a refusal.
                links = [ln for ln in links if "as=blame" not in ln["href"]]
            return self._result(body["uri"], T_LOG, json.dumps(body, indent=1), links)
        try:
            kind = run_git(self._git_dir(repo), "cat-file", "-t", f"{commit}:{path}").strip()
        except TmError:
            raise self._git_missing(repo, at, path, commit) from None
        if kind == "tree":
            raise TmError(RESOURCE_NOT_FOUND, "not-found", f"{path} is a tree; its listing is at {base}/", nearest=[f"{base}/{q}"])
        if kind != "blob":
            raise TmError(RESOURCE_NOT_FOUND, "binary", f"{path} is a {kind} (a submodule), not a file", mimeType="application/x-git-" + kind)
        size = int(run_git(self._git_dir(repo), "cat-file", "-s", f"{commit}:{path}").strip())
        mime = mime_for(path) if not needs_sniff(path) else mime_for(path, run_git(self._git_dir(repo), "cat-file", "blob", f"{commit}:{path}", binary=True)[:SNIFF])
        links = self._git_links(repo, at, path, False, head)
        if as_ == "stat":
            stat = {"uri": base, "path": path, "at": at, "commit": commit, "type": kind, "size": size, "mimeType": mime, "text": is_text(mime)}
            return self._result(f"{base}{q}{sep}as=stat", T_STAT, json.dumps(stat, indent=1), links + [link("alternate", base + q)])
        if as_ == "blame":
            out = run_git(self._git_dir(repo), "blame", "-l", "--root", "--date=short", commit, "--", path)
            if len(out.encode()) > READ_CAP:
                raise TmError(RESOURCE_NOT_FOUND, "too-large", f"blame of {path} is over the cap; read the file in ranges and the log instead",
                              size=len(out.encode()), log=f"{base}{q}{sep}as=log")
            return self._result(f"{base}{q}{sep}as=blame", T_BLAME, out, links)
        span = span_of(ref)
        start, end = 0, size
        if span and span[0] == "range":
            start, end = byte_range(span[1], size)
        elif span is None and size > READ_CAP:
            raise _too_large(f"{path} at {at}", size, base + q)
        data = run_git(self._git_dir(repo), "cat-file", "blob", f"{commit}:{path}", binary=True)[start:end]
        uri = base + q if span is None else f"{base}{q}{sep}range={start}-{end}"
        if span and span[0] != "range":
            uri, mime, data = cut(span, data, mime, base + q)
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

    def route_readers(self, file: str) -> list[str]:
        """The URL paths that stand for a route's pages (TM-18), on the
        canonical site and in English: a literal route's page, or for a
        dynamic route the collection its pages are listed in (their longest
        shared directory). A dynamic route whose pages share only the root
        (the doors) names them one by one, since the root collection is the
        front page too. Empty where the site renders no page from it."""
        site = self.sites[0]
        pages = [p for p in self.pages_of_route(site, file) if not (p == "/ja" or p.startswith("/ja/"))]
        if not pages or not self.graph.is_dynamic(file):
            return pages[:1]
        common = (pages[0].rpartition("/")[0] or "/") if len(pages) == 1 else posixpath.commonpath(pages)
        return sorted(pages) if common == "/" else [common.rstrip("/") + "/"]

    def readers(self, name: str) -> list[tuple[str, str]]:
        """(path, confidence): one for each route whose pages read the
        record, on the canonical site; exact wins where two routes share a
        collection."""
        out: dict[str, str] = {}
        for _, file in self.graph.routes:
            conf = self.page_reads(self.sites[0], file).get(name)
            for path in (self.route_readers(file) if conf else []):
                if path not in out or conf == "exact":
                    out[path] = conf
        return sorted(out.items())

    def collection_reads(self, path: str) -> dict[str, str]:
        """The records read by the dynamic routes whose pages this canonical
        collection stands for."""
        out: dict[str, str] = {}
        for _, file in self.graph.routes:
            if self.graph.is_dynamic(file) and path in self.route_readers(file):
                for n, conf in self.page_reads(self.sites[0], file).items():
                    if n not in out or conf == "exact":
                        out[n] = conf
        return dict(sorted(out.items()))

    def reader_uri(self, uri: str) -> str | None:
        """The tm:read-by target that stands for a page or a collection: what
        a record names back for it. A page on either site, in either
        language, is stood for by its route's one link."""
        ref = parse(uri)
        if ref.mount == "entity":
            return self.entities.stands_for(ref)
        if ref.mount == "mcp":
            # A map is read from its files and names itself back (tinyhelper#6).
            return uri
        if ref.mount != "http" or ref.site is None:
            return None
        if ref.is_collection:
            return f"{ROOT}http/{self.sites[0]}{quote(ref.path)}"
        clean = ref.path.rstrip("/") or "/"
        route = self.graph.route_for(clean)
        if not route:
            return None
        paths = self.route_readers(route[0])
        english = clean[3:] or "/" if clean == "/ja" or clean.startswith("/ja/") else clean
        path = english if english in paths else (paths[0] if len(paths) == 1 and paths[0].endswith("/") else None)
        return f"{ROOT}http/{self.sites[0]}{quote(path)}" if path else None

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
                child = {"uri": f"{ROOT}http/{site}{quote(prefix + seg)}", "name": seg, "mimeType": T_PAGE, "isCollection": False}
                title = self.page_title(site, prefix + seg)
                if title:
                    child["title"] = title
                out.append(child)
            if e["below"]:
                out.append({"uri": f"{ROOT}http/{site}{quote(prefix + seg)}/", "name": seg + "/", "mimeType": T_LISTING, "isCollection": True})
        return out

    def _http_complete(self, site: str, typed: str) -> list[str]:
        d, _, leaf = typed.rpartition("/")
        kids = self._http_children(site, d + "/")
        return [f"{d}/{c['name']}" for c in kids if c["name"].startswith(leaf)]

    def _version_links(self, site: str, page: str) -> list[dict]:
        """TM-20: the same page in the other language and on the other site,
        as `alternate`. TM-18 names a reading route once, on the canonical
        site and language, and counts on these to carry a reader to the rest,
        so they are never capped. The other language is linked only where the
        site's build made it (a page may be English only); the other site
        wherever it serves the page, as `serves` judges for renders-as."""
        out: list[dict] = []
        if page == "/ja":
            twin, lang = "/", "English"
        elif page.startswith("/ja/"):
            twin, lang = page[3:], "English"
        else:
            twin, lang = "/ja" + ("" if page == "/" else page), "Japanese"
        # Each condition holds the same way round from either end, so every
        # link is answered: the language twin only where the build made both,
        # the other site only where both sites serve the page.
        b = self.built(site)
        if b is not None and page in b and twin in b:
            out.append(link("alternate", f"{ROOT}http/{site}{quote(twin)}", title=f"the same page in {lang}"))
        for other in self.sites:
            if other != site and self.serves(site, page) and self.serves(other, page):
                out.append(link("alternate", f"{ROOT}http/{other}{quote(page)}", title=f"the same page on {other}"))
        return out

    def _http_links(self, site: str, path: str, is_dir: bool) -> list[dict]:
        clean = path.rstrip("/") or "/"
        parent = clean.rpartition("/")[0]
        up = f"{ROOT}http/{site}{quote(parent)}/" if parent else f"{ROOT}http/{site}/"
        base = f"{ROOT}http/{site}{quote(clean)}"
        links = [link("up", up if clean != "/" else f"{ROOT}http/")]
        if is_dir and site == self.sites[0] and clean != "/":
            # A collection that stands for a dynamic route's pages carries
            # their reading, the inverse of the records' one link (TM-18).
            for name, conf in self.collection_reads(clean + "/").items():
                links.append(link("tm:data", f"{ROOT}fs/data/{quote(name)}", conf,
                                  title="a record the pages listed here read" if conf == "exact" else "a record the pages listed here reach"))
        if not is_dir:
            links.append(link("collection", up))
            links.append(link("describedby", f"{base}?as=stat"))
            links.append(link("alternate", f"{base}?as=rendered", title="the HTML a visitor gets"))
            links.extend(self._version_links(site, clean))
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
            links.extend(self.entities.inbound("http", site, clean))
        return links

    async def _read_http(self, ref: Ref) -> dict:
        if ref.site is None:
            body = {"uri": f"{ROOT}http/", "children": [
                {"uri": f"{ROOT}http/{s}/", "name": s, "mimeType": T_LISTING, "isCollection": True} for s in self.sites
            ]}
            return self._result(f"{ROOT}http/", T_LISTING, json.dumps(body, indent=1), [link("up", ROOT)])
        # A page's text is what a reader wants first, so it is the default
        # (TM-4); the HTML a visitor gets, nav and flight payload and all, is
        # one facet away.
        asked = ref.facets.get("as")
        as_ = asked or "text"
        if as_ not in AS_HTTP:
            raise TmError(BAD_PARAMS, "bad-facet", f"as={as_!r}; http offers {', '.join(AS_HTTP)}")
        site, path = ref.site, ref.path
        span = span_of(ref)
        if span and (as_ != "text" or ref.is_collection):
            # tinypeek#8: a range is of a page's text, and so are its lines
            # (tinypeek#16). Anywhere else it is refused, as a facet a thing
            # lacks is, not dropped (TM-11).
            raise TmError(BAD_PARAMS, "bad-facet", f"{span[0]} reads a page's text; it goes with ?as=text, or with no ?as on a page")
        if ref.is_collection and path != "/":
            if asked:
                # TM-11: a listing has one representation. A page's facet on it
                # is refused, as a file refuses one it lacks, not dropped.
                raise TmError(BAD_PARAMS, "bad-facet", f"as={asked!r}; an http collection is a listing and offers no facets; read {ref.uri} without ?as")
            kids = self._http_children(site, path)
            if not kids:
                raise self._http_missing(site, path)
            chunk, nxt = _page(kids, ref.facets.get("cursor"), LIST_CAP)
            body = {"uri": ref.uri, "children": chunk}
            if nxt:
                body["nextCursor"] = nxt
            return self._result(_cursored(ref.uri, ref.facets.get("cursor")), T_LISTING, json.dumps(body, indent=1), self._http_links(site, path, True))
        if path == "/" and ref.uri.endswith("/") and not (set(ref.facets) - {"cursor"}):
            # The site root is both the front page and the top collection;
            # the collection is what a cold client wants first.
            kids, nxt = _page(self._http_children(site, "/"), ref.facets.get("cursor"), LIST_CAP)
            body = {"uri": ref.uri, "children": kids, "front_page": f"{ref.uri}?as=text"}
            if nxt:
                body["nextCursor"] = nxt
            # The listing and the front page share this address, so it carries
            # the front page's own links too: its source and its data.
            # Its other versions too (TM-20), or /ja's link to it goes unanswered.
            page = [ln for ln in self._http_links(site, "/", False)
                    if ln["rel"].startswith("tm:") or (ln["rel"] == "alternate" and "?as=" not in ln["href"])]
            return self._result(_cursored(ref.uri, ref.facets.get("cursor")), T_LISTING, json.dumps(body, indent=1), self._http_links(site, "/", True) + page)
        status, ctype, data = await self.fetch(site, path)
        base = f"{ROOT}http/{site}{quote(path)}"
        links = self._http_links(site, path, False)
        bare = ctype.split(";")[0].strip() or "application/octet-stream"
        if as_ == "stat":
            # tinypeek#23: the stat says what the thing reads as, a page as a
            # page; contentType stays what the front door said.
            stat = {"uri": base, "status": status, "contentType": ctype, "mimeType": T_PAGE if bare == "text/html" else http_type(bare), "size": len(data),
                    "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            return self._result(f"{base}?as=stat", T_STAT, json.dumps(stat, indent=1), links)
        if status == 404:
            raise self._http_missing(site, path)
        if status >= 400:
            raise TmError(RESOURCE_NOT_FOUND, "unreachable", f"{site}{path} answered {status}", status=status)
        if 300 <= status < 400:
            raise TmError(RESOURCE_NOT_FOUND, "redirect", f"{site}{path} redirects; the visitor would be sent on", status=status)
        mime = bare
        if as_ == "text" and mime == "text/html":
            # tinypeek#8: a page's text is held to the byte cap like every
            # other read. It was the one read with no cap, and the default one.
            text = page_text(data.decode("utf-8", errors="replace")).encode()
            if span and span[0] == "range":
                start, end = byte_range(span[1], len(text))
                return self._result(f"{base}?as=text&range={start}-{end}", T_PAGE, text[start:end].decode("utf-8", errors="replace"), links)
            if span:
                uri, _, piece = cut(span, text, T_PAGE, f"{base}?as=text")
                return self._result(uri, T_PAGE, piece.decode("utf-8", errors="replace"), links)
            if len(text) > READ_CAP:
                raise _too_large(f"the text of {site}{path}", len(text), f"{base}?as=text", stat=f"{base}?as=stat")
            return self._result(f"{base}?as=text" if asked else base, T_PAGE, text.decode("utf-8"), links)
        if span:
            raise TmError(BAD_PARAMS, "bad-facet", f"{span[0]} reads a page's text, and {site}{path} is {mime}, not a page")
        if as_ == "text" and asked:
            raise TmError(RESOURCE_NOT_FOUND, "binary", f"{site}{path} is {mime}, not a page", mimeType=mime, stat=f"{base}?as=stat")
        # Not a page (robots.txt, a picture): with no facet it reads as itself.
        if len(data) > READ_CAP:
            raise TmError(RESOURCE_NOT_FOUND, "too-large", f"{site}{path} is {len(data)} bytes rendered; ?as=text is smaller, and reads in ranges if it is over the cap too",
                          size=len(data), stat=f"{base}?as=stat", text=f"{base}?as=text")
        if not is_text(mime):
            raise TmError(RESOURCE_NOT_FOUND, "binary", f"{site}{path} is {mime}", mimeType=mime, stat=f"{base}?as=stat")
        return self._result(base, http_type(mime), data.decode("utf-8", errors="replace"), links)

    def _http_missing(self, site: str, path: str) -> TmError:
        clean = path.rstrip("/") or "/"
        parts = clean.split("/")
        sibs: list[dict] = []
        for i in range(len(parts) - 1, 0, -1):
            kids = self._http_children(site, "/".join(parts[:i]) + "/")
            if kids:
                sibs = rank_children(parts[i], kids)
                break
        return TmError(RESOURCE_NOT_FOUND, "not-found", f"{site}{path} is not a page this box knows", nearest=[c["uri"] for c in sibs[:5]])
