# Step 7: what is needed from `tinymachines/6502`

Written from this repository, which does not reach across. Everything below is
a request or a finding, not a change. Measured 2026-08-22 against the checkout
at `~/projects/tinymachines/6502` and the live API.

## The brief's blocker is gone

`START-HERE.md` step 7 says:

> The blocker is concrete: the wasm crate cannot export or import a machine.
> Zero state functions on it.

**That is no longer true.** `crates/v6502-wasm/src/lib.rs` exports
`exportMachine()` at line 323 and `importState()` at line 385, both built on
the same codec the service uses: `state::snapshot` and
`MachineState::from_hex`. `exportMachine()` emits the API's own `{state,
memory}` JSON.

So the two surfaces already exchange a machine, and the interchangeability
property step 7 is aiming at is available today.

**Verified rather than read.** A machine shaped exactly as the wasm emits it,
including the missing `version` field, was posted to the live
`POST /v1/step` and stepped from half-cycle 0 to 8. `version` is `const 1` with
a default and is not in the schema's `required` list, so its absence validates.

`START-HERE.md` step 7 should be updated, and the wording that needs changing
is the paragraph beginning "The blocker is concrete".

## What this repository has built

- `web/public/engine/tm6502.mjs`, served at `/engine/tm6502.mjs`. One session
  interface over two backends, no build step and no dependencies. MIT, and it
  contains no chip.
- `docs/6502/two-ways-in.mdx`, which documents the shared shape and the name
  mapping, and runs the worked example live against the API.

## What is wanted from the 6502 side

Four things, in the order they unblock each other.

### 1. Memory should travel with `importState`, or the asymmetry should be documented

`importState` restores the chip half only. Memory goes separately through
`fillMemory` and `load`, which the crate's own comment says. The wrapper does
this and it works, but it is the one place the two backends genuinely differ
rather than differ in naming, and a caller who forgets it gets a chip that is
correct running a program that is not there.

Either an `importMachine(json)` that does both, or a doc comment on
`importState` saying plainly that a machine is not restored until memory is
too. The first is nicer; the second costs nothing.

### 2. A published JavaScript package that ships no die data

The current 106 KB wasm bundle **embeds the die data**: `v6502-wasm` depends on
`v6502-sim` depends on `v6502-netlist`, which `include_bytes!`s `netlist.bin`.
That bundle carries CC BY-NC-SA 3.0 whatever the repo's licence file says about
the code.

A JavaScript package that wants to be MIT the way the crate is has to ship no
die data and take a netlist at runtime, exactly as `halfphi` does in Rust. Two
packages, split along the line the Rust side already draws. That is also the
better product: chip-agnostic, and it loads the 6800 and the Z80 as well.

Until that exists, `local({ engine })` in the wrapper is code with nothing to
run against from here, and this site cannot demonstrate the local backend
without serving NonCommercial data from an MIT page.

### 3. An assembler on the wasm side, or a clear statement that there is not one

`local()` cannot assemble, because the wasm build has no assembler. The wrapper
refuses with that reason and points at the remote backend. That is honest but
it means "the same interface either way" has one hole in it, and it is the hole
a beginner hits first.

### 4. Two names that could match and do not

Not important, and cheap:

| wasm | HTTP |
|---|---|
| `runHalfCycles(n)` | `half_cycles` |
| `stepInstruction(max)` | `until: "instruction"`, `max_half_cycles` |

The wrapper maps them. If the crate ever grows a convenience method, matching
the request field names would remove the mapping.

## One thing found on the way that is not step 7

`POST /v1/step` takes `half_cycles`. An earlier attempt here sent `n` and got a
422 with no hint about which field was wrong, which cost a round. Not a bug:
FastAPI's validation error does name the field, and reading it was faster than
guessing. Recorded only because the next person will make the same guess.
