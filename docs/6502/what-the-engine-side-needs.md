---
title: What the engine side needs
description: Four measured requests for tinymachines/6502. Three landed; the fourth was withdrawn once it was measured.
order: 10
---

# What the engine side needs

Written from `tinymachines/public`, which does not reach across. Everything
below is a request or a finding, never a change. Every claim was measured, and
the measurement is given so it can be re-run rather than believed.

**Read against `origin/main`, not a working tree.** Anything not pushed is not
described here.

## Where it stands

| | | |
|---|---|---|
| 1 | Memory should travel with `importState` | **landed** in `d5122f2` |
| 2 | A build that ships no die data | **landed** in `06eb9fb` |
| 3 | Publish the assembler that already exists | **landed** in `7d280c0` |
| 4 | Two names that could match | **withdrawn**, and the reason is below |

Checked against `origin/main` on 2026-08-23, three commits after the merges.

Nothing here blocks the roof. `/engine/tm6502.mjs` and
[Two ways in](/docs/6502/two-ways-in) are built and serving.

## The blocker the brief describes is gone

`START-HERE.md` step 7 says the wasm crate cannot export or import a machine,
and that there are zero state functions on it. That has not been true for some
time.

`exportMachine()` and `importState()` both exist, built on the codec the
service already uses: `state::snapshot` and `MachineState::from_hex`.
`exportMachine()` emits the API's own `{state, memory}` JSON.

Measured rather than read: a machine shaped exactly as the wasm emits it,
including the missing `version` field, was posted to the live `POST /v1/step`
and stepped from half-cycle 0 to 8. `version` is `const 1` with a default and
is absent from the schema's `required` list, so its absence validates.

**The paragraph beginning "The blocker is concrete" is what needs rewriting in
`START-HERE.md`.**

---

## 1. Memory should travel with `importState`

**Landed** in `d5122f2`, as `importMachine`.

`importState` restores the chip half only. Memory goes separately through
`fillMemory` and `load`. The doc comment says so, in the sense that it tells
you what to call, but it describes the arrangement rather than warning about
it.

It is the one place the two surfaces genuinely differ rather than differ in
naming. Over HTTP a machine is one value and arrives whole. In the browser it
is two calls, and a caller who makes only the first gets a chip that is correct
running a program that is not there. **That failure looks like a simulation
bug, not a missing call.**

Either would have done: an `importMachine(json)` that does both, or a sentence
saying a machine is not restored until memory is too.

**Both are there now.** `importMachine` takes decoded bytes and does the pair
in one call, and `importState`'s own doc comment now warns that it leaves
memory alone. `tools/check-wasm-import.py` holds it to that: it asserts that
`importMachine` agrees with `importState` plus `writeMemory` byte for byte,
that the registers match, that a program restored whole computes its sum, and
that `importState` alone leaves the old memory in place, which is the failure
the request was about.

Run against a wasm built from the merged tree, all six assertions pass.
`/engine/tm6502.mjs` still does the pair itself in `restoreInto()`, and can
now do it in one call instead.

## 2. A build that ships no die data

**Landed in `06eb9fb`, "Two builds of the wasm crate: one with the die data,
one without".**

This was the one with a licence consequence, and it is worth recording what it
solved. `v6502-wasm` depends on `v6502-sim` depends on `v6502-netlist`, and
`crates/v6502-netlist/src/lib.rs` embeds `netlist.bin` with `include_bytes!`.
That blob is 32,628 bytes and the built bundle is 108,956. So that bundle
carries CC BY-NC-SA 3.0 whatever the licence file says about the code around
it.

What landed is a `mos6502` feature, on by default, so every existing caller is
unaffected. Turning it off drops `v6502-netlist` and with it the only thing in
the workspace that embeds die data. `Machine.fromNetlist(bytes)` and
`netlistInfoOf(bytes)` take one at runtime instead. Two builds of one crate
rather than two crates that drift.

`tools/check-wasm-nodata.py` came with it, and it guards the dependency tree
rather than the output, for a reason worth quoting: someone adds a convenience,
reaches for `mos6502()` to implement it, the dependency comes back, and nothing
fails. The build works, the tests pass, and the package quietly stops being
MIT.

## 3. Publish the assembler that already exists

**Landed** in `7d280c0`.

This one needed no Rust work at all, and an earlier version of this page asked
for the wrong thing.

`web/asm.js` is a 376-line ES module exporting `assemble()` and `AsmError`. It
imports one thing, `OPCODES` from `./disasm.js`, which is 96 lines and imports
nothing. Neither file mentions a netlist or die data, and neither makes a
network call. Run out of the tree under node it assembles the worked example to
`a9 2e 18 69 14 00`, byte for byte what the API returns for the same source.

It is also the only assembler in the project: `service/asm-bridge.mjs` says so,
and the Python service shells out to it rather than keeping a second one.

It is packaged as `@tinymachines/6502-asm`, MIT, no dependencies, 8.7 kB.
`dist/` is generated from `web/` at build time and gitignored, because a
published copy would reintroduce exactly what the single-assembler arrangement
prevents. The build refuses to produce anything if either file
mentions die data or grows an import reaching outside the package.

## 4. Two names that could match and do not

**Withdrawn.** It was described here as cheap, and measuring it showed it is
not.

| wasm | HTTP |
|---|---|
| `runHalfCycles(n)` | `half_cycles` |
| `stepInstruction(max)` | `until: "instruction"` plus `max_half_cycles` |

The wrapper maps them, and the mapping is two lines. Renaming to match would
delete those two lines and break six callers plus a published API surface: the
names are part of what `v6502-wasm` exports, so changing them is a breaking
change to anything already using it, in exchange for deleting a mapping that
costs nothing to keep.

Left alone deliberately, and written down here so the next person to notice the
mismatch finds the measurement rather than repeating it. A rename is worth
doing if that crate ever has a breaking release for another reason; it is not
worth causing one.

---

## What is already right, and should not be disturbed

The list above is mostly deficits, and the balance is misleading.

- **The codec is the same on both sides and it is written down.** Lowercase
  hex, bit *i* of a set in byte *i*/8 LSB first. Measured on a live machine:
  216 bytes per node set, 432 hex characters, and 439 bytes for the transistor
  set, 878 characters. Exactly the numbers the brief states.
- **`exportMachine` emits the service's shape rather than a second one.** That
  decision is the reason step 7 is a wrapper and not a protocol.
- **The API is stateless and carries the whole machine**, which makes the two
  backends interchangeable by construction rather than by effort. Demonstrated
  from this side: a machine exported after 40 half-cycles, imported into a
  second session, continued to 50.
- **`tools/check-wasm-parity.py` now proves that from the engine side too.** It
  splits a run in half, hands it across in both directions, and requires the
  answer to match an uninterrupted run. That is the claim this documentation
  makes, checked where the engine lives rather than only where it is consumed.
- **`importState` clears the rewind history**, with a comment saying why:
  keeping it would let `stepBack` walk into a machine this one never was.

## One thing found on the way that is not step 7

`POST /v1/step` takes `half_cycles`. An attempt here sent `n` and got a 422.
Not a bug: FastAPI named the field in the response, and reading it was faster
than guessing. Recorded because the next person will make the same guess.
