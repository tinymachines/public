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

from pydantic import BaseModel, ConfigDict, Field


class Piece(BaseModel):
    """One of the six things this site is a roof over."""

    key: str = Field(
        description="Stable identifier, used in the URL and in MCP tool arguments. "
                    "Chosen to survive renaming: the display name may change, this "
                    "does not.",
        examples=["chip-api"],
    )
    project: Optional[str] = Field(
        default=None,
        description="Which project this piece belongs to, as a key in "
                    "data/projects.json, or null when it belongs to none of them. "
                    "Null is a real answer rather than a missing one: halfphi names no "
                    "chip and loads the 6502, the 6800 and the Z80 through identical "
                    "calls, so filing it under one project would describe a dependency "
                    "as an owner. A test holds both directions, so a piece cannot name "
                    "a project that does not exist and a project cannot claim a piece "
                    "that does not.",
        examples=["6502"],
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
    version: str = Field(
        description="The deployed version, from the repository's VERSION file. It "
                    "counts changes that were deployed rather than releases planned "
                    "in advance: the patch digit moves on every deploy carrying a "
                    "change, and scripts/deploy.sh is the only thing that moves it. "
                    "It does not replace `commit`, which says exactly what is running "
                    "and is what a bug report needs; this is what a person can say "
                    "out loud.",
        examples=["1.0.0"],
    )
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


# ---------------------------------------------------------------------------
# Administration: dev keys and the people they belong to.
#
# These are the first models in this file that describe something STORED. Every
# model above is derived from pieces.py or measured at request time, which is
# why the service could be restarted at any moment and why a copy of it was
# worth nothing. From here down there is a SQLite file behind the shape.
#
# One field is deliberately absent from every model here, and its absence is
# the design: there is no field anywhere that carries a key's secret, except
# `MintedKey.key`, which exists for exactly one response and is documented as
# such. A "show me the key" route cannot be added without changing a model,
# which is the point of putting the boundary in the schema rather than in a
# convention.
# ---------------------------------------------------------------------------


Scope = Literal["dev", "admin"]


class User(BaseModel):
    """A person, as four facts and three timestamps.

    Four fields because four are needed to know who somebody is and address
    them by URL. There is no password, no session and no verified flag: with no
    mail capability there is no reset path, so choosing a sign-in mechanism now
    would be choosing one whose recovery story does not exist. A row here is a
    record of a person; a dev key is the only credential this service accepts.
    """

    id: str = Field(
        description="Stable identifier. Used by every other route that refers to a "
                    "person, so that changing a handle does not orphan anything.",
        examples=["u_9f2c41ab73d05e18"],
    )
    email: str = Field(
        description="Stored lowercased, and unique. Validated for shape only: nothing "
                    "here can send mail, and the only proof an address works is "
                    "sending to it, so this is a record rather than a verification.",
        examples=["ada@example.org"],
    )
    handle: str = Field(
        description="Two to thirty-two characters, lowercase, digits and hyphens. "
                    "Unique, and lowercased on the way in, because a handle becomes a "
                    "path segment and `Ada` and `ada` being two rows is one person "
                    "with two accounts. Handles that collide with a path this site "
                    "serves are refused.",
        examples=["ada"],
    )
    first_name: str = Field(
        description="What to call them. One field rather than given/family, because "
                    "the only thing this site does with a name is greet somebody, and "
                    "a name model that assumes two parts is wrong for a large "
                    "fraction of the world.",
        examples=["Ada"],
    )
    pic: Optional[str] = Field(
        default=None,
        description="A site-relative path, an http(s) URL, or a data:image URI. Null "
                    "when there is none. Note that this site's Content-Security-Policy "
                    "is `img-src 'self' data:`, so a picture on another host is stored "
                    "and reported but cannot be rendered as an image by a page here: "
                    "the admin screen shows it as a link rather than as a broken "
                    "image. Widening the policy is a decision about the policy.",
        examples=["/pics/ada.png"],
    )
    created_at: datetime = Field(description="When the row was created, UTC.")
    updated_at: datetime = Field(description="When any field last changed, UTC.")
    disabled_at: Optional[datetime] = Field(
        default=None,
        description="When the account was disabled, or null when it is active. Rows "
                    "are disabled rather than deleted: the keys that reference a "
                    "person are the record of what that credential did, and a handle "
                    "that was somebody is a fact worth keeping once handles are URLs.",
    )


class UsersResponse(BaseModel):
    """Everybody, newest first."""

    count: int = Field(description="How many users, counted rather than stated.", examples=[3])
    users: list[User] = Field(
        description="Every user, newest first. There is no paging yet, and there is no "
                    "pretend paging either: when the list is long enough to need it, "
                    "the parameters arrive here and this description changes with them."
    )


class NewUser(BaseModel):
    """What creating a user requires."""

    # A field this model does not declare is a 422, not a silently ignored key.
    # Pydantic ignores unknown fields by default, so without this a request
    # naming `first_nmae` would be accepted, change nothing, and return 200:
    # a save that appears to succeed and does not. That is the exact failure
    # the PATCH rule below is written against, so it is closed in the schema
    # rather than trusted to the handler.
    model_config = ConfigDict(extra="forbid")

    email: str = Field(description="Their address. Lowercased and checked for shape, not delivered to.", examples=["ada@example.org"])
    handle: str = Field(description="Two to thirty-two characters, lowercase letters, digits and hyphens.", examples=["ada"])
    first_name: str = Field(description="What to call them.", examples=["Ada"])
    pic: Optional[str] = Field(
        default=None,
        description="Optional picture reference: a site-relative path, an http(s) URL, "
                    "or a data:image URI.",
        examples=["/pics/ada.png"],
    )


class UserPatch(BaseModel):
    """A partial update. Absent is not the same as null.

    Every field is optional, and the route sends only the ones the request
    actually named. That is the registry's rule carried over because it was
    paid for there: **a PATCH touches only what it names**, so a client saving
    a first name cannot blank a picture it never loaded.

    The distinction is real and it is the reason this model exists rather than
    reusing NewUser with defaults: `pic` omitted leaves the picture alone,
    `"pic": null` removes it. A field this model does not declare is rejected
    rather than ignored, because silently dropping `first_nmae` is how a save
    appears to succeed and changes nothing.
    """

    # A field this model does not declare is a 422, not a silently ignored key.
    # Pydantic ignores unknown fields by default, so without this a request
    # naming `first_nmae` would be accepted, change nothing, and return 200:
    # a save that appears to succeed and does not. That is the exact failure
    # the PATCH rule below is written against, so it is closed in the schema
    # rather than trusted to the handler.
    model_config = ConfigDict(extra="forbid")

    email: Optional[str] = Field(default=None, description="New address. Omit to leave it alone.")
    handle: Optional[str] = Field(default=None, description="New handle. Omit to leave it alone.")
    first_name: Optional[str] = Field(default=None, description="New name. Omit to leave it alone.")
    pic: Optional[str] = Field(
        default=None,
        description="New picture reference. Omit to leave it alone; send null to remove it.",
    )


class ApiKey(BaseModel):
    """A dev key, as everything about it except the key.

    The secret is not here and cannot be: only its SHA-256 is stored, so this
    model describes all that survives minting. That is the registry's rule and
    the one part of its auth story worth copying exactly, because a copy of the
    database is then not a copy of everybody's credentials.
    """

    id: str = Field(description="Stable identifier, used to revoke it.", examples=["k_41ab73d05e189f2c"])
    pub: str = Field(
        description="The public half of the key: eight hex characters, stored in clear "
                    "and safe in a log. It is what makes a key in a list "
                    "recognisable to the person holding it, so revoking the right one "
                    "stops being a guess. It is not part of the secret and cannot "
                    "narrow it.",
        examples=["2f9a1b3c"],
    )
    scope: Scope = Field(
        description="`dev` or `admin`, ordered: an admin key satisfies a route that "
                    "needs dev. Two scopes is not a permission system; it is a place "
                    "for the third one to go that is not a boolean called is_admin.",
        examples=["dev"],
    )
    note: str = Field(description="Who or what the key is for, in the minter's words. Empty string when none was given.", examples=["ada, local development"])
    user_id: Optional[str] = Field(
        default=None,
        description="The user this key belongs to, or null. Null is a real state: the "
                    "bootstrap admin key belongs to nobody, and a key can be minted "
                    "for someone before they have a row.",
        examples=["u_9f2c41ab73d05e18"],
    )
    created_at: datetime = Field(description="When it was minted, UTC.")
    last_used_at: Optional[datetime] = Field(
        default=None,
        description="When it last authenticated a request, UTC, or null if it never "
                    "has. Recorded at most once a minute, so it is accurate to the "
                    "minute and not to the request: every authenticated GET would "
                    "otherwise be a write.",
    )
    revoked_at: Optional[datetime] = Field(
        default=None,
        description="When it was revoked, or null while it is live. Revoked keys are "
                    "kept and reported rather than deleted, because the row is the "
                    "record that the credential existed.",
    )
    active: bool = Field(
        description="Whether it would authenticate right now. Derived from revoked_at "
                    "and returned so a client does not have to reimplement the rule "
                    "that decides it.",
        examples=[True],
    )


class KeysResponse(BaseModel):
    """Every key, newest first."""

    count: int = Field(description="How many keys, counted rather than stated.", examples=[4])
    active: int = Field(description="How many of them are not revoked.", examples=[3])
    keys: list[ApiKey] = Field(description="Every key, revoked ones included, newest first.")


class NewKey(BaseModel):
    """What minting a key requires."""

    # A field this model does not declare is a 422, not a silently ignored key.
    # Pydantic ignores unknown fields by default, so without this a request
    # naming `first_nmae` would be accepted, change nothing, and return 200:
    # a save that appears to succeed and does not. That is the exact failure
    # the PATCH rule below is written against, so it is closed in the schema
    # rather than trusted to the handler.
    model_config = ConfigDict(extra="forbid")

    scope: Scope = Field(default="dev", description="`dev` unless there is a reason. An admin key can mint and revoke keys, including its own.", examples=["dev"])
    note: str = Field(default="", description="Who or what it is for. Not required, and strongly worth filling in: a key with no note is a key nobody can decide to revoke.", examples=["ada, local development"])
    user_id: Optional[str] = Field(
        default=None,
        description="The user it belongs to. Optional, because a key can exist before "
                    "a person does. An unknown id is refused rather than stored.",
        examples=["u_9f2c41ab73d05e18"],
    )


class MintedKey(BaseModel):
    """The one response that carries a secret.

    `key` appears here and in no other model, no log line and no database
    column. It cannot be retrieved afterwards: what is stored is its SHA-256,
    so the only copy after this response is the one the caller keeps. Losing it
    means minting another and revoking this one.
    """

    key: str = Field(
        description="The key itself, in full. This is the only time it exists outside "
                    "the holder's hands: only its digest is stored, so it cannot be "
                    "shown again by anything, including an admin.",
        examples=["tmk_2f9a1b3c_kZ8w2Qx1nR7vB4tL9pY0sM3jH6cF5dA8gE1uT2iO4rK"],
    )
    record: ApiKey = Field(description="The stored row, which is everything about the key except the key.")


class WhoAmI(BaseModel):
    """What the presented key is, and what it can do.

    The route that answers this is the one an admin screen calls first, because
    the alternative to asking is guessing from whether some other request
    returned 401, and a screen that infers its own permissions from a failure
    shows the wrong thing whenever the failure has another cause.
    """

    key: ApiKey = Field(description="The key that authenticated this request.")
    user: Optional[User] = Field(
        default=None,
        description="The person it belongs to, or null when it belongs to nobody.",
    )
    can_administer: bool = Field(
        description="Whether this key satisfies the admin scope. Stated rather than "
                    "left to the client to derive from `key.scope`, so that adding a "
                    "third scope does not silently change what an old client believes "
                    "it is allowed to show.",
        examples=[True],
    )


class DisabledState(BaseModel):
    """Whether an account is disabled.

    A body with one field rather than two routes named `disable` and `enable`,
    so the operation is symmetric and idempotent: sending the state you want is
    the same call whichever direction you are going, and repeating it is not a
    second event.
    """

    # A field this model does not declare is a 422, not a silently ignored key.
    # Pydantic ignores unknown fields by default, so without this a request
    # naming `first_nmae` would be accepted, change nothing, and return 200:
    # a save that appears to succeed and does not. That is the exact failure
    # the PATCH rule below is written against, so it is closed in the schema
    # rather than trusted to the handler.
    model_config = ConfigDict(extra="forbid")

    disabled: bool = Field(
        description="True disables the account, false restores it. Nothing is deleted "
                    "either way.",
        examples=[True],
    )


# ---------------------------------------------------------------------------
# Projects and surfaces: the structure the site is organised by.
#
# A piece is a thing that exists. A SURFACE is one addressable thing a project
# serves, and a project is a body of work with an identity. The two lists
# overlap without being the same: halfphi is a piece and not a surface, because
# it is a library with no address; the documentation tree is a surface and not
# a piece, because it is not one of the six.
#
# They are joined by `Surface.piece`, and a test holds that join in both
# directions, because either half alone is easy to satisfy while the other
# quietly breaks.
# ---------------------------------------------------------------------------


class Surface(BaseModel):
    """One addressable thing a project serves."""

    key: str = Field(description="Stable identifier within its project.", examples=["games"])
    name: str = Field(description="What it is called in prose.", examples=["Die Runner"])
    what: str = Field(description="What it is, in a few sentences.")
    piece: Optional[str] = Field(
        default=None,
        description="The key in /v1/pieces this surface is, or null when it is not one "
                    "of the six. The documentation tree and the style guide are "
                    "surfaces and not pieces.",
        examples=["console"],
    )
    serves_today: str = Field(
        description="Where it answers right now, probed rather than remembered. For a "
                    "surface that has moved under the apex this is still true: it is "
                    "where it has always answered, which is a different question from "
                    "where to read it.",
        examples=["https://games.tinymachines.ai"],
    )
    lands_at: str = Field(
        description="The path under the apex it lands at.",
        examples=["/6502/games"],
    )
    lands_at_settled: bool = Field(
        description="False while `lands_at` is a proposal rather than a decision. A "
                    "public path that moves becomes a redirect map, so the difference "
                    "is worth carrying: a proposal written as a fact reads as decided "
                    "the next time somebody looks.",
        examples=[True],
    )
    status: str = Field(
        description="Where the move has got to, in the words the manifest uses. "
                    "`not started` means it has not moved; anything else describes "
                    "what has arrived, which can be part of a surface.",
        examples=["console here, registry pages not"],
    )
    nav: bool = Field(description="Whether the site navigation carries it.", examples=[False])


class Project(BaseModel):
    """A body of work with an identity, and the surfaces it serves."""

    key: str = Field(description="Stable identifier, used in paths.", examples=["6502"])
    name: str = Field(description="What it is called in prose.", examples=["6502"])
    what: str = Field(description="What the project is.")
    silo: Optional[str] = Field(
        default=None,
        description="The stylesheet scoping this project's identity tokens, or null. A "
                    "project looks like itself by overriding a short list of tokens "
                    "under `[data-project]`, never by forking the design system: what "
                    "may be overridden is identity, and what may not is meaning.",
        examples=["style/projects/6502.css"],
    )
    landing: Optional[str] = Field(
        default=None,
        description="Its page on this site, or null when it has none yet. A project "
                    "with no landing page is absent from the navigation rather than "
                    "dead-linked.",
        examples=["/6502"],
    )
    status: str = Field(description="Where the project as a whole stands.", examples=["moving"])
    surfaces: list[Surface] = Field(description="Everything it serves.")


class ProjectsResponse(BaseModel):
    """The projects, and how much of each has arrived.

    The counts are derived from the surfaces rather than tracked beside them,
    so they cannot disagree with the list they describe.
    """

    measured_on: str = Field(
        description="When `serves_today` was last probed, from the manifest. These are "
                    "addresses that were checked, not addresses that were remembered.",
        examples=["2026-08-23"],
    )
    count: int = Field(description="How many projects.", examples=[3])
    surfaces: int = Field(description="How many surfaces across all of them.", examples=[11])
    arrived: int = Field(
        description="How many surfaces are served from this site. The difference "
                    "between this and `surfaces` is how much of the move is left.",
        examples=[7],
    )
    projects: list[Project] = Field(description="Every project, the roof itself included.")
