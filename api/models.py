"""The models. They validate the requests and they generate the document.

There is no second schema layer here describing what these already describe,
and there is no hand-written OpenAPI file. `openapi.json` is derived from this
module, which is the one thing that makes the reference incapable of drifting
from the behaviour: they are the same object.

"Doc-maxxed" is meant as something checkable rather than as an intention.
`test_api.py` fails when a field has no description, when a route has no
summary, and when a path exists that the README does not name. Those checks
are here on day one rather than added after the first thing goes undocumented,
because the 6502 service's equivalent has already caught real omissions twice.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Piece(BaseModel):
    """One of the six things this site is a roof over."""

    key: str = Field(
        description="Stable identifier, used in the URL and in MCP tool arguments. "
                    "Chosen to survive renaming: the display name may change, this "
                    "does not.",
        examples=["chip-api"],
    )
    name: str = Field(
        description="What the piece is called in prose.",
        examples=["the 6502 API"],
    )
    what: str = Field(
        description="What it does, in the words `notes/inventory.md` uses. Kept to a "
                    "few sentences: the documentation tree is where the long form "
                    "lives.",
    )
    source: str = Field(
        description="Where the source is, as a URL. Every piece is public.",
        examples=["https://github.com/tinymachines/6502"],
    )
    ships_as: str = Field(
        description="How it reaches a user: a crate, a static bundle, a uvicorn "
                    "process. Recorded because 'where is the source' and 'what runs' "
                    "are different questions and only one of them is a repository.",
        examples=["uvicorn, with --root-path /api behind nginx"],
    )
    code_licence: str = Field(
        description="The licence on the code we wrote.",
        examples=["MIT"],
    )
    data_terms: str = Field(
        description="The terms on the die data the piece embeds, which are NOT the "
                    "code licence and do not follow from it. NonCommercial and "
                    "ShareAlike travel with anything derived from the visual6502 die "
                    "data. Split from code_licence on purpose: collapsing the two "
                    "into one 'licence' field is what produces the sentence 'halfphi "
                    "is MIT, so the netlist is fine'. See NOTICE.md.",
        examples=["CC BY-NC-SA 3.0, derived from visual6502 die data"],
    )
    public_url: Optional[str] = Field(
        default=None,
        description="Where it answers on the public internet, or null when it does "
                    "not have a surface of its own. Null is a real answer here, not a "
                    "missing value, and `not_hosted_because` says which.",
        examples=["https://6502.tinymachines.ai/api"],
    )
    not_hosted_because: Optional[str] = Field(
        default=None,
        description="Why there is no public_url. Present exactly when public_url is "
                    "null. A piece with no URL and no reason would read as an "
                    "oversight, so the reason is required rather than optional in "
                    "practice, and a test holds the pair together.",
    )


Reachability = Literal["up", "down", "unreachable", "not_probed"]


class PieceStatus(BaseModel):
    """What was measured about one piece, and when.

    This is a measurement rather than a claim. The server probes the URL; it
    does not read a config file that says the service is up. That distinction
    is the registry's rule applied here: the thing that publishes must not be
    the thing that claims.
    """

    key: str = Field(description="The piece this is about.", examples=["explorer"])
    url: Optional[str] = Field(
        default=None,
        description="The URL that was probed, or null when nothing was.",
        examples=["https://6502.tinymachines.ai"],
    )
    reachability: Reachability = Field(
        description="`up` means an HTTP response arrived and its status was below 400. "
                    "`down` means a response arrived and it was 400 or worse: the host "
                    "is answering and the application is not. `unreachable` means no "
                    "response arrived at all, which is a different failure and is "
                    "reported as a different word rather than folded into `down`. "
                    "`not_probed` means this piece has no public surface, and "
                    "`Piece.not_hosted_because` says why.",
        examples=["up"],
    )
    http_status: Optional[int] = Field(
        default=None,
        description="The status code, when one arrived. Null when nothing did.",
        examples=[200],
    )
    latency_ms: Optional[int] = Field(
        default=None,
        description="Round trip in milliseconds, measured around the request. Null "
                    "when no response arrived. This is one sample from this host, not "
                    "a service level: treat it as a smoke test, not a metric.",
        examples=[42],
    )
    detail: Optional[str] = Field(
        default=None,
        description="Why the probe failed, in the words the client library used. "
                    "Present only for `unreachable`. A refusal carries its reason "
                    "rather than being flattened to false.",
        examples=["timed out after 4.0s"],
    )
    checked_at: datetime = Field(
        description="When this measurement was taken, UTC. Results are cached, so this "
                    "can be older than the request that returned it. It is included "
                    "precisely so a stale reading cannot be mistaken for a fresh one.",
    )


class StatusResponse(BaseModel):
    """Every piece, measured."""

    checked_at: datetime = Field(
        description="The oldest measurement in this response. The whole set is no "
                    "fresher than this.",
    )
    cache_seconds: int = Field(
        description="How long a probe result is reused before the URL is asked again. "
                    "Bounded so that reloading this endpoint cannot be used to "
                    "generate traffic against the subdomains.",
        examples=[30],
    )
    up: int = Field(description="How many pieces answered with a status below 400.", examples=[3])
    probed: int = Field(
        description="How many pieces were probed at all. The difference between this "
                    "and the total is the pieces with no public surface, which are "
                    "reported rather than counted as failures.",
        examples=[4],
    )
    total: int = Field(description="How many pieces there are.", examples=[6])
    pieces: list[PieceStatus] = Field(description="One measurement per piece, in the order the pieces are listed.")


class PiecesResponse(BaseModel):
    """The six pieces."""

    count: int = Field(description="How many pieces, counted rather than stated.", examples=[6])
    pieces: list[Piece] = Field(description="Every piece. There is no paging: the list is six long.")


class Meta(BaseModel):
    """What is running, and what it was built from.

    Every field here is read off the running process or the checked-out tree.
    Nothing is typed into a constant that a later commit would leave behind.
    """

    service: str = Field(description="The name of this service.", examples=["tinymachines-api"])
    commit: Optional[str] = Field(
        default=None,
        description="The git commit this process was started from, read out of .git "
                    "rather than by shelling out, because a deploy runs under "
                    "systemd's PATH and cannot assume git is on it. Null when the "
                    "tree is not a git checkout, which is honest rather than a "
                    "fabricated 'unknown'.",
        examples=["07e0bb2f0c5f4a1b9d3e2c7a8b6f0d1e2a3b4c5d"],
    )
    branch: Optional[str] = Field(
        default=None,
        description="The branch, when HEAD points at one. Null on a detached HEAD.",
        examples=["main"],
    )
    started_at: datetime = Field(description="When this process started, UTC.")
    uptime_seconds: int = Field(description="How long it has been up.", examples=[3600])
    python: str = Field(description="The interpreter running it.", examples=["3.10.12"])
    fastapi: str = Field(description="The FastAPI version that generated the document you are reading.", examples=["0.121.2"])
    pydantic: str = Field(description="The Pydantic version that validates the requests.", examples=["2.11.7"])


class Health(BaseModel):
    """Liveness, and nothing more.

    It deliberately reports only what this process can answer for. It does not
    probe the subdomains, because a front door that calls itself unhealthy
    when somebody else's service is down cannot be used to decide whether to
    restart the front door. `/v1/status` is where the other pieces are
    measured.
    """

    status: Literal["ok"] = Field(
        description="`ok` is the only value. There is no degraded state, because this "
                    "process has no dependency to be degraded by: if it can answer, "
                    "it is up, and if it cannot, nothing answers at all.",
        examples=["ok"],
    )
    uptime_seconds: int = Field(description="How long this process has been up.", examples=[3600])


class Index(BaseModel):
    """What this API is and where the rest of it is."""

    service: str = Field(description="The name of this service.", examples=["tinymachines-api"])
    describes: str = Field(
        description="One line on what the API is for.",
        examples=["The roof over six pieces of 6502 work."],
    )
    openapi: str = Field(
        description="Where the generated OpenAPI document is. It is generated from the "
                    "Pydantic models that validate the requests, so it cannot drift "
                    "from the behaviour.",
        examples=["/api/openapi.json"],
    )
    mcp: str = Field(
        description="The MCP endpoint. The same surface, spoken to a language model "
                    "instead of to a program.",
        examples=["/api/mcp"],
    )
    routes: list[str] = Field(description="Every path this service serves, derived from the app's own routing table.")
    interactive_docs: Optional[str] = Field(
        default=None,
        description="Where a browsable UI would be, or null. It is null: the usual "
                    "Swagger and ReDoc pages load their JavaScript from a CDN, and "
                    "this site's Content-Security-Policy is script-src 'self'. They "
                    "would render as a blank page with a console error, which is a "
                    "worse answer than saying there is not one.",
    )
