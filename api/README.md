# `/api`

One API, spoken as **REST** and as **MCP**, with an `openapi.json` that is worth
reading on its own.

Nothing here yet. See [`../START-HERE.md`](../START-HERE.md) step 3.

## What is already settled

- **The models generate the document.** Pydantic models validate every request
  *and* produce the OpenAPI schema, so the reference cannot drift from the
  behaviour. The 6502 service does this and its `/docs` and `/redoc` are
  generated from the same models that reject a malformed request.
- **REST and MCP are one surface, not two.** The existing service answers both
  over the same implementations: the HTTP routes are fine-grained because a
  program holds the state, and the MCP tools are coarse because a language
  model cannot usefully hold two kilobytes of hex. Same design, different
  client.
- **Doc-maxxing means something checkable.** Every field described, every
  example one that has been run, and a test that fails when a route exists and
  the reference does not mention it. That check has already caught real
  omissions.

## What is not settled

The port, and whether this app also renders `/docs`. See the open questions in
`../START-HERE.md`.
