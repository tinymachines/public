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
3. **Done (2026-08-26).** The API engine: the same driver, halfwave behind
   it, the Machine crossing whole each way; the switch beside power, its
   latency beside the rate; back and seek refused on the API.
4. **Done (2026-08-26, 6502@4f8bebb).** The Lab registers with the store
   through a handover from the strip (`window.tmChipStore` /
   `tm:chip-store`), its player hidden while driven; halfshot and trace
   register drivers over their recordings. Every page with a chip is on the
   one store. The finale's four steps have all arrived; what is left of the shape
   is the console's and the Lab's chips joining the switch, which needs a
   local console engine and a local Lab, neither of which exists.

Every step leaves the disabled controls exactly as they are until the step
that makes them true.

## The console joins the switch, 2026-08-28

The console was the page the shape named last: it had a chip nobody could
move, so its driver said `engine: false, runsOn: 'api'` and the strip's key
was greyed there. It is real now.

**The seam is one function.** `console.js`'s `post()` is the only place the
console reaches the outside: `boot` and `step`, the whole machine out and
back. The build patches it to try `globalThis.tm6502Transport` first
(`web/lib/console-modules.ts`, the fourth patch), and
`web/app/[lang]/6502/games/localEngine.ts` puts the wasm chip behind it,
loaded at runtime from the 6502 release nginx already serves at
`/6502/chip/` (the same bundle every explorer page on this site runs; no die
data is copied here, NOTICE.md). `ConsoleDriver.tsx` installs it when the
store's engine is `local` and takes it away when it is `api`, which is the
only place either happens.

**Switching mid-run is a hand-off, not a reboot,** because the machine is a
value `console.js` is holding between frames. The next frame simply leaves
for somewhere else, and the frame count, the score and the half-cycle keep
counting.

### Measured, 2026-08-28, before any of it was written

The two engines are the same engine built twice, and that is checked rather
than repeated: `web/e2e/console-engine.spec.ts` boots Die Runner and runs one
8,704 half-cycle frame on each and compares. Identical `value`, `pullup`,
`pulldown`, `trans_on` and `half_cycle`, identical memory page for page, and
the eight watched gates agree. Both after the boot and after the frame.

What it costs, on this desk (Chrome, production, the server one hop away):

| | in the page | over the API |
|---|---|---|
| Silicon Snake, 600 half-cycles a frame | 24.7 ms, 40.5 fps | 25.1 ms, 39.9 fps |
| Die Runner, 8,704 half-cycles a frame | 353 ms, 2.8 fps | 301 ms, 3.3 fps |

The in-page chip runs 24,503 half-cycles a second; halfwave's native build,
round trip included, 30,400. Under a fourfold CPU throttle, which is roughly
a mid-range phone, the in-page chip drops to 5,975 a second: 1.5 s a frame
for Die Runner, against the API's 0.3 s from anywhere. The wasm bundle is
121 KB (56 KB gzipped) and loads in 19 ms here, 59 ms throttled sixfold.

**So the console states a default the store does not have.** The store's
default engine is `local`, which is right for the explorer, where a press is
a few half-cycles and the round trip is the whole cost. A console frame is
three orders of magnitude more work than that, so a floor with no recorded
choice gets `api` written by the console at mount (`ConsoleDriver.tsx`), and
the key overrules it in either direction from then on. That is a choice made
in one line rather than a default nobody chose, and it is the line to change
if the trade moves.

What is left of the shape: the Lab's chip, which is its own wasm and its own
player, and a driver shape that lets a page state its own engine default
rather than writing the floor's (`notes/upstream-transport.md`).
