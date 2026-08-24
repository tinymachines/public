---
title: tinymachines
description: One roof over the 6502 work and the hotbits instrument, both already running.
order: 1
---

# tinymachines

A transistor-level MOS 6502 and the things built on it, a Geiger counter
turning decay into random bytes, and the documentation for both. Everything
documented here exists and runs. This tree is where it is written down
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

And for hotbits:

| | |
|---|---|
| [The instrument](/docs/hotbits) | the chain from a decay event to a byte somebody can fetch |
| [The bits](/docs/hotbits/the-bits) | one bit per pair of gaps, and why the bias cancels by symmetry |
| [The health tests](/docs/hotbits/the-health-tests) | three layers on three timescales, and the one that refuses to serve |
| [The gateway](/docs/hotbits/the-gateway) | why the open endpoints closed, and what a browser is allowed to see |

## What is running now

Six surfaces are here: [the explorer](/6502/explorer) and its measured tables,
[the console](/6502/games), [the builder pages](/6502/builders),
[the lab](/6502/lab), [the API reference](/6502/api) and
[the visual6502 archive](/6502/archive/). Each still answers at its own
subdomain as well, because nothing has been switched off.

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

## The second project

[hotbits](/hotbits) is here too, which makes this a roof rather than a 6502
site with a roof on it. It is true random bytes from radioactive decay: a
Geiger counter on a Pi, with each bit taken from comparing one gap between
decay events with the next, so the bias cancels by symmetry rather than by
correction.

Two pages, and both of them ask rather than state. The landing page reads the
byte pool from the running instrument when you load it, because a pool that
refills at a few dozen bytes a minute is a number that is wrong within the
hour; what the rate was when somebody measured it, and where each figure came
from, is written down in [the bits](/docs/hotbits/the-bits). [The
reference](/hotbits/api) is generated from the instrument's own `openapi.json`
in your browser and then calls what it describes, which is how it can report
that four documented endpoints answer in a way no browser is allowed to read.

The documentation is a section of this tree now: [the
instrument](/docs/hotbits), [the bits](/docs/hotbits/the-bits), [the health
tests](/docs/hotbits/the-health-tests) and [the
gateway](/docs/hotbits/the-gateway). The extraction and the health tests are
written from the instrument's source; the gateway is written from calling it,
and each page says which of the two it is doing.

It has no design yet, deliberately. `style/projects/hotbits.css` lists every
lever a project may pull, commented out and empty, and the palette is the
owner's to make. The day it is filled in both pages change and neither is
edited.

## What is not here yet

This tree is being moved out of four repository READMEs that were reachable
only by cloning. Moved so far: the simulator, verification, the API, the atlas,
the console contract, cartridges, MCP and the registry.

`api.html` arrived with the rest: it is read out of the 6502 repository at
build time and rendered at [/6502/api](/6502/api), not retyped, and it checks
itself against the running service rather than asserting what exists. That
check found the gap the moment it was written: three routes described in the
document are merged upstream and are not deployed, and the page names them.

The service moved too, settled 2026-08-24, and the reason it could not move
earlier is worth keeping: it ran with one static root path of `/api`, so its
schema said `servers: /api` everywhere, and a client reading that schema under
the apex would have called this site's own API instead and got answers from
the wrong service. The service now names, per request, the door a request
came through, so `tinymachines.ai/6502/api/openapi.json` says `/6502/api` and
the subdomain's copy still says `/api`, and each is true where it is read.
One process, several front doors, each door honest; every deploy of this site
re-checks both claims from outside. The subdomain stays the canonical address
until the flip becomes a redirect.
