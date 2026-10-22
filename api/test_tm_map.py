"""tm://, a server's map (tinyhelper#6, spec section 13.1): what makes an MCP
server's data addressable.

The index driver in tinyhelper derives a map from a server's own schemas and
writes it under notes/maps/<server>.json; a hand-written override beside it
corrects one entry at a time. Here the mount reads the two: mcp/<server>/map
is the merged map with each entry's confidence, and every path a map names
reads by calling the tool it names, typed by the kind the map gives it,
linked as the map says, with the server's provenance carried untouched.
Every test runs against the fake server of test_tm_mcp with tools/call added.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import httpx

import tm
from tm import ROOT, Namespace

from test_tm import canned_fetch, read, refusal, rels, repo, run  # noqa: F401  (repo is the fixture)
from test_tm_mcp import TOOLS, Fake, servers


MAP_TOOLS = TOOLS + [
    {"name": "describe_kind", "description": "One dex.", "inputSchema": {"type": "object", "properties": {"kind": {"type": "string"}}, "required": ["kind"]},
     "outputSchema": {"title": "DexKind", "type": "object"}},
    {"name": "search_slots", "description": "Slots of a dex.",
     "inputSchema": {"type": "object", "properties": {"kind": {"type": "string"}, "limit": {"type": "integer"}, "offset": {"type": "integer"}, "mag": {"type": "number"}}, "required": ["kind"]}},
    {"name": "graph_node", "description": "One node.", "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]},
     "outputSchema": {"title": "GraphNode", "type": "object"}},
    {"name": "lab_file", "description": "One file.", "inputSchema": {"type": "object", "properties": {"ws": {"type": "string"}, "file": {"type": "string"}}, "required": ["ws", "file"]}},
    {"name": "plain", "description": "Answers in words.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "wrapped", "description": "Wraps its answer.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "graph_list", "description": "The nodes.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "wrapped_one", "description": "Wraps one.", "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}},
    {"name": "mint", "description": "Mints a thing.", "inputSchema": {"type": "object", "properties": {"body": {"type": "object"}}}},
]
MAP_TOOLS[0] = {**TOOLS[0], "inputSchema": {"type": "object", "properties": {"kind": {"type": "string"}, "slot_id": {"type": "integer"}}, "required": ["kind", "slot_id"]}}

SLOTS = {("earthquake", 7): {"slot_id": 7, "kind": "earthquake", "mag": 5.1, "sources": ["USGS"], "licence_basis": "public domain"},
         ("earthquake", 8): {"slot_id": 8, "kind": "earthquake", "mag": 6.0, "sources": ["USGS"], "licence_basis": "public domain"},
         ("tornado", 1): {"slot_id": 1, "kind": "tornado", "ef": 3}}
PDF = b"%PDF-1.4 fake"


class Mapped(Fake):
    """The fake server with tools/call: a small dex, a graph, a lab file."""

    def __init__(self, mode: str = "json"):
        super().__init__(mode, {"tools": {}})
        self.called: list[tuple[str, dict]] = []
        self.session = "s1"       # the id initialize hands out; a post with another is 404
        self.throttle = 0         # how many posts answer 429 before the server relents
        self.retry_after: int | None = 1

    async def handler(self, request: httpx.Request) -> httpx.Response:
        if self.mode == "json" and request.method == "POST":
            if self.throttle > 0:
                self.throttle -= 1
                return httpx.Response(429, headers={"retry-after": str(self.retry_after)} if self.retry_after else {}, text="<html>429</html>")
            sid = request.headers.get("mcp-session-id")
            if sid and sid != self.session:
                return httpx.Response(404, text="unknown session")
            msg = json.loads(request.content)
            got = self.answer(msg)
            self.calls[-1] = (self.calls[-1][0], dict(request.headers))
            if got is None:
                return httpx.Response(202)
            headers = {"mcp-session-id": self.session} if msg.get("method") == "initialize" else {}
            return httpx.Response(200, headers=headers, json=got)
        return await super().handler(request)

    def answer(self, msg: dict) -> dict | None:
        method = msg.get("method", "")
        if method == "tools/list":
            self.calls.append((method, {}))
            return {"jsonrpc": "2.0", "id": msg.get("id"), "result": {"tools": MAP_TOOLS}}
        if method != "tools/call":
            return super().answer(msg)
        self.calls.append((method, {}))
        name, args = msg["params"]["name"], msg["params"].get("arguments") or {}
        self.called.append((name, args))
        result = self.call(name, args)
        return {"jsonrpc": "2.0", "id": msg.get("id"), "result": result}

    @staticmethod
    def structured(data) -> dict:
        return {"content": [{"type": "text", "text": json.dumps(data)}], "structuredContent": data}

    def call(self, name: str, args: dict) -> dict:
        if name == "list_kinds":
            return self.structured({"kinds": [{"name": "earthquake", "title": "Earthquakes"}, {"name": "tornado", "title": "Tornadoes"}], "sources": ["many"]})
        if name == "describe_kind":
            if args["kind"] not in ("earthquake", "tornado"):
                return {"content": [{"type": "text", "text": f"no dex named {args['kind']}"}], "isError": True}
            return self.structured({"kind": args["kind"], "columns": ["mag"], "sources": ["USGS"], "licence_basis": "public domain"})
        if name == "search_slots":
            found = [s for (k, _), s in sorted(SLOTS.items()) if k == args.get("kind", k) and s.get("mag", 0) >= args.get("mag", 0)]
            return self.structured({"total": len(found), "offset": args.get("offset", 0), "limit": args.get("limit", 50), "slots": found})
        if name == "get_slot":
            s = SLOTS.get((args["kind"], args["slot_id"]))
            if not s:
                return {"content": [{"type": "text", "text": f"no slot {args['slot_id']} in {args['kind']}"}], "isError": True}
            return self.structured(s)
        if name == "graph_node":
            more = [f"n{i}" for i in range(4, 10)] if args["id"] == "n1" else []
            return self.structured({"id": args["id"], "label": f"node {args['id']}", "links": [{"neighbour": {"id": "n2", "label": "second"}, "rel": "cites"}, "n3"] + more})
        if name == "graph_list":
            return self.structured({"nodes": [{"id": "n1", "label": "first"}]})
        if name == "wrapped":
            return self.structured({"result": json.dumps({"total": 2, "results": [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}]})})
        if name == "wrapped_one":
            return self.structured({"result": json.dumps({"id": args["id"], "name": args["id"].upper(), "sources": ["x"]})})
        if name == "lab_file":
            return {"content": [{"type": "resource", "resource": {"uri": f"lab://{args['ws']}/{args['file']}", "mimeType": "application/pdf", "blob": base64.b64encode(PDF).decode()}}]}
        if name == "plain":
            return {"content": [{"type": "text", "text": "just words"}]}
        return {"content": [{"type": "text", "text": "unknown tool"}], "isError": True}


MAP = {
    "server": "fake",
    "derived": "2026-10-22T18:00:00+00:00",
    "from": ["tools/list"],
    "reads": {
        "dex/": {"tool": "list_kinds", "items": "kinds", "key": "name"},
        "dex/{kind}": {"tool": "describe_kind", "kind": "vnd.tm.dex-kind+json; kind={kind}"},
        "dex/{kind}/": {"tool": "search_slots", "query": ["offset", "limit", "mag"], "items": "slots", "key": "slot_id"},
        "dex/{kind}/{slot_id}": {"tool": "get_slot", "kind": "vnd.tm.slot+json; kind={kind}", "links": {"describedby": "dex/{kind}"}},
        "graph/": {"tool": "graph_list", "items": "nodes", "key": "id"},
        "graph/{id}": {"tool": "graph_node", "kind": "vnd.tm.node+json", "edges": "links"},
        "lab/{ws}/{file}": {"tool": "lab_file", "kind": "from-result"},
        "words": {"tool": "plain"},
        "any/": {"tool": "search_slots", "query": ["*"], "items": "slots"},
        "wrapped/": {"tool": "wrapped", "items": "results", "key": "id"},
        "wrapped/{id}": {"tool": "wrapped_one", "kind": "vnd.tm.thing+json"},
        "tools/{x}": {"tool": "get_slot"},
    },
    "undecided": {"mint": "its name is a side-effect verb, so it stays a tool", "get_slots": "takes a list of ids, so it is a batch and not one address"},
}
OVERRIDE = {"server": "fake", "_": "the graph node's kind was right; the edges field was guessed and is confirmed",
            "reads": {"graph/{id}": {"tool": "graph_node", "kind": "vnd.tm.node+json", "edges": "links"}, "words": None}}


def write_map(repo: Path, derived: dict | None = MAP, override: dict | None = OVERRIDE) -> None:
    d = repo / "notes" / "maps"
    d.mkdir(exist_ok=True)
    for f in d.glob("fake*.json"):
        f.unlink()
    if derived is not None:
        (d / "fake.json").write_text(json.dumps(derived, indent=1))
    if override is not None:
        (d / "fake.override.json").write_text(json.dumps(override, indent=1))


def make(repo: Path, fake: Mapped | None = None, **kw) -> tuple[Namespace, Mapped]:
    fake = fake or Mapped()
    return Namespace(repo, fetch=canned_fetch, mcp_servers=servers(), mcp_transport=httpx.MockTransport(fake.handler), **kw), fake


def body_of(ns: Namespace, uri: str) -> tuple[dict, list[dict], dict]:
    c, links = read(ns, uri)
    return json.loads(c["text"]), links, c


def test_the_map_reads_as_its_merged_entries_each_with_its_confidence(repo):
    write_map(repo)
    ns, fake = make(repo)
    body, links, c = body_of(ns, f"{ROOT}mcp/fake/map")
    assert c["mimeType"] == tm.T_MAP == "application/vnd.tm.map+json"
    assert body["uri"] == f"{ROOT}mcp/fake/map" and body["server"] == f"{ROOT}mcp/fake/" and body["derived"] == MAP["derived"] and body["from"] == ["tools/list"]
    assert body["source"] == f"{ROOT}fs/notes/maps/fake.json" and body["override"] == f"{ROOT}fs/notes/maps/fake.override.json"
    reads = body["reads"]
    # The derived file's entries read inferred, the override's exact, and a
    # null in the override removes an entry.
    assert reads["dex/{kind}/{slot_id}"]["confidence"] == "inferred" and reads["dex/{kind}/{slot_id}"]["tool"] == "get_slot"
    assert reads["graph/{id}"]["confidence"] == "exact"
    assert "words" not in reads
    assert reads["dex/{kind}/{slot_id}"]["uri"] == f"{ROOT}mcp/fake/dex/{{kind}}/{{slot_id}}"
    # A map may not claim the mount's own paths; the entry is dropped and said.
    assert "tools/{x}" not in reads and body["ignored"] == {"tools/{x}": "tools/, resources/, prompts/ and map are the mount's own paths"}
    assert body["undecided"] == MAP["undecided"]
    assert body["counts"] == {"reads": 10, "exact": 1, "inferred": 9, "undecided": 2}
    r = rels(links)
    assert r["up"] == [f"{ROOT}mcp/fake/"] and r["describedby"] == [f"{ROOT}mcp/fake/map?as=stat"]
    assert r["tm:data"] == [f"{ROOT}fs/notes/maps/fake.json", f"{ROOT}fs/notes/maps/fake.override.json"]
    assert all(ln["confidence"] == "exact" and ln["type"] == tm.T_RECORD for ln in links if ln["rel"] == "tm:data")
    # The files say back what reads them, so the pair holds.
    _, back = read(ns, f"{ROOT}fs/notes/maps/fake.json")
    assert rels(back)["tm:read-by"] == [f"{ROOT}mcp/fake/map"]
    _, back = read(ns, f"{ROOT}fs/notes/maps/fake.override.json")
    assert rels(back)["tm:read-by"] == [f"{ROOT}mcp/fake/map"]
    # Reading the map costs the server nothing: the map is two files.
    assert not fake.called
    # Its stat claims the type.
    st, links = read(ns, f"{ROOT}mcp/fake/map?as=stat")
    assert json.loads(st["text"])["mimeType"] == tm.T_MAP and f"{ROOT}mcp/fake/map" in rels(links)["alternate"]


def test_a_map_without_an_override_and_a_server_without_a_map(repo):
    write_map(repo, override=None)
    ns, _ = make(repo)
    body, links, _ = body_of(ns, f"{ROOT}mcp/fake/map")
    assert body["override"] is None and "graph/{id}" in body["reads"] and body["reads"]["graph/{id}"]["confidence"] == "inferred" and "words" in body["reads"]
    assert rels(links)["tm:data"] == [f"{ROOT}fs/notes/maps/fake.json"]
    write_map(repo, derived=None, override=None)
    ns, _ = make(repo)
    e = refusal(ns, f"{ROOT}mcp/fake/map")
    assert e.reason == "not-found" and "no map is derived for fake yet" in e.message and e.data["nearest"] == [f"{ROOT}mcp/fake/"]
    srv, _, _ = body_of(ns, f"{ROOT}mcp/fake/")
    assert srv["map"] is None and [c["name"] for c in srv["children"]] == ["tools/"]
    e = refusal(ns, f"{ROOT}mcp/fake/dex/earthquake/7")
    assert e.reason == "not-found" and "no map is derived for fake" in e.message


def test_the_server_record_lists_its_map_and_the_roots_the_map_names(repo):
    write_map(repo)
    ns, _ = make(repo)
    srv, links, _ = body_of(ns, f"{ROOT}mcp/fake/")
    assert srv["map"] == f"{ROOT}mcp/fake/map" and srv["counts"]["reads"] == 10
    kids = {c["name"]: c for c in srv["children"]}
    assert kids["map"] == {"uri": f"{ROOT}mcp/fake/map", "name": "map", "mimeType": tm.T_MAP, "isCollection": False}
    assert kids["dex/"] == {"uri": f"{ROOT}mcp/fake/dex/", "name": "dex/", "mimeType": tm.T_LISTING, "isCollection": True}
    assert kids["any/"]["isCollection"] is True
    # A root with braces is not a child: there is nothing to list without an argument.
    assert "lab/" not in kids and not any("{" in k for k in kids)
    assert list(kids) == ["tools/", "map", "any/", "dex/", "graph/", "wrapped/"]


def test_a_mapped_thing_reads_its_tool_typed_linked_and_with_provenance(repo):
    write_map(repo)
    ns, fake = make(repo)
    r = run(ns.read(f"{ROOT}mcp/fake/dex/earthquake/7"))
    c, links = r["contents"][0], r["_meta"][tm.META_LINKS]
    assert c["uri"] == f"{ROOT}mcp/fake/dex/earthquake/7"
    assert c["mimeType"] == "application/vnd.tm.slot+json; kind=earthquake"
    assert json.loads(c["text"]) == SLOTS[("earthquake", 7)]
    # The path's segments are the tool's arguments, coerced by its schema.
    assert fake.called == [("get_slot", {"kind": "earthquake", "slot_id": 7})]
    rl = rels(links)
    assert rl["up"] == [f"{ROOT}mcp/fake/dex/earthquake/"] and rl["collection"] == [f"{ROOT}mcp/fake/dex/earthquake/"]
    assert rl["describedby"] == [f"{ROOT}mcp/fake/dex/earthquake", f"{ROOT}mcp/fake/dex/earthquake/7?as=stat"]
    assert rl["tm:read-with"] == [f"{ROOT}mcp/fake/tools/get_slot"]
    by_href = {ln["href"]: ln for ln in links}
    assert by_href[f"{ROOT}mcp/fake/tools/get_slot"]["confidence"] == "inferred" and by_href[f"{ROOT}mcp/fake/tools/get_slot"]["type"] == tm.MCP_TYPE["tool"]
    assert by_href[f"{ROOT}mcp/fake/dex/earthquake"]["type"] == "application/vnd.tm.dex-kind+json; kind=earthquake"
    assert by_href[f"{ROOT}mcp/fake/dex/earthquake/"]["type"] == tm.T_LISTING
    # Provenance rides in _meta untouched, and the map's entry says how sure.
    assert r["_meta"][tm.META_PROVENANCE] == {"sources": ["USGS"], "licence_basis": "public domain"}
    assert r["_meta"][tm.META_MAP] == {"map": f"{ROOT}mcp/fake/map", "entry": "dex/{kind}/{slot_id}", "tool": "get_slot", "confidence": "inferred"}
    # The stat claims the same type, and its links are the thing's.
    st, links = read(ns, f"{ROOT}mcp/fake/dex/earthquake/7?as=stat")
    s = json.loads(st["text"])
    assert s["mimeType"] == "application/vnd.tm.slot+json; kind=earthquake" and s["isCollection"] is False and s["text"] is True
    assert rels(links)["tm:read-with"] == [f"{ROOT}mcp/fake/tools/get_slot"]
    # A piece reads as a piece.
    piece, _ = read(ns, f"{ROOT}mcp/fake/dex/earthquake/7?pointer=/mag")
    assert json.loads(piece["text"]) == 5.1
    # The server's error is a refusal with its words and the collection above.
    e = refusal(ns, f"{ROOT}mcp/fake/dex/earthquake/9")
    assert e.reason == "not-found" and "no slot 9 in earthquake" in e.message and e.data["nearest"] == [f"{ROOT}mcp/fake/dex/earthquake/"]
    # An argument the schema types is refused before the server is asked.
    e = refusal(ns, f"{ROOT}mcp/fake/dex/earthquake/seven")
    assert e.reason == "not-found" and "slot_id" in e.message and "integer" in e.message
    assert ("get_slot", {"kind": "earthquake", "slot_id": "seven"}) not in fake.called
    # One answer is kept a while: the thing and its stat cost one call.
    assert sum(1 for n, a in fake.called if a == {"kind": "earthquake", "slot_id": 7}) == 1


def test_a_mapped_collection_lists_its_items_and_passes_its_own_query(repo, monkeypatch):
    write_map(repo)
    ns, fake = make(repo)
    body, links, c = body_of(ns, f"{ROOT}mcp/fake/dex/earthquake/")
    assert c["mimeType"] == tm.T_LISTING and body["uri"] == f"{ROOT}mcp/fake/dex/earthquake/"
    assert body["total"] == 2 and body["result"]["slots"][0]["slot_id"] == 7
    assert body["children"] == [
        {"uri": f"{ROOT}mcp/fake/dex/earthquake/7", "name": "7", "mimeType": "application/vnd.tm.slot+json; kind=earthquake", "isCollection": False},
        {"uri": f"{ROOT}mcp/fake/dex/earthquake/8", "name": "8", "mimeType": "application/vnd.tm.slot+json; kind=earthquake", "isCollection": False}]
    assert fake.called[-1] == ("search_slots", {"kind": "earthquake"})
    rl = rels(links)
    assert rl["up"] == [f"{ROOT}mcp/fake/dex/"] and rl["describedby"] == [f"{ROOT}mcp/fake/dex/earthquake"] and rl["tm:read-with"] == [f"{ROOT}mcp/fake/tools/search_slots"]
    # A query name the entry lists goes to the tool, coerced; the echo carries it.
    body, _, c = body_of(ns, f"{ROOT}mcp/fake/dex/earthquake/?mag=5.5&limit=10")
    assert fake.called[-1] == ("search_slots", {"kind": "earthquake", "mag": 5.5, "limit": 10})
    assert c["uri"] == body["uri"] == f"{ROOT}mcp/fake/dex/earthquake/?limit=10&mag=5.5"
    assert [k["name"] for k in body["children"]] == ["8"] and body["query"] == {"limit": 10, "mag": 5.5}
    # One it does not list is refused, naming the ones it takes.
    e = refusal(ns, f"{ROOT}mcp/fake/dex/earthquake/?depth=3")
    assert e.reason == "bad-facet" and "depth" in e.message and "limit, mag, offset" in e.message
    # The mount's own parameters are never passed through, and at= has no past here.
    e = refusal(ns, f"{ROOT}mcp/fake/dex/earthquake/?at=HEAD")
    assert e.reason == "bad-facet" and "no past" in e.message
    # A collection whose query is * passes any filter through.
    body, _, _ = body_of(ns, f"{ROOT}mcp/fake/any/?kind=tornado&ef=3")
    assert fake.called[-1] == ("search_slots", {"kind": "tornado", "ef": "3"})
    # No deeper template: the items are listed as the body's result, children empty.
    assert body["children"] == [] and body["result"]["slots"][0]["kind"] == "tornado"
    # The root lists the kinds as collections, since a collection one deeper exists.
    body, links, _ = body_of(ns, f"{ROOT}mcp/fake/dex/")
    assert body["children"] == [
        {"uri": f"{ROOT}mcp/fake/dex/earthquake/", "name": "earthquake", "title": "Earthquakes", "mimeType": tm.T_LISTING, "isCollection": True},
        {"uri": f"{ROOT}mcp/fake/dex/tornado/", "name": "tornado", "title": "Tornadoes", "mimeType": tm.T_LISTING, "isCollection": True}]
    assert rels(links)["up"] == [f"{ROOT}mcp/fake/"]
    # And the kind's record is a thing of its own, up to the root.
    body, links, c = body_of(ns, f"{ROOT}mcp/fake/dex/tornado")
    assert c["mimeType"] == "application/vnd.tm.dex-kind+json; kind=tornado" and body["columns"] == ["mag"]
    assert rels(links)["up"] == [f"{ROOT}mcp/fake/dex/"]
    # A cursor pages the children the tool returned, the query riding along.
    monkeypatch.setattr(tm, "LIST_CAP", 1)
    body, _, _ = body_of(ns, f"{ROOT}mcp/fake/dex/earthquake/")
    assert [k["name"] for k in body["children"]] == ["7"] and body["next"].startswith(f"{ROOT}mcp/fake/dex/earthquake/?cursor=")
    body, _, _ = body_of(ns, body["next"])
    assert [k["name"] for k in body["children"]] == ["8"] and "next" not in body


def test_edges_lift_into_related_links_and_from_result_keeps_the_servers_type(repo):
    write_map(repo)
    ns, _ = make(repo)
    body, links, c = body_of(ns, f"{ROOT}mcp/fake/graph/n1")
    assert c["mimeType"] == "application/vnd.tm.node+json" and body["label"] == "node n1"
    related = [ln for ln in links if ln["rel"] == "related"]
    assert [ln["href"] for ln in related][:2] == [f"{ROOT}mcp/fake/graph/n2", f"{ROOT}mcp/fake/graph/n3"] and len(related) == 8
    assert related[0]["title"] == "second" and all(ln["type"] == "application/vnd.tm.node+json" for ln in related)
    assert rels(links)["up"] == [f"{ROOT}mcp/fake/graph/"]
    # The override made this entry exact, and the read says so.
    assert run(ns.read(f"{ROOT}mcp/fake/graph/n1"))["_meta"][tm.META_MAP]["confidence"] == "exact"
    # from-result: the server's own type, bytes and all.
    r = run(ns.read(f"{ROOT}mcp/fake/lab/ws1/paper.pdf"))
    c = r["contents"][0]
    assert c["mimeType"] == "application/pdf" and base64.b64decode(c["blob"]) == PDF and "text" not in c
    st, _ = read(ns, f"{ROOT}mcp/fake/lab/ws1/paper.pdf?as=stat")
    assert json.loads(st["text"])["mimeType"] == "application/pdf" and json.loads(st["text"])["text"] is False
    # A link to a from-result address carries no type: the address does not say.
    assert ns.target_type(f"{ROOT}mcp/fake/lab/ws1/paper.pdf") is None
    # A text answer with no structure and no kind is kept as words.
    write_map(repo, override=None)
    ns, _ = make(repo)
    c, _ = read(ns, f"{ROOT}mcp/fake/words")
    assert c["mimeType"] == "text/plain" and c["text"] == "just words"


def test_an_answer_wrapped_as_a_result_string_is_unwrapped(repo):
    """A server built on a framework that wraps a tool's return as
    {"result": <value>}, the value a JSON string, still lists and still reads:
    the wrapper is the transport's, not the thing's."""
    write_map(repo)
    ns, _ = make(repo)
    body, _, c = body_of(ns, f"{ROOT}mcp/fake/wrapped/")
    assert c["mimeType"] == tm.T_LISTING and body["total"] == 2
    assert [k["uri"] for k in body["children"]] == [f"{ROOT}mcp/fake/wrapped/a", f"{ROOT}mcp/fake/wrapped/b"]
    assert body["children"][0]["mimeType"] == "application/vnd.tm.thing+json" and body["result"]["results"][1]["name"] == "B"
    r = run(ns.read(f"{ROOT}mcp/fake/wrapped/a"))
    c = r["contents"][0]
    assert c["mimeType"] == "application/vnd.tm.thing+json" and json.loads(c["text"]) == {"id": "a", "name": "A", "sources": ["x"]}
    assert r["_meta"][tm.META_PROVENANCE] == {"sources": ["x"]}


def test_one_session_a_server_is_kept_and_reopened_when_the_server_forgets_it(repo):
    """A tool call costs one POST, not three: the session the server gave an
    id is kept across calls, and across the lists. When the server no longer
    knows it (404), one more is opened and the read goes through."""
    write_map(repo)
    ns, fake = make(repo)
    read(ns, f"{ROOT}mcp/fake/dex/earthquake/7")
    read(ns, f"{ROOT}mcp/fake/dex/earthquake/8")
    read(ns, f"{ROOT}mcp/fake/graph/n1")
    methods = [m for m, _ in fake.calls]
    assert methods.count("initialize") == 1 and methods.count("tools/call") == 3
    assert all(h.get("mcp-session-id") == "s1" for m, h in fake.calls if m == "tools/call")
    # The server restarts and forgets the session: the next read reopens one, once, and reads.
    fake.session = "s2"
    c, _ = read(ns, f"{ROOT}mcp/fake/dex/tornado/1")
    assert json.loads(c["text"])["ef"] == 3
    methods = [m for m, _ in fake.calls]
    assert methods.count("initialize") == 2 and fake.calls[-1][1].get("mcp-session-id") == "s2"
    # A gated or silent server drops the session, so a server that comes back is met afresh.
    assert "fake" in ns.mcp._sessions


def test_a_server_that_answers_429_reads_as_throttled_with_its_retry_after(repo):
    write_map(repo)
    ns, fake = make(repo)
    read(ns, f"{ROOT}mcp/fake/")
    fake.throttle = 1
    e = refusal(ns, f"{ROOT}mcp/fake/dex/earthquake/7")
    assert e.reason == "throttled" and e.data["status"] == 429 and e.data["retryAfter"] == 1 and "429" in e.message
    assert e.data["nearest"] == [f"{ROOT}mcp/fake/"]
    # The server relents: the same read goes through, and the session was reopened.
    c, _ = read(ns, f"{ROOT}mcp/fake/dex/earthquake/7")
    assert json.loads(c["text"])["slot_id"] == 7
    # A 429 while listing: the record says so and is asked again when the server said to, not a minute later.
    ns, fake = make(repo)
    fake.throttle = 1
    fake.retry_after = 2
    body, _, _ = body_of(ns, f"{ROOT}mcp/fake/")
    assert body["status"] == "unreachable" and body["statusCode"] == 429 and "rate-limiting" in body["reason"]
    snap = ns.mcp._snap["fake"]
    import time
    assert 0 < (snap["at"] + tm.MCP_RETRY_S) - time.monotonic() <= 2.5


def test_unmapped_paths_refuse_naming_the_map(repo):
    write_map(repo)
    ns, _ = make(repo)
    e = refusal(ns, f"{ROOT}mcp/fake/dex/earthquake/7/more")
    assert e.reason == "not-found" and "the map" in e.message and e.data["nearest"] == [f"{ROOT}mcp/fake/map"]
    e = refusal(ns, f"{ROOT}mcp/fake/dex")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{ROOT}mcp/fake/dex/"]
    e = refusal(ns, f"{ROOT}mcp/fake/graph/n1/")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{ROOT}mcp/fake/graph/n1"]
    e = refusal(ns, f"{ROOT}mcp/fake/map/")
    assert e.reason == "not-found" and e.data["nearest"] == [f"{ROOT}mcp/fake/map"]
    e = refusal(ns, f"{ROOT}mcp/fake/dex/earthquake/7?as=tree")
    assert e.reason == "bad-facet"


def test_the_address_says_the_type_and_the_registry_knows_a_mapped_kind(repo):
    write_map(repo)
    ns, _ = make(repo)
    assert ns.target_type(f"{ROOT}mcp/fake/map") == tm.T_MAP
    assert ns.target_type(f"{ROOT}mcp/fake/dex/") == tm.T_LISTING
    assert ns.target_type(f"{ROOT}mcp/fake/dex/earthquake/7") == "application/vnd.tm.slot+json; kind=earthquake"
    assert ns.target_type(f"{ROOT}mcp/fake/dex/earthquake") == "application/vnd.tm.dex-kind+json; kind=earthquake"
    assert ns.target_type(f"{ROOT}mcp/fake/words") is None, "the override removed it"
    assert ns.target_type(f"{ROOT}mcp/fake/nowhere/x") is None
    write_map(repo, override=None)
    assert ns.target_type(f"{ROOT}mcp/fake/words") == tm.T_RECORD
    write_map(repo)
    assert tm.kind_of("application/vnd.tm.slot+json; kind=earthquake") == "slot"
    # The vocabulary grows by what the maps name, each pointing at the schema the server published.
    vocab = ns.vocabulary()
    assert "slot" in vocab and "node" in vocab and "dex-kind" in vocab and "map" in vocab and "fake" in vocab["slot"]
    read(ns, f"{ROOT}mcp/fake/dex/earthquake/7")
    body, links, _ = body_of(ns, f"{ROOT}kinds/slot")
    assert body["served"] == 1 and body["mediaTypes"] == {"application/vnd.tm.slot+json; kind=earthquake": 1}
    assert body["schema"] == f"{ROOT}mcp/fake/tools/get_slot?pointer=/outputSchema"
    assert f"{ROOT}mcp/fake/tools/get_slot?pointer=/outputSchema" in rels(links)["describedby"]
    kinds, _, _ = body_of(ns, f"{ROOT}kinds/")
    assert {c["name"]: c["title"] for c in kinds["children"]}["slot"] == vocab["slot"]
    # A tool with no output schema gives its kind no schema address.
    read(ns, f"{ROOT}mcp/fake/dex/earthquake/")
    assert "schema" not in body_of(ns, f"{ROOT}kinds/listing")[0]


def test_completions_and_a_changed_map_file_are_seen_without_a_restart(repo):
    write_map(repo)
    ns, _ = make(repo)
    read(ns, f"{ROOT}mcp/fake/")
    assert ns.mcp.complete("fake", "") == ["tools/", "map", "any/", "dex/", "graph/", "wrapped/"] + [f"tools/{t['name']}" for t in MAP_TOOLS]
    assert ns.mcp.complete("fake", "ma") == ["map"]
    body, _, _ = body_of(ns, f"{ROOT}mcp/fake/map")
    assert "graph/{id}" in body["reads"]
    changed = {**MAP, "reads": {k: v for k, v in MAP["reads"].items() if k != "graph/{id}"}}
    import os, time
    write_map(repo, derived=changed)
    later = time.time() + 5
    os.utime(repo / "notes" / "maps" / "fake.json", (later, later))
    body, _, _ = body_of(ns, f"{ROOT}mcp/fake/map")
    # The override still names graph/{id}, so it stays, as exact.
    assert body["reads"]["graph/{id}"]["confidence"] == "exact" and "words" not in body["reads"]
    write_map(repo, derived=changed, override=None)
    body, _, _ = body_of(ns, f"{ROOT}mcp/fake/map")
    assert "graph/{id}" not in body["reads"] and body["override"] is None


def test_a_gated_or_silent_server_refuses_a_mapped_read_with_its_word(repo):
    write_map(repo)
    ns, _ = make(repo, Mapped("gated"))
    e = refusal(ns, f"{ROOT}mcp/fake/dex/earthquake/7")
    assert e.reason == "gated"
    # The map itself still reads: it is two files.
    body, _, _ = body_of(ns, f"{ROOT}mcp/fake/map")
    assert body["counts"]["reads"] == 10
    ns, _ = make(repo, Mapped("down"))
    assert refusal(ns, f"{ROOT}mcp/fake/dex/").reason == "unreachable"


def test_the_crawler_samples_the_mapped_reads_and_is_red_when_a_map_names_a_tool_the_server_lacks(repo, capsys, monkeypatch):
    from test_tm import _crawler
    crawler = _crawler()
    (repo / "notes" / "escape.md").unlink()
    write_map(repo)

    last_called: list = []

    def crawl() -> tuple[int, str]:
        ns, fake = make(repo, git_repos={}, sites=tm.SITES[:1])
        rc = run(crawler.crawl(4000, repo, ns))
        last_called[:] = fake.called
        return rc, capsys.readouterr().out + "\ncalled: " + " ".join(sorted({n for n, _ in fake.called}))

    rc, out = crawl()
    assert rc == 0, out
    mapped = int(out.split(" mapped reads")[0].rsplit(" ", 1)[1])
    # A server that answers 429 twice during the walk is waited for, not failed on.
    monkeypatch.setattr(crawler, "MCP_PACE_S", 0)
    ns2, fake2 = make(repo, git_repos={}, sites=tm.SITES[:1])
    read(ns2, f"{ROOT}mcp/fake/")
    fake2.throttle = 2
    fake2.retry_after = None
    rc2 = run(crawler.crawl(4000, repo, ns2))
    out2 = capsys.readouterr().out
    assert rc2 == 0 and "waited" in out2, out2
    assert mapped >= 8, out
    assert "the mapped collections were sampled" in out
    # The walk reached the dex, a kind's collection and a slot, each through its tool.
    assert "called: describe_kind get_slot graph_list graph_node list_kinds search_slots wrapped wrapped_one" in out
    # A node carries 8 related links to other nodes; the walk follows the
    # sample of them and no more, or it would walk a server's whole graph live.
    nodes = sorted(a["id"] for n, a in last_called if n == "graph_node")
    assert nodes == ["n1", "n2", "n3", "n4"], nodes
    # A map whose tool the server does not list: the reads under it do not resolve.
    broken = json.loads(json.dumps(MAP))
    broken["reads"]["dex/{kind}/{slot_id}"]["tool"] = "fetch_slot"
    write_map(repo, derived=broken)
    rc, out = crawl()
    assert rc == 1 and f"{ROOT}mcp/fake/dex/earthquake/7 (from {ROOT}mcp/fake/dex/earthquake/) does not resolve: not-found" in out, out
    assert "get_slot" not in out.split("called:")[1]
    # A map present and no mapped read made is not a pass: with the roots
    # gone from the server's record, the walk reaches the map and nothing under it.
    write_map(repo)
    monkeypatch.setattr(tm.Map, "roots", lambda self: [])
    rc, out = crawl()
    assert rc == 1 and "no mapped read was made" in out and " 0 mapped reads" in out, out
