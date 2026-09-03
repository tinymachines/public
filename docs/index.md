---
title: tinymachines
description: One roof over the 6502 work, the hotbits instrument and the ntsc-crt simulator, all already running.
order: 1
---

# tinymachines

A transistor-level MOS 6502 and the things built on it, a Geiger counter
turning decay into random bytes, an NTSC signal simulated at the waveform,
and the documentation for all of it. Everything
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

The chip itself has a shelf of analysis, pulled from the 6502 tree at build
time rather than retyped, so these pages cannot drift from the documents they
are:

| | |
|---|---|
| [The chip atlas: an address for every part](/docs/6502/atlas) | the rubric, and an entry per container, generated from the die data |
| [How this chip is built](/docs/6502/idioms) | the recurring circuit idioms, counted from the switch network |
| [Snake, one instruction deep](/docs/6502/walk-snake) | one real instruction through the silicon, five cycles, schematics pulled live |
| [Engine-side answers to the Lab's findings](/docs/6502/findings-answers) | the halfwave review, answered, with the tests that hold each answer |

And for hotbits:

| | |
|---|---|
| [The instrument](/docs/hotbits) | the chain from a decay event to a byte somebody can fetch |
| [The bits](/docs/hotbits/the-bits) | one bit per pair of gaps, and why the bias cancels by symmetry |
| [The health tests](/docs/hotbits/the-health-tests) | three layers on three timescales, and the one that refuses to serve |
| [The gateway](/docs/hotbits/the-gateway) | why the open endpoints closed, and what a browser is allowed to see |

## What is running now

Seven surfaces are here: [the explorer](/6502/explorer) and its measured
tables, [the console](/6502/games), [the builder pages](/6502/builders),
[the lab](/6502/lab), [the API reference](/6502/api),
[the editor](/6502/manage) and [the visual6502 archive](/6502/archive/). Each
still answers at its own subdomain as well, because nothing has been switched
off.

The chip data is the exception, and deliberately so. The explorer's die
geometry, its measured tables and its wasm bundle are served from the 6502
site's own directory rather than copied here: all of it is CC BY-NC-SA, and
this repository does not redistribute it. See `NOTICE.md`.

The cartridge editor arrived last, at [/6502/manage](/6502/manage). For a
while it could not: editing sends a bearer token, and the preflight from this
origin refused the `Authorization` header, so the request was never made at
all. That was a header that was not there rather than a decision, and once the
service's CORS policy admitted it (`tinymachines/6502#12`, fixed 2026-08-24),
the page moved like the others. See [the registry](/docs/6502/the-registry).

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

## The third project

[ntsc-crt](/ntsc) is signal-level NTSC: the composite waveform between a
console and a tube, encoded from three sources, pulled apart by four
different filters, and displayed through a five-stage CRT model. The 6502
work simulates a chip at its switches; this simulates the signal, and the
two meet at the NES.

Its landing page is a measurement report. The repository declared every
pre-computed number in its own spec a claim for a test to confirm, and three
did not survive; the page carries the corrections, and every figure it
states was re-measured for it by running the project's own scanner, suite
and mutation run at a pinned commit. The documentation has not moved into
this tree yet; it lives in
[the repository](https://github.com/tinymachines/ntsc-crt).

## The console taking shape

[The console arc has a landing now](/nes), a measurement report in the
house shape. The 6502 work and the signal work meet at the NES, and the meeting is now
being built end to end, chip by chip, under a written plan whose checkpoints
are recorded reference traces rather than intentions. The new repositories
are public:

- [nes-bus](https://github.com/tinymachines/nes-bus) holds the contracts:
  the frame types and pin tables every chip crate speaks, dependency-free,
  so the PPU, the CPU and the encoder can be proven against each other
  instead of against copies.
- [2a03](https://github.com/tinymachines/2a03) is the NES CPU, the family's
  fifth chip through the same engine calls, and the first to match its
  reference bit for bit with no list of exceptions at all. It has also
  made first sound: a small program of ours runs on the chip through a
  memory harness, the reference's own run of the same program replays
  through it bit for bit, and the square channel's output swings in
  plateaus whose length comes straight from the program's own timer byte.
- [2c02](https://github.com/tinymachines/2c02) is the PPU, whose recorded
  reference run now goes through the contract's pin frames, with a built-in
  sabotage that lies about one pin's polarity and must make it fail.

The fifth chip also settled a question the engine had carried since its
first release: which way a group resolves when a layout pull fights an
external drive. Four chips never formed such a group; the 2A03's set
overflow chain forms three at power-on, its reference resolves them low,
and [halfphi](https://github.com/tinymachines/halfphi) 0.1.3 now agrees,
with the swap proven unobservable on every other chip. And the signal side
has met real silicon: [the ntsc page](/ntsc) now carries frames decoded
from raw oscilloscope records of a real console, and the first colour
scored against the pipeline's own synthesis. Documentation for these lives
in the repositories until it moves into this tree.

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
