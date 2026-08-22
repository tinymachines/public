---
title: Verification
description: Two independent oracles, because either alone is insufficient.
order: 2
---

# Verification

Two independent oracles, because either alone is insufficient.

## Differential against the original

A headless harness runs the visual6502 JavaScript engine and dumps the level of
*all 1725 nodes at every half-cycle*. The Rust engine matches bit-exactly.

Matching registers would only show agreement about the 6502. Matching every
node shows agreement about the silicon.

## Against the documented ISA

Datasheet cycle counts including page-crossing and branch penalties, the
read-modify-write double write, JSR/RTS stack layout, ADC/SBC flags, and BCD.

A shared misreading of the die data would pass the first test and fail this
one. That is the reason for having both.

## Running them

The differential test needs an oracle generated before it can run. Without it,
that one test skips rather than passing on nothing.

```bash
git clone --recurse-submodules https://github.com/tinymachines/6502
cd 6502

cargo test --workspace

# The differential test against the original needs an oracle generated first;
# without it that one test skips.
node tools/golden-trace/gen.js --steps 3000
```

The die data is a submodule rather than a copy, for the licensing reason set
out in [the simulator](/docs/6502). If you cloned without
`--recurse-submodules`, the build has no die data to parse:

```bash
git submodule update --init
```

## What state restoration is held to

`crates/v6502-sim/tests/state.rs` is the licence for the API's central claim.
Restoring a snapshot into a fresh machine is proven bit-exact over every node
at every half-cycle, and three serialize-and-resume hops land exactly where one
straight run does. `test_service.py` proves the same thing through the HTTP
surface.

That is what makes [the stateless API](/docs/6502/the-api) an engineering fact
rather than an intention.
