# 06: Agent Brief (handoff)

You are building the **NES-style universal arcade shell** from this pack.
Read in order: `00-REVIEW.md` → `01-DIRECTION.md` → `02-GEOMETRY-SPEC.md` →
`03-COMPONENTS.md` → `04-PAGES-FLOWS.md`. The manifest
(`05-SLICING-MANIFEST.json`) is your layer contract; `tokens.seed.json` is
your color process. Sources in `sources/` are *reference mood*, not assets , 
nothing is traced from them, and no IP from them ships (see IP policy,
Direction §7).

## Working rules

1. **Direction beats downstream docs; specs beat your preferences.** If you
   find a genuine conflict or an underspecified case, stop, file it as an
   issue in `ISSUES.md` (create it), propose a resolution, and continue on
   non-blocked work. Do not silently improvise geometry.
2. **Deterministic everything.** Facet generation, layout solving, exports , 
   same inputs, same output, snapshot-testable.
3. **Vector discipline**: closed polygons, 8u grid, 0/45/90° only, circle
   whitelist, stroke roles in units, no gradients, no filters, no raster.
4. **Measured convention**: every rendered sheet carries a footer with the
   parameters that produced it (ratio, S, m, c, seed, ladder rung).
5. Deliver each milestone as reviewable artifacts before starting the next.
   QA happens between milestones: expect change requests.

## Milestones

### M0: Foundation (tokens + stationery)
- Run the token process (`tokens.seed.json` §process): swatch sheet →
  sampled values → `tokens.css` + `tokens.static.css` + contrast report.
- Blueprint "paper" stationery SVG: field, grid, title block, the BP-3
  legend (hatch/dash/cross-hatch/solid/dash-dot line language).
- **Deliver**: tokens files, contrast table, stationery.svg, swatch render.

### M1: Master geometry
- Implement the layout solver: `solve(W, H) → {mask, zones, docks, facets}`
  per `02-GEOMETRY-SPEC.md`. Pure function, no rendering dependencies.
- Annotated master sheet (paper ground) at 8K units: portrait 9:19.5,
  landscape 16:9, square 1:1, ultrawide 21:9: mask, guaranteed 224 window,
  safe areas, zones, dims.
- **Deliver**: solver module + tests over the full test matrix, master sheet SVG.

### M2: Component kit
- Every component in `03-COMPONENTS.md` as standalone SVG group with all
  states, local origin at center, IDs per manifest.
- Original cartridge label art for the roster (Direction §7).
- Kit sheet (paper ground): all components laid out with dims, plus a
  panel-ground render of each.
- **Deliver**: components.svg (symbol library), kit sheet, roster labels.

### M3: Assembly
- Compose full shells for the test matrix using solver + kit: panel-ground
  renders, portrait and landscape, with facet filler.
- Page set mockups: Gameplay / Shelf / Status / Settings (static).
- **Deliver**: one SVG per test-matrix ratio + page mockups.

### M4: Interaction prototype
- HTML/SVG prototype: live ratio (drag-resize or orientation toggle),
  swipe pages, coin flow, cartridge load flow, LED states, boot wipe.
- Resolve the Gameplay-page swipe gesture decision (Pages §"swipe conflict")
  and file it.
- **Deliver**: single-file prototype + decision log.

### M5: Export ladder + final QA
- Render every ladder rung per manifest; verify integer pixel alignment,
  stroke-drop rules, native 256×240 fills-only pass.
- Full QA checklist run (`07-QA-CHECKLIST.md`), self-scored, evidence
  attached (renders, diffs, test output).
- **Deliver**: export set + QA report.

## Definition of done (global)

- Solver tests green across the whole test matrix.
- Zero letterboxing, zero non-uniform scaling, at any ratio in the matrix.
- 224×224 guaranteed window fully visible everywhere (automated check).
- Every vertex on the 8u grid (lintable: write the lint).
- No IP: grep sheets and metadata for nintendo/mario/zelda/™ → zero hits.
- Facets snapshot-stable across runs.
