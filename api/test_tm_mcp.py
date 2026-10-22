"""tm://, the mcp mount (tinypeek#22): an MCP server read as a host's mount.

Every test runs against a fake MCP server behind an httpx transport, so the
three ways a server answers (streamable HTTP with JSON, streamable HTTP with
an event-stream body, the older SSE transport with its endpoint event) are
each exercised without a network, and so are the two ways it does not (a
token it wants that the box does not hold, and nothing answering at all).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest

import mcp_server
import tm
from tm import ROOT, Namespace, TmError

from test_tm import canned_fetch, read, refusal, rels, repo, run  # noqa: F401  (repo is the fixture)


TOOLS = [
    {
        "name": "get_slot",
        "title": "One slot",
        "description": "One record of a dex.",
        "inputSchema": {"type": "object", "properties": {"kind": {"type": "string"}, "slot_id": {"type": "string"}}, "required": ["kind", "slot_id"]},
        "outputSchema": {"title": "Slot", "type": "object", "properties": {"id": {"type": "string"}}},
    },
    {"name": "list_kinds", "description": "Every dex.", "inputSchema": {"type": "object", "properties": {}}},
]
RESOURCES = [{"uri": "cb://catalog", "name": "catalog", "title": "The catalog", "mimeType": "application/json"}]
TEMPLATES = [{"uriTemplate": "cb://services/{id}", "name": "service", "description": "One service"}]
PROMPTS = [{"name": "brief", "description": "A brief", "arguments": [{"name": "topic", "required": True}]}]


class Fake:
    """An MCP server as an httpx transport. mode is json, sse-body, legacy,
    gated or down; calls records every JSON-RPC method and the headers it
    came with, so a test can count them and see what was sent."""

    def __init__(self, mode: str = "json", capabilities: dict | None = None):
        self.mode = mode
        self.calls: list[tuple[str, dict]] = []
        self.capabilities = capabilities if capabilities is not None else {"tools": {}, "resources": {}, "prompts": {}}
        self._queue: list[dict] = []

    def answer(self, msg: dict) -> dict | None:
        method = msg.get("method", "")
        self.calls.append((method, {}))
        if method.startswith("notifications/"):
            return None
        results = {
            "initialize": {"protocolVersion": "2025-03-26", "capabilities": self.capabilities,
                           "serverInfo": {"name": "fake", "version": "1.0"}, "instructions": "A fake."},
            "tools/list": {"tools": TOOLS},
            "resources/list": {"resources": RESOURCES},
            "resources/templates/list": {"resourceTemplates": TEMPLATES},
            "prompts/list": {"prompts": PROMPTS},
        }
        if method in results:
            return {"jsonrpc": "2.0", "id": msg.get("id"), "result": results[method]}
        return {"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": -32601, "message": "Method not found"}}

    async def _stream(self):
        yield b"event: endpoint\ndata: /messages?session=abc\n\n"
        for _ in range(10000):
            if self._queue:
                yield f"event: message\ndata: {json.dumps(self._queue.pop(0))}\n\n".encode()
            else:
                await asyncio.sleep(0)

    async def handler(self, request: httpx.Request) -> httpx.Response:
        if self.mode == "down":
            raise httpx.ConnectError("nothing there")
        if self.mode == "gated":
            return httpx.Response(401, text="<html>401 Authorization Required</html>")
        if self.mode == "legacy":
            if request.method == "GET":
                return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=self._stream())
            msg = json.loads(request.content)
            got = self.answer(msg)
            self.calls[-1] = (self.calls[-1][0], dict(request.headers))
            if got is not None:
                self._queue.append(got)
            return httpx.Response(202)
        msg = json.loads(request.content)
        got = self.answer(msg)
        self.calls[-1] = (self.calls[-1][0], dict(request.headers))
        if got is None:
            return httpx.Response(202)
        headers = {"mcp-session-id": "s1"} if msg.get("method") == "initialize" else {}
        if self.mode == "sse-body":
            body = f"event: message\ndata: {json.dumps(got)}\n\n"
            return httpx.Response(200, headers={**headers, "content-type": "text/event-stream"}, text=body)
        return httpx.Response(200, headers=headers, json=got)


def servers(mode: str = "streamable-http", auth: str | None = None) -> dict:
    return {"fake": {"endpoint": "https://fake.example/mcp", "transport": mode, "what": "a fake server", **({"auth": auth} if auth else {})}}


def make(repo: Path, fake: Fake, conf: dict | None = None) -> Namespace:
    return Namespace(repo, fetch=canned_fetch, mcp_servers=conf or servers(), mcp_transport=httpx.MockTransport(fake.handler))


@pytest.mark.parametrize("mode", ["json", "sse-body"])
def test_a_server_reads_as_its_record_and_its_tools_as_things_with_addresses(repo, mode):
    fake = Fake(mode)
    ns = make(repo, fake)
    root, links = read(ns, ROOT)
    assert f"{ROOT}mcp/" in [m["uri"] for m in json.loads(root["text"])["mounts"]]
    assert f"{ROOT}mcp/" in rels(links)["collection"]
    top, links = read(ns, f"{ROOT}mcp/")
    kids = json.loads(top["text"])["children"]
    assert kids == [{"uri": f"{ROOT}mcp/fake/", "name": "fake", "title": "a fake server", "mimeType": tm.MCP_TYPE["server"], "isCollection": True}]
    assert rels(links)["up"] == [ROOT]
    srv, links = read(ns, f"{ROOT}mcp/fake/")
    body = json.loads(srv["text"])
    assert body["status"] == "up" and body["serverInfo"] == {"name": "fake", "version": "1.0"}
    assert body["counts"] == {"tools": 2, "resources": 1, "templates": 1, "prompts": 1, "reads": 0}
    assert body["auth"] == "none" and body["transport"] == "streamable-http" and body["checked"]
    assert [c["uri"] for c in body["children"]] == [f"{ROOT}mcp/fake/tools/", f"{ROOT}mcp/fake/resources/", f"{ROOT}mcp/fake/prompts/"]
    assert rels(links)["up"] == [f"{ROOT}mcp/"]
    assert rels(links)["tm:serves"] == [f"{ROOT}mcp/fake/tools/get_slot", f"{ROOT}mcp/fake/tools/list_kinds"]
    tools, _ = read(ns, f"{ROOT}mcp/fake/tools/")
    kids = json.loads(tools["text"])["children"]
    assert kids[0] == {"uri": f"{ROOT}mcp/fake/tools/get_slot", "name": "get_slot", "title": "One slot", "mimeType": "application/vnd.tm.tool+json", "isCollection": False}
    tool, links = read(ns, f"{ROOT}mcp/fake/tools/get_slot")
    assert tool["mimeType"] == "application/vnd.tm.tool+json"
    body = json.loads(tool["text"])
    assert body["uri"] == f"{ROOT}mcp/fake/tools/get_slot" and body["server"] == f"{ROOT}mcp/fake/" and body["inputSchema"]["required"] == ["kind", "slot_id"]
    r = rels(links)
    assert r["up"] == [f"{ROOT}mcp/fake/tools/"] and r["collection"] == [f"{ROOT}mcp/fake/tools/"]
    assert r["describedby"] == [f"{ROOT}mcp/fake/tools/get_slot?as=stat"]
    assert r["tm:served-by"] == [f"{ROOT}mcp/fake/"]
    assert r["tm:schema"] == [f"{ROOT}mcp/fake/tools/get_slot?pointer=/inputSchema", f"{ROOT}mcp/fake/tools/get_slot?pointer=/outputSchema"]
    # The schema link reads the piece it names, as the crawler will check.
    piece, _ = read(ns, f"{ROOT}mcp/fake/tools/get_slot?pointer=/inputSchema")
    assert json.loads(piece["text"])["required"] == ["kind", "slot_id"] and piece["uri"].endswith("?pointer=/inputSchema")
    # A tool with no output schema carries one schema link.
    _, links = read(ns, f"{ROOT}mcp/fake/tools/list_kinds")
    assert rels(links)["tm:schema"] == [f"{ROOT}mcp/fake/tools/list_kinds?pointer=/inputSchema"]
    # Its stat claims the type its listing did (the crawler holds the two together).
    stat, links = read(ns, f"{ROOT}mcp/fake/tools/get_slot?as=stat")
    st = json.loads(stat["text"])
    assert st["mimeType"] == "application/vnd.tm.tool+json" and st["isCollection"] is False and st["text"] is True and st["size"] > 0
    assert f"{ROOT}mcp/fake/tools/get_slot" in rels(links)["alternate"]
    # Resources and prompts read the same way, as descriptors.
    res, links = read(ns, f"{ROOT}mcp/fake/resources/")
    body = json.loads(res["text"])
    assert body["children"][0]["uri"] == f"{ROOT}mcp/fake/resources/catalog" and body["children"][0]["mimeType"] == "application/vnd.tm.resource+json"
    assert body["templates"] == TEMPLATES
    one, _ = read(ns, f"{ROOT}mcp/fake/resources/catalog")
    assert one["mimeType"] == "application/vnd.tm.resource+json" and json.loads(one["text"])["resource"] == "cb://catalog"
    pr, _ = read(ns, f"{ROOT}mcp/fake/prompts/brief")
    assert pr["mimeType"] == "application/vnd.tm.prompt+json" and json.loads(pr["text"])["arguments"][0]["name"] == "topic"
    # The namespace's own links ride on it too: the whole set is behind ?as=links.
    allof, links = read(ns, f"{ROOT}mcp/fake/tools/get_slot?as=links")
    assert json.loads(allof["text"])["total"] == len(links) == 6


def test_the_older_sse_transport_reads_through_its_endpoint_event(repo):
    fake = Fake("legacy")
    ns = make(repo, fake, servers("sse"))
    srv, _ = read(ns, f"{ROOT}mcp/fake/")
    body = json.loads(srv["text"])
    assert body["status"] == "up" and body["counts"]["tools"] == 2 and body["transport"] == "sse"
    tool, _ = read(ns, f"{ROOT}mcp/fake/tools/list_kinds")
    assert json.loads(tool["text"])["description"] == "Every dex."
    assert [m for m, _ in fake.calls][:2] == ["initialize", "notifications/initialized"]


def test_the_lists_are_asked_for_once_and_kept(repo, monkeypatch):
    fake = Fake()
    ns = make(repo, fake)
    read(ns, f"{ROOT}mcp/fake/")
    read(ns, f"{ROOT}mcp/fake/tools/get_slot")
    read(ns, f"{ROOT}mcp/fake/prompts/")
    methods = [m for m, _ in fake.calls]
    assert methods == ["initialize", "notifications/initialized", "tools/list", "resources/list", "resources/templates/list", "prompts/list"]
    # Past its keep, the server is asked again.
    monkeypatch.setattr(tm, "MCP_TTL_S", 0)
    read(ns, f"{ROOT}mcp/fake/")
    # The session the server gave an id is kept (tinyhelper#6), so the lists
    # are asked for again and initialize is not.
    assert [m for m, _ in fake.calls[6:]] == ["tools/list", "resources/list", "resources/templates/list", "prompts/list"]


def test_a_server_that_declares_no_resources_or_prompts_lists_neither(repo):
    fake = Fake(capabilities={"tools": {}})
    ns = make(repo, fake)
    srv, _ = read(ns, f"{ROOT}mcp/fake/")
    body = json.loads(srv["text"])
    assert [c["name"] for c in body["children"]] == ["tools/"] and body["counts"] == {"tools": 2, "resources": 0, "templates": 0, "prompts": 0, "reads": 0}
    e = refusal(ns, f"{ROOT}mcp/fake/prompts/")
    assert e.reason == "not-found" and "declares no prompts" in e.message and e.data["nearest"] == [f"{ROOT}mcp/fake/"]
    assert [m for m, _ in fake.calls] == ["initialize", "notifications/initialized", "tools/list"]


def test_a_token_comes_from_the_environment_and_never_from_a_reader(repo, monkeypatch):
    fake = Fake()
    monkeypatch.setenv("TM_MCP_FAKE_AUTH", "Bearer not-for-anyone")
    ns = make(repo, fake, servers(auth="TM_MCP_FAKE_AUTH"))
    srv, _ = read(ns, f"{ROOT}mcp/fake/")
    body = json.loads(srv["text"])
    assert body["auth"] == "held by this box" and body["status"] == "up"
    assert all(h.get("authorization") == "Bearer not-for-anyone" for _, h in fake.calls)
    assert "not-for-anyone" not in srv["text"] and "TM_MCP_FAKE_AUTH" not in srv["text"]
    # Named and not held: the record says so, and nothing is sent.
    monkeypatch.delenv("TM_MCP_FAKE_AUTH")
    fake2 = Fake()
    ns2 = make(repo, fake2, servers(auth="TM_MCP_FAKE_AUTH"))
    body = json.loads(read(ns2, f"{ROOT}mcp/fake/")[0]["text"])
    assert body["auth"] == "named, not held by this box"
    assert all("authorization" not in h for _, h in fake2.calls)


def test_a_gated_server_and_an_unreachable_one_read_as_what_they_are(repo):
    ns = make(repo, Fake("gated"))
    srv, links = read(ns, f"{ROOT}mcp/fake/")
    body = json.loads(srv["text"])
    assert body["status"] == "gated" and body["statusCode"] == 401 and body["children"] == [] and "counts" not in body
    assert "tm:serves" not in rels(links)
    e = refusal(ns, f"{ROOT}mcp/fake/tools/")
    assert e.reason == "gated" and e.data["status"] == 401 and e.data["nearest"] == [f"{ROOT}mcp/fake/"]
    e = refusal(ns, f"{ROOT}mcp/fake/tools/get_slot?as=stat")
    assert e.reason == "gated"
    ns = make(repo, Fake("down"))
    body = json.loads(read(ns, f"{ROOT}mcp/fake/")[0]["text"])
    assert body["status"] == "unreachable" and body["reason"] == "ConnectError"
    e = refusal(ns, f"{ROOT}mcp/fake/tools/get_slot")
    assert e.reason == "unreachable" and "fake.example" not in e.message


def test_mcp_refusals_teach(repo):
    ns = make(repo, Fake())
    e = refusal(ns, f"{ROOT}mcp/fakr/")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{ROOT}mcp/fake/"]
    e = refusal(ns, f"{ROOT}mcp/fake")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{ROOT}mcp/fake/"]
    e = refusal(ns, f"{ROOT}mcp/fake/tools/get_slots")
    assert e.reason == "not-found" and e.data["nearest"][0] == f"{ROOT}mcp/fake/tools/get_slot"
    e = refusal(ns, f"{ROOT}mcp/fake/tools/get_slot/")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{ROOT}mcp/fake/tools/get_slot"]
    e = refusal(ns, f"{ROOT}mcp/fake/things/")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{ROOT}mcp/fake/"]
    e = refusal(ns, f"{ROOT}mcp/fake/tools/get_slot?at=main")
    assert e.reason == "bad-facet" and "no past" in e.message
    e = refusal(ns, f"{ROOT}mcp/fake/tools/?as=stat")
    assert e.reason == "bad-facet"
    e = refusal(ns, f"{ROOT}mcp/fake/tools/get_slot?as=raw")
    assert e.reason == "bad-facet" and "stat, links" in e.message
    e = refusal(ns, f"{ROOT}mcp/fake/tools/get_slot?pointer=/nowhere")
    assert e.reason == "not-found" and e.data["at"] == ""


def test_the_grammar_names_the_mount(repo):
    ns = make(repo, Fake())
    tmpl = {t["name"]: t for t in ns.templates()}
    assert tmpl["mcp"]["uriTemplate"] == f"{ROOT}mcp/{{server}}{{/path*}}{{?as,range,lines,pointer,rel,min,cursor}}"
    names = [r["name"] for r in ns.list_resources(None)["resources"]]
    assert "mcp" in names and "mcp/fake/" in names
    done = ns.complete({"ref": {"type": "ref/resource", "uri": tmpl["mcp"]["uriTemplate"]}, "argument": {"name": "server", "value": "f"}})
    assert done["completion"]["values"] == ["fake"]
    done = ns.complete({"ref": {"type": "ref/resource", "uri": tmpl["mcp"]["uriTemplate"]}, "argument": {"name": "path", "value": "t"}, "context": {"arguments": {"server": "fake"}}})
    assert done["completion"]["values"] == ["tools/"]
    read(ns, f"{ROOT}mcp/fake/")
    done = ns.complete({"ref": {"type": "ref/resource", "uri": tmpl["mcp"]["uriTemplate"]}, "argument": {"name": "path", "value": "tools/g"}, "context": {"arguments": {"server": "fake"}}})
    assert done["completion"]["values"] == ["tools/get_slot"]


def test_a_read_on_the_mount_costs_what_a_git_read_does():
    assert mcp_server.cost({"method": "resources/read", "params": {"uri": f"{ROOT}mcp/fake/tools/"}}) == mcp_server.COST_MCP == 2


def test_the_real_configuration_names_public_endpoints_and_no_token():
    conf = json.loads((Path(__file__).resolve().parent / "mcp_servers.json").read_text())
    names = [k for k in conf if not k.startswith("_")]
    assert names == ["campaignbrain", "resume", "terrapulse"]
    for name in names:
        s = conf[name]
        assert s["endpoint"].startswith("https://") and s["transport"] in ("streamable-http", "sse") and s["what"]
        if "auth" in s:
            assert s["auth"].startswith("TM_MCP_") and " " not in s["auth"], "auth names a variable, never holds a value"
