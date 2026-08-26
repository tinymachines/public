# 07: QA Checklist (gate per milestone)

Score each item pass/fail with evidence (render, diff, test output).
Any fail blocks the next milestone.

## M0 gate
- [ ] Token values sampled programmatically, not eyeballed; sampling script included
- [ ] No BP-2 printed hex adopted without pixel verification
- [ ] Contrast table covers every text-on-fill pair; failures flagged
- [ ] Stationery legend matches BP-3 line language exactly
- [ ] Footer/title block carries generation parameters

## M1 gate
- [ ] `solve()` is pure and deterministic (same input → identical output, hashed)
- [ ] Test matrix ratios all produce: mask on-grid, m = 4%, c = S/9 (grid-rounded)
- [ ] 224×224 guaranteed window fully inside mask at every ratio (automated)
- [ ] Integer scale factor k chosen correctly (largest k with 224k ≤ S_px)
- [ ] No letterbox/pillarbox present anywhere; surplus goes to reveal or facets
- [ ] Vertical bias rule (portrait top-gap = m) implemented
- [ ] Master sheet dims match solver output numerically (spot-check 5 values)

## M2 gate
- [ ] Every manifest layer id exists; no extra ids
- [ ] All vertices pass the 8u-grid lint; angle lint (0/45/90) passes
- [ ] Circles only on the whitelist
- [ ] All states present per component; state toggling never mutates geometry
- [ ] 7-seg counters are polygons, not fonts
- [ ] Cartridge roster 100% original; IP grep clean
- [ ] Local origin at center verified for every group (transform round-trip test)

## M3 gate
- [ ] Dock priority behaves per spec under a cramped ratio (force-test at 1:1.05)
- [ ] Facets deterministic (two runs, byte-identical output)
- [ ] Facet shading is exactly two flat tones per family
- [ ] HUD chips never enter corner exclusion zones
- [ ] Shelf docks to widest free edge, or falls back to page-only
- [ ] Ghost-button overlay appears only in the 1:1 ± 10% band

## M4 gate
- [ ] Swipe never fires from a gameplay input gesture (decision filed + tested)
- [ ] Coin flow: tap → drop → credits++ → pulse stops
- [ ] LED tri-state transitions match the machine-state diagram
- [ ] Boot wipe is 4 stepped frames, no blur/gradients
- [ ] Touch targets ≥ 88 px at device scale; hit regions = polygon +8u dilation
- [ ] Orientation change re-solves layout with no reload and no state loss

## M5 gate
- [ ] All ladder rungs render; every rung's vertices land on integer pixels
- [ ] Hairlines dropped at ≤720p; fills-only at native
- [ ] Native 256×240 render is legible and honest (no cheated detail)
- [ ] Gzip/size budget recorded per rung (report only, no target yet)
- [ ] Final IP grep clean across all outputs and metadata
- [ ] Every sheet footer carries its generation parameters
