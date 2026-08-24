---
title: The instrument
description: A Geiger counter on a Pi, and the chain from a decay event to a byte somebody can fetch.
# 2 rather than 1: this orders the SECTIONS. The 6502 tree's own index is
# order 1, and the chip stays first in the sidebar; within this directory the
# sibling pages carry their own numbers.
order: 2
---

# The instrument

hotbits is true random bytes from radioactive decay. The instrument is a
sealed thorium calibration card sitting against an SBM-20 Geiger tube on a
CAJOE RadiationD-v1.1 counter board, with a Raspberry Pi 4 timestamping every
detected event. Everything downstream of the tube is bookkeeping: nothing adds
randomness after the nucleus has decayed.

The chain, end to end:

| stage | what happens | where |
|---|---|---|
| decay | a nucleus in the Th-232 chain decays; the tube discharges | the card and the tube |
| pulse | the board's NE555 shapes the discharge into a clean edge | the counter board |
| timestamp | the Pi records the edge as one monotonic nanosecond value | `logger.py`, one line per event, append-only |
| bits | pairs of gaps between events are compared; each pair is one bit | `extract_stream.py`, every minute |
| health | the new bits pass the continuous tests or the pool refuses to serve | the same pass, see [the health tests](/docs/hotbits/the-health-tests) |
| pool | fresh bytes accumulate in an append-only file with a consume watermark | the API's pool |
| gateway | a key spends bytes; seeds and replays stay open | [the gateway](/docs/hotbits/the-gateway) |

The source is a thorium card rather than something exotic for a reason worth
recording: Th-232 in secular equilibrium is a whole decay chain, six alpha
emitters and several beta emitters, all decaying independently and all summed
at one tube. A sum of independent Poisson processes is still Poisson, which is
the only property [the bit extraction](/docs/hotbits/the-bits) needs.

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
  copying lab notes is how they stop being true.
- **The gateway's internals.** Key issuance and byte budgets run on the
  instrument itself and their source is not in the tree this site builds
  from. [The gateway page](/docs/hotbits/the-gateway) documents what the
  service can be observed to do, and says so where observation is all there
  is.
