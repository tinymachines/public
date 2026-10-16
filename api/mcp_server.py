"""MCP over the same models: three tools, each one a whole errand.

    POST /api/mcp        (streamable HTTP, no session, no SSE)

REST and MCP are one surface here, not two. The HTTP routes are fine-grained
because a program can hold a list of six things and ask a second question
about the fourth. A language model asking "what is tinymachines and what is
running" should not have to make four calls and carry the intermediate JSON in
its context to do it, so the tools are coarse: `overview` answers that whole
question in one call, measurement included.

Same implementations underneath. A tool that returned something the REST route
did not would be a second surface pretending to be one, which is the thing
this file exists to avoid.

The transport is hand-written JSON-RPC rather than an SDK, for the same reason
the 6502 service does it: `initialize`, `tools/list` and `tools/call` over one
POST is a short, dependency-free thing with little in it to be wrong about,
and this service's promise is that it has nothing to go stale underneath it.
That file is the reference; this is the same shape with different tools.
"""

from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

SERVER = {"name": "tinymachines", "title": "tinymachines.ai", "version": "1.0.0"}

# Revisions of the MCP spec this speaks. A client asking for one of these gets
# it back; anything else gets our newest, which is what the spec says to do.
SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"]
LATEST = SUPPORTED[0]

INSTRUCTIONS = """tinymachines.ai is the roof over six pieces of transistor-level
MOS 6502 work: a switch-level engine, an explorer, a stateless HTTP API over the
real chip, a warm engine process, a console with a cartridge format, and a
registry.

Call overview first. It answers what the pieces are and which of them are
answering right now, in one call, so you do not have to ask six times.

Reachability is measured, not asserted: the server probes each public URL and
reports what came back, with the time it was asked. `up`, `down` and
`unreachable` are three different answers on purpose. `down` means the host
replied with 400 or worse; `unreachable` means nothing replied at all.

The chip itself is not here. This service describes and measures the pieces; to
run 6502 code, use the 6502 API at https://6502.tinymachines.ai/api, which has
its own MCP endpoint with five tools for assembling, running and minting
cartridges."""

# Appended when the server carries a tm:// namespace (api/tm.py).
TM_INSTRUCTIONS = """

The same server is also a read-only namespace, tm://, spoken as MCP resources:
start by reading tm://tinymachines/ (the mounts), then read any URI ending in /
to list its children, and read a file or page to get it. Five mounts: fs/ is
the repository's docs/, data/ and notes/; git/<repo>/ is a repository at any ref or time
(?at=, a branch, tag, commit or ISO date, which fs takes too; with ?as=log, blame, tree, stat); http/<site>/ is what a visitor gets from
a site this box serves, a page read as its text (?as=rendered for the HTML). A piece of a thing has an address and reads:
?lines=FIRST-LAST is lines of a file or a page's text, ?pointer=/a/0/b is what a JSON pointer names in a JSON file,
?range=START-END is bytes; the answer's uri keeps the span, so a quote keeps where it came from;
offbox/ names the places a build chain leaves this box; entity/ holds the
autopsy's patterns, games, routines and lessons as things of their own, so
entity/pattern/pad-poll links to every game it was found in (tm:found-in), each
routine a rule named (tm:instance) and the lessons that use it
(tm:demonstrated-by), with no need to read the record they come from. Every read carries
typed links in _meta under "tinymachines.ai/links": a notebook page links to the
markdown it is rendered from (tm:source), the file links back to its page
(tm:renders-as) and to the repository it came from (tm:generated-by or
tm:repository), any page links to its route file (tm:source) and to the records
its own code reads (tm:data), a script to what it reads that no repository
holds (tm:input), a page to itself in the other language and on the other site
(alternate), a submodule to the repository it pins (tm:pins), and up, collection, alternate, describedby,
version-history and latest-version do what the IANA registry says. Links come in one order (the IANA ones, then exact, then
inferred; by rel, then href) and no read carries more than a hundred: a read with more ends in a tm:links link to
<uri>?as=links, which gives all of them a page at a time, each page ending in next. A link that stands for several
occurrences says how many in count. Reads are rate-limited by caller: a burst of 240, then 4 a second, a page
costing 5 and a git read 2; over it the answer is rate-limited with retryAfter in seconds, and waiting that long is enough. A URI that does not resolve comes back with the nearest ones that
do. Resource templates and completions give the grammar and live values, so you
can compose a URI you were never shown and try it. The resolve tool reads the
same URIs and returns the links in its body, for a client that prefers tools."""


def start_here(namespace: Any) -> str:
    """TM-12: the box's orientation documents, named in the instructions so a
    fresh session's first message points at them. The namespace says which
    are there to read; none that would not resolve is named."""
    docs = namespace.start_here() if hasattr(namespace, "start_here") else []
    if not docs:
        return ""
    return "\n\nRead these first; they are this box's own orientation documents:\n" + "\n".join(
        f"  {d['uri']}  ({d['what']})" for d in docs)


class RpcError(Exception):
    def __init__(self, code: int, message: str, data: Any = None):
        super().__init__(message)
        self.code, self.message, self.data = code, message, data


PARSE, INVALID_REQ, NO_METHOD, BAD_PARAMS, INTERNAL = -32700, -32600, -32601, -32602, -32603
# In the range JSON-RPC leaves to the server; the last digits are HTTP's 429.
RATE_LIMITED = -32029

# ---------------------------------------------------------------------------
# The rate limit (tinypeek#6)
# ---------------------------------------------------------------------------
#
# Every other control here bounds one request: a byte cap, a page of a
# listing, a cap on links. Nothing bounded how many a caller makes, and two of
# the mounts do real work on each: http fetches the page through the front
# door, git starts a process.
#
# A token bucket for each caller, in memory. A caller is the address the
# front door accepted the connection from; there are no tokens yet, and when
# there are, a token id is a better key and goes in the same place. The
# address is a key in a table and nothing else: never logged, never written
# down, never handed back, and forgotten on restart.
#
# Sized so that a person or a model reading the namespace never meets it, and
# something crawling it does: a burst of 240 units, then 4 a second. The
# deploy's own crawl runs in-process and is not a caller at all. A caller on
# the box that reaches the port directly shares one bucket with every other
# such caller; nothing in the deploy talks to this endpoint over HTTP, and a
# burst of 240 is room for a person checking by hand, so loopback is not
# exempted: an exemption is a limit anything on the box can step around.

RATE_BURST = 240.0        # units a caller may spend at once
RATE_PER_SECOND = 4.0     # units a caller earns back each second
RATE_CALLERS = 10_000     # buckets kept; past it the longest idle are dropped
COST_HTTP = 5             # a page, fetched through the front door
COST_GIT = 2              # a git process


class RateLimit:
    """Token buckets by caller. `take` spends, or says how long to wait."""

    def __init__(self, capacity: float = RATE_BURST, per_second: float = RATE_PER_SECOND,
                 clock: Callable[[], float] = time.monotonic, max_callers: int = RATE_CALLERS):
        self.capacity, self.per_second, self.clock, self.max_callers = float(capacity), float(per_second), clock, max_callers
        self._buckets: dict[str, tuple[float, float]] = {}    # caller -> (units left, when)

    def __len__(self) -> int:
        return len(self._buckets)

    def forget(self, caller: str) -> None:
        self._buckets.pop(caller, None)

    def take(self, caller: str, units: float) -> int | None:
        """Spend `units` for `caller`: None when it could, else the whole
        seconds until it can. A refusal spends nothing, so the wait it names
        is enough."""
        now = self.clock()
        left, then = self._buckets.pop(caller, (self.capacity, now))
        left = min(self.capacity, left + (now - then) * self.per_second)
        wait = None
        if units > left:
            wait = max(1, math.ceil((min(units, self.capacity) - left) / self.per_second))
        else:
            left -= units
        # Re-inserted last, so the table is in order of last use and the
        # longest idle are the first out when a flood of addresses fills it.
        self._buckets[caller] = (left, now)
        while len(self._buckets) > self.max_callers:
            self._buckets.pop(next(iter(self._buckets)))
        return wait


# ---------------------------------------------------------------------------
# The audit log (tinypeek#7)
# ---------------------------------------------------------------------------
#
# What was read through the namespace, one JSON line a request. Until now
# nothing recorded it: nginx logs that somebody POSTed to /api/mcp, and the
# URI is in the body, which nginx does not keep.
#
# A record is the time, the method, the tool and the URI where there is one,
# how it ended ("ok", or the refusal's reason), the bytes sent back and the
# milliseconds it took, and a token id, which is null until there are tokens.
# It holds no address and no hash of one. The only identity there is today is
# the caller's address, which is personal data, and the site's own visitor
# count keeps none either; when tokens exist the token id is who asked.
#
# It is written outside the checkout, always: the namespace serves parts of
# the checkout, and a log it could serve would be a log of its own readers,
# published. So a directory under the checkout is refused, not trusted to be
# outside the served roots. One file a day, thirty days kept, readable by the
# service's user and nobody else. A write that fails is counted and never
# fails the read it was recording.
#
# It is bounded in bytes as well as days, because the disk it sits on also
# holds the service's database, and a full disk there is a worse failure than
# a missing line. A crawler inside the rate limit can make hundreds of
# thousands of requests a day. So a day's file stops at 8 MiB, after which
# records are counted and not written, and the first line of the next file
# says how many were dropped; and the files together stay under 64 MiB, the
# oldest going first.

AUDIT_DAYS = 30
AUDIT_DAY_BYTES = 8 * 1024 * 1024      # one day's file; past it records are counted, not written
AUDIT_TOTAL_BYTES = 64 * 1024 * 1024   # every file together; the oldest days go first
# A URI is whatever a client sends. It is recorded cut to this length, with
# its real length beside it, so a record stays a few hundred bytes: at 2,000
# characters a caller could spend a day's room in a few thousand requests and
# blind the log for the rest of the day.
AUDIT_URI_MAX = 300


class AuditLog:
    def __init__(self, directory: Path, repo: Path, days: int = AUDIT_DAYS, now: Callable[[], float] = time.time,
                 day_bytes: int = AUDIT_DAY_BYTES, total_bytes: int = AUDIT_TOTAL_BYTES):
        self.dir = Path(directory)
        self.days, self.now, self.day_bytes, self.total_bytes = days, now, day_bytes, total_bytes
        self.failed, self.last_error = 0, ""
        self.dropped = 0              # records not written since the last file began, for want of room
        self._day, self._size = "", 0
        here, checkout = self.dir.resolve(), Path(repo).resolve()
        if here == checkout or checkout in here.parents:
            raise ValueError(f"the audit log may not be written under the checkout ({checkout}), which the namespace serves parts of")

    @classmethod
    def from_env(cls, repo: Path) -> "AuditLog | None":
        """$TM_AUDIT_DIR, else tm-audit/ in the service's state directory,
        else no log at all (a test, a dev run). A place under the checkout is
        refused and the service starts without a log rather than not at all."""
        explicit, state = os.environ.get("TM_AUDIT_DIR"), os.environ.get("STATE_DIRECTORY")
        where = Path(explicit) if explicit else Path(state.split(":")[0]) / "tm-audit" if state else None
        if where is None:
            return None
        try:
            return cls(where, repo)
        except ValueError as e:
            print(f"audit: {e}; reads are not being logged", flush=True)
            return None

    def write(self, method: str, tool: str | None, uri: str | None, result: str, size: int, ms: int, token: str | None = None) -> None:
        try:
            t = datetime.fromtimestamp(self.now(), timezone.utc)
            day = t.strftime("%Y-%m-%d")
            rec: dict[str, Any] = {"time": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "method": str(method)[:100]}
            if tool is not None:
                rec["tool"] = str(tool)[:100]
            rec["uri"] = None if uri is None else str(uri)[:AUDIT_URI_MAX]
            if uri is not None and len(str(uri)) > AUDIT_URI_MAX:
                rec["uri_len"] = len(str(uri))
            rec.update(result=result, bytes=size, ms=ms, token=token)
            today = self.dir / f"tm-audit-{day}.jsonl"
            lines = b""
            if day != self._day:
                self.dir.mkdir(mode=0o700, parents=True, exist_ok=True)
                os.chmod(self.dir, 0o700)
                kept = sorted(f for f in self.dir.glob("tm-audit-*.jsonl") if f != today)
                # By days, then by bytes: the oldest go first, leaving room for today's.
                while kept and (len(kept) >= self.days or sum(f.stat().st_size for f in kept) > self.total_bytes - self.day_bytes):
                    kept.pop(0).unlink()
                self._day, self._size = day, today.stat().st_size if today.exists() else 0
                if self.dropped:
                    # What the day before could not hold is said, not hidden.
                    lines = (json.dumps({"time": rec["time"], "method": "audit", "result": "dropped", "dropped": self.dropped}) + "\n").encode()
                    self.dropped = 0
            # json.dumps escapes a newline, so one record is one line whatever the URI held.
            lines += (json.dumps(rec, ensure_ascii=False) + "\n").encode("utf-8", errors="replace")
            if self._size + len(lines) > self.day_bytes:
                self.dropped += 1
                return
            fd = os.open(today, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            try:
                os.write(fd, lines)
            finally:
                os.close(fd)
            self._size += len(lines)
        except Exception as e:  # noqa: BLE001  -- the read is the point; the record is not
            self.failed += 1
            self.last_error = f"{type(e).__name__}: {e}"
            self._day = ""


def _subject(msg: Any) -> tuple[str, str | None, str | None]:
    """A message's method, tool and URI, for the record; nonsense is recorded as nonsense."""
    if not isinstance(msg, dict):
        return "?", None, None
    params = msg.get("params") if isinstance(msg.get("params"), dict) else {}
    method = msg.get("method") if isinstance(msg.get("method"), str) else "?"
    tool = params.get("name") if method == "tools/call" else None
    args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
    uri = args.get("uri") if method == "tools/call" else params.get("uri")
    return method, tool if isinstance(tool, str) else None, uri if isinstance(uri, str) else None


FREE = ("initialize", "ping", "tools/list", "resources/templates/list")


def cost(msg: Any) -> int:
    """What one message costs its caller. Connecting and learning the grammar
    are free, so a limited client can still find out what it is talking to; a
    read is one unit, more where the box does more work for it."""
    if not isinstance(msg, dict):
        return 1
    method, params = msg.get("method"), msg.get("params")
    if not isinstance(method, str):
        return 1
    if method in FREE or method.startswith("notifications/"):
        return 0
    params = params if isinstance(params, dict) else {}
    uri = params.get("uri")
    if method == "tools/call" and isinstance(params.get("arguments"), dict):
        uri = params["arguments"].get("uri")
    if isinstance(uri, str):
        mount = uri.split("://", 1)[-1].split("/", 2)[1:2]
        if mount == ["http"]:
            return COST_HTTP
        if mount == ["git"]:
            return COST_GIT
    return 1


TOOLS: list[dict] = [
    {
        "name": "overview",
        "title": "What tinymachines is, and what is up",
        "description": (
            "The six pieces of the tinymachines 6502 work, each with what it is, where "
            "its source is, how it ships and its licence, together with a live "
            "reachability measurement of the ones that have a public surface. Read "
            "this first: it answers the whole 'what is this and what is running' "
            "question in one call. Reachability is probed at call time, subject to a "
            "short cache, and every measurement carries the time it was taken."
        ),
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "piece",
        "title": "One piece in detail",
        "description": (
            "One of the six pieces by key, with its live reachability. Keys are "
            "halfphi, explorer, chip-api, halfwave, console and registry. Call "
            "overview if you do not know which key you want; an unknown key is "
            "refused with the list of valid ones rather than guessed at."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "The piece's stable key, for example chip-api.",
                },
            },
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "licensing",
        "title": "What may be published, and under what terms",
        "description": (
            "The licence position, which is not one licence. Our code is MIT. The "
            "visual6502 die data is CC BY-NC-SA 3.0, and NonCommercial and ShareAlike "
            "travel with everything derived from it, which includes the netlist, the "
            "measured tables, the API's responses and every cartridge. halfphi is the "
            "clean piece because it embeds no die data. Read this before suggesting "
            "anything that would publish, relicense or charge for any of it."
        ),
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]


def make_handler(
    impls: dict[str, Callable[[dict], Any]],
    namespace: Any = None,
    limiter: RateLimit | None = None,
    audit: AuditLog | None = None,
) -> Callable[..., Any]:
    """One JSON-RPC message in, one response out (or None for a notification).

    Batches are handled by the caller, which is the only part of the transport
    that needs to know a batch from a message.

    `namespace`, when given, is a tm.Namespace: the server then also speaks
    resources/list, resources/templates/list, resources/read and
    completion/complete, and says so in its capabilities. Without one it is
    the three tools and nothing else, which is what it was.

    `limiter`, when given, holds each caller to a rate (tinypeek#6). The
    caller is whatever the transport passes as `caller` with a message; a
    message with none (a test, the box reading itself in-process) is not
    limited.

    `audit`, when given, gets one record for every message that has an answer
    (tinypeek#7): a read, a refusal, a call over the rate. It is written here
    so both doors are covered, resources and tools alike.
    """
    tools = list(TOOLS)
    if namespace is not None:
        # The namespace's one tool, resolve(uri): the same read, with the
        # links in the body, for a client that never lists resources.
        tools.append(namespace.tool())
        impls = {**impls, namespace.tool()["name"]: namespace.resolve}
    names = {t["name"] for t in tools}
    missing = names - set(impls)
    assert not missing, f"tools with no implementation: {sorted(missing)}"
    extra = set(impls) - names
    assert not extra, f"implementations with no tool: {sorted(extra)}"

    async def call_tool(params: dict) -> dict:
        name = params.get("name")
        if name not in impls:
            raise RpcError(BAD_PARAMS, f"no tool named {name!r}")
        args = params.get("arguments") or {}
        if not isinstance(args, dict):
            raise RpcError(BAD_PARAMS, "arguments must be an object")
        try:
            result = impls[name](args)
            if hasattr(result, "__await__"):
                result = await result
        except RpcError:
            raise
        except Exception as e:  # noqa: BLE001
            # A tool that refuses is a normal result with isError, not a
            # protocol error: the model has to be able to read the reason and
            # try again, and a JSON-RPC error is for the client, not the model.
            # A structured refusal (a tm.TmError) keeps its data, which is
            # where the nearest URIs and the range template are.
            data = getattr(e, "data", None)
            text = (
                json.dumps({"error": str(e), **data}, indent=1)
                if isinstance(data, dict)
                else f"{type(e).__name__}: {e}"
            )
            return {"content": [{"type": "text", "text": text}], "isError": True}
        text = result if isinstance(result, str) else json.dumps(result, indent=1, default=str)
        return {"content": [{"type": "text", "text": text}], "isError": False}

    capabilities: dict[str, Any] = {"tools": {"listChanged": False}}
    if namespace is not None:
        capabilities["resources"] = {"subscribe": False, "listChanged": False}
        capabilities["completions"] = {}

    def refuse(wait: int) -> dict:
        return {"reason": "rate-limited", "retryAfter": wait, "burst": int(limiter.capacity), "perSecond": limiter.per_second}

    async def handle(msg: Any, caller: str | None = None) -> dict | None:
        if audit is None or (isinstance(msg, dict) and str(msg.get("method", "")).startswith("notifications/")):
            return await answer(msg, caller)
        began = time.monotonic()
        result, size = "error", 0
        try:
            out = await answer(msg, caller)
            got = (out or {}).get("result")
            result = "ok"
            if isinstance(got, dict) and got.get("isError"):
                # A tool's refusal is a result; the reason is in its text.
                try:
                    result = json.loads(got["content"][0]["text"]).get("reason") or "error"
                except Exception:  # noqa: BLE001
                    result = "error"
            else:
                size = len(json.dumps(got, default=str)) if got is not None else 0
            return out
        except RpcError as e:
            result = (e.data or {}).get("reason", "error") if isinstance(e.data, dict) else "error"
            raise
        finally:
            audit.write(*_subject(msg), result, size, int((time.monotonic() - began) * 1000))

    async def answer(msg: Any, caller: str | None = None) -> dict | None:
        # Before anything is parsed or read: a caller over its rate is told
        # so, and how long to wait, whatever it asked for.
        wait = limiter.take(caller, cost(msg)) if limiter is not None and caller is not None and cost(msg) else None
        if wait is not None:
            said = f"too many requests; try again in {wait}s"
            if isinstance(msg, dict) and msg.get("method") == "tools/call":
                # A tool's refusal is a result the model can read, as below.
                if msg.get("id") is None:
                    return None
                return {"jsonrpc": "2.0", "id": msg.get("id"), "result": {
                    "content": [{"type": "text", "text": json.dumps({"error": said, **refuse(wait)}, indent=1)}], "isError": True}}
            raise RpcError(RATE_LIMITED, said, refuse(wait))
        if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
            raise RpcError(INVALID_REQ, "not a JSON-RPC 2.0 message")
        method, mid = msg.get("method"), msg.get("id")
        params = msg.get("params") or {}
        if method is None:
            raise RpcError(INVALID_REQ, "no method")

        if method.startswith("notifications/"):
            return None  # nothing to acknowledge; the spec wants no body
        if method == "initialize":
            want = params.get("protocolVersion")
            result: Any = {
                "protocolVersion": want if want in SUPPORTED else LATEST,
                "capabilities": capabilities,
                "serverInfo": SERVER,
                "instructions": INSTRUCTIONS + (TM_INSTRUCTIONS + start_here(namespace) if namespace else ""),
            }
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            result = {"tools": tools}
        elif method == "tools/call":
            result = await call_tool(params)
        elif namespace and method == "resources/list":
            result = tm_call(namespace.list_resources, params.get("cursor"))
        elif namespace and method == "resources/templates/list":
            result = {"resourceTemplates": namespace.templates()}
        elif namespace and method == "resources/read":
            uri = params.get("uri")
            if not isinstance(uri, str):
                raise RpcError(BAD_PARAMS, "resources/read needs a uri")
            result = await tm_call_async(namespace.read, uri)
        elif namespace and method == "completion/complete":
            result = tm_call(namespace.complete, params)
        else:
            raise RpcError(NO_METHOD, f"method {method!r} is not implemented")

        if mid is None:
            return None
        return {"jsonrpc": "2.0", "id": mid, "result": result}

    handle.limiter = limiter    # for the transport's own tests, and nothing else
    handle.audit = audit
    return handle


def _as_rpc(e: Exception) -> RpcError:
    """A tm.TmError is already a structured refusal; it becomes the JSON-RPC
    error with its reason and helpers in `data`, so a wrong guess teaches the
    client instead of dead-ending."""
    code = getattr(e, "code", None)
    data = getattr(e, "data", None)
    if isinstance(code, int) and isinstance(data, dict):
        return RpcError(code, str(e), data)
    return RpcError(INTERNAL, f"{type(e).__name__}: {e}")


def tm_call(fn: Callable[..., Any], *args: Any) -> Any:
    try:
        return fn(*args)
    except RpcError:
        raise
    except Exception as e:  # noqa: BLE001
        raise _as_rpc(e) from e


async def tm_call_async(fn: Callable[..., Any], *args: Any) -> Any:
    try:
        return await fn(*args)
    except RpcError:
        raise
    except Exception as e:  # noqa: BLE001
        raise _as_rpc(e) from e


def error_body(mid: Any, e: RpcError) -> dict:
    body: dict = {"jsonrpc": "2.0", "id": mid, "error": {"code": e.code, "message": e.message}}
    if e.data is not None:
        body["error"]["data"] = e.data
    return body
