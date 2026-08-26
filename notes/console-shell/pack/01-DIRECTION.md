# 01: Direction (the synthesis)

One shell, every ratio, no letterboxing, no distortion, all vector. Five
sources and three prior sheets collapse into six load-bearing decisions.
Everything downstream (geometry spec, components, manifest, QA) implements
these; if a downstream doc contradicts this one, this one wins and the
contradiction gets filed as an issue.

## 1. Square core, crop camera, chamfer mask

The game renders once, to a fixed **native virtual canvas of 256×240**.
The visible window is a **chamfered-octagon mask** whose size is locked to
`S = min(W, H) − 2m`. A **guaranteed square of 224×224** native pixels is
always fully visible on every device (this is the design contract game logic
is written against). Surplus aspect ratio *reveals* more of the native canvas
,  extra columns on wide screens (up to the full 256), the HUD rows on tall
screens: it never letterboxes and never scales non-uniformly.

Sources: BP-4 + Claude sheets (max square), BP-3 (crop camera), BP-1 (mask idea).

## 2. Flex zones absorb everything else

Whatever the ratio leaves over is claimed by named containers:
**deck** (below screen, portrait), **wing-L / wing-R** (beside screen,
landscape), **header** (thin strip, portrait). Controls dock into zones by a
fixed priority table (see `02-GEOMETRY-SPEC.md` §6). The gap between the
octagon mask and the zone edges is filled by **dynamic polygons**: procedural
facets generated on the 8-unit grid, 45° edges only, deterministic from
(W, H, seed). BP-5's crystal filler, made reproducible.

## 3. One shape language: the 45° chamfer

Screen mask, buttons, panels, cartridges, filler facets: all polygons with
axis-aligned and 45° edges, vertices snapped to the 8-unit module grid.
Circles are the deliberate exception, reserved for: joystick ball, coin,
LEDs, D-pad pivot. Action buttons are **octagons** (BP-1 wins the shape war).
This single constraint is what makes the whole thing slice, boolean, and
downscale cleanly.

## 4. The machine is part of the game

The shell is a simulated console, not chrome:
- **Coin acceptor** with credits counter: insert-coin is the continue
  mechanic; coins are *given*, never sold.
- **Power / Reset** pair with a tri-state LED (off / amber boot / red live);
  power is pause, reset is restart, boot plays a flicker wipe.
- **Cartridge shelf**: carts spine-out, drag to the slot to load;
  cartridge-detect LED; flip-for-info detail card; collection metadata
  (owned / free slots).
- **Cartridges configure the shell**: label art, theme palette, and optional
  custom NES-style palette all travel with the cart (BP-1's palette loader ×
  BP-2's theming screens, merged).

## 5. Four pages, swiped on the glass

Gameplay · Shelf · Status/Inventory · Settings. Swipe left/right on the
screen area itself (BP-5), or tap the swipe-rail dots. Map is an optional
per-cartridge 5th page. Settings hosts the toy drawer: CRT filter toggle,
scanline intensity, PAL/NTSC visual switch, rewind buffer, achievements.

## 6. Design at 8K in units, export down to native

Master authored at 7680-wide in **units** (1u = 30 px @ 8K, 8u module grid).
Ladder: 8K → 4K → 1080 → 720 → PAL 576 / NTSC 480 → **native 256×240**.
Stroke roles in units (hairline 1u, seam 2u, bezel 4u); below 720p drop
hairlines, keep fills. Every vertex divides down to integer pixels at every
rung: that's the point of the grid.

## 7. IP policy and the fake-game roster

No Nintendo marks, no ™ on "NES", no Mario/Zelda/licensed anything, ever , 
including in placeholder art and screenshots. Ship an original roster for the
shelf (label art is part of M2):

- **Halfwave Hero** (platformer, house cart: gold shell)
- **Contest Group** (puzzle: the settle-round joke)
- **Pull-Up Panic** (arcade climber)
- **Node 1725** (maze crawler)
- **Phase Rail** (rhythm runner: φ1/φ2 themed)
- **Tank 90 → Tread 91** (rename; keep the energy)

Names are placeholders too: swap freely, but every replacement must be
original and clearly non-infringing.

## 8. Aesthetic register

Two grounds, per house convention: **paper** (the blueprint sheets: this
pack, the docs, the annotated masters) and **panel** (the live shell: what
users touch). Paper is drafting-blue, stroke-first, hatched, dimensioned
(BP-3's legend). Panel is the toy: flat fills, beveled-look via 45° facet
shading (two flat tones, no gradients), NES-inspired palette sampled per
`tokens.seed.json`. Every number that appears on a paper sheet carries the
parameters that produced it (measured-chip convention applies to design
artifacts too).
