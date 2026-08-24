---
title: tinymachines
description: One roof over six pieces of 6502 work that already run.
order: 1
---

# tinymachines

A transistor-level MOS 6502, the things built on it, and the documentation for
both. Six pieces exist and run. This tree is where they are written down
together for the first time.

Nothing here models 6502 behaviour. There is no instruction decoder, no
addressing-mode table, no cycle-count lookup. There are 1725 wires and 3510
switches, and the behaviour falls out of simulating them.

## Where to start

| | |
|---|---|
| [The simulator](/docs/6502) | what runs the chip, and why every register value is read back off the die |
| [Verification](/docs/6502/verification) | the two oracles, and why either alone is insufficient |
| [The API](/docs/6502/the-api) | the whole machine travels in every request |
| [The chip atlas](/docs/6502/the-atlas) | what a wire is part of |
| [The console contract](/docs/6502/the-console-contract) | a frame is an agreement, not hardware |
| [Cartridges](/docs/6502/cartridges) | a ROM, its tiles and the contract, in one file |
| [MCP](/docs/6502/mcp) | five tools, each one a whole errand |
| [The registry](/docs/6502/the-registry) | builders, and why publishing measures rather than believes |

## What is running now

Five surfaces are here: [the explorer](/6502/explorer) and its measured
tables, [the console](/6502/games), [the builder pages](/6502/builders),
[the lab](/6502/lab), and [the visual6502 archive](/6502/archive/). Each still
answers at its own subdomain as well, because nothing has been switched off.

The chip data is the exception, and deliberately so. The explorer's die
geometry, its measured tables and its wasm bundle are served from the 6502
site's own directory rather than copied here: all of it is CC BY-NC-SA, and
this repository does not redistribute it. See `NOTICE.md`.

What has not moved is the cartridge editor. The builder pages read the live
registry from here over CORS, which is what that service's open
`Access-Control-Allow-Origin` was for, but editing sends a bearer token and the
preflight from this origin does not admit an `Authorization` header. That is a
header that is not there rather than a decision that has not been taken. See
[the registry](/docs/6502/the-registry).

## What is not here yet

This tree is being moved out of four repository READMEs that were reachable
only by cloning. Moved so far: the simulator, verification, the API, the atlas,
the console contract, cartridges, MCP and the registry.

Not moved yet, and deliberately: the reference tables currently inside the 6502
service's own `api.html`. The memory map, the tile encoding and the shapes that
travel are all things the running service already publishes, `GET /v1/console`
being the contract as data. Copying them here would make a third copy of a fact
that already exists twice, so they arrive when `/api` does and they arrive
generated from the Pydantic models that validate the requests, not retyped.
