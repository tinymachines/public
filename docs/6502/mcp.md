---
title: MCP
description: Five tools, each one a whole errand, because a model cannot hold 2 KB of hex.
order: 7
---

# MCP

`POST /mcp` speaks the Model Context Protocol over streamable HTTP, with no
session and no SSE stream, for the same reason [the API](/docs/6502/the-api)
keeps no sessions.

Five tools: `console_spec`, `assemble`, `run`, `mint_cartridge`, `chip_atlas`.

## Connecting a client

The chip's endpoint, and the site's, which has three tools about what the
pieces are and which of them are up:

```
https://6502.tinymachines.ai/api/mcp
https://tinymachines.ai/api/mcp
```

For Claude Code:

```
claude mcp add --transport http 6502 https://6502.tinymachines.ai/api/mcp
claude mcp add --transport http tinymachines https://tinymachines.ai/api/mcp
```

For a client that reads an `mcpServers` block (Claude Desktop, Cursor and
the like):

```json
{
  "mcpServers": {
    "6502": { "type": "http", "url": "https://6502.tinymachines.ai/api/mcp" },
    "tinymachines": { "type": "http", "url": "https://tinymachines.ai/api/mcp" }
  }
}
```

No key, no session header, no stream to open. Both servers speak the
`2025-06-18`, `2025-03-26` and `2024-11-05` revisions of the protocol; a
client asking for a newer one is answered in the newest of those, which is
what the protocol says to do. A `GET` on either endpoint is a 405 with
`Allow: POST`: there is no SSE stream, and the older HTTP+SSE transport,
which opens one with a `GET` first, is not spoken.

## The tools are coarse where the HTTP routes are fine-grained

That is the design, not an oversight.

The API is stateless because a *program* holds the machine: 2 KB of hex out and
back, and the client's copy is the session. An MCP client is a language model,
and a model cannot usefully hold 2 KB of hex. So `run` assembles, boots, steps
and reports in one call, and the machine never leaves the server.

## run renders the screen

`run` renders the screen as two hex characters a cell.

That is the one thing that turns writing a 6502 game from guessing into
working: an assembler says the bytes are legal, and only the picture says the
program is right.

## What holds it honest

The MCP suite reproduces the project's own witness rather than consulting a
table. `$2E + $14` reads `$42` at `$0082` by half-cycle 41, which is the number
the programs page, the API reference and the service suite all state.

Nothing in that path consults an instruction table, so agreeing is evidence
rather than a restatement.
