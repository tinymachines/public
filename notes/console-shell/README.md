# The console shell

The handoff pack (`pack/`, the owner's, 2026-08-25) asked for one NES-style
shell for every ratio: a chamfered-octagon screen sized to the short side,
flex zones taking what the ratio leaves, controls docked by priority,
deterministic 45-degree facets absorbing the rest, the machine as part of
the game. This is where it landed and how to check it.

`ISSUES.md` is the pack's own working rule 1 in action: every place this
console is not the machine the pack assumed, with what the code does about
it. Read it first; the numbers below reference it.

## What is where

| | |
|---|---|
| `web/lib/shell/geom.ts` | units, polygons, the chamfered octagon, the grid and angle lint |
| `web/lib/shell/solve.ts` | `solve(W, H, seed)`: mask, integer scale, zones, docks, facets, params. Pure |
| `web/lib/shell/solve.test.ts` | the pack's M1 and M3 gates over its ratio matrix (`bun test lib/shell`) |
| `web/lib/shell/kit.test.tsx` | the M2 gate: every part's polygons on the half module at 0/45/90 |
| `web/app/[lang]/6502/games/shell/Kit.tsx` | the parts: d-pad, A/B, pills, power and LED, coin and 7-seg counter, speaker, cart, rail, quick chips |
| `web/app/[lang]/6502/games/shell/Shell.tsx` | the assembly and the machine: pages, swipe, coins, LED, boot wipe, toys |
| `web/app/[lang]/6502/games/shell/shell.css` | fills by token role, states, effects. No colour of its own |
| `web/app/[lang]/6502/games/consoleState.ts` | what the console is doing, read off game.js's DOM contract |
| `web/scripts/shell-sheets.ts` | the paper sheets: `bun scripts/shell-sheets.ts` writes `web/out/shell/master-*.svg` |
| `web/e2e/shell.spec.ts` | the M4 gate in a browser: touch floor, coin, LED, pages, rotation, IP |

## The one fact that changes the pack

This console's screen is one page of chip memory: 16 x 16 tiles of 8 px,
128 x 128, square. There is no 256 x 240 canvas and nothing outside the
square to reveal, so the crop camera collapses to "the whole screen, at the
largest integer scale that fits inside the chamfer" (ISSUES #1). Everything
else in the pack survives: the mask, the zones, the priorities, the facets,
the 8u grid, the four pages, the coin, the LED, the export ladder's bottom
rung (128 x 128 is native here).

## Milestones, as delivered

| gate | state |
|---|---|
| M0 tokens and stationery | tokens are the site's (`style/tokens.css`, already sampled and contrast-tabled); no new colour. Paper sheets carry the BP-3 legend. ISSUES #7, #12 |
| M1 solver and master sheets | `solve()` pure and hashed; 10 tests over 11 sizes; seven master sheets |
| M2 parts kit | 10 parts, states by attribute, 7-seg digits as polygons, no glyph in the kit; lint over 17 sizes x 13 forms |
| M3 assembly | the page itself, every ratio, facets deterministic from (W, H, cart index) |
| M4 interaction | live at /6502/games: swipe and rail, coin flow, LED tri-state, boot wipe, hold-to-off, snapshot, toys; rotation re-solves in place |
| M5 export ladder | not built: the ladder rasterises a vector master for print, and this shell is served live from the solver at every size. The sheets are SVG at any scale |

## Definition of done, self-scored

- Solver tests green across the matrix: yes, `bun test lib/shell`.
- Zero letterboxing, zero non-uniform scaling: the canvas is drawn at its
  natural size, an integer multiple of 128, inside a square mask
  (`shell.spec.ts` holds it at phone and desk).
- Guaranteed window fully visible everywhere: 128 of 128, automated
  (`containsRect` in the solver tests).
- Every vertex on the grid: frame on 8u, parts on 4u, both linted (ISSUES #3).
- No IP: `shell.spec.ts` greps the page; `sources/` never entered the repo.
- Facets snapshot-stable: the determinism test hashes two runs.

## Not done, and said so

- A/B, turbo, the stick: the controller byte has no bits for them (ISSUES #2).
- Cartridge theming beyond an accent and a facet seed (ISSUES #8).
- Rewind, achievements, palette loader: refused with the reason on the
  settings page (ISSUES #9).
- M5 rasters.
