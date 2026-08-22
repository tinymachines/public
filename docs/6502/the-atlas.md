---
title: The chip atlas
description: What a wire is part of, walked out of the switch network rather than named by hand.
order: 4
---

# The chip atlas

`/v1/nodes` answers *what can I watch*, and its grouping is a reading of the
die's names. Five more routes answer *what is this node part of*, and every
answer is measured.

Twenty-three kinds of machinery, walked out of the switch network by
`web/chip-groups.js`, the module the tracer and the chip map draw with, and
exported by `tools/export-groups.mjs` into `web/groups.json`.

```bash
curl -s localhost:6502/v1/atlas/full                  # ALL of it, one file, 48 KB gzipped
curl -s localhost:6502/v1/atlas                       # just the kinds, blocks, counts
curl -s 'localhost:6502/v1/groups?kind=alu'           # the ALU as 17 containers
curl -s 'localhost:6502/v1/groups/regs:a'             # one, with its wiring
curl -s 'localhost:6502/v1/tags?multi=true'           # the 88 nodes in more than one
curl -s 'localhost:6502/v1/node/pipeUNK39'            # one node, all of its tags
curl -s 'localhost:6502/v1/neighbors?node=a0&via=switch'
```

## Two layers, and the difference is the point

The **partition** is 132 groups with every one of the 1547 nodes in exactly
one, because a drawing needs disjoint boxes.

The **containers** are the same derivations unfiltered: 135 of them,
overlapping, with 88 nodes in more than one, and three (`sdp:sd1`, `sdp:sd2`,
`sbus:link`) that exist only there.

`?layer=containers` on a group asks for the derivation's own set instead of the
box. `intr:nmi` is 20 nodes as a walk and 18 as a box, and the two it loses
include `pipeVectorA2`, the one address bit by which `$FFFA` differs from
`$FFFE`.

## Why it is cacheable

Nothing here runs the chip and none of it changes, so nginx serves the whole
family `public, max-age=86400`.

It is held in memory, so it is rebuilt whenever the die exporters run, which
`deploy.sh` does, and then the service is restarted.

## What the atlas settled that a hand-written list had wrong

The console's gate labels used to be eight strings typed beside eight watched
line names, which is two claims where there is one fact. The atlas answers
instead, and agrees on five of the eight.

The three it does not agree on are the useful part. `ADDADL` and `ADHPCH` each
open one switch a bit, and the hand-written pair had named bit 2 and bit 3
where bit 0 is canonical. `XSB` joins `sb0` to a node **the die never named**,
so the hand-written `x0 - sb0` was naming the register a reader assumes is
there. The atlas says that node is owned by `regs:x`.

That correction is pinned by a test in the service suite, which asserts
`dpc2_XSB` reads `regs:x - sb0`. See [the console
contract](/docs/6502/the-console-contract#the-gates-are-real) for what the
gates are and why they were chosen by measurement.
