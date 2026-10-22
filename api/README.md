# `/api`: FastAPI, spoken as REST and as MCP

Python 3.10, FastAPI, uvicorn, Pydantic. Runs on **`127.0.0.1:6510`**, nginx
proxies `/api` to it.

**Installed and serving.** `deploy/tinymachines-api.service` runs it with
`--root-path /api`, so the generated document describes the paths a client
actually calls rather than the ones uvicorn sees.

## What it is for

This is the roof's own API. It answers the question none of the six pieces can
answer about itself: **what they all are, and which of them are up.**

It does not run 6502 code. That is the 6502 API at
`https://6502.tinymachines.ai/api`, which is one of the pieces described here
and has its own MCP endpoint with five tools for assembling, running and
minting cartridges. Two services, one of which describes the other.

## Routes

Everything is under `/api` in public paths. The table is the paths as the app
declares them.

| | |
|---|---|
| `GET /` | The index: where the document is, where MCP is, and every route, derived from the app's routing table |
| `GET /health` | Liveness of this process, and nothing else |
| `GET /v1/meta` | What commit is running, and what built the document |
| `GET /v1/pieces` | The six pieces: what, where, how they ship, and their terms |
| `GET /v1/pieces/{key}` | One piece. An unknown key is a 404 naming the valid ones |
| `GET /v1/tokens` | Whether the public token mint is on, and what is left of its limits for you |
| `POST /v1/tokens` | Mint a free registry token, once. Rate-limited per address and per day; 503 where no registry is configured |
| `GET /v1/projects` | The projects, their surfaces, and how much of the move has happened |
| `GET /v1/visitors` | Who visited, from the nginx logs, over the last thirty days: reads per site and per day, pages, referrers, how much was automated. No address in it; 404 until the first snapshot |
| `GET /v1/auth` | Which ways of signing in this deployment offers (today: GitHub, where configured) |
| `GET /v1/auth/github` | Start a GitHub sign-in; redirects there and back to `next` |
| `GET /v1/auth/github/callback` | Where GitHub returns the browser; opens the session cookie |
| `POST /v1/auth/logout` | Forget the session |
| `GET /v1/status` | Which pieces are answering, **measured** |
| `POST /mcp` | The same surface, spoken to a language model |
| `GET /mcp` | 405 with `Allow: POST`. There is no stream to open |

Everything above is public. The routes in the next two tables need a session, which is the
cookie a GitHub sign-in leaves: an account holds the digests of the registry
tokens it minted, so it can replace one it lost. `auth.py` says why an account
exists at all and why GitHub is the first way in.

| | |
|---|---|
| `GET /v1/auth/pass` | 204 for a session or a live dev key (`Authorization: Bearer tmk_...`), 401 for anybody else. The front door asks it before the sprite generator, so a program can use the generator's MCP endpoint with a key |
| `GET /v1/me` | Who is signed in, and the tokens the account holds, by digest |
| `POST /v1/me/tokens` | Mint a registry token held by this account, counted against the account rather than the address |
| `POST /v1/me/tokens/{token_id}/reissue` | Revoke a lost token in the registry and move its page to a new one, returned once |
| `DELETE /v1/me/tokens/{token_id}` | Revoke. The page stays |

An account can also keep a shelf of its own cartridges, so that every menu on
the site that asks for a `.nes` can offer them by name. A cartridge answers
only to the session that put it there: somebody else's id is a 404, the same as
one that never existed. **Every sign-in has a shelf** (opened 2026-09-22; they
were granted by hand before that), of `db.SHELF_DEFAULT` places; an admin can
resize one through `carts_max` on the user, and zero closes it.
The bytes live on disk beside the database (`$STATE/carts`, or `TM_CARTS`),
never in it and never in this repository. `carts.py` has the whole argument;
`python3 carts.py grant <handle> <how-many>` resizes a shelf on the box (zero closes it), and
`python3 carts.py add <handle> <file.nes>` puts a dump that is already on the box
on a shelf, held to every rule an upload is.

| | |
|---|---|
| `GET /v1/me/carts` | The account's shelf, by name, and what it may hold. Empty for a shelf an admin closed |
| `POST /v1/me/carts` | Add one. The body is the `.nes`; the header is read here and held to the file's length. With `mapper` in the query the body is a raw dump (PRG, then CHR) and the header is written here from the bytes' lengths and the board named |
| `GET /v1/me/carts/{cart_id}/rom` | The bytes, `private, no-store`, checked against their digest on the way out |
| `PATCH /v1/me/carts/{cart_id}` | Rename it or change its note. Touches only what it names |
| `DELETE /v1/me/carts/{cart_id}` | Remove the entry and the file |
| `GET /v1/me/carts/{cart_id}/save` | The cartridge's saved RAM, what its battery would have kept; 404 until the game has saved |
| `PUT /v1/me/carts/{cart_id}/save` | Write it, whole. The play page is the battery: it writes while a cartridge with one runs, and when it stops |
| `DELETE /v1/me/carts/{cart_id}/save` | Forget it. The ROM stays |
| `GET /v1/me/carts/{cart_id}/revisions` | The cartridge's revisions, oldest first: each an IPS patch against the file as it arrived, and what this service measured when it applied it |
| `POST /v1/me/carts/{cart_id}/revisions` | Keep one. The body is the IPS; it is applied here and refused if it changes nothing, grows the file or touches the header. `message` in the query |
| `GET /v1/me/carts/{cart_id}/revisions/{rev_id}` | One revision |
| `GET /v1/me/carts/{cart_id}/revisions/{rev_id}/patch` | The IPS bytes, `private, no-store` |
| `GET /v1/me/carts/{cart_id}/revisions/{rev_id}/rom` | The patched image, made on request and checked against its digest on the way out |
| `PATCH /v1/me/carts/{cart_id}/revisions/{rev_id}` | Change its message. Touches only what it names |
| `DELETE /v1/me/carts/{cart_id}/revisions/{rev_id}` | Remove the revision and its patch. The cartridge stays |
| `GET /v1/me/carts/{cart_id}/blocks` | The cartridge's code blocks, oldest first: each a run of the code window's listing the owner selected, with the bytes that were on the bus, a label and a note |
| `POST /v1/me/carts/{cart_id}/blocks` | Keep one. JSON: the range, the bytes as hex, a label and a note; refused if the bytes do not reach the last instruction or run off the bus |
| `GET /v1/me/carts/{cart_id}/blocks/{block_id}` | One block |
| `PATCH /v1/me/carts/{cart_id}/blocks/{block_id}` | Change its label or note. Touches only what it names |
| `DELETE /v1/me/carts/{cart_id}/blocks/{block_id}` | Remove the block. The cartridge stays |

Everything below needs a dev key.

| | |
|---|---|
| `GET /v1/admin/whoami` | What the presented key is, and whether it can administer |
| `GET /v1/admin/keys` | Every key, revoked ones included, and none of the secrets |
| `POST /v1/admin/keys` | Mint a key. **The only response in this API that carries one** |
| `DELETE /v1/admin/keys/{key_id}` | Revoke. The row stays |
| `GET /v1/admin/mints` | The public mint's ledger: address digests, notes, times. Never a token |
| `GET /v1/admin/users` | Everybody, newest first |
| `POST /v1/admin/users` | Create a person |
| `GET /v1/admin/users/{user_id}` | One person, by id rather than by handle |
| `PATCH /v1/admin/users/{user_id}` | Change only the fields the request names |
| `PUT /v1/admin/users/{user_id}/disabled` | Disable or restore. Nothing is deleted |

**HEAD is answered wherever GET is**, because HTTP defines HEAD as GET without
a body and a resource that answers one answers the other. It is not in the
document: adding it would put a HEAD operation on every path describing
something HTTP already guarantees, in a reference whose claim is that every
line earns its place. It is transport behaviour and lives in the transport, as
`HeadAsGet` in `app.py`. The headers are the ones GET would send, Content-Length
included, so a client can ask how big something is without fetching it.

`GET /api/openapi.json` is the reference. There is no Swagger or ReDoc page,
and that is a decision rather than an omission: both load their JavaScript from
a CDN, and this site's CSP is `script-src 'self'`. They would render as a blank
page with a console error, which is a worse answer than saying there is not
one. `GET /` says so in `interactive_docs`.

## The stream desk

Games through the console's stream chain, and the streams they go out on:
the control plane over the console repository's `stream` tool (`api/stream.py`
says what is deliberately small about it). Reads take any live key, writes an
admin key; or, since 2026-10-21, a tinymachines.ai passkey: the desk is the
one surface here that also takes a signed-in person, see "Operators" below.
One run at a time; the games are the cartridges the site serves and no other
image can be named.

| Route | What it does |
|---|---|
| `GET /v1/stream/games` | The cartridges the desk may run, with their sizes and digests |
| `GET /v1/stream/outputs` | Which outputs are configured, as booleans: `file`, `rtmp`, `youtube`, and whether the tool is built. Never a key |
| `GET /v1/stream/runs` | Every run, newest first, progress read from each run's log; once a run ends, the cost per frame of each stage of the chain (`ms_console` to `ms_handoff`), from the line the tool prints last. The run history at /nes/stream/history is a view of this route and nothing else |
| `POST /v1/stream/runs` | Start a run: a game, an output (`file`, `hls` for the monitor's live picture, `rtmp`, `youtube`), seconds, an optional bench script. 409 while one is running or when the output's key is not in the environment |
| `GET /v1/stream/runs/{run_id}` | One run as it stands |
| `POST /v1/stream/runs/{run_id}/stop` | Stop it: SIGTERM to the tool and its ffmpeg, SIGKILL after three seconds |
| `GET /v1/stream/runs/{run_id}/log` | The last sixty lines of the tool's output, every configured key cut out |
| `GET /v1/stream/runs/{run_id}/markers` | The markers placed on it |
| `POST /v1/stream/runs/{run_id}/markers` | Place a marker, stamped with the frame the log last reported |
| `POST /v1/stream/runs/{run_id}/control` | A pad byte or a reset to a running game, through the tool's control pipe; answers with the frame it landed on |
| `GET /v1/stream/runs/{run_id}/file` | The MP4 a finished file run wrote |
| `GET /v1/stream/me` | Who this request is to the desk and what it may do: a key, a passkey session (and whether it is an operator's), or nobody, with where a passkey signs in. 200 for everybody |
| `POST /v1/stream/sign-out` | End a passkey session on the account service; relays the header that clears its cookie here |

### Operators: the same passkey as the other apps

The owner asked for the sign-in the kit's apps have (sprites, events,
hotbits), which is one tinymachines.ai passkey on the kit's shared account
service, kit-accounts, on the box and at accounts.tinymachines.ai. This site is
registered there as a site, so the same passkey opens the stream desk, and
the roof keeps **no passkeys and no sessions** for it (`api/kitaccounts.py`):
a request carries the service's cookie, the roof asks the service who it is
over loopback (`GET /v1/auth/check`, with this host's name), and the service
answers an account id and handle, nobody, or a refusal of a write from another
origin, which is relayed as it stands.

Who may operate is the roof's own list, the `operators` table
(`api/operators.py`): an account on it reads and writes the desk as an admin
key does; a signed-in account not on it is told so by handle (403); nobody is
the same 401 as before, with the Bearer challenge. An operator is
admin-equivalent on the desk on purpose: a person trusted to watch a run from
the monitor is trusted to stop it. Keys keep working unchanged, and a key that
is presented is judged as a key even when a cookie sits beside it.

| Route | What it does |
|---|---|
| `GET /v1/admin/operators` | Every account ever made an operator, removed ones included. Admin key |
| `POST /v1/admin/operators` | Make an account an operator, by the id `GET /v1/stream/me` shows a signed-in person. Admin key |
| `DELETE /v1/admin/operators/{account_id}` | Stop it operating; the row stays as the record. Admin key |

The first operator is therefore made with the admin key once, from the desk's
sign-in page, which offers the field to a signed-in non-operator; after that
the key stays in the drawer. How the browser gets the cookie without any
WebAuthn code in this repository: the page sends the reader to the accounts
site's hand-off page, which runs the ceremony on accounts.tinymachines.ai and
sends the browser back through `GET /api/v1/auth/hand-off` on this host, the
one `/api/` path nginx hands to the service (`deploy/tinymachines.ai.nginx`).
The page's address for that is read from the service's own answer, never
typed.

## The administered surface

Nine routes, one credential, one SQLite file. This is the first state this
service has ever held, so the boundary is worth stating rather than
discovering: **everything stored is administrative.** No chip state, no
machine, no cartridge. Those stay where they are.

### The key rule, inherited

`START-HERE.md` §5 says to extend the registry's mechanism rather than start
again, and the part worth copying exactly is the part that would hurt to change
later: **a key is shown once and only its SHA-256 is stored**, so a copy of the
database is not a copy of everybody's credentials. `POST /v1/admin/keys` is the
only response anywhere in this API that contains a key, and a test walks the
generated document to assert that stays true.

Two things are added on top of it, both because the registry's version has a
gap the roof would otherwise inherit:

- **A key has a public half.** The registry stores a bare digest, so a token in
  a list is a hash: unrecognisable to the person holding it and useless in a
  log line. A key here is `tmk_<pub>_<secret>`. The eight-character `pub` is
  stored in clear and printed in every listing; the secret is 256 bits nothing
  sees again. Revoking the right key stops being a guess.
- **Scope is a column.** `dev` and `admin`, ordered, `admin` covering `dev`.
  Two scopes is not a permission system. What it is, is a place for the third
  one to go that is not a boolean called `is_admin`.

The stored digest is a plain SHA-256 rather than bcrypt or argon2, and that is
deliberate: the thing hashed is 256 bits from the system CSPRNG, not a
password, so there is no dictionary to run and no candidate list shorter than
2^256. A slow KDF makes guessing expensive where guessing is already
impossible, and costs the property that makes this work: a digest can be a
UNIQUE index, so authentication is one indexed lookup rather than a scan.

### Where the first key comes from

Every credentialed system answers this once. Here, **startup mints an admin key
when no live one exists and prints it to stderr**, which under systemd is the
journal: a place only somebody already on the host can read.

    sudo journalctl -u tinymachines-api | grep -A4 'has been minted'

The condition is "no live admin key" rather than "the database is new", which
makes the same code the recovery path. `scripts/recover-admin-key.sh` walks it
from the host when the key you had is gone and the journal has rotated: it
revokes the live admin keys in the database, restarts the service and prints
the key the restart mints, once. Revoke every admin key by accident and a
restart mints another, so there is no break-glass flag to maintain and no
second mechanism to get wrong. Revoking the **last** live admin key is refused
anyway, with a 409 that says to mint the replacement first.

### What authenticates, and what does not

`Authorization: Bearer tmk_...`. Not a cookie, not a session, not a form post.
(The stream desk is the one exception, and it is somebody else's cookie: the
kit's account service holds the session and this service asks it, see "The
stream desk". The administered surface itself stays key-only.)

That is a decision, not a first draft. A cookie needs a session table, an
expiry policy, a CSRF answer and a logout that invalidates something, and every
one of those is a choice about how *users* sign in: a question nobody has
answered and that this service cannot answer while it has no way to send mail.
A bearer header needs none of them. The admin screen holds the key in memory
for the life of a tab and writes it nowhere, so a reload asks again. That is
the cost, it is small, and one person pays it.

401 and 403 are kept apart because they ask for different things: 401 means
present a credential, 403 means present a different one. A revoked key is told
it was revoked rather than answered as though it never existed, which is not
the registry's 404-not-403 rule being broken but a different question: that
rule is about a token learning whether some *other* builder exists.

**MCP has no administrative tool and will not be given one.** That endpoint
carries no credential, and a test fails if a tool name starts looking like key
or user management.

### The user table is four fields

`email`, `handle`, `first_name`, `pic`, and three timestamps. There is no
password column, no session and no verified flag, and that is not a gap to fill
in quietly: with no mail capability there is no reset path, so choosing a
sign-in mechanism now would be choosing one whose recovery story does not
exist. A row is a record of a person. A dev key is the only credential.

Email and handle are folded to lowercase and both are unique, because a handle
is going to be a path segment and two rows differing only in case is one person
with two accounts. Handles that collide with a path this site serves are
reserved in `users.py` rather than in the route table, so the answer is the
same in the API, in the admin screen and in any future sign-up.

An address is validated for shape and never verified. The only proof an address
works is sending to it, and nothing here can send.

**A PATCH touches only what it names.** The registry's rule, carried over
because it was paid for there: a client saving a first name cannot blank a
picture it never loaded. Absent and null are therefore different, and an
unrecognised field is a 422 rather than an ignored key, because silently
dropping `first_nmae` is how a save appears to succeed and changes nothing.

Nothing deletes a person. `PUT .../disabled` is a state, not a `DELETE` that
does not delete, and the keys that referenced them survive with `user_id` set
null: deleting somebody must never silently delete the record of what their
credential did.

### One thing the CSP decides for you

`pic` accepts a site-relative path, an http(s) URL or a `data:image` URI. It is
stored either way, because it is a true fact about the person. But this site
sends `img-src 'self' data:`, so **an avatar on another host cannot be rendered
by a page here**: the browser blocks it and shows a broken image with no error
on the page, which is the quiet kind of failure this repository keeps a list
of. The admin screen therefore draws a monogram and shows the URL as a link.
Widening `img-src` is a decision about the policy and belongs in a conversation
about the policy, not in a form handler.

### Where the file is

`TM_DB` names it, and it is not in the repository. Under systemd,
`StateDirectory=tinymachines` sets `$STATE_DIRECTORY` and the unit points
`TM_DB` at it, so the data outlives any move of the checkout. `*.db` is
gitignored, but a path that defaults into the working tree is one somebody
eventually commits, so the default is a state directory instead.

Migrations are a list applied by `PRAGMA user_version`, not
`CREATE TABLE IF NOT EXISTS`, which is the version that works until a column is
added and then silently serves an old shape. A file written by a newer build is
refused rather than opened: a downgrade that quietly drops writes is worse than
a service that will not start.

### What is deliberately not here

**There is no cartridge table, and adding one would be a mistake.** Cartridges
already live in the registry's SQLite next door, where publishing re-runs each
one on the chip rather than believing its `verify` block. A table here would be
a second copy of a fact that the thing which measures it does not own, and the
two would drift the first time a cartridge was republished. When the admin
screen manages cartridges it should read `games.tinymachines.ai`, over HTTP,
the same way `/v1/status` measures rather than asserts. That is a real piece of
work and it is not started.

## What is settled, and now built

- **The models generate the document.** `models.py` validates every request
  *and* produces the OpenAPI schema. There is no hand-written OpenAPI file and
  no second schema layer describing what the models already describe, so the
  reference cannot drift from the behaviour.
- **REST and MCP are one surface.** The three MCP tools about the pieces call
  the same implementations the HTTP routes call, and `resolve` is the
  namespace's own read. HTTP is fine-grained because a program
  can hold six things and ask a second question about the fourth; the tools are
  coarse because a model should not need four calls and the intermediate JSON
  in its context to ask what this is. `overview` answers that in one call,
  measurement included.
- **Doc-maxxing means something checkable.** `test_api.py` fails when a route
  exists that this file does not name, when a field has no description, and
  when a route has no summary. Those are here on day one rather than added
  after the first thing goes undocumented.
- **Coins are a quota, never a price.** See `../NOTICE.md`. Not built yet.

## tm://, the namespace

The same endpoint also speaks MCP **resources**: this checkout's `docs/`,
`data/` and `notes/`, and the pages of the sites this box serves, as one
read-only URI namespace with typed links between a page and the file it is
rendered from. The spec is `extern/tinypeek/spec/tm-protocol-spec.md`; `api/tm.py` is its
first slice, built on this server to find out whether an MCP client navigates
resources at all before a server is written for the purpose.

```
tm://                                        the hosts this server answers for: one
tm://tinymachines/                           the mounts
tm://tinymachines/fs/docs/nes/pile.md        a file; ?as=stat for its metadata
tm://tinymachines/fs/docs/nes/               a directory: reading it lists it
tm://tinymachines/git/nes-bench/docs/pile.md?at=v1.0
                                             a file of a repository, at a ref or a time
                                             (?at=2026-10-01; fs and entity take it too);
                                             ?as=log, ?as=blame, ?as=tree, ?as=stat
tm://tinymachines/http/tinymachines.ai/docs/nes/pile?as=text
                                             a page, as its readable text
tm://tinymachines/offbox/autopsy-models      where a build chain leaves the box
tm://tinymachines/entity/pattern/pad-poll    a pattern, a game, a routine or a lesson
                                             of the autopsy, as a thing with links
tm://tinymachines/mcp/terrapulse/tools/get_slot
                                             a tool of an MCP server this box reads,
                                             as the server described it; mcp/<server>/
                                             is the server's record and whether it answered
tm://tinymachines/mcp/terrapulse/map         the server's map: which of its tools read
                                             as addresses, and how sure each entry is
tm://tinymachines/mcp/terrapulse/dex/earthquake/<id>
                                             one thing of the server's data, read by the
                                             tool the map names, typed by the kind it gives
tm://tinymachines/kinds/pattern              one kind of thing this host has served: its
                                             media type, how often, and the links it carried
```

Three verbs, `resources/list`, `resources/read` and `completion/complete`,
and resource templates for the grammar; and one tool, `resolve(uri)`, which is
the same read with the links in its body, for a client that is tool-first and
never lists resources. The two answer the same thing, and a refusal through
the tool keeps its reason and its nearest URIs. A collection is a URI ending in `/`;
reading one returns its children as JSON with a cursor, which is how a client
walks coarse to fine. Every read carries links in `_meta` under
`tinymachines.ai/links`: `tm:source` from a notebook page to its markdown,
`tm:renders-as` back, `tm:generated-by` from a pulled page or its copy to the
file in the repository it was pulled from and `tm:generates` back,
`tm:repository` and `tm:working-copy` between a file here and the same file
in git, `tm:source` from any page to the route file that renders it and
`tm:data` to the records its own code reads (with `tm:read-by` back from
the record, at the same confidence, and `tm:generated-by` from the record to the script that writes
it; an entity's `tm:data` points into its record with `?pointer=`, which reads that piece), `alternate` from a page to the same page in the other language and on the
other site, `tm:pins` from a submodule to the repository it pins, at the
pinned commit, `tm:step` from a trail (a JSON file under `notes/trails/`, a
named ordered list of addresses) to each step it lists and `tm:step-of` from
every step back to the trails it is on, `tm:served-by` from a tool of an MCP
server to the server and `tm:serves` back, `tm:schema` from a tool to its
schema as a piece of itself (`?pointer=/inputSchema`), and `up`, `collection`, `alternate`, `describedby`, `version-history`
and `latest-version` as the IANA registry defines them. A URI that does not resolve comes back as a
JSON-RPC error whose `data.reason` says why (`not-found` with the nearest URIs
that do, `too-large` with a `?range=` and a `?lines=` template, `out-of-root`, `denied`, `binary`).
A piece of a thing has an address: `?lines=FIRST-LAST` reads lines of a file or
of a page's text, counted from 1; `?pointer=/a/0/b` reads what a JSON pointer
(RFC 6901) names in a JSON file; `?range=START-END` reads bytes. One span a
read, and the answer's `uri` keeps it, so a quote keeps where it came from.

The mcp mount (`api/mcp_servers.json`) reads other MCP servers as mounts of
this host: the box keeps the connection, and a client sees addresses. With
no map yet, a server exposes what MCP itself lists: its record (what it is,
whether it answered when the box asked, what it declared at `initialize`),
its tools, resources and prompts, each as the server described it, with a
vendor media type (`application/vnd.tm.tool+json`). Nothing is called. A
server that wants a token the box does not hold reads as `gated`, one that
does not answer as `unreachable`; the token, where there is one, is named in
the file and held in the service's environment, and never appears in a URI,
a body or a refusal.

Every read says what it is in its media type (tinypeek#23): a thing the
server composes is `application/vnd.tm.<kind>+json` (a listing, a stat, a
record, a pattern, a tool) or `text/vnd.tm.<kind>` (a page's text, a blame),
and a file the server merely holds keeps its own type. Nothing reads as bare
`application/json`. `kinds/` is the registry of kinds, measured: it lists
every kind this host has served since its record began, and `kinds/<kind>`
says how often, as which media types, and with which link relations; a kind
never served is not listed. A link may carry its target's `type`, as RFC
8288 allows, wherever the address settles it. On the entity mount,
`?as=set&rel=<rel>` reads a set and its members in one: the things behind one
link relation, each as its own address reads it, a page at a time.

A server's map (tinyhelper#6, spec 13.1) is what makes its data
addressable. tinyhelper's index driver derives `notes/maps/<server>.json`
from the server's own schemas; a person corrects one entry at a time in
`notes/maps/<server>.override.json`; the mount merges the two and serves
them as `mcp/<server>/map`, every entry with `confidence: inferred` or
`exact` and what the driver could not decide beside them. A path the map
names reads by calling the tool its entry names with the path's segments as
arguments, coerced by the tool's schema; the answer is the thing, typed by
the entry's kind (`application/vnd.tm.slot+json; kind=earthquake`), linked
as the entry says (`tm:read-with` the tool, `describedby`, `related` from a
field of edges), its provenance fields carried into `_meta` untouched. A
mapped collection lists its items as addresses and takes the query its
entry lists. The map reads from two files and costs the server nothing; the
crawler samples each mapped collection at three children a run
(`entity/<kind>/?as=set` inlines a listing).

The git mount offers this repository and the siblings checked out beside it,
under their GitHub names, all public under github.com/tinymachines. It runs
git itself, read-only, with every argument passed as an argument, a ref
checked against a pattern before it is used, and the tree path normalised
and refused if it walks up. `6502` is the served worktree, so its HEAD is
the commit the site's pages were read from. Which repository a pulled page
came from is read from the pull scripts (`web/scripts/pull-nesdocs.mjs`,
`pull-chipdocs.mjs`), which are the one copy of that fact.

The data links are read off the tree, not typed (`SiteGraph` in `api/tm.py`):
a URL's route is the Next convention under `web/app/[lang]/`, the records a
page reaches are the `data/<name>.json` files named in the page's file and
in the library modules it imports, followed through `web/lib` only (the site
frame and its menu are not the page's reading, and the language tables are
every page's), and the writer of a record is the script under `scripts/`
that names it. Static reading of source, so each of those links says
`inferred`, except that a record whose own note names its writer gets
`exact`.

Three decisions, each for a reason this box supplies: the fs roots are an
allowlist of the three directories that are public on GitHub, never the host,
and every path is resolved before it is touched; `rendered` is fetched through
nginx on loopback with the site's name as SNI and Host, so the bytes are what a
visitor gets and the mount cannot be pointed at a site this box does not
serve; and the page-to-source join is the notebook loader's own rule restated,
which `test_tm.py` checks against the loader and against the last crawl.

Fixed from the owner's work package of 2026-10-07 (an audit of the live
server, kept beside the project as `docs/feedback/`): sources the type table
did not know are recognised by their content, so a lesson's `prg.s` reads as
text (TM-1); `resolve` with `?as=raw` returns a binary file's bytes, base64
(TM-2); the http listings come from each site's build manifest, every page
the build made with its title, so the game and lesson pages can be listed
(TM-3); a lesson page links to its cartridge's source files and each file
links back (TM-6); a mount's root no longer goes up to itself (TM-10); and
`scripts/check-tm-links.py` crawls the live namespace at the end of every
deploy, after the beta follows (TM-15). A file names the page it becomes
only on a site whose build has that page, so a beta that has not caught up
is not promised it.

A page's data is what its own code reads (TM-8, TM-14): its route file and
the files beside it, and the library modules they import. A module reads a
record when it builds the record's path or imports it, not when a comment
names it. The site frame's modules (what SiteFrame and the layouts import)
are entered only when the page imports them itself and never walked
through, so the menu's records and the metadata's are no page's data. A
record read by a module the page imports directly is `exact`, one further
down is `inferred`, and where the build is on this box a link holds only if
the page's bundle ships the reader module. A record names each route that
reads it once (TM-18), on the canonical site in English: a literal route by
its page, a dynamic one by the collection its pages are listed in, which
carries the `tm:data` back. A dynamic route whose pages share only the root
(the doors) is named page by page, since the root is the front page too. A
page on either site in either language is answered by its route's one link,
and the crawl holds the pair that way: `data/autopsy.json` went from 92
`tm:read-by` links to 5.

A record's writer is exact when the record's own note names it, under
either key a record keeps its note in (TM-7). Past the writer,
`api/lineage.json` names what a script reads that it did not make and the
places the chain leaves this box; the `offbox` mount serves each as a node
that says what it is and why it is not exposed, with `tm:generated-by` to
what makes it and `tm:input-of` to what reads it (`tm:input` is the way
there). `data/autopsy.json` walks to `scripts/board-autopsy.py`, to the
per-game models off the box, to `wasm/listing/tools/autopsy.py`, to the
cartridges off the box, every link exact.

What is not here yet: subscriptions, and anything that writes.

## Pieces and surfaces are different questions

`/v1/pieces` is what exists. `/v1/projects` is how the site is organised, and
the two lists overlap without being the same.

A **piece** is a thing: halfphi is one, and it has no address at all, because
it is a library. A **surface** is one addressable thing a project serves: the
documentation tree is a surface and is not one of the six. `Surface.piece` is
the join, and a test holds it in both directions, because either half alone is
easy to satisfy while the other quietly breaks. The one that actually happens
is a surface naming a piece that was renamed, since the two live in different
files.

Every surface carries **both addresses**. `serves_today` is where it has always
answered and `lands_at` is where it lands here, and they stay separate because
a surface that has moved still answers at the old address. Collapsing them
would leave the API unable to say where a reader should be sent, which is
exactly the bug the front page shipped: it linked to two subdomains for
surfaces that had already arrived.

`lands_at_settled` is false while the path is a proposal. A public path that
moves becomes a redirect map, and a proposal written as a fact reads as decided
the next time somebody looks.

## Reachability is measured, not asserted

`/v1/status` probes each public URL and reports what came back. Nothing reads a
file that says a service is up: the registry's rule, that the thing which
publishes must not be the thing that claims, applied to the roof.

Three answers, kept distinct on purpose:

| | |
|---|---|
| `up` | a response arrived, status below 400 |
| `down` | a response arrived and it was 400 or worse: the host answers, the app does not |
| `unreachable` | nothing arrived, and the reason travels with it |
| `not_probed` | the piece has no public surface, and `not_hosted_because` says why |

Folding `unreachable` into `down` would report a dead host and a broken
application as the same finding. `not_probed` pieces are reported rather than
omitted, because dropping them would make the totals lie about how many pieces
there are.

Results are cached for 30 seconds and every one carries `checked_at`, so a
stale reading cannot be mistaken for a fresh one. The cache is also why
reloading the endpoint is not a way to generate traffic against the three live
subdomains.

## The six pieces are one copy of a fact

`pieces.py` is the list. The same six are described in prose in
`../notes/inventory.md` and linked from `../docs/index.md`, and rather than
keeping three lists in step by hand, a test fails when they disagree. Adding a
seventh piece here and nowhere else is a red test.

That check has already earned itself: it caught two names in this file drifting
from the survey's, and the survey won.

Licensing is two fields, not one. `code_licence` and `data_terms` are different
questions, and collapsing them is what produces the sentence "halfphi is MIT,
so the netlist is fine". NonCommercial and ShareAlike travel with anything
derived from the die data. See `../NOTICE.md`.

## Running it

```bash
python3 -m uvicorn app:app --app-dir api --host 127.0.0.1 --port 6510 --root-path /api
python3 -m pytest api/ -q
```

Dependencies are the system interpreter's, which is how `6502-api.service`
already runs on this host. `requirements.txt` records the versions this was
built and measured against.

## Not 6502

`127.0.0.1:6502` is held by the live 6502 API. A uvicorn started there fails to
bind and every request then goes to production while looking local. Check
`ss -ltn`.
