# 00: Source Review

Five candidate blueprints (BP-1 … BP-5, in `sources/`) plus the three Claude
geometry sheets from the prior session (chamfer/flex-zone system, control
vocabulary, export ladder). This document is the audit. Verdicts feed
`01-DIRECTION.md`; nothing is adopted without appearing here first.

Source ↔ upload mapping (verify before trusting anything below):
BP-1 = IMG_5436, BP-2 = IMG_5435, BP-3 = IMG_5434, BP-4 = IMG_5433, BP-5 = IMG_5432.

---

## BP-1: dark navy / purple pixel poster

**Keep**
- Extra Ideas Vault: CRT filter toggle, scanline intensity slider, PAL/NTSC
  visual switch, limited rewind buffer, 8-bit achievement pop-ups, **custom
  palette loader via cartridge** (best single idea in the batch: a cartridge
  that reconfigures the shell, not just the game).
- Dev notes: stroke-based lines, clipping masks for polygon scaling, 8 px UI
  grid, snap all points, minimum test matrix {4:3, 16:9, 9:16, 1:1}.
- Cartridge shelf **side view / beveled stack** with power LED on the loaded cart.
- Five-page swipe set enumeration (Gameplay / Status / Inventory / Map / Options).
- Layered safe areas expressed as % of frame.

**Kill**
- The radiating-ratio octagon hero diagram. Pretty, but it doesn't *specify*
  anything: the mask mechanics are asserted, not defined. Replaced by the
  crop-camera rule (see BP-3 + Direction §2).
- Its safe-area numbers (5/10/15%) conflict with BP-4's (3/4.5%). Neither set
  survives as-is; unified numbers are defined once in `02-GEOMETRY-SPEC.md`.

## BP-2: classic blueprint blue / color sprites

**Keep**
- "85% of shortest side always visible, no HUD in corners": the cleanest
  statement of the visibility guarantee. Adopted (as the *floor*, not the target).
- Modular HUD bar ideas (hearts, energy bar, item slots, score/timer as
  dockable chips).
- Theming-as-swipe-screens (Arcade Classic / Space / Dungeon / Racing) →
  becomes the **cartridge-driven theme** system, merged with BP-1's palette loader.
- Vector-slice checklist (flat shapes, no gradients, pixel friendly).

**Kill**
- **The 16u×9u letterboxed game core.** Directly contradicts the brief
  ("almost max width of smallest dimension"). Letterbox/pillarbox is the
  failure mode we're designing around, not the mechanism. Rejected wholesale.
- Printed hex palette (#1A1D2E …). Per project rule: never trust transcribed
  values from renders. Treated as *candidates only*; final tokens are sampled
  from approved swatch pixels (see `tokens.seed.json`).
- "NES™" branding. We are NES-*style*, not NES-branded. No ™, no Nintendo marks.

## BP-3: line-art drafting sheet

**Keep**
- **The crop-camera concept.** The cropping-examples strip (same scene,
  different windows per ratio) is the correct mental model: the playfield is
  larger than any one crop; the mask is a camera window, not a letterbox.
  This is the geometric heart of the final design.
- Drafting legend discipline: hatch = playfield safe, dash = action safe,
  cross-hatch = text/UI safe, solid = dynamic crop mask, dash-dot = guide
  (no render). Adopted as the official line-language for all sheets.
- Downscale chain ending at **NES native 256×240**: the other sources all
  stop at NTSC 480. Native is the true bottom rung.
- Cartridge detail card with flip-for-info tab.
- Tap / hold / charge as button semantics; lock/slide joystick modes.

**Kill / Replace**
- Mario, Zelda, Double Dragon cartridges and sprites. All IP is scrubbed;
  the pack ships an original fake-game roster (see Direction §7).

## BP-4: rendered blueprint / max-square system

**Keep**
- **Explicit max-square formulation**: "gameplay = largest square inside the
  shortest dimension": independently converges with the Claude geometry
  sheets. This agreement across three sources is the strongest signal in the
  review; the square core is settled.
- HUD rules: flat, no parallax, icons & fonts scale with safe area.
- Quick-access strip (menu / pause / sound / snapshot).
- Shelf metadata (collection size / free slots): hooks straight into the
  coin-economy / collection ideas.
- Palette organized as *ramps by role* (incl. the DPCM/dither swatch joke,
  which we are absolutely keeping as an easter egg).
- Touch rules: large hit areas, 8 px minimum touch target, visual feedback.

**Kill**
- Mario sprites (IP scrub).
- Its 3%/4.5% safe numbers as literal values: merged into the unified set.

## BP-5: skeuomorphic console blueprint

**Keep**
- **The full-shell arrangement.** This is the concrete realization of the
  flex-zone architecture: landscape = cartridge/system bay (wing L) + screen +
  control panel (wing R); portrait = header strip + screen + control deck.
  Adopted as the canonical assembly, with polygons swapped to the chamfer language.
- Cartridge-detection LED states, credits counter on the coin acceptor,
  power/reset pairing.
- "Dynamic polygons" as named filler geometry between screen and zone edges , 
  this is exactly the surplus-absorber; it now gets a spec instead of a caption.
- Swipe area = the screen itself (left/right on the glass switches pages).

**Kill / Replace**
- Zelda cartridge and title screen (IP scrub).
- Freeform "crystal" filler facets → regenerated procedurally on the 8-unit
  grid with 45° chamfer angles only (slice-friendly, deterministic).

## Claude sheets (prior session): carried forward

- Chamfered-octagon screen mask, `S = min(W,H) − 2m`, chamfer `c = S/9`.
- Flex-zone container model (deck / wing L / wing R) with dock priority.
- 8-unit module grid; 1u = 30 px at 8K.
- Stroke ladder (hairline 1u / seam 2u / bezel 4u; drop 1u strokes below 720p).
- Parts-kit slicing: every control a group with local origin at its center.

---

## Conflict resolutions (summary)

| Conflict | Sources | Ruling |
|---|---|---|
| Square core vs 16:9 letterbox core | BP-4 + Claude vs BP-2 | **Square core + crop camera.** BP-2 rejected. |
| Safe-area percentages | BP-1 (5/10/15) vs BP-4 (3/4.5) vs BP-2 (85%) | Unified set in `02-GEOMETRY-SPEC.md` §4. BP-2's 85% kept as the hard visibility floor. |
| Button shape language | Octagon (BP-1) vs circle (BP-2/4) vs hex (BP-3) | **Octagon family**: matches the 45° chamfer language everywhere else. Circles reserved for stick ball, coin, LEDs. |
| Page count | 5 (BP-1) vs 4 (BP-3/4) | 4 core pages (Gameplay / Shelf / Status / Settings); Map is an optional per-cartridge 5th. |
| Palette values | BP-2 printed hex vs sampled | Sampled/derived only. Printed hex = unverified candidates. |
| Export floor | NTSC 480 vs native 256×240 | Ladder extends to native (BP-3). |
