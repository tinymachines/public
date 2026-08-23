"""tinymachines.ai/api: the roof's own API, spoken as REST and as MCP.

    uvicorn app:app --app-dir api --host 127.0.0.1 --port 6510 --root-path /api

What this serves is what the roof knows and the six pieces do not: what they
all are, and which of them are answering right now. It does not run 6502 code.
That is the 6502 API on its own subdomain, which is a piece this one describes.

Two things are deliberate about the shape.

**openapi.json is generated from the models in models.py**, which are the same
objects that validate the requests. There is no hand-written OpenAPI document
and no second schema layer describing what the models already describe, so the
reference cannot drift from the behaviour.

**The reference is held to the app by a test**, not by intention. test_api.py
fails when a route exists that api/README.md does not name, when a field has
no description, and when a route has no summary. That check earns its keep the
day somebody adds a route and forgets the prose, which is the same day the
prose stops being trustworthy.
"""

from __future__ import annotations

import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import fastapi
import pydantic
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.routing import APIRoute

import admin
import db
import mcp_server
import probe as probe_mod
import projects as projects_mod
from models import (
    Health,
    Index,
    Meta,
    Piece,
    PiecesResponse,
    PieceStatus,
    ProjectsResponse,
    StatusResponse,
)
from pieces import BY_KEY, PIECES
from provenance import commit_and_branch
from release import VERSION

STARTED_MONO = time.monotonic()
STARTED_AT = datetime.now(timezone.utc)

_cache = probe_mod.Cache()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Open the database once at startup so a broken schema is a service that
    # fails to start rather than a service that answers /health and 500s on the
    # first administered request. Migrations run here for the same reason: the
    # first request after a deploy should not be the one that pays for them, and
    # a migration that fails should fail where systemd can see it.
    conn = db.connect()
    try:
        minted = admin.bootstrap(conn)
        if minted:
            admin.announce(minted)
    finally:
        conn.close()
    yield
    _cache.clear()


app = FastAPI(
    title="tinymachines.ai",
    # From VERSION, the one file that holds it. It was a literal here and a
    # different literal in web/package.json, and neither was ever incremented.
    version=VERSION,
    description=(
        "The roof over six pieces of transistor-level MOS 6502 work.\n\n"
        "This API describes the pieces and measures which of them are answering. "
        "It does not run 6502 code: that is the 6502 API at "
        "https://6502.tinymachines.ai/api, which is one of the pieces described "
        "here.\n\n"
        "Reachability is probed rather than asserted. `up`, `down` and `unreachable` "
        "are three different answers, and every measurement carries the time it was "
        "taken so a cached reading cannot be mistaken for a fresh one.\n\n"
        "The same surface is spoken as MCP at `/api/mcp`, over the same "
        "implementations."
    ),
    lifespan=lifespan,
    # No Swagger and no ReDoc. Both load their JavaScript from a CDN, and this
    # site's CSP is script-src 'self', so they would render as a blank page
    # with a console error. A blank page that looks like a docs page is worse
    # than no docs page: openapi.json is the artifact, and GET / says so.
    docs_url=None,
    redoc_url=None,
)

# The three live subdomains are separate origins today and move under the apex
# later, so a page on any of them may want to ask this service what is running.
# Nothing here is user state or a credential, so there is nothing for an open
# policy to leak.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "HEAD", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)


class HeadAsGet:
    """Answer HEAD wherever GET is answered.

    FastAPI's @app.get() registers GET alone. Starlette's own Route adds HEAD
    to any GET route; FastAPI's APIRoute does not, so every route here replied
    405 to HEAD. That is the wrong answer twice over: HTTP defines HEAD as GET
    without a body, so a resource that answers GET answers HEAD by definition,
    and a 405 tells a monitor the endpoint is broken rather than that it is
    fine.

    It was found by this project's own prober. probe.py sends HEAD first and
    falls back to GET on 405, which is why /v1/status kept working and why the
    fault stayed invisible until something looked at the header directly.

    Done here rather than by listing methods=["GET", "HEAD"] on six decorators,
    for a documentation reason. Adding HEAD to the decorators puts a HEAD
    operation in openapi.json for every path, which is six entries describing
    something HTTP already guarantees, in a document whose whole claim is that
    every line of it earns its place. This is transport behaviour, so it lives
    in the transport.

    RFC 9110 is explicit that the headers should be the ones GET would send,
    Content-Length included, so the body is dropped and nothing else is
    touched. A client can therefore ask "how big is this" without fetching it.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method") != "HEAD":
            await self.app(scope, receive, send)
            return

        scope = dict(scope, method="GET")

        async def send_without_body(message):
            if message["type"] == "http.response.body":
                # Keep the framing, drop the bytes. more_body is forced off so
                # a streaming response cannot leave the connection waiting for
                # a chunk that will never come.
                await send({"type": "http.response.body", "body": b"", "more_body": False})
                return
            await send(message)

        await self.app(scope, receive, send_without_body)


app.add_middleware(HeadAsGet)

# The administered surface. It lives in its own module because the line between
# "anyone may ask" and "a key may ask" should be visible in the file listing.
app.include_router(admin.router)


def _uptime() -> int:
    return int(time.monotonic() - STARTED_MONO)


def _routes() -> list[str]:
    """Every path the app serves, from the app's own routing table rather than
    from a list somebody maintains beside it."""
    return sorted({r.path for r in app.routes if isinstance(r, APIRoute)} | {"/mcp"})


@app.get(
    "/",
    response_model=Index,
    summary="What this API is, and where the rest of it is",
    description=(
        "The index. It names the generated OpenAPI document, the MCP endpoint and "
        "every path this service serves, and the route list is derived from the app's "
        "own routing table rather than written out here, so it cannot omit a route "
        "that exists."
    ),
)
def index() -> Index:
    return Index(
        service="tinymachines-api",
        describes="The roof over six pieces of 6502 work.",
        openapi="/api/openapi.json",
        mcp="/api/mcp",
        routes=_routes(),
        interactive_docs=None,
    )


@app.get(
    "/health",
    response_model=Health,
    summary="Liveness of this process, and nothing else",
    description=(
        "Whether this process can answer. It deliberately does not probe the six "
        "pieces: a front door that reports itself unhealthy because somebody else's "
        "service is down cannot be used to decide whether to restart the front door. "
        "Use /v1/status to measure the pieces."
    ),
)
def health() -> Health:
    return Health(status="ok", uptime_seconds=_uptime())


@app.get(
    "/v1/meta",
    response_model=Meta,
    summary="What is running, and what it was built from",
    description=(
        "Provenance for the running process: the commit, the branch, how long it has "
        "been up and the versions of the libraries that generated this document. The "
        "commit is read out of .git directly rather than by shelling out to git, "
        "because a service started by systemd inherits a PATH that need not have git "
        "on it. Where it cannot tell, it reports null rather than a fabricated value."
    ),
)
def meta() -> Meta:
    commit, branch = commit_and_branch()
    return Meta(
        service="tinymachines-api",
        version=VERSION,
        commit=commit,
        branch=branch,
        started_at=STARTED_AT,
        uptime_seconds=_uptime(),
        python=".".join(str(n) for n in sys.version_info[:3]),
        fastapi=fastapi.__version__,
        pydantic=pydantic.VERSION,
    )


@app.get(
    "/v1/pieces",
    response_model=PiecesResponse,
    summary="The six pieces",
    description=(
        "Every piece, with what it is, where its source is, how it ships and its "
        "terms. Licensing is two fields rather than one: the code licence and the "
        "terms on the die data are different questions, and NonCommercial and "
        "ShareAlike travel with anything derived from that data. This is a "
        "description, not a measurement; /v1/status is the measurement."
    ),
)
def list_pieces() -> PiecesResponse:
    return PiecesResponse(count=len(PIECES), pieces=PIECES)


@app.get(
    "/v1/pieces/{key}",
    response_model=Piece,
    summary="One piece by key",
    description=(
        "One piece. An unknown key is a 404 naming every valid key, rather than an "
        "empty result that a caller could read as 'this piece exists and is blank'."
    ),
    responses={404: {"description": "No piece with that key. The message lists the valid keys."}},
)
def get_piece(key: str) -> Piece:
    piece = BY_KEY.get(key)
    if piece is None:
        raise HTTPException(
            status_code=404,
            detail=f"no piece named {key!r}. Valid keys: {', '.join(sorted(BY_KEY))}",
        )
    return piece


@app.get(
    "/v1/projects",
    response_model=ProjectsResponse,
    summary="The projects, their surfaces, and how much of the move has happened",
    description=(
        "The structure the site is organised by, which is a different question from "
        "what the pieces are. A piece is a thing that exists; a surface is one "
        "addressable thing a project serves. halfphi is a piece and not a surface, "
        "because it is a library with no address. The documentation tree is a surface "
        "and not a piece, because it is not one of the six.\n\n"
        "Five sites are being brought under one roof, and every surface carries both "
        "addresses: `serves_today`, where it has always answered, and `lands_at`, "
        "where it lands here. Those stay separate on purpose. A surface that has "
        "moved still answers at the old address, so collapsing the two would make "
        "the API unable to say where a reader should be sent.\n\n"
        "`lands_at_settled` is false while the path is a proposal. A public path that "
        "moves becomes a redirect map, and a proposal written as a fact reads as "
        "decided the next time somebody looks.\n\n"
        "The counts are derived from the surfaces rather than tracked beside them, so "
        "they cannot disagree with the list they describe."
    ),
)
def list_projects() -> ProjectsResponse:
    return ProjectsResponse(
        measured_on=projects_mod.MEASURED_ON,
        count=len(projects_mod.PROJECTS),
        surfaces=len(projects_mod.SURFACES),
        arrived=len(projects_mod.ARRIVED),
        projects=projects_mod.PROJECTS,
    )


@app.get(
    "/v1/status",
    response_model=StatusResponse,
    summary="Which pieces are answering, measured now",
    description=(
        "Probes every piece that has a public surface and reports what came back. "
        "This is a measurement rather than a claim: nothing here reads a file that "
        "says a service is up.\n\n"
        "`up` means a response arrived with a status below 400. `down` means one "
        "arrived and it was 400 or worse, so the host is answering and the "
        "application is not. `unreachable` means nothing arrived at all, and carries "
        "the reason. `not_probed` means the piece has no public surface, and the "
        "piece's `not_hosted_because` says why; those are reported rather than "
        "counted as failures.\n\n"
        "Results are cached briefly and every one carries `checked_at`, so a stale "
        "reading cannot be mistaken for a fresh one. The cache also means reloading "
        "this endpoint is not a way to generate traffic against the subdomains."
    ),
)
async def status() -> StatusResponse:
    measured = await probe_mod.probe_all(PIECES, _cache)
    probed = [m for m in measured if m.reachability != "not_probed"]
    return StatusResponse(
        checked_at=min(m.checked_at for m in measured),
        cache_seconds=probe_mod.CACHE_S,
        up=sum(1 for m in probed if m.reachability == "up"),
        probed=len(probed),
        total=len(measured),
        pieces=measured,
    )


# --------------------------------------------------------------------------
# MCP: the same implementations, spoken to a language model.
#
# Each tool below calls the same function the REST route calls. A tool that
# computed its own answer would be a second surface pretending to be one.
# --------------------------------------------------------------------------


async def _mcp_overview(_: dict) -> dict:
    s = await status()
    by_key = {m.key: m for m in s.pieces}
    return {
        "what": "tinymachines.ai: the roof over six pieces of transistor-level 6502 work.",
        "checked_at": s.checked_at,
        "up": s.up,
        "probed": s.probed,
        "total": s.total,
        "pieces": [
            {**p.model_dump(), "status": by_key[p.key].model_dump(exclude={"key"})}
            for p in PIECES
        ],
    }


async def _mcp_piece(args: dict) -> dict:
    key = args.get("key")
    if not isinstance(key, str) or key not in BY_KEY:
        raise mcp_server.RpcError(
            mcp_server.BAD_PARAMS,
            f"no piece named {key!r}. Valid keys: {', '.join(sorted(BY_KEY))}",
        )
    measured = await probe_mod.probe_all([BY_KEY[key]], _cache)
    return {**BY_KEY[key].model_dump(), "status": measured[0].model_dump(exclude={"key"})}


def _mcp_licensing(_: dict) -> dict:
    """Assembled from the pieces rather than retyped, so it cannot disagree
    with what /v1/pieces reports."""
    return {
        "summary": "Our code is ours. The die data is not, and its terms travel with it.",
        "code": "MIT",
        "die_data": "CC BY-NC-SA 3.0, Greg James / visual6502.org",
        "what_the_terms_reach": [
            "the netlist and every artefact built from it",
            "the explorer, the atlas, the schematic and every measured table",
            "the API's responses, which are the chip's own state",
            "Die Runner and every cartridge, because a cartridge is a program "
            "running on a chip built from that data",
        ],
        "the_clean_piece": "halfphi parses and solves switch networks and names no "
                           "chip. It embeds no die data, which is the only reason it "
                           "can be MIT. Adding die data to it would undo that.",
        "coins": "Coins are never sold, they are given away. Decided 2026-08-22. They "
                 "are a quota and an anti-abuse budget, so NonCommercial is not "
                 "engaged. Anything that would put a price on a coin reopens a closed "
                 "question, and reopens it as a conversation with the rightsholder.",
        "per_piece": [
            {"key": p.key, "code_licence": p.code_licence, "data_terms": p.data_terms}
            for p in PIECES
        ],
        "read_before_publishing": "NOTICE.md in the repository.",
    }


_MCP = mcp_server.make_handler({
    "overview": _mcp_overview,
    "piece": _mcp_piece,
    "licensing": _mcp_licensing,
})


@app.post("/mcp", include_in_schema=False)
async def mcp_endpoint(request: Request):
    """Streamable HTTP, no session, no SSE. One POST in, one JSON body out."""
    try:
        payload = await request.json()
    except Exception as e:  # noqa: BLE001
        return JSONResponse(
            mcp_server.error_body(None, mcp_server.RpcError(mcp_server.PARSE, str(e))),
            status_code=400,
        )

    batch = isinstance(payload, list)
    messages = payload if batch else [payload]
    if batch and not messages:
        return JSONResponse(
            mcp_server.error_body(None, mcp_server.RpcError(mcp_server.INVALID_REQ, "empty batch")),
            status_code=400,
        )

    out = []
    for msg in messages:
        mid = msg.get("id") if isinstance(msg, dict) else None
        try:
            res = await _MCP(msg)
        except mcp_server.RpcError as e:
            res = mcp_server.error_body(mid, e)
        except Exception as e:  # noqa: BLE001
            res = mcp_server.error_body(mid, mcp_server.RpcError(mcp_server.INTERNAL, str(e)))
        if res is not None:
            out.append(res)

    # Every message was a notification: the spec wants 202 and no body.
    if not out:
        return Response(status_code=202)
    return JSONResponse(out if batch else out[0])


@app.get("/mcp", include_in_schema=False)
def mcp_no_stream() -> Response:
    """GET is where a client opens an SSE stream. This server has no server-initiated
    messages to send, so it says so rather than holding a connection open that will
    never carry anything."""
    return JSONResponse(
        {"error": "This MCP endpoint is POST only. It has no server-initiated "
                  "messages, so there is no stream to open."},
        status_code=405,
        headers={"Allow": "POST"},
    )
