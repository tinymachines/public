# 03: Component Kit

Every component is a standalone SVG `<g>` with **local origin at its
geometric center**, closed polygons only, vertices on the 8u grid, strokes
by role (hairline 1u / seam 2u / bezel 4u). States are sibling groups toggled
by class, never redrawn geometry. IDs per `05-SLICING-MANIFEST.json`.

## ctl-dpad: 24u cross
Cross polygon, 45° pivot facets, circular pivot ghost. States: idle,
pressed-{n,e,s,w,ne,nw,se,sw} (pressed arm shifts 1u + dark face swap).

## ctl-stick: 28u gate + ball
Octagonal gate (restrictor + hit region), ball circle, shaft seam line.
Modes: 8-way snap / slide (BP-3). States: centered, deflected×8, mode badge.

## ctl-ab: 17u octagon pair (+ optional turbo)
Concave read via inner octagon inset 2u dark tone. B left-low, A right-high
(NES stagger). Optional turbo micro-switches above (8u toggles). States:
idle, pressed (inset grows 1u), turbo-on (marker dot).

## ctl-pills: select/start
Rounded-rect pills 52×14u in a recessed tray (seam outline). States: idle,
pressed, held (hold-to-pause per BP-3 tap/hold/charge semantics).

## sys-power: rocker 56×22u + LED + reset
Split rocker (seam at center), reset chiclet 34×22u, LED circle 5u.
LED states: off / amber (boot) / red (live). Power = pause, hold = off,
reset = restart with flicker wipe.

## sys-coin: slot 10×44u + acceptor + credits
Vertical slot, coin circle 12u, credits counter (7-seg style, drawn as
segment polygons: sliceable, no font dependency). Interaction: tap slot →
coin polygon animates down → credits++ (coins are granted, never sold).

## sys-shelf: cartridge shelf + carts
Shelf rail with edge-connector ridge row (game picker affordance), carts
44×38u spine-out, per-cart: shell polygon, label window, detect notch.
Loaded cart shows power LED. Detail card: flip tab reveals info panel
(title, theme palette chips, save icon). Metadata chips: owned / free slots.
Roster per `01-DIRECTION.md` §7: original games only.

## sys-speaker: 45° grille
Parallel 45° slot polygons in a chamfered field. Purely decorative; may be
dropped first under dock pressure.

## nav-swiperail: 3-5 dots + chevrons
Dots (active = filled accent), chevrons as 2-segment polylines. Mirrors
page count; Map dot appears only when cartridge declares a map page.

## nav-quick: quick-access strip
Four 20u octagon chips: menu / pause / sound / snapshot (BP-4). Context row;
docks into header (portrait) or wing-R (landscape).

## hud-chips: modular HUD bar
Dockable chips on the title-safe rail: hearts, energy bar (segment
polygons), item slots, score/timer (7-seg polygons). Flat, no parallax,
scales with safe area (BP-4). Never in corners.

## scr-mask: screen assembly
Chamfered octagon mask, inner 8:7.5 trim (dashed on paper sheets only),
optional overlays as separate groups: fx-scanlines (1u lines, intensity =
opacity steps), fx-crt (corner vignette polygons: flat, stepped, no
gradients), fx-flicker (boot wipe frames ×4).

## fx-wear: optional overlay
Scuff polygons, faded price-sticker octagon, cart-slot shine line.
One group, toggleable, never on by default.
