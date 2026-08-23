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
