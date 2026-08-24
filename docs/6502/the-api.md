---
title: The API
description: A transistor-level 6502 over HTTP, with the whole machine travelling in every request.
order: 3
---

# The API

The reference is at [/6502/api](/6502/api), where it checks itself against the
running service and says which routes it describes do not answer yet. The
service answers at `6502.tinymachines.ai/api`, and is not proxied under the
apex: it runs with a root path of `/api`, so an interactive client reading its
schema from a second path would issue requests against this site's own API and
get answers from the wrong service rather than an error.

A transistor-level MOS 6502 over HTTP, one half-cycle at a time. Nothing here
models 6502 behaviour: every request settles the real 3510-switch network and
every register in every response is read back out of its own storage nodes.

## The server is stateless

The whole machine travels in each request as a `Machine` object: the four chip
bitsets (every node level, every pull, every conducting transistor, about 2 KB
of hex) plus a sparse 64 KiB memory, which is a fill byte and only the 256-byte
pages that differ from it. The response carries the whole machine back.

Your copy of that object **is** the session. That is what lets any number of
instances answer any request, and what makes a session something you can save
to a file, diff, or hand to somebody else.

The claim is held to a test rather than asserted. See
[verification](/docs/6502/verification#what-state-restoration-is-held-to).

## The flow a learner follows

```bash
# 1. Assemble (or skip straight to boot with a rom: the boot assembles too).
curl -s localhost:6502/v1/assemble -H 'content-type: application/json' -d '{
  "source": "        .org $0200\nstart:  LDA #$2E\n        STA $80\n        JMP start"
}'
# -> bytes, a listing with an address and bytes per line, the label table

# 2. Boot: the rom is laid into memory at its org, the reset vector aimed at
#    it, and the chip power-cycled through its real reset sequence. The
#    machine comes back standing at its first opcode fetch.
curl -s localhost:6502/v1/boot -d '{"rom": {"source": "..."}}' > m0.json

# 3. Step: POST the machine back with a half-cycle count, or
#    until="instruction" to run to the next opcode fetch. trace=true returns
#    one Observation per half-cycle; watch=["sync","sb0"] reads any named
#    node on the die at each one.
jq '{machine, half_cycles: 41, trace: true}' m0.json | \
  curl -s localhost:6502/v1/step -d @- > m1.json
```

An `Observation` is what a learner reads at one instant: the bus (address,
data, read/write, sync), the registers with a `nv-BdIzC` flag string, the clock
phase, the timing chain's T-states, the last opcode fetch, and any watched
nodes. All of it read off the silicon, none of it modelled.

## What to try first

The programs page's "Add two bytes" (`$2E + $14`): boot it, step 41 half-cycles
with `trace` on, and watch the answer. At half-cycle about 37 the adder holds
`$42` while `A` still reads `$40`. The ADC's result exists and is in no register
until the next instruction's fetch transfers it.

That overlap is real silicon behaviour, it is invisible in every behavioural
emulator, and seeing it in a trace is the reason this service simulates
switches instead of opcodes.

## The pieces

| | |
|---|---|
| `target/release/halfwave` | The engine: a warm, resident, stateless chip. Netlist parsed once; state injected per request. Line protocol in, one JSON line out. Zero dependencies. |
| `asm-bridge.mjs` | The assembler: `web/asm.js` over stdin and stdout. There is one assembler in this project and this is how the service uses it rather than growing a second one. |
| `models.py` | The public shapes (Pydantic): `Machine`, `ChipState`, `SparseMemory`, `Rom`, `Observation`. |
| `engine.py` | The pool of warm engine processes. |
| `app.py` | FastAPI: the endpoints. |
| `atlas.py` | [The chip atlas](/docs/6502/the-atlas): the die's derived containers, indexed and queryable. Reads two generated files and runs nothing. |
| `test_service.py` | 26 tests, end to end. |
| `test_atlas.py` | 52 tests over the atlas, against the site's own published figures. |

## Running it locally

```bash
# The engine (once):
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
cargo build --release -p v6502-sim --bin halfwave

# The service:
uvicorn app:app --app-dir service --port 6502

# The tests:
python3 -m pytest service/test_service.py -q
```

Environment: `HALFWAVE_BIN` (path to the engine, default
`target/release/halfwave`), `HALFWAVE_POOL` (warm instances, default 2), and
`NODE` (node binary for the assembler, default `node`, needs 16 or later).

Port 6502 is the live API's. A local server started on a port already bound
fails to bind silently, and every request then goes to production. Check
`ss -ltn` before believing a local server is yours.

## Numbers for whoever builds on this

Each of these was measured rather than estimated, and the sentence that says so
travels with it.

- **About 26,000 half-cycles per second per warm instance.** A request is
  bounded at 200,000 half-cycles (`max_step` in `/v1/meta`), so long runs have
  to be sharded.
- **Twelve warm chips, up before the first request** (`HALFWAVE_POOL`, 3 ms and
  2.2 MB each). That is 5.55 times the throughput of one, not 12 times: this is
  a 6-core part with two threads per core and the solver is compute-bound, so
  the second thread on a core has little to interleave with.
- **About 980 requests a second** when the work is one half-cycle. The HTTP
  layer is not the limit, and that was measured, not assumed.
- The engine caps traced steps at **10,000 per request**.

## Refusals, rather than plausible answers

- A JAM opcode (`$02` and friends) never reaches another fetch.
  `until="instruction"` returns `completed: false` when the cap is hit, which is
  the honest answer rather than a hang.
- The chip's own quirks are surfaced, not smoothed. `S` is undefined out of
  power-on, since reset only decrements it by three. `P` bit 5 reads as 1
  because no storage node exists for it. A boot into memory with no reset
  vector runs whatever `$FFFC` points at, exactly like the silicon.
