# 02: Geometry Spec

Normative. All values in **units (u)** unless marked px. Agent implements
exactly; deviations require a filed issue, not a silent fix.

## 1. Units & grid

- 1u = 30 px at the 8K master (7680 px wide reference frame).
- Module grid: **8u**. Every vertex of every shape snaps to it.
- Angles: 0° / 45° / 90° only. No arcs except the circle whitelist
  (stick ball, coin, LEDs, D-pad pivot).

## 2. Screen mask

Given device W×H (px), let `S = min(W, H) − 2m`, with bezel margin
`m = 0.04 · min(W, H)` (round m to the nearest 8u equivalent).

- Mask = chamfered octagon: square S×S with corner chamfers `c = S/9`,
  c rounded to nearest 8u.
- Mask center: horizontally centered always; vertically biased toward the
  top edge in portrait (top gap = m), centered in landscape.

## 3. Crop camera (what the mask shows)

- Native virtual canvas: **256×240** (NES native), integer-scaled by
  `k = floor(S_px / 224)` … use largest k such that 224·k ≤ S_px.
- **Guaranteed window: 224×224** native px, always fully visible. Game
  logic treats this as the screen. This satisfies and exceeds BP-2's
  "85% of shortest side" floor (224/256 = 87.5%).
- Surplus width (landscape/wide): reveal additional native columns
  symmetrically, up to 256 total. Beyond 256·k px of mask width, the
  dynamic polygons take over: never stretch, never letterbox.
- Surplus height (portrait/tall): reveal HUD rows (native rows 0-15 and
  224-239) before ceding space to the deck.
- Scaling is integer-only (crisp pixels, subpixel off: BP-1). Fractional
  remainder goes to the bezel, never to the image.

## 4. Safe areas (unified: supersedes BP-1 and BP-4 numbers)

Measured from the mask edge, inward, as % of S:

| Zone | Inset | Rule |
|---|---|---|
| Bezel (m) | outside mask | 4% of min(W,H) each side |
| Action safe | 5% | All sprites/gameplay-critical inside |
| Title/UI safe | 10% | All HUD text inside; **no HUD in corners** (corners = chamfer triangles + 8u) |

## 5. Flex zones

Portrait: `header` (fixed 24u strip above screen, optional), `deck`
(everything below mask + m). Landscape: `wing-L`, `wing-R` (everything
beside mask + m), split equally. Squarish ratios (1:1 ± 10%): zones may
collapse; controls overlay the bezel corners as ghost buttons (reduced
opacity octagons): the only overlay case allowed.

## 6. Dock priority

When a zone is too small for its full loadout, drop from the bottom of its
list; when roomy, space out along the zone axis.

- deck (portrait): 1 movement (d-pad or stick) left · 2 A/B right ·
  3 select/start pills center · 4 coin+power strip · 5 speaker · 6 shelf lip
- wing-L: 1 movement · 2 coin acceptor · 3 power/reset · 4 cartridge bay
- wing-R: 1 A/B (+turbo) · 2 select/start · 3 quick-access · 4 speaker
- header: title marquee · credits counter · swipe rail

Shelf always docks to the widest free edge; if none fits, shelf lives only
as the Shelf page.

## 7. Dynamic polygons (filler facets)

Deterministic function `facets(W, H, seed)`:
1. Compute residual region = zone ∩ ¬(controls ∪ mask ∪ m).
2. Slice with 45° lines from mask chamfer vertices outward to zone corners.
3. Subdivide slabs thicker than 48u with alternating 45° cuts on the 8u grid.
4. Shade with exactly two flat tones per facet family (light face / dark
   face): the "bevel" is tonal, not gradient.
Same (W, H, seed) must always yield identical facets (snapshot-testable).

## 8. Touch

Minimum touch target 88 px at device scale (≥ BP-4's 8 px native × integer
scale, whichever larger). Hit region = the drawn polygon dilated by 8u.
Joystick gate octagon doubles as its hit region; stick snaps to 8 gate
vertices (8-way) or slides freely (lock/slide modes, BP-3).
