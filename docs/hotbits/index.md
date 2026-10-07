---
title: The instrument
description: A Geiger counter whose every count is timed in hardware, and the chain from a decay event to a byte somebody can fetch.
# 2 rather than 1: this orders the SECTIONS. The 6502 tree's own index is
# order 1, and the chip stays first in the sidebar; within this directory the
# sibling pages carry their own numbers.
order: 2
---

# The instrument

hotbits is true random bytes from radioactive decay. The instrument is a
sealed thorium calibration card sitting against an SBM-20 Geiger tube on a
CAJOE RadiationD-v1.1 counter board, inside a steel case. Each count leaves
the case as light, through an optocoupler, and a small board outside the
case latches the moment of the edge in hardware and sends it to a server,
where everything else happens. Everything downstream of the tube is
bookkeeping: nothing adds randomness after the nucleus has decayed.

The chain, end to end:

| stage | what happens | where |
|---|---|---|
| decay | a nucleus in the Th-232 chain decays; the tube discharges | the card and the tube |
| pulse | the board's NE555 shapes the discharge into a clean edge | the counter board |
| isolate | the edge drives an optocoupler; only light crosses the wall of the case | the opto beside the counter board |
| timestamp | the emitter latches each falling edge in hardware and streams the numbered edges to the server, each one acknowledged | an ESP32-C6 board, firmware `emitter` |
| gaps | a hardware counter tallies the same pin, so an edge the stream lost is counted as missed, and the chain breaks there rather than joining across it | the emitter, and `extract_stream.py` on the server |
| bits | pairs of gaps between events are compared; each pair is one bit | `extract_stream.py`, every minute, on the server |
| health | the new bits pass the continuous tests or the pool refuses to serve | the same pass, see [the health tests](/docs/hotbits/the-health-tests) |
| pool | fresh bytes accumulate in an append-only file with a consume watermark | the API's pool |
| gateway | a key spends bytes; seeds and replays stay open | [the gateway](/docs/hotbits/the-gateway) |

The source is a thorium card rather than something exotic for a reason worth
recording: Th-232 in secular equilibrium is a whole decay chain, six alpha
emitters and several beta emitters, all decaying independently and all summed
at one tube. A sum of independent Poisson processes is still Poisson, which is
the only property [the bit extraction](/docs/hotbits/the-bits) needs.

## The bench, as of October 2026

Until 2026-10-05 a Raspberry Pi 4 sat beside the counter board and stamped
every edge in software. It is retired: its USB-C power plug melted, and it
was also the weakest link in two other ways, since its timestamps moved by
microseconds with load and temperature, and it shared a ground with the
counter board. What replaced it is the design on the drawing package linked
under the title of this page, and it has three parts.

- **The case.** The counter board runs on its own 5 V adapter and drives an
  optocoupler inside the steel case. Only light crosses the isolation barrier.
- **The emitter.** Outside the case, an ESP32-C6 board latches each falling
  edge in hardware, with a capture clock the drawing records as 160 MHz, which
  is 6.25 ns per tick. It streams the numbered edges over Wi-Fi with
  acknowledgements, and holds 8192 unacknowledged edges, about thirteen
  minutes at the usual rate, through an outage. A hardware pulse counter
  tallies the same pin, so an edge that was lost is counted as missed rather
  than quietly skipped.
- **The server.** Extraction, the health tests and the API now run on a
  server, not on the instrument. The extractor restarts its chain of gaps at
  every missed edge, so no interval is ever formed across one.

Where it stood on 2026-10-06: the emitter and the receiver were built and run
end to end on the chip's own test pulses, with nothing missed, and the
receiver drops a link that falls silent for ten seconds. The optocoupler was
being wired to the counter board, and real counts were not yet flowing. So
the pool was not being fed by the tube at that moment, and the only claim
about the pool to trust is the one [the landing page](/hotbits) makes by
reading it when you load it.

Two limits the drawing states rather than hides: the tube and the counter
board's pulse shaper add jitter of the order of microseconds, so the low bits
of a 6.25 ns timestamp are the tube's noise rather than the decay's; and the
optocoupler fitted first is a slow stand-in, with a fast one to be ordered.

## Where it is on this site

Two pages, and both ask the instrument rather than stating things about it.
[/hotbits](/hotbits) reads the byte pool and the health verdicts from the
running service when you load it. [/hotbits/api](/hotbits/api) renders the
service's own `openapi.json` and then calls every route it describes, so the
reference can say which documented routes are answering right now instead of
asserting that they should be.

## What this tree covers, and what it does not

These pages cover the part that can be checked from here: the extraction and
its health tests are read from the instrument's source tree, and the gateway's
behaviour is measured by calling it. Two things are deliberately not restated:

- **The bench.** Grounding, the scope work, the chassis history and the
  parts list live in the instrument's own repository. They are lab notes, and
  copying lab notes is how they stop being true. The drawing package is the
  one piece of the bench served here, because a drawing is built from its
  sources and checked against them before it is linked.
- **The gateway's internals.** Key issuance and byte budgets run on the
  server that holds the pool, and their source is not in the tree this site
  builds from. [The gateway page](/docs/hotbits/the-gateway) documents what
  the service can be observed to do, and says so where observation is all
  there is.
