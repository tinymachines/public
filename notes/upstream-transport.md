# Proposal for tinymachines/6502: one transport, one driver shape

*For the 6502 repository. Written from the roof, where the floor transport
already runs on every 6502 page; nothing here is changed from here.*

## The model

The Halfwave Lab's player strip is the standard the site settled on:

```
power · start · ½ · play · ½ · cyc · op · [rate ──○──] 1 Hz · [scrub ────○] 40 / 120
```

The roof's `ChipTransport` is that strip, in that order, in the Lab's shapes
and words, on the explorer, the primer, the seventeen explorer pages and now
the console. It drives `web/chip-controls.js`, which is already the one store:
running, Hz, and one registered driver. Every control is a view of it, and
the strip is one more view.

Three of the Lab's controls the strip cannot offer yet, and the console can
offer only two of the six it does. Both gaps are the same gap: **the driver
shape says too little.** Today a driver is `{ step, back, reset, halfCycle }`
and the store treats a missing method as a no-op, so a strip cannot tell
"this page has no step" from "step did nothing".

## What the driver should say

```js
registerDriver({
  // What it can do. The strip shows exactly these and nothing else.
  caps: { power: true, back: true, step: true, cycle: true, op: true, rate: true, seek: true },

  // Present shape, unchanged.
  step(),            // one half-cycle forward
  back(),            // one half-cycle back
  reset(),           // to the first half-cycle of this machine
  halfCycle(),       // where it is, or null

  // Power, as the Lab has it. Off holds no state; on boots a new machine.
  powered(),         // boolean
  power(on),         // async; the store exposes `booting` while it settles

  // One opcode: run forward until SYNC is high. The Lab's `nextFetch`.
  sync(),            // boolean at the current half-cycle
                     // (with step(), the store can implement op itself)

  // A position to scrub. Recordings have an end; a live machine has none.
  length(),          // number of half-cycles known, or null for unbounded
  seek(h),           // go to half-cycle h; back() is seek(h-1) where it exists
});
```

And in the store, one setter per new thing, the same rule it already runs on:

```js
export function driverCaps()        // {} when no driver
export function isPowered()
export function isBooting()
export function setPower(on)        // async, announces on both edges
export function stepOp()            // step() until driver.sync() is true, bounded
export function chipLength()        // driver.length() or null
export function seek(h)             // setRunning(false); driver.seek(h); announce()
```

Nothing existing changes. `step`, `stepBack`, `reset`, `setRunning`,
`setClock` keep their names and their no-op-on-absent behaviour, so every
page that registers today keeps working with `caps` omitted, read as "what
the driver has methods for".

## What registers

| page | today | after |
|---|---|---|
| explorer, the seventeen pages | register `{step, back, reset, halfCycle}` | add `caps`, `sync`; `length: null` |
| the primer | same machine | same |
| the Lab | its own player, its own state (`POWER`, `PWBUSY`, `i`, `F`) | registers `{caps: all, power, powered, sync, length: F.length, seek: go}`; its player becomes a view of the store, or is dropped for the roof's strip |
| the console (game.js) | its own `state.running`, power and pause buttons | registers `{caps: {power, reset}, power, powered, reset, halfCycle}`; the roof today reaches it through its button ids, which is a bridge and should not outlive this |
| halfshot | recordings, its own controls, no driver | registers `{caps: {back, step, cycle, seek}, length, seek, halfCycle}` |

## The one machine

The strip's running state and clock already cross pages (the store persists
Hz in `localStorage`; the roof persists running in `sessionStorage`). The
machine does not: each explorer page boots its own, and a client navigation
leaves the previous page's views registered with no lifecycle to unregister
them, which is why the roof uses full navigations between explorer pages.

Two upstream pieces close that:

1. **A lifecycle on the modules.** `mount(root)` returns `unmount()`, and
   `registerDriver(null)` is honoured. A page that leaves takes its views with
   it.
2. **The Machine outside the page.** `chip-machine.js` holds the wasm instance
   and its trace; pages ask for it rather than making one. The half-cycle you
   were at on the tracer is the half-cycle the explorer opens on.

Both are inside the 6502 tree and are the reason "a pause in one is a pause
in all" is true today but "the same half-cycle in all" is not yet.

## Order

1. `caps` and `driverCaps()` (an afternoon; unblocks the strip hiding rather
   than guessing, and retires the roof's per-page capability maps).
2. `sync` + `stepOp` (the op button).
3. `length` + `seek` (the scrubber; halfshot and the Lab register).
4. `power` (the Lab's first button; the console registers properly).
5. Lifecycle, then the shared Machine.

## Two more, found by the roof's e2e suite (2026-08-26)

- **`app.js` registers `sw.js` relative to the page.** On the roof the page
  is `/6502/explorer`, so that is `/6502/sw.js`, a 404 the `.catch` swallows
  but the console still reports on every explorer page. A no-op worker at
  that path would take the `/6502/` scope away from the roof's own worker,
  so the roof leaves it. Proposal: register only when
  `location.origin` is the explorer's own, or take the path from the same
  place the asset manifest comes from.
- **The "changed since the previous deploy" panel reads its markers from
  the site masthead's menu** (`data-changed-since="menu"`). The roof drops
  that masthead for its own, so the panel never fills there. Proposal: read
  the changed set from the archive endpoint the markers were derived from,
  so any host that keeps the section can fill it.

## The controller byte, proposed by the console shell (2026-08-26)

The shell at `/6502/games` docks A and B beside the d-pad, disabled, with
"this cartridge reads four directions and no buttons" as the reason
(`notes/console-shell/ISSUES.md` #2). The contract writes one byte and
`game.js` maps only up, down, left, right into it.

Proposal, in `tinymachines/6502`: a cartridge's contract gains an optional
`buttons` map beside `dirs` (`{ a: 0x10, b: 0x20 }` or whatever the ROM
reads), `game.js` binds `[data-btn]` elements and two keys (`x`, `z` or
`k`, `j`) the way it binds `[data-dir]` and the arrows, and ORs the button
bits into `state.input` for the frame. A cartridge that declares no
`buttons` leaves the shell's A and B disabled exactly as today, so nothing
published changes. The shell needs no change beyond reading the declared
map, which it can do from the loaded cartridge through the same DOM
contract.
