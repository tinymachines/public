# `/api`: FastAPI, spoken as REST and as MCP

Python 3.10, FastAPI, uvicorn, Pydantic. Runs on **`127.0.0.1:6510`**, nginx
proxies `/api` to it.

Nothing here yet. See [`../START-HERE.md`](../START-HERE.md) step 3.

## What is already settled

- **The models generate the document.** Pydantic models validate every request
  *and* produce the OpenAPI schema, so the reference cannot drift from the
  behaviour. Do not hand-write an OpenAPI document and do not add a second
  schema layer to describe what the models already describe.
- **REST and MCP are one surface, not two.** The 6502 service answers both over
  the same implementations: HTTP routes are fine-grained because a program
  holds the state, MCP tools are coarse because a language model cannot
  usefully hold two kilobytes of hex. Same design, different client.
- **Doc-maxxing means something checkable.** Every field described, every
  example one that has been run, and a test that fails when a route exists and
  the reference does not mention it. That check has already caught real
  omissions twice in the 6502 service; it is worth having on day one rather
  than added after the first thing goes undocumented.
- **Coins are a quota, never a price.** See `../NOTICE.md`. The token mechanism
  worth extending is the registry's: shown once, only the SHA-256 stored, so a
  copy of the database is not a copy of everybody's credentials.

## Not 6502

`127.0.0.1:6502` is held by the live 6502 API. A uvicorn started there fails to
bind and every request then goes to production while looking local. Check
`ss -ltn`.
