# One engine in the strip

*Decided 2026-08-25 (owner): the finale for the 6502 floor is a single 6502
engine that lives in the strip and drives whichever screen is showing, so a
user moving between the explorer, the primer, the console and the Lab is
moving between views of ONE running chip. And an option to switch the engine
between local (wasm in the browser) and the API (halfwave, over HTTP).*

This note is the shape, so the pieces that arrive one at a time arrive in
the right places. *Status, 2026-08-26 evening: steps 1 and 2 have arrived,
upstream, as `6502/web/chip-machine.js` (6502@d50c52e, release v0.251); the
strip is mounted once in the 6502 layout and power, opcode step and seek
are real on every wasm page. `notes/strip-recon.md` is the survey that
preceded it.*

## What exists, and where the seam is

- `web/chip-controls.js` (upstream, in the 6502 tree) is already the one
  store: running, Hz, one registered driver. The strip is a view of it, and
  the store instance survives client-side navigation. What does NOT survive
  is the machine: each page boots its own wasm chip and registers it as the
  driver; the explorer pages are hard navigations besides (`MenuItem.hard`).
- The strip now shows the Lab's full set, with power, opcode step and seek
  disabled on every page, because the store has no such actions and no page
  has a machine that outlives it. Those three are the finale's gauges.
- The Lab is its own machine (its own wasm, its own player) and stays
  byte-for-byte upstream; it joins last, by registering as a driver of the
  same store, which is an upstream change (`notes/upstream-transport.md`).

## The shape

```
strip  ──►  store (chip-controls.js: running, hz, driver)
                 │
                 ▼
            engine (new, roof-owned, one instance per document)
              ├─ local:  v6502-wasm, booted once, kept across pages
              └─ api:    halfwave over 6502.tinymachines.ai/api (step, run,
                         read memory), the same calls the console makes today
                 │
                 ▼
            screens: explorer die view, primer readouts, console page of
            memory, Lab datapath: each SUBSCRIBES to the engine and draws;
            none owns a chip
```

Three rules, each already paid for elsewhere in the tree:

1. **The engine is the driver.** It registers once with the store; pages
   register nothing. Power, seek and opcode step become real because there is
   one run to seek in.
2. **A screen that cannot draw the engine's state says so** (a refusal beats
   a plausible answer): the console needs a program image in memory, the
   explorer needs the netlist, and a switch from local to API mid-run either
   carries the state over (halfwave can be loaded from a memory image and a
   half-cycle count) or refuses with the reason.
3. **The local/API switch is a control in the strip**, beside power, and its
   state is written down (`sessionStorage`, as `tm.chip.running` is) so it
   survives a hard navigation. Measured, not assumed: the API path shows its
   latency next to the Hz readout.

## Order of arrivals

1. **Done (2026-08-26, upstream).** The machine crosses pages by snapshot:
   each page still builds the Machine its renderer is bound to, and
   `chip-machine.js` `adopt()` restores it from the one the previous page
   left (`exportMachine()` in sessionStorage, same program only) and arms
   `pagehide` to leave its own. `chipDriver()` hands the store the full
   driver (caps, op, seek over the rewind window, power). Seek and power
   turned on here; the roof-owned wasm boot was not needed for it.
2. **Done with 1.** A hard navigation is exactly what the snapshot crosses,
   so the explorer's navigations stay hard. A deep link naming a half-cycle
   (`?steps=`) outranks the snapshot.
3. The API engine: same driver interface, halfwave behind it. The switch.
4. **Done (2026-08-26, 6502@4f8bebb).** The Lab registers with the store
   through a handover from the strip (`window.tmChipStore` /
   `tm:chip-store`), its player hidden while driven; halfshot and trace
   register drivers over their recordings. Every page with a chip is on the
   one store. What remains of the finale is step 3, the API engine and the
   local/API switch, and the console's shell keys acting on the store.

Every step leaves the disabled controls exactly as they are until the step
that makes them true.
