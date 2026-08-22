# The tinymachines style guide

This is the thing `START-HERE.md` §4 says is the owner's and in progress. It is
no longer in progress. The `@theme` block it reserves as a seam is
`tokens.css`; drop it into `web/app/globals.css` and the seam is filled.

Read this once, then work from `zoo.html`. The zoo is the normative artifact:
every component is rendered there on the real ground with the markup that
produced it, extracted from the live DOM so a listing cannot drift from its
render. This document is the *why*; the zoo is the *what*.

---

## 0. What was changed from the binder, and why

The binder scans are the design. The hex codes printed on them are not.

Every colour label in the source pages is invented: `#DA7AAF` is captioned
"Burnt Silicon" but is a pink; `#1BBFFFE` and `#D119282` have seven digits;
`#FU1GPOD`, `#BBCSDH`, `#9RC361` and `#AFU1GPOD` are not hexadecimal at all.
The rendered swatches, on the other hand, are good and consistent across pages.

So the palette below was **sampled from the swatches**, not transcribed from
the captions. Values are the median RGB of a 12&times;12 patch at each swatch
centre in `IMG_5318`, white-balanced by scaling against the page's paper white
(237, 238, 242 &rarr; 255, 255, 255). Every contrast ratio quoted is computed
against the actual ground, not estimated.

Two names were also corrected. The source calls one swatch "Mustard Conductor"
twice, once over the burnt orange; and the Logic Accents block lists Electric
Blue twice with two different values. Names here are one-to-one with values.

Nothing else was invented. Where the binder states an interaction time (150ms
detent, 160ms error strobe), that number is in the tokens unchanged.

---

## 1. The one idea: two grounds

**Paper is documentation. Panel is the machine talking.**

This is the load-bearing decision in the whole system, and it is a *semantic*,
not a light/dark theme. There is no toggle. A dark box on a tinymachines page
means the values inside it came out of the engine on a run that happened.

| | Paper | Panel |
|---|---|---|
| ground | `--color-paper` `#F4F2EC` | `--color-panel` `#131311` |
| carries | prose, tables, navigation, marketing | node state, registers, traces, memory, code |
| type | serif for prose, sans for UI | mono, almost exclusively |
| rules | 1px ink hairlines | 1px `--color-rule-panel` |
| separator | none | the chrome bezel |

Two rules follow, and both are checkable in review:

- **Never render live engine state on paper.** If a number came out of
  `halfphi`, it belongs on a panel or it carries a measured chip. Preferably
  both.
- **Never put marketing copy on a panel.** A dark hero section with a headline
  in it is the failure mode this rule exists to prevent. The panel is not a
  mood; it is a claim about where the content came from.

It comes straight out of the subject. The 6502 work has exactly two artifacts:
the datasheet that describes the chip, and the instrument that watches it run.
The style guide should not have to invent a third.

### Chrome is the boundary

The third material is the bezel, and it has one job: mark where paper stops and
the machine starts. Chrome is an **edge**, never a fill, and never a background
for content.

If you find chrome anywhere that is not that boundary (a chrome button on a
paper page, a chrome heading, a brushed-metal card), it has become decoration
and should be deleted. The binder's own note about "preventing clutter" is
this rule, and it is the difference between engineered and kitsch.

---

## 2. Colour

### The Earth Conductor: categorical

Assigns identity: a bus, a signal class, a region, a category in a table.
**Each hue ships in two forms**, because legibility is ground-dependent:

| Name | On panel | ratio | On paper (`-ink`) | ratio |
|---|---|---|---|---|
| Burnt Silicon | `#D06B40` | 5.2:1 | `#8E3D1C` | 6.6:1 |
| Mustard Conductor | `#D2B771` | 9.5:1 | `#7A6220` | 5.2:1 |
| Forest Logic | `#5FA772` | 6.4:1 | `#2D583A` | 7.3:1 |
| Ocean Data | `#5FB8C0` | 8.1:1 | `#1A5A61` | 7.0:1 |

The pairs are **named, not derived at the call site**. A component that
computes a lighter shade when it finds itself on a panel is a component that
will get it wrong the first time somebody nests one ground inside the other.

Standing assignments, so a screenshot means the same thing twice:

- **Ocean Data**: addresses and indices. Anything that *points at* something.
- **Mustard Conductor**: values. Bytes, counts, register contents.
- **Forest Logic**: held / verified / matched.
- **Burnt Silicon**: the primary action, and writes. It is the only hue that
  appears both as a control colour and a data colour, because a write is the
  one place where the machine took an action.

### Logic Accents: state only

Three, and each has exactly one meaning. If you reach for one of these for
emphasis rather than state, use ink.

- **Electric Blue** `#5E92FF` / `#0F3FB8`: **active, driven, now**. The lit
  phase. The current half-cycle. A value that changed.
- **Signal Orange** `#E4670F` / `#9A5A12`: **needs a human**. A warning, an
  armed destructive control, a provisional number.
- **Signal Red** `#FF6A5C` / `#B0281B`: **an assertion failed**. Nothing else.

That last one is a real constraint and it is worth stating plainly: in this
codebase, `contested_groups` and `nonconvergent_settles` are asserted zero.
Red on a tinymachines page therefore means *an invariant that the test suite
holds did not hold*. Not "bad". Not "important". Broken. Anything that is
merely unfortunate gets orange, and anything that is merely emphatic gets ink.

The reason to defend this is the reason the export-time clamp was rejected: a
violation that gets styled as a normal state is a violation that stops being
visible.

### Drive states

`halfphi`'s `Drive` enum gets colour, and the legend is printed in **ordinal
order** (Floating, ChargedHigh, PullDown, PullUp, Vcc, Vss), because that
order *is* the resolution rule. Never sort this alphabetically in a legend.

`ChargedHigh` is deliberately the dimmest lit state. It ranks below the real
pulls, and that ranking is exactly what makes dynamic retention work across a
phase, so the colour should read as *held*, not *driven*. Contested is red,
because it is unreachable in a healthy run.

### The Chrome Core

`--color-chrome-hi` through `--color-chrome-lo`, plus two gradients.
Bezel material only. See §1.

---

## 3. Typography

Four voices. Three of them are one superfamily, so a docs page carrying prose,
a table and a register dump at once stays coherent.

| Role | Face | Where |
|---|---|---|
| Display | **Archivo** 800/900, caps, `-0.02em` | Section headers. Nowhere else. |
| Interface | **IBM Plex Sans** | Labels, buttons, UI copy, table name columns. |
| Data | **IBM Plex Mono**, tabular | Anything the machine produced. |
| Documentation | **IBM Plex Serif** | Prose paragraphs in `/docs`, and only there. |

All four are OFL and on Google Fonts. `--font-display` is the swap seam: change
that one line to drop in a licensed display face (the binder's "Silicon Sans"
is closest to Eurostile, and Berkeley Mono is the paid upgrade for the mono if
you ever want it) without touching a single component.

The rule that makes this a system rather than four fonts:

> **Mono means the machine said it.** An address, a node id, a count, a
> duration, an opcode, a hash. If a human typed it as prose, it is not mono.

That is why the serif is confined to documentation prose. A serif paragraph
next to a hex dump is what makes the hex dump look like *data* rather than
text. Set prose in sans and the two blur into one grey field.

### Scale

Ten sizes, and the small end is where the work is, because this is a data-dense
site: `11 / 12 / 13 / 15 / 17 / 21 / 24 / 32 / 48 / 72`. 13px mono is the
workhorse: it is the size at which `0x3F40` stays unambiguous and eight bytes
plus ASCII still fit a phone. Prose is 17px serif; UI is 15px sans.

Caps tracking is `0.08em` and applies to every uppercase label. Display
tracking is negative. Do not track lowercase text.

---

## 4. The grid

One number: `--u: 4px`. Every spacing value in the system is a multiple.

Four steps carry almost everything: 2u inside a control, 4u for module
padding, 8u between modules, 16u between sections. The zoo page sits on an 8u
rule so the grid is visible while you work.

This is the binder's "primary grid unit", and its payoff is that a memory
monitor and the table beside it line up without anybody measuring. When a
value does not want to be a multiple of 4, the answer is almost always that
the element is the wrong size, not that the grid needs an exception.

---

## 5. Motion: tac-motion

Mechanical, not cinematic. The binder is explicit and it is right: simulate
mechanical resistance, and no slow retro fades or zooms.

| Token | Duration | For |
|---|---|---|
| `--t-snap` | 90ms | button press, chip toggle |
| `--t-detent` | 150ms | switch throw, encoder step |
| `--t-slide` | 180ms | module slide-and-snap |
| `--t-strobe` | 160ms &times;4 | assertion strobe, then hold |
| `--t-glow` | 1400ms | attention pulse |

`--ease-detent` is `cubic-bezier(0.2, 0.9, 0.1, 1)`: fast out, hard stop.
That curve is the house feel; if a transition does not use it, there should be
a reason.

Three rules:

- **Nothing exceeds 240ms except the attention glow.** The glow is the one slow
  curve in the system and it is slow deliberately, so it reads as breathing
  rather than blinking.
- **A moving part moves.** Lit state is a glow on the part that travelled,
  never a colour change on the housing. Position, glow and label colour change
  together, so the state survives greyscale.
- **Nothing blinks forever.** The assertion strobe fires four hard steps and
  then holds red. A permanent blink is wallpaper within a minute, which is the
  opposite of what an alarm is for.

Reduced motion is handled globally in `tokens.css`. The test every specimen
passes: with animation off, state is still legible from position and colour
alone.

---

## 6. Components

The zoo is the reference. What is worth stating here is the kit discipline
around it:

- **`components.css` is the kit.** A page does not fork a component; if a
  component is wrong for a page, fix the component or add a specimen.
- **The zoo's own chrome lives in `zoo.html`, never in `components.css`.** A
  zoo-only class in the kit will turn up on a real page eventually.
- **Every specimen is marked** `shipped`, `draft` or `idea`, so it is always
  clear what can be used today.
- **Markup listings are extracted from the live DOM at load.** They are not
  maintained beside the specimen, because that is a second copy and second
  copies drift. Same reasoning as deriving docs navigation from the tree.

### Two components carry rules from the repo

**The measured chip** is `START-HERE.md`'s rule with a place to live: every
number on the site says which run produced it. A figure without one is a
figure somebody typed, and the reader is entitled to know which they are
looking at. Code blocks that state an output carry the same stamp as a `RAN`
line.

**The coin meter** shows a budget remaining and has deliberately no "buy more"
affordance, because coins are given away and never sold. When it empties, the
copy points at a way to earn. Designing a price into this component reopens a
question that is closed.

### The phase rail

The signature. Two cells, &phi;1 and &phi;2, and they are never both lit:
non-overlap is an axiom of the engine, so the component makes the illegal state
unrenderable: lit-ness comes from one `data-phase` attribute on the parent, not
from a class on each cell. There is no way to pass it a state that violates the
axiom.

Every live panel wears one. It is the cheapest possible reminder that this is a
half-wave simulator and that `h`, not cycles, is the unit everything is counted
in. Axes label half-cycles and never quietly convert.

---

## 7. Voice

Same register as the repo: plain, decided, and always giving the reason.

- Say what a control does, in the words of the person using it. "Run to
  breakpoint", not "Execute".
- An action keeps its name through the whole flow. The button that says
  "Export trace" produces a file called a trace.
- Errors do not apologise and are never vague. Say what happened, where, and
  what is true as a result. The rail-violation notice in the zoo is the model:
  it names the node, the half-cycle, and says the trace was *not* clamped.
- Numbers carry provenance or they do not appear.

---

## 8. The short list

If you read nothing else:

1. Paper is documentation, panel is the machine talking. Not a theme.
2. Chrome is an edge. Never a fill.
3. Every Earth Conductor hue has a paper form and a panel form. Use the right one.
4. Red means an assertion failed. Nothing else is red.
5. Mono means the machine said it.
6. Everything is a multiple of 4px.
7. 150ms, fast out, hard stop. Nothing over 240ms but the glow.
8. Every number carries the run that produced it.
9. &phi;1 and &phi;2 are never both lit.
10. Fix the component, do not fork it.

---

## 9. Still open

- **The display face.** Archivo is a good, free stand-in for the binder's
  heavy condensed caps, but it is a stand-in. If the identity is worth a
  licence, this is where to spend it, and it is one token.
- **The die photography.** The binder has no rule for how die imagery sits on
  the page, and the atlas will need one. Provisional instinct: die images are
  panel content, framed by a bezel, never bled to the page edge, but that
  should be decided against a real atlas page, not in the abstract.
- **Dense mode.** The 13px mono workhorse is right for a docs page. A full
  screen memory explorer probably wants 12px and 1.35 leading. Add it as a
  container-scoped token override rather than a second scale.
- **Print.** The whole system came off paper and it would be a shame if a docs
  page printed badly. Panels invert to white-on-white today.
