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
| `GET /v1/status` | Which pieces are answering, **measured** |
| `POST /mcp` | The same surface, spoken to a language model |
| `GET /mcp` | 405 with `Allow: POST`. There is no stream to open |

Everything above is public. Everything below needs a dev key.

| | |
|---|---|
| `GET /v1/admin/whoami` | What the presented key is, and whether it can administer |
| `GET /v1/admin/keys` | Every key, revoked ones included, and none of the secrets |
| `POST /v1/admin/keys` | Mint a key. **The only response in this API that carries one** |
| `DELETE /v1/admin/keys/{key_id}` | Revoke. The row stays |
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
makes the same code the recovery path. Revoke every admin key by accident and a
restart mints another, so there is no break-glass flag to maintain and no
second mechanism to get wrong. Revoking the **last** live admin key is refused
anyway, with a 409 that says to mint the replacement first.

### What authenticates, and what does not

`Authorization: Bearer tmk_...`. Not a cookie, not a session, not a form post.

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
- **REST and MCP are one surface.** The three MCP tools call the same
  implementations the HTTP routes call. HTTP is fine-grained because a program
  can hold six things and ask a second question about the fourth; the tools are
  coarse because a model should not need four calls and the intermediate JSON
  in its context to ask what this is. `overview` answers that in one call,
  measurement included.
- **Doc-maxxing means something checkable.** `test_api.py` fails when a route
  exists that this file does not name, when a field has no description, and
  when a route has no summary. Those are here on day one rather than added
  after the first thing goes undocumented.
- **Coins are a quota, never a price.** See `../NOTICE.md`. Not built yet.

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
