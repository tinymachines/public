---
title: What the engine side needs
description: Four measured requests for tinymachines/6502, so the engine can be driven the same way in a page and over HTTP.
order: 10
---

Written from `tinymachines/public`, which does not reach across. Everything
below is a request or a finding, never a change. Every claim was measured
against the checkout at `~/projects/tinymachines/6502` and the live API on
2026-08-22, and the measurement is given so it can be re-run rather than
believed.

**Nothing here blocks the roof.** `/engine/tm6502.mjs` and
`/docs/6502/two-ways-in` are built and serving. This is the list of things that
would close the remaining gaps, in the order they unblock each other.

---

## First: the brief's blocker is gone

`START-HERE.md` step 7 says:

> The blocker is concrete: the wasm crate cannot export or import a machine.
> Zero state functions on it.

**That is no longer true.** `crates/v6502-wasm/src/lib.rs` exports
`exportMachine()` at line 323 and `importState()` at line 385, both built on
the codec the service already uses: `state::snapshot` and
`MachineState::from_hex` in `crates/v6502-sim/src/state.rs`. `exportMachine()`
emits the API's own `{state, memory}` JSON.

**Measured, not read.** A machine shaped exactly as the wasm emits it,
including the missing `version` field, was posted to the live `POST /v1/step`
and stepped from half-cycle 0 to 8. `version` is `const 1` with a default and
is absent from the schema's `required` list, so its absence validates.

So the two surfaces already exchange a machine, and the interchangeability step
7 is aiming at is available today. **The paragraph beginning "The blocker is
concrete" is what needs rewriting in `START-HERE.md`.**

---

## 1. Memory should travel with `importState`, or the asymmetry should be documented

**What is true now.** `importState` restores the chip half only. Memory goes
separately through `fillMemory` and `load`, which the crate's own doc comment
says plainly.

**Why it matters.** It is the one place the two surfaces genuinely differ
rather than differ in naming. Over HTTP a machine is one value and arrives
whole. In the browser it is two calls, and a caller who makes only the first
gets a chip that is correct running a program that is not there. That failure
looks like a simulation bug, not a missing call.

`/engine/tm6502.mjs` does both, in `restoreInto()`, so the wrapper is not
blocked. The request is so that a reader who skips the wrapper is not.

**Either would do.** An `importMachine(json)` that does both, which is nicer.
Or one sentence on `importState` saying a machine is not restored until memory
is too, which costs nothing.

## 2. A JavaScript package that ships no die data

**This is the one with a licence consequence, and it is easy to get backwards.**

**Measured.** `v6502-wasm` depends on `v6502-sim` depends on `v6502-netlist`,
and `crates/v6502-netlist/src/lib.rs:26` does
`include_bytes!(concat!(env!("OUT_DIR"), "/netlist.bin"))`. That blob is 32,628
bytes. The built bundle at `dist/pkg/v6502_wasm_bg.84797a3e.wasm` is 108,956
bytes and contains it.

So **that bundle carries CC BY-NC-SA 3.0**, whatever the repository's licence
file says about the code around it. A JavaScript package that bundled it would
put NonCommercial and ShareAlike on something advertised as MIT.

**What to build.** A package that ships no die data and takes a netlist at
runtime, exactly as `halfphi` does in Rust. Two packages, split along the line
the Rust side already draws between `halfphi`, which names no chip, and
`v6502-netlist`, which is the die data. That is also the better product:
chip-agnostic, and it loads the 6800 and the Z80 as well.

**What it unblocks here.** Until it exists, `local({ engine })` in the wrapper
is code with nothing to run against, and this site cannot demonstrate the local
backend without serving NonCommercial data from a page that is MIT.

## 3. Publish the assembler that already exists

**This one turned out to need no Rust work at all, and my earlier note asking
for a Rust assembler was wrong.**

**Measured.** `web/asm.js` is a 376-line ES module exporting `assemble(source,
{org})` and `AsmError`. It imports exactly one thing, `OPCODES` from
`./disasm.js`, which is 96 lines and imports nothing. Neither file mentions the
netlist, the die data or any `.bin`, and neither makes a network call. Run
straight out of the tree under node it assembles `LDA #$2E / CLC / ADC #$14 /
BRK` to `a9 2e 18 69 14 00`, byte for byte what the API returns for the same
source.

It is also **the only assembler in the project**: `service/asm-bridge.mjs` says
so, and the Python service shells out to it rather than keeping a second one,
so the two cannot drift.

**So the request is small.** Publish `asm.js` and `disasm.js` as an MIT package,
or simply serve them at a stable URL. 19 KB for the pair, no dependencies, no
die data. That closes the one hole in "the same interface either way": `local()`
currently cannot assemble and says so, and it is the hole a beginner hits first.

## 4. Two names that could match and do not

Not important, and cheap.

| wasm | HTTP |
|---|---|
| `runHalfCycles(n)` | `half_cycles` |
| `stepInstruction(max)` | `until: "instruction"` plus `max_half_cycles` |

The wrapper maps them. If the crate ever grows a convenience method, matching
the request field names would delete the mapping rather than move it.

---

## What is already right, and should not be disturbed

Worth stating, because the list above is all deficits and the balance is
misleading.

- **The codec is the same on both sides and it is written down.** Lowercase
  hex, bit *i* of a set in byte *i*/8 LSB first. Measured on a live machine:
  216 bytes for each node set, 432 hex characters, and 439 bytes for the
  transistor set, 878 characters. Exactly the numbers `START-HERE.md` states.
- **`exportMachine` emits the service's shape rather than a second one.** That
  decision is the reason step 7 is a wrapper and not a protocol.
- **The API is stateless and carries the whole machine.** This is what makes
  the two backends interchangeable by construction rather than by effort. Start
  a run in the browser, finish it on the server, or the reverse. Demonstrated
  from this repository: a machine exported after 40 half-cycles, imported into
  a second session, and continued to 50.
- **`importState` clears the rewind history**, with a comment saying why:
  keeping it would let `stepBack` walk into a machine this one never was. That
  is the right call and worth not losing.

## One thing found on the way that is not step 7

`POST /v1/step` takes `half_cycles`. An attempt here sent `n` and got a 422.
Not a bug: FastAPI named the field in the response and reading it was faster
than guessing. Recorded only because the next person will make the same guess.
