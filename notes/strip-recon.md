# The strip and every page that runs the chip: recon, 2026-08-26

*Status, same evening: pieces 1, 2 and 4 of section 5 are done (upstream
6502@d50c52e, 4f8bebb, 64b093f; roof 1.0.109 to 1.0.113): every page with a
chip is on the one store, the Lab included, and the Lab is read from the
checkout rather than copied. The console driver declares its capabilities
and the shell's keys act on the store (3, at 1.0.114); the API engine and
the switch arrived at 1.0.117 (6502@2f9471d, v0.254). The cartridge pack is minted (the headless kind, 6502@de82d6b); publishing
it waits on a token or a handle.*

*Survey before the final iteration on the control strip (owner's brief: the
first button is power, solid when on; one running cartridge for every page;
the Lab and the explorer are debug views of it; ALL control comes through the
strip, no page keeps a button that overlaps it; the headless programs get
minted as one cartridge). Nothing here is changed yet. `notes/one-engine.md`
is the target shape; this is what stands between here and there, by file.*

## 1. What is true today, in one paragraph

There is one STORE and there are eleven MACHINES. The store is upstream's
`6502/web/chip-controls.js` (running, Hz, one registered driver of shape
`{step, back, reset, halfCycle}`; no power, no opcode step, no seek, no
capabilities). The strip is the roof's `ChipTransport.tsx`, mounted once PER
PAGE (not once per document), and the explorer pages are hard navigations, so
between two explorer pages the store module itself dies and is re-imported.
Every explorer page boots its own wasm `Machine` and registers it; the console
runs on the API with its own `state.running` and is bridged to the store by
clicking its buttons; the Lab runs on the API with its own `POWER` flag and
its own player, and never touches the store at all. Power, `op` and seek in
the strip are disabled everywhere because nothing behind them exists.

## 2. The pieces, by file

### The strip (roof)

| file | role |
|---|---|
| `web/app/[lang]/6502/explorer/ChipTransport.tsx` | the strip. Fetches `/6502/chip/asset-manifest.json`, imports `chip-controls.js` by hash, subscribes. `caps` prop from the page. Persists running in `sessionStorage` `tm.chip.running`. Withdraws after 8 s with no driver. Power: `disabled`, `aria-pressed={live}` |
| `web/style/components.css` | `.chip-transport`, `.tbtn`, `.ct-row`, `.ct-seek`, `.has-transport` |
| `web/app/components/Fullscreen.tsx` | `FullscreenButton` at the strip's right end; `LabFullscreen` portals it into the Lab's own `.prow` |
| `web/e2e/strip.spec.ts`, `web/e2e/lib.ts` `STRIP_LIVE` | holds the order `power start ½ play ½ cyc op`, disabled-not-hidden, two rows on a phone, on nine pages |

Mounted by: `explorer/page.tsx`, `[page]/page.tsx` (the seventeen), `games/page.tsx`
(with `caps={{back,step,cycle,rate: false}}`). NOT mounted on `/6502/lab`.

### The store (upstream, served by alias from `/6502/chip/`)

`6502/web/chip-controls.js`: `setRunning/toggleRunning/setClock/step/stepBack/reset`,
`registerDriver(d)`, `subscribe`, `announce`, `halfCyclesFor(now)` (pacing),
`initClock` (`?speed=`, then `localStorage` `v6502.clock`), `resetControls`.
A missing driver method is a silent no-op, which is why the roof carries a
per-page `caps` map.

### The machines: who boots a chip, and what controls it

| page (roof route) | machine | registers a driver | its OWN controls beside the strip |
|---|---|---|---|
| `/6502/explorer` (`app.js`) | wasm, own | yes | `btn-run btn-half btn-back btn-cycle btn-instr btn-reset btn-fit btn-fullscreen`; keys `c`, `i` |
| `/6502/tracer` | wasm, own | yes | `tc-run tc-step tc-back tc-cycle tc-reset tc-speed` + the solo set `tc-solo-*`; arrow keys |
| `/6502/blueprint` | wasm, own | yes | `bp-run bp-step bp-cycle bp-reset bp-speed` |
| `/6502/exploded` | wasm, own | yes | `ex-run ex-step ex-reset` |
| `/6502/schematic` | wasm, own | yes | `solo-clock-select`, a painted transport |
| `/6502/chipmap` | wasm, own | yes | (store only) |
| `/6502/block` | wasm, own, on `bk-boot` | yes, after boot | `bk-boot` |
| `/6502/primer` | wasm via `demos.js` `createChip` | registers itself | a `dm-bar` transport (`◀ ▶ ▶❙ ⏻` + clock) on EVERY example |
| `/6502/programs` | wasm via `demos.js` | registers itself | one `dm-bar` transport |
| `/6502/halfshot` | recordings, own | **no** | `hs-run hs-back hs-next hs-reset hs-record`; arrows, Home, End. Calls `setRunning` on the store with no driver behind it |
| `/6502/trace` | wasm, own | **no** | `tr-run tr-step tr-back tr-restart`; a PRIVATE `setRunning` (`trace.js:451`). Pause in the strip does not pause it |
| `/6502/games` (`game.js`) | halfwave API, whole frames | via `ConsoleDriver.tsx`: DOM bridge (`#b-power`/`#b-pause` clicks, MutationObserver) | the contract's `#b-power #b-pause` (hidden), the shell's `data-act` power / reset / start / select / quick "pause" (`shell/Shell.tsx:62-108`), and the strip. **Three surfaces for pause** |
| `/6502/lab` | halfwave API, own `POWER`/`PWBUSY`, recording `F` up to 4000 half-cycles | **no** | its own player: `b-power b-reset b-hb b-play b-hf b-cf b-if rate scrub`; space, arrows; `nextFetch()` and `go(n)` are exactly the `op` and seek the strip lacks |
| `/6502/two-ways-in` (`TwoWaysDemo.tsx`) | `tm6502.mjs` `remote()`, one shot | no | "Run it" |
| decode, timing, pinout, diegraph, designer, blockdiagram, talk | none (measurements over 768 runs) | no | none; the strip withdraws |

Ids collide across pages (`b-power` is both the Lab's and the console's). Fine
today because they never share a document; a shared strip must not read them.

### Engines the roof can reach

| engine | where | state model |
|---|---|---|
| wasm `Machine` | `/6502/chip/pkg/v6502_wasm.js` (alias), imported by every upstream page | object in hand; `halfStep/stepBack/powerCycle/halfCycle/load/setResetVector`, `exportMachine()` emits the API's `{state, memory}` |
| halfwave, over HTTP | `chipApi()` from `data/projects.json` = `https://6502.tinymachines.ai/api`, `/v1/step`, `/v1/meta`, `/v1/nodes` | stateless; the whole machine travels out and back |
| `web/public/engine/tm6502.mjs` | roof-owned, MIT, no die data | one interface over both: `remote()` works; `local({engine})` needs a wasm engine handed in and cannot assemble |

`tm6502.mjs` is already the seam the one engine needs: the same machine JSON
crosses both backends, which is what makes a local/API switch mid-run a
transfer rather than a reboot.

### The chip API base, four ways

`data-chip-api` on `.lab-shell` and on the games workbench (read by the three
build-time patches in `lib/console-modules.ts`); `lib/lab.ts` rewrites the
Lab's `location.origin + "/api"` to the literal; `TwoWaysDemo` uses the
module's `DEFAULT_API`; the manage and builders pages pass `chipApi()` as a
prop. One value, four routes to it.

## 3. The headless programs, scattered

| where | what |
|---|---|
| `6502/web/programs.js` (exported to `programs.txt`) | seven: Counter, Fibonacci, Fill page, Add, Multiply, Count bits, Copy; org `$0200`; picked by `program-nav.js`, persisted; used by explorer, chipmap, primer, block, halfshot, tracer, blueprint, exploded, trace |
| `TwoWaysDemo.tsx` `SOURCE` and `docs/6502/two-ways-in.mdx` | `LDA #$2E / CLC / ADC #$14 / BRK`, typed twice |
| `docs/6502/index.md`, `docs/6502/the-api.md` (+ `ja/`) | source listings in prose |
| the Lab's Program tab (inside `halfwave-lab.html`) and `src/demo.json` | its own source and a canned trace |
| `6502/games/rom/*.rom`, `dierunner.cart.gz` | already cartridges |

Minting one cartridge for these needs a decision first: the console contract
is a program that draws a screen page and sets a status byte, and the
registry lists only ROMs that finish a frame. None of the seven draw. Either
the contract gains a headless kind (a cart with no screen, listed with "draws
nothing" as its measurement), or the pack is a program image the engine
loads (memory + org + entry), not a console cartridge. The first keeps one
format; the second keeps the registry's promise intact. Owner's call.

## 4. What the brief needs, mapped to where it lands

| brief | roof | upstream (`tinymachines/6502`, proposal) |
|---|---|---|
| power first, solid when on | strip: real `power` bound to the engine; `aria-pressed` from `powered()`; `.on` style | store: `setPower/isPowered/isBooting` (`notes/upstream-transport.md` step 4) |
| ONE strip instance | mount the strip in `app/[lang]/6502/layout.tsx`, not per page; pages declare `caps` (or the driver does) | pages stop rendering `[data-chip-nav]` on the roof (already stripped with the masthead) |
| one running cartridge for every page | roof-owned engine module: boots wasm once per document, registers as THE driver, snapshots `{memory, halfCycle, hz, running}` to `sessionStorage` across the hard navigations, restores on the next page | `chip-machine.js`: pages take the machine rather than boot one; `mount/unmount` lifecycle |
| Lab and explorer are debug views | Lab draws from the engine's trace; its player becomes the strip (or is hidden while the strip is mounted) | Lab registers `{caps: all, power, sync, length, seek}` or is drawn from the roof's engine |
| all control through the strip | console: shell `data-act` power/reset/start route through the store, not `#b-power` clicks; `TwoWaysDemo` runs on the engine | remove or demote the per-page transports listed in section 2 (`btn-*`, `tc-*`, `bp-*`, `ex-*`, `hs-*`, `tr-*`, `dm-bar`); `trace.js` joins the store; `halfshot` registers a driver |
| headless programs in one cartridge | the pack, minted through `/api/v1/tokens` and the registry, listed under a builder | contract decision above |

## 5. Suggested division

1. **Engine (roof, no upstream dependency):** `web/lib/engine/` client module
   over `tm6502.mjs`: boot wasm once, register as driver with `caps`, real
   `power`, `sync` for `op`, `seek` over its own trace, snapshot/restore.
   Turns on power, op and seek in the strip. Step 1 of `one-engine.md`.
2. **Strip (roof):** move the mount to the 6502 layout; power first and
   solid; `caps` from the driver; e2e `strip.spec` updated to assert one
   strip per document and power's pressed state.
3. **Console (roof):** `ConsoleDriver` becomes a driver of the engine, not a
   DOM bridge; the shell's power/reset/start act on the store. Keep
   `game.js` byte for byte until upstream reads the driver.
4. **Upstream proposals (6502):** `caps`, `power`, `sync`, `seek`, lifecycle,
   `chip-machine.js`; retire the per-page transports; `trace.js` and
   `halfshot.js` on the store. Ordered in `notes/upstream-transport.md`.
5. **Cartridge pack:** contract decision, then mint.

What holds it: `strip.spec`, `fullscreen.spec`, `kit.spec`, `shell.spec`,
`parity.spec`, `lib/console-modules.test.ts`, `scripts/check-build.mjs`
(reads `game.js`'s DOM contract). Each step adds its spec.
