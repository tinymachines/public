# Console shell: issues

The pack's working rule 1: a genuine conflict or an underspecified case is
filed here with a proposed resolution, and the work continues on what is not
blocked. Nothing below was silently improvised; each entry says what the code
does in the meantime and where.

Numbering is referenced from the code as `ISSUES #n`.

## 1. The native screen is 128 x 128, not 256 x 240

**Conflict.** The pack's crop camera (Direction 1, Geometry 3) assumes a
256 x 240 native canvas with a guaranteed 224 x 224 window. This console's
screen is one page of chip memory: 16 x 16 tiles of 8 px, so 128 x 128,
square, and there is nothing outside it to reveal. `docs/6502/the-console-contract.md`
is the source; `game.js` sizes its canvas as `c.width * TILE * s` with
`width = 16`.

**Resolution applied.** The square core is the whole screen. The guaranteed
window is 128 of 128 (100 percent, above the pack's 85 percent floor), and
the solver's job reduces to the integer scale `k` and keeping the whole square
inside the chamfer. Surplus ratio goes to the flex zones and facets, never to
a reveal, because there is nothing to reveal. `solve()` takes `native` as an
option so a wider contract could change this in one place.

**Consequence.** The HUD-rows idea (native rows 0 to 15 and 224 to 239 shown
on tall screens) has no rows to show. The HUD is the shell's own line on the
glass (`.hud`), title-safe, never in the corners.

## 2. The controller byte carries four directions

**Conflict.** The pack docks A/B (with turbo), select/start and a stick. The
console contract writes one byte, and `game.js` maps only up, down, left and
right into it (`KEYS`, `[data-dir]`). There is no A, B, stick or turbo the
chip could see.

**Resolution applied.** A and B are docked, drawn and **disabled**, with the
reason in their `title`: the same rule as the floor strip (show the full set,
disable what the page cannot honour). Select cycles the cartridge; start
continues with a credit after game over and pauses while live; both are
shell actions, not controller bits. No stick.

**Proposal upstream.** Extend the controller byte with two button bits in
`tinymachines/6502` (a cartridge declares `dirs` today; `buttons` would sit
beside it). Then A/B enable themselves from the cartridge's declaration.
Filed in `notes/upstream-transport.md` territory; not done from here.

## 3. The pack's part sizes are not on its own 8u grid

**Conflict.** Geometry 1 says every vertex of every shape snaps to the 8u
module grid. Components names 17u octagons, 52 x 14u pills, a 56 x 22u rocker,
a 34 x 22u chiclet, a 10 x 44u slot, 5u LEDs. None of those sit on an 8u grid
with the origin at the part's centre.

**Resolution applied.** Two grids, stated: the **frame** (mask, zones, docks,
facets) is on the 8u module grid and `lintSolved()` holds it; a **part's
interior** is on the 4u half module (`Kit.tsx`), because an octagon of edge
16u with a chamfer of 4u cannot be expressed on 8u. Part boxes are rounded to
the grid: 24u d-pad, two 16u octagons, 48 x 16u pills, 56 x 24u rocker, 32 x
24u chiclet, 8u LED cell.

## 4. Part sizes scale with the mask, not the frame

**Underspecified.** Sizes are given in frame units (1u = W/256). In landscape
the mask is much smaller than 240u and the wings are 56u wide on a 16:9
screen; a 64u coin acceptor or a 112u power strip cannot dock at all, and
the pack's dock priority would then drop everything but the d-pad.

**Resolution applied.** `solve()` scales part sizes by `S / 240`, clamped to
[0.5, 1], before the touch floor. A part that is still wider than its wing
takes a stack variant (pills, power, quick have one); a part with no stack
form is dropped by width, which is the priority rule doing its job.

## 5. A red LED means a failed assertion on this site

**Conflict.** Components: LED tri-state off / amber / red. STYLE.md, Logic
Accents: `--color-red` is ASSERTION FAILED and nothing else, on every
project, and `style/check-silo.py` refuses to let a silo reassign it.

**Resolution applied.** Boot is `--color-orange` (ATTENTION, needs a human)
and live is `--color-blue` (ACTIVE, driven high). The LED still has three
states; it says them in the site's own words. Owner's call if red is wanted
here anyway; it would need a token the style guide does not have.

## 6. The gameplay-page swipe gesture (decision, filed as the pack asks)

**Decision.** Plain one-finger horizontal travel of 48 px or more on the
glass, dominant over vertical. The pack offered two-finger drag or an
edge-start; both exist to keep a swipe from stealing a gameplay gesture, and
on this console there is no gameplay gesture on the glass: the d-pad buttons
and the keyboard are the controller, the glass takes no touch input at all.
A guard against a conflict that cannot occur would cost every reader a
discoverable swipe. Revisit if a cartridge ever reads touch on the glass.

## 7. The palette process is replaced by the house tokens

**Resolved by the site.** `tokens.seed.json` asks for a swatch render,
sampled programmatically, emitted as a Tailwind 4 `@theme`. That pipeline
already exists and already ran: `style/tokens.css` was sampled from the
owner's binder, with contrast per pair recorded in the file. The shell uses
those tokens by role (`shell.css` header) and defines no colour of its own,
so `style/check-tokens.py` covers it and the contrast table is the one
already in `tokens.css`. BP-2's printed hex was not adopted anywhere.

## 8. Cartridge-driven theming has nothing to read yet

**Underspecified against the contract.** A cartridge is a ROM, its tiles and
the contract; it carries no label art, theme palette or screen palette, and
the four screen colours are the die's own layers (the contract says so).

**Resolution applied.** The shell's accent and facet seed follow the loaded
cartridge's index, so two cartridges look different and one always looks the
same. The settings page says why the palette loader is not live. Adding a
`theme` block to the cartridge format is an upstream change.

## 9. Rewind and achievements cannot be honest here

**Resolved by refusal.** The engine keeps no sessions and no snapshots: every
frame carries the whole machine and nothing is retained to scrub back
through. Achievements have nothing minting them. Both appear on the settings
page, disabled, with the reason, rather than as controls that do nothing.

## 10. The roster and IP

**Resolved.** The shelf shows the cartridges the console actually has (Die
Runner, Silicon Snake) and whatever the reader loads. The pack's placeholder
roster (Halfwave Hero and friends) is not shipped because it is not real;
names on the shelf are cartridges that run. `grep -ri "nintendo\|mario\|zelda\|™"`
over the shipped tree is part of the e2e suite (`shell.spec.ts`). The pack's
`sources/` images are third-party mood and are gitignored with the archive.

## 11. Coins

**Constraint, not a conflict.** NOTICE.md, 2026-08-22: coins are never sold.
The acceptor gives a coin on every tap; a credit is spent to continue after
game over. Nothing about it touches money and nothing here should.

## 12. The sheets are on house paper, not drafting blue

**Conflict.** `tokens.seed.json` and Direction 8 want a drafting-blue field
with cyan strokes for the paper ground. STYLE.md section 1: paper is
`--color-paper`, documentation, ink hairlines; there is no second paper.

**Resolution applied.** `scripts/shell-sheets.ts` draws on the site's paper
with the site's ink, hues from the Earth Conductor `-ink` forms, and keeps
the BP-3 line language exactly. A drafting-blue sheet would be a third
ground, which the style guide says not to invent.

## 13. A cartridge change inside a boot finishes booting the wrong ROM

**Measured, 2026-08-28.** `game.js`'s `power()` awaits the ROM fetch and the
console's power without re-checking `state.gen` after either. A cartridge
change (`#cart` onchange) in that window bumps the generation and swaps
`state.cart`, and the boot resumes: the old bytes, the new contract, the
buttons painted live, the loop already stale. The console reports live and
draws nothing; a resume then runs Die Runner's ROM as Silicon Snake.

**Resolution applied.** The shell refuses a cartridge change while the
console is booting (`Shell.tsx` `changeCart`: the shelf, the select pill,
and the shelf pane all go through it), with the nudge and a title saying
why. The window is a few hundred ms. `e2e/shell.spec.ts` presses reset and
select in one task and holds that the chosen cartridge is the one that
boots.

**Proposal upstream.** Re-check the generation after each await in
`power()`, the rule `loop()` already keeps. Filed in
`notes/upstream-transport.md`.

## 14. The chip in the page ran the game and froze the console

**Measured, 2026-08-28,** on the first build of the console's local engine,
with the wasm chip on the page's own thread. A frame of Die Runner is one
synchronous 350 ms run of the engine, and `game.js`'s loop starts the next
as soon as the last resolves, so between two frames there is a microtask and
nothing else. The browser never got a turn: a `setInterval(250)` fired once
in thirteen seconds, the canvas never repainted, the LED and every readout
held the values they had before the boot, and the d-pad took no presses. The
game ran to its own game over without drawing a frame, and the shell's phase
was still `off` when it ended.

Nothing about this shows up over the API, where every frame waits on a real
round trip and the page breathes in the gap. It is the kind of bug a switch
between two engines invents.

**Resolution applied.** The chip runs on a worker
(`web/public/engine/console-chip.worker.mjs`); the page keeps a transport
and nothing else (`games/localEngine.ts`). One structured clone of the
machine per call, about 5 KB, which is what the round trip was posting
anyway. `e2e/console-engine.spec.ts` holds the shape that failed: with the
chip in the page the frame count rises, the half-cycle count rises, and the
request count does not move.

## 15. Two installs at mount, two chips, and a console that stopped at frame 14

**Measured, 2026-08-28,** the day the in-page chip became the default. With
the switch on a press there was one install; as a default it runs at mount,
and the store announces more than once there. Two installs started a
millisecond apart, both greeted the worker before either had set its flag,
and in the worker both passed the `if (chip)` guard and ran the wasm glue's
`init()`. That instantiates the module a second time and rebinds the glue to
it, so the console held a pointer into the first instance while every call
went into the second.

It played fourteen frames of Die Runner, correctly, then trapped
(`unreachable`); every call after it failed with wasm-bindgen's "recursive
use of an object", because the panic had left the borrow held. The console
said "the engine stopped answering", which was true and useless. The same
calls replayed into a fresh chip were fine, the API answered them, and a
worker driven by hand never failed: only the app's own worker did, which is
what sent the search in the wrong direction for an hour.

**Resolution applied.** Keep the promise, not the result, on both sides
(`engine()` in the worker, `runHere()` in `games/localEngine.ts`). The
page-side build had it and the move into a worker dropped it.
`e2e/console-engine.spec.ts` now runs the default engine through a game over
and a second boot: fourteen frames is under four seconds, so a check that
stops at the first frame passes over this.

## 16. Silicon Snake, drawn as a broken Space Invaders

**Reported by the owner, 2026-08-28,** and reproduced on the live console:
arrive on a `?cart=` link (Die Invaders), play it, choose Silicon Snake from
the shelf, power on, and the snake's body and its food are drawn as
invaders and a ship. The cartridge that boots is the right one, the readouts
agree, and only the sprites are somebody else's.

Upstream `game.js` gives the module one `TILES` array. `useCart()` replaces
it with a loaded cartridge's CHR and nothing puts it back, so the next
cartridge borrows the sheet, and the legend keeps showing it too.

**Resolution applied.** Two build-time patches (`lib/console-modules.ts`):
`useCart` keeps the sheet it displaces on `state.house`, and the picker sets
the tiles the chosen cartridge should draw in, redrawing the legend with
them. Filed upstream in `notes/upstream-transport.md`;
`e2e/console-cart.spec.ts` walks the owner's path against the registry's own
published cartridges and compares the legend, which is the sheet itself
rather than a canvas at whatever frame it had reached.

**Upstream, same day (6502@f0001d3).** The 6502 project reproduced it from
the source (three places assign `TILES`, none put it back, the picker never
touched it) and fixed it with one `selectTiles()` over `state.cart.tileset
|| HOUSE`. `tileset`, not `tiles`: `cart.tiles` is the tile-index remap
`drawScreen` applies. Their loader case, the house sheet landing after a
linked cartridge, is patched here too and is measured at two milliseconds
apart on the live console, which is a coin toss rather than a corner. The
patches here come out when a served release carries the fix.
