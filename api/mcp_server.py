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
to list its children, and read a file or page to get it. Three mounts: fs/ is
the repository's docs/, data/ and notes/; git/<repo>/ is a repository at any ref
(?at=, with ?as=log, blame, tree, stat); http/<site>/ is what a visitor gets from
a site this box serves, with ?as=text for the readable text. Every read carries
typed links in _meta under "tinymachines.ai/links": a notebook page links to the
markdown it is rendered from (tm:source), the file links back to its page
(tm:renders-as) and to the repository it came from (tm:generated-by or
tm:repository), and up, collection, alternate, describedby, version-history and
latest-version do what the IANA registry says. A URI that does not resolve comes back with the nearest ones that
do. Resource templates and completions give the grammar and live values, so you
can compose a URI you were never shown and try it. The resolve tool reads the
same URIs and returns the links in its body, for a client that prefers tools."""


class RpcError(Exception):
    def __init__(self, code: int, message: str, data: Any = None):
        super().__init__(message)
        self.code, self.message, self.data = code, message, data


PARSE, INVALID_REQ, NO_METHOD, BAD_PARAMS, INTERNAL = -32700, -32600, -32601, -32602, -32603


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
) -> Callable[[Any], Any]:
    """One JSON-RPC message in, one response out (or None for a notification).

    Batches are handled by the caller, which is the only part of the transport
    that needs to know a batch from a message.

    `namespace`, when given, is a tm.Namespace: the server then also speaks
    resources/list, resources/templates/list, resources/read and
    completion/complete, and says so in its capabilities. Without one it is
    the three tools and nothing else, which is what it was.
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

    async def handle(msg: Any) -> dict | None:
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
                "instructions": INSTRUCTIONS + (TM_INSTRUCTIONS if namespace else ""),
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
