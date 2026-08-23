"""The API's tests, and the ones that hold the document to the app.

The doc-maxxing checks are the point of this file. "Every field described" is
an intention until something fails when a field is not, so the checks that
earn their keep here are the ones that go red the day somebody adds a route
and forgets the prose. That is the same day the prose stops being trustworthy.

Nothing here touches the network. `probe_all` takes its prober, so the
reachability logic is measured against a stub: a suite that needs the internet
fails for reasons that have nothing to do with the code, and then gets ignored.

    python3 -m pytest api/ -q
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

import mcp_server
import probe as probe_mod
from app import app
from models import Piece
from pieces import BY_KEY, PIECES

HERE = Path(__file__).resolve().parent
REPO = HERE.parent


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clear_cache():
    """Probe results are cached in a module-level object, so one test's
    measurement would otherwise be another test's answer."""
    from app import _cache
    _cache.clear()
    yield
    _cache.clear()


# ---------------------------------------------------------------------------
# The document is held to the app.
# ---------------------------------------------------------------------------


def served_paths() -> list[str]:
    return [r.path for r in app.routes if isinstance(r, APIRoute)]


def test_every_route_is_named_in_the_readme():
    """A route that exists and is not documented is the omission this check
    exists for. The 6502 service's equivalent has caught real ones twice."""
    readme = (HERE / "README.md").read_text()
    paths = served_paths()
    assert paths, "no routes found; this check would pass on nothing"
    for path in paths:
        # A path converter is framework detail, not API surface: {key:path}
        # would be documenting FastAPI to a reader.
        shown = re.sub(r"\{(\w+):\w+\}", r"{\1}", path)
        assert shown in readme, f"api/README.md does not mention the route {shown}"


def test_every_model_field_has_a_description():
    """Doc-maxxing, made checkable. A field with no description generates an
    OpenAPI property with no description, and the reference is then decorative
    for that field."""
    import models as models_mod
    from pydantic import BaseModel

    # Ours only. FastAPI generates HTTPValidationError and ValidationError
    # itself and they carry no descriptions; failing on those would mean
    # either editing the framework or adding an exclusion list that the next
    # undocumented field could hide behind. Naming the models this repository
    # owns cannot widen by accident.
    ours = {
        n for n, v in vars(models_mod).items()
        if isinstance(v, type) and issubclass(v, BaseModel) and v is not BaseModel
    }
    assert len(ours) >= 7, f"only found {len(ours)} models; this check would pass on nothing"

    schemas = app.openapi()["components"]["schemas"]
    assert schemas, "no schemas; this check would pass on nothing"
    assert ours <= set(schemas), f"models missing from the document: {sorted(ours - set(schemas))}"

    missing = []
    for name in sorted(ours):
        schema = schemas[name]
        for field, spec in (schema.get("properties") or {}).items():
            # anyOf covers Optional[...]: the description sits on the parent.
            if not spec.get("description") and not spec.get("allOf"):
                missing.append(f"{name}.{field}")
    assert not missing, f"fields with no description: {missing}"


def test_every_route_has_a_summary_and_a_description():
    doc = app.openapi()
    assert doc["paths"], "no paths; this check would pass on nothing"
    for path, methods in doc["paths"].items():
        for verb, spec in methods.items():
            assert spec.get("summary"), f"{verb.upper()} {path} has no summary"
            assert spec.get("description"), f"{verb.upper()} {path} has no description"


def test_the_index_lists_every_route_it_serves():
    """The index derives its route list from the app rather than repeating it,
    so this checks the derivation rather than a hand-written list."""
    with TestClient(app) as c:
        listed = set(c.get("/").json()["routes"])
    assert set(served_paths()) <= listed
    assert "/mcp" in listed, "the MCP endpoint is excluded from the schema but is still a route"


def test_no_em_dashes_in_anything_shipped():
    """House style. The document is shipped text as much as a page is."""
    import json
    doc = json.dumps(app.openapi())
    assert "\u2014" not in doc, "an em dash reached the OpenAPI document"
    # Globbed rather than listed. The list used to be seven filenames typed
    # out here, which is the ten-drifted-nav-lists problem in miniature: four
    # modules were added for the administered surface and none of them were
    # covered, because a hand-written list of files to check looks exactly the
    # same whether or not it names every file. This one cannot miss a new
    # module, and it names this file too, which is why the two assertions above
    # look for the character in a way that does not contain it.
    checked = sorted(HERE.glob("*.py")) + sorted(HERE.glob("*.md"))
    assert len(checked) >= 8, f"only {len(checked)} files found; this would pass on nothing"
    for f in checked:
        assert "\u2014" not in f.read_text(), f"em dash in api/{f.name}"


# ---------------------------------------------------------------------------
# The pieces, and the prose about them.
# ---------------------------------------------------------------------------


def test_a_broken_pieces_file_fails_loudly():
    """The data moved out to JSON, so the failure mode moved with it. A record
    missing a field must stop the import rather than serve a piece with a hole
    in it, and the message must name the file: a Pydantic traceback pointing at
    models.py sends the reader to the wrong place when the fault is in the
    data."""
    import json
    from pydantic import ValidationError
    from models import Piece

    good = json.loads((REPO / "data" / "pieces.json").read_text())
    assert len(good) == 6, "the fixture for this check is the real file"

    broken = [dict(good[0])]
    del broken[0]["code_licence"]
    with pytest.raises(ValidationError):
        Piece(**broken[0])


def test_pieces_and_the_prose_agree():
    """pieces.py is the one copy of this fact. The prose in notes/inventory.md
    and the links in docs/index.md describe the same six, and a seventh added
    in one place only is what this catches."""
    inventory = (REPO / "notes" / "inventory.md").read_text()
    assert len(PIECES) == 6, f"{len(PIECES)} pieces; the prose everywhere says six"
    for p in PIECES:
        # The display name, not the key: the key is ours and the prose is the
        # owner's, so matching on the key would be checking nothing.
        stem = p.name.replace("the ", "").split(":")[0].strip()
        assert stem.lower() in inventory.lower(), (
            f"notes/inventory.md does not mention {stem!r}. Either the piece is new "
            f"and the survey was not updated, or the name drifted."
        )


def test_a_piece_without_a_url_says_why():
    """Null is a real answer here. Null with no reason reads as an oversight,
    so the pair is held together rather than left to a convention."""
    for p in PIECES:
        if p.public_url is None:
            assert p.not_hosted_because, f"{p.key} has no public_url and no reason"
        else:
            assert not p.not_hosted_because, f"{p.key} has a public_url and a reason not to"


def test_licence_fields_are_not_collapsed():
    """The code licence and the die data terms are different questions. A piece
    that claims MIT with no data terms is the sentence NOTICE.md exists to
    prevent."""
    for p in PIECES:
        assert p.code_licence, f"{p.key} has no code licence"
        assert p.data_terms, f"{p.key} has no data terms"
    clean = [p for p in PIECES if "no die data" in p.data_terms]
    assert [p.key for p in clean] == ["halfphi"], (
        "halfphi is meant to be the only piece embedding no die data. If that "
        "changed, NOTICE.md changed too."
    )


# ---------------------------------------------------------------------------
# Routes.
# ---------------------------------------------------------------------------


def test_head_is_answered_wherever_get_is(client):
    """HTTP defines HEAD as GET without a body, so a resource that answers GET
    answers HEAD. Every route here replied 405 until the transport did that,
    and a 405 tells a monitor the endpoint is broken rather than that it is
    fine.

    Found by this project's own prober: probe.py sends HEAD first and falls
    back to GET on 405, which is exactly why it kept working and the fault
    stayed invisible."""
    paths = [p for p in served_paths() if p != "/v1/pieces/{key}"]
    paths.append("/v1/pieces/chip-api")
    assert len(paths) >= 5, "not enough routes; this check would pass on nothing"

    for path in paths:
        got = client.get(path)
        head = client.head(path)
        assert head.status_code == got.status_code, (
            f"HEAD {path} answered {head.status_code}, GET answered {got.status_code}"
        )
        assert head.content == b"", f"HEAD {path} returned a body"


def test_head_keeps_the_headers_get_would_send(client):
    """RFC 9110: the headers should be the ones GET would send, Content-Length
    included, so a client can ask how big something is without fetching it.
    Dropping the body while keeping the framing is the whole trick, and getting
    it wrong the other way (dropping Content-Length too) would make HEAD
    useless for the one thing it is for."""
    got, head = client.get("/v1/pieces"), client.head("/v1/pieces")
    assert head.headers.get("content-type") == got.headers.get("content-type")
    assert head.headers.get("content-length") == got.headers.get("content-length")
    assert int(head.headers["content-length"]) > 0
    assert head.content == b""


def test_head_on_a_post_only_route_still_refuses(client):
    """/mcp is POST. Its GET says so with an Allow header, and HEAD gets the
    same refusal rather than being quietly accepted: answering HEAD everywhere
    would be a different bug from the one being fixed."""
    got, head = client.get("/mcp"), client.head("/mcp")
    assert got.status_code == 405 and head.status_code == 405
    assert head.headers.get("allow") == "POST"


def test_health_reports_only_itself(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["uptime_seconds"] >= 0


def test_meta_reports_the_real_commit(client):
    """Provenance that is not the running tree's provenance is worse than
    none, so this is checked against git rather than against itself."""
    import subprocess
    body = client.get("/v1/meta").json()
    try:
        real = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        pytest.skip("git is not available to check against")
    if real.returncode != 0:
        pytest.skip("not a git checkout")
    assert body["commit"] == real.stdout.strip()


def test_pieces_counts_rather_than_states(client):
    body = client.get("/v1/pieces").json()
    assert body["count"] == len(body["pieces"]) == 6


def test_an_unknown_piece_is_refused_with_the_valid_keys(client):
    r = client.get("/v1/pieces/nope")
    assert r.status_code == 404
    detail = r.json()["detail"]
    for key in BY_KEY:
        assert key in detail, "the refusal should name every valid key"


def test_a_known_piece_comes_back_whole(client):
    body = client.get("/v1/pieces/chip-api").json()
    assert body["key"] == "chip-api"
    assert set(body) == set(Piece.model_fields)


# ---------------------------------------------------------------------------
# Reachability, measured against a stub rather than the internet.
# ---------------------------------------------------------------------------


def run(coro):
    return asyncio.get_event_loop_policy().new_event_loop().run_until_complete(coro)


def stub(mapping: dict[str, probe_mod.Probe]):
    async def prober(url: str) -> probe_mod.Probe:
        return mapping[url]
    return prober


def test_the_three_reachability_answers_are_distinct():
    """up, down and unreachable are three different findings. Folding the last
    two together would report a dead host and a broken app as the same thing."""
    up, down, gone = PIECES[1], PIECES[2], PIECES[3]
    mapping = {
        up.public_url: probe_mod.Probe(200, 12, None),
        down.public_url: probe_mod.Probe(502, 8, None),
        gone.public_url: probe_mod.Probe(None, None, "ConnectError: refused"),
    }
    out = run(probe_mod.probe_all([up, down, gone], probe_mod.Cache(), stub(mapping)))
    got = {m.key: m.reachability for m in out}
    assert got == {up.key: "up", down.key: "down", gone.key: "unreachable"}
    unreachable = next(m for m in out if m.reachability == "unreachable")
    assert unreachable.detail, "an unreachable probe must carry its reason"
    assert unreachable.http_status is None and unreachable.latency_ms is None


def test_a_piece_with_no_url_is_reported_not_counted():
    """Silently omitting the unhosted pieces would make the totals lie about
    how many pieces there are."""
    out = run(probe_mod.probe_all(PIECES, probe_mod.Cache(), stub({
        p.public_url: probe_mod.Probe(200, 5, None) for p in PIECES if p.public_url
    })))
    assert len(out) == len(PIECES)
    not_probed = [m for m in out if m.reachability == "not_probed"]
    assert {m.key for m in not_probed} == {p.key for p in PIECES if p.public_url is None}
    for m in not_probed:
        assert m.url is None and m.http_status is None


def test_the_cache_stops_a_second_probe():
    """Without this, reloading a status page is a way to generate traffic
    against the three live subdomains from anyone who finds it."""
    calls = {"n": 0}
    piece = PIECES[1]

    async def counting(url: str) -> probe_mod.Probe:
        calls["n"] += 1
        return probe_mod.Probe(200, 5, None)

    cache = probe_mod.Cache(ttl=60)
    run(probe_mod.probe_all([piece], cache, counting))
    run(probe_mod.probe_all([piece], cache, counting))
    assert calls["n"] == 1, "the second call should have been served from the cache"

    # And the cache must actually expire, or a status endpoint becomes a
    # snapshot that never updates.
    expired = probe_mod.Cache(ttl=-1)
    run(probe_mod.probe_all([piece], expired, counting))
    run(probe_mod.probe_all([piece], expired, counting))
    assert calls["n"] == 3


def test_status_totals_are_derived_from_the_measurements(client):
    body = client.get("/v1/status").json()
    assert body["total"] == len(PIECES)
    assert body["probed"] == sum(1 for p in PIECES if p.public_url)
    assert body["up"] <= body["probed"]
    assert len(body["pieces"]) == body["total"]
    assert body["cache_seconds"] == probe_mod.CACHE_S


# ---------------------------------------------------------------------------
# MCP: the same surface, not a second one.
# ---------------------------------------------------------------------------


def rpc(client, method, params=None, mid=1):
    body = {"jsonrpc": "2.0", "id": mid, "method": method}
    if params is not None:
        body["params"] = params
    return client.post("/mcp", json=body)


def test_initialize_echoes_a_supported_version(client):
    r = rpc(client, "initialize", {"protocolVersion": "2025-03-26"})
    result = r.json()["result"]
    assert result["protocolVersion"] == "2025-03-26"
    assert result["serverInfo"]["name"] == "tinymachines"
    assert result["instructions"]


def test_an_unknown_protocol_version_gets_the_newest(client):
    result = rpc(client, "initialize", {"protocolVersion": "1999-01-01"}).json()["result"]
    assert result["protocolVersion"] == mcp_server.LATEST


def test_every_advertised_tool_is_implemented(client):
    """make_handler asserts this at import, both ways. This checks the list a
    client actually sees."""
    tools = rpc(client, "tools/list").json()["result"]["tools"]
    assert {t["name"] for t in tools} == {"overview", "piece", "licensing"}
    for t in tools:
        assert t["description"], f"tool {t['name']} has no description"
        assert t["inputSchema"]["type"] == "object"


def test_overview_agrees_with_the_rest_routes(client):
    """The tools call the same implementations. A tool that computed its own
    answer would be a second surface pretending to be one."""
    import json
    result = rpc(client, "tools/call", {"name": "overview", "arguments": {}}).json()["result"]
    assert result["isError"] is False
    body = json.loads(result["content"][0]["text"])
    assert body["total"] == client.get("/v1/pieces").json()["count"]
    assert {p["key"] for p in body["pieces"]} == set(BY_KEY)
    for p in body["pieces"]:
        assert "status" in p, "overview should carry the measurement, not just the description"


def test_an_unknown_piece_is_refused_not_guessed(client):
    r = rpc(client, "tools/call", {"name": "piece", "arguments": {"key": "nope"}})
    body = r.json()
    # A refusal the model can read and retry, rather than a protocol error.
    assert "error" in body or body["result"]["isError"] is True
    text = body.get("error", {}).get("message") or body["result"]["content"][0]["text"]
    assert "chip-api" in text, "the refusal should name the valid keys"


def test_an_unknown_tool_is_refused(client):
    body = rpc(client, "tools/call", {"name": "nope", "arguments": {}}).json()
    assert body["error"]["code"] == mcp_server.BAD_PARAMS


def test_an_unknown_method_is_refused(client):
    body = rpc(client, "does/not/exist").json()
    assert body["error"]["code"] == mcp_server.NO_METHOD


def test_a_notification_gets_no_body(client):
    r = client.post("/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"})
    assert r.status_code == 202
    assert not r.content


def test_a_batch_comes_back_as_a_batch(client):
    r = client.post("/mcp", json=[
        {"jsonrpc": "2.0", "id": 1, "method": "ping"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ])
    body = r.json()
    assert isinstance(body, list) and len(body) == 2
    assert [m["id"] for m in body] == [1, 2]


def test_get_on_mcp_says_there_is_no_stream(client):
    r = client.get("/mcp")
    assert r.status_code == 405
    assert r.headers["allow"] == "POST"


def test_licensing_does_not_disagree_with_the_pieces(client):
    """Assembled from pieces.py rather than retyped, so this checks the
    assembly rather than two hand-written lists."""
    import json
    result = rpc(client, "tools/call", {"name": "licensing", "arguments": {}}).json()["result"]
    body = json.loads(result["content"][0]["text"])
    per = {e["key"]: e for e in body["per_piece"]}
    assert set(per) == set(BY_KEY)
    for key, piece in BY_KEY.items():
        assert per[key]["code_licence"] == piece.code_licence
        assert per[key]["data_terms"] == piece.data_terms
    assert "never sold" in body["coins"]


# ---------------------------------------------------------------------------
# Projects, and the two directions between them and the pieces.
# ---------------------------------------------------------------------------


def test_pieces_and_projects_agree_in_both_directions():
    """One copy of the fact, held to by a check rather than by care.

    Both directions, because either alone is easy to satisfy while the other
    quietly breaks: a piece filed under a project nobody defined, and a project
    claiming a surface whose piece was renamed. The second is the one that
    actually happens, because a surface is edited in data/projects.json and the
    piece it names lives in a different file.
    """
    import json

    manifest = json.loads((REPO / "data" / "projects.json").read_text())
    project_keys = {p["key"] for p in manifest["projects"]}
    assert len(project_keys) >= 2, "not enough projects; this check would pass on nothing"

    for piece in PIECES:
        if piece.project is not None:
            assert piece.project in project_keys, (
                f"piece {piece.key!r} names project {piece.project!r}, which "
                f"data/projects.json does not define. Valid: {sorted(project_keys)}"
            )

    surfaces = [(p["key"], s) for p in manifest["projects"] for s in p["surfaces"]]
    assert surfaces, "no surfaces; this check would pass on nothing"
    for project_key, surface in surfaces:
        named = surface["piece"]
        if named is None:
            continue
        assert named in BY_KEY, (
            f"project {project_key!r} surface {surface['key']!r} names piece "
            f"{named!r}, which data/pieces.json does not define. "
            f"Valid: {', '.join(sorted(BY_KEY))}"
        )
        assert BY_KEY[named].project == project_key, (
            f"project {project_key!r} claims piece {named!r}, but that piece says "
            f"it belongs to {BY_KEY[named].project!r}."
        )


def test_every_project_with_a_silo_has_one_on_disk():
    """A silo named in the manifest and absent from the tree is a project that
    renders as the house palette while the manifest says it has an identity."""
    import json

    manifest = json.loads((REPO / "data" / "projects.json").read_text())
    named = [(p["key"], p["silo"]) for p in manifest["projects"] if p["silo"]]
    assert named, "no project declares a silo; this check would pass on nothing"
    for key, silo in named:
        assert (REPO / silo).is_file(), f"project {key!r} names {silo}, which does not exist"


def test_the_version_is_the_file_and_nothing_else():
    """One number, one home.

    It was a literal in a decorator and a different literal in package.json,
    neither incremented, and both wrong in different directions. This fails if
    a copy comes back: the API's declared version, the version it reports, and
    web/package.json all have to be what VERSION says.
    """
    import json

    declared = (REPO / "VERSION").read_text().strip()
    assert re.fullmatch(r"\d+\.\d+\.\d+", declared), (
        f"VERSION is {declared!r}, which is not a semver. scripts/deploy.sh "
        "increments it and parses it back."
    )

    doc = app.openapi()
    assert doc["info"]["version"] == declared, (
        f"openapi.json declares {doc['info']['version']}, VERSION says {declared}"
    )

    pkg = json.loads((REPO / "web" / "package.json").read_text())
    assert pkg["version"] == declared, (
        f"web/package.json says {pkg['version']}, VERSION says {declared}. "
        "scripts/deploy.sh writes both; if they differ, something else edited one."
    )


def test_meta_reports_the_version(client):
    body = client.get("/v1/meta").json()
    assert body["version"] == (REPO / "VERSION").read_text().strip()
