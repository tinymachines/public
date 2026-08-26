# NES-Style Universal Arcade Shell: Handoff Pack v0.1

Director's pack for building the universal (all-ratio, portrait + landscape)
1980s NES-style arcade shell. Synthesized from five candidate blueprints
(Grok/Gemini, in `sources/BP-1..5.jpg`) plus the prior Claude geometry
sheets. The agent builds; we QA at each milestone gate.

## Read order

| File | What it is |
|---|---|
| `00-REVIEW.md` | Source audit: keep/kill/merge verdicts + conflict rulings |
| `01-DIRECTION.md` | The synthesis: six load-bearing decisions. Wins all conflicts. |
| `02-GEOMETRY-SPEC.md` | Normative math: units, mask, crop camera, safe areas, zones, facets |
| `03-COMPONENTS.md` | Parts kit with states |
| `04-PAGES-FLOWS.md` | Pages, machine states, coin/cartridge flows |
| `05-SLICING-MANIFEST.json` | Machine-readable layer contract + export ladder |
| `tokens.seed.json` | Color roles + the sampling process (no transcribed hex) |
| `06-AGENT-BRIEF.md` | The actual handoff: rules, milestones M0-M5, definition of done |
| `07-QA-CHECKLIST.md` | Gate checklist per milestone |
| `sources/` | BP-1..BP-5 reference images (mood only; contains third-party IP: do not trace or ship anything from these) |

## One-paragraph summary

Square-core crop camera (256×240 native, 224×224 guaranteed, integer scale
only) behind a chamfered-octagon mask sized to `min(W,H) − 2m`; surplus
aspect ratio reveals native canvas, then flex zones (deck/wings/header)
dock the controls by priority, and deterministic 45° facet polygons absorb
the rest. One shape language (8u grid, 0/45/90°, octagon buttons), the
machine as part of the game (coins, power LED, cartridges that theme the
shell), four swipe pages, authored at 8K in units and exported down to
NES native.

Mapping for QA: BP-1=IMG_5436, BP-2=IMG_5435, BP-3=IMG_5434,
BP-4=IMG_5433, BP-5=IMG_5432.
