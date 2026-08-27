# Pretext on the tracer: measured 2026-08-27

`extern/pretext` is chenglou's text layout library (MIT, no die data,
submodule at `ac49b09`, v0.0.8): `prepare(text, font)` measures the
segments once with canvas, `layout(prepared, width, lineHeight)` is
arithmetic after that, and neither touches the DOM. The question was
whether it has a job on the tracer, the page with the most text on the
site. The probe ran against the live page at 1280px, Chromium, with the
CDP performance counters, and injected the built library into the page
to lay out the page's own texts in the page's own fonts.

## What the page costs today

200 half-cycles through the store, one per animation frame, the page
repainting its readouts as it does for a reader:

| | |
|---|---|
| wall | 3,370 ms (paced by the frames, not the work) |
| layouts | 426 (about two per half-cycle) |
| layout time | 337 ms |
| style recalculation | 755 ms |
| script | 53 ms |
| DOM nodes the engine tracks | 25,312 |

So a half-cycle costs the engine about 1.7 ms of layout and 3.8 ms of
style recalculation, and the script that produced the text is a
rounding error. The cost is in the twelve readout cards being rewritten
with `innerHTML` each step (`tracer.js` around lines 2240 to 2550) and in
the size of the tree those writes invalidate, not in the text itself.

The text itself, for the record, because the page reads as heavy:
19 paragraphs of prose, 24,724 characters, and one of them is 20,661
characters long (`web/tracer.html` line 251, "The tinted regions behind
the graph are the functional blocks..."), which lays out 5,760 px tall
at the prose column's width. Every other paragraph on the page is under
700. That paragraph is an editorial fact, not a layout one; no library
changes it.

## What pretext does with the same text

Twelve of the page's own texts (the five readout boxes, the first seven
prose paragraphs), each laid out at its box's width and line height, in
the computed font of its box (IBM Plex Mono for the cards, IBM Plex Sans
for the prose). DOM measure = set the text on a probe element with the
same font and width, read `offsetHeight` (a forced layout each time).

| text | chars | width | DOM height | pretext height | DOM per measure | pretext prepare (once) | pretext layout |
|---|---|---|---|---|---|---|---|
| tc-block (the instruction) | 1,140 | 291 | 396 | 396 | 0.095 ms | 15.3 ms | 35 µs |
| tc-picked | 51 | 291 | 36 | 36 | 0.025 ms | 0.7 ms | <5 µs |
| tc-stats | 108 | 1,208 | 18 | 18 | 0.020 ms | 0.4 ms | <5 µs |
| the 20,661-char paragraph | 20,661 | 612 | 5,760 | 5,760 | 2.47 ms | 21.2 ms | 105 µs |
| the other eight paragraphs | 233 to 650 | 612 to 680 | 72 to 192 | same, all eight | 0.045 to 0.105 ms | 0.2 to 2.3 ms | <10 µs |

Every height agrees to the pixel, twelve of twelve, in both families.
After the one-time `prepare`, a layout pass over all twelve costs 0.165 ms
against 3.24 ms through the DOM, about 20 times cheaper; `prepare` for
all twelve costs 44 ms once, most of it the two long texts.

## So: is there a job

Not the one the page's cost suggests. Pretext measures; it does not make
a 6,163-node instrument section cheaper to restyle, and style
recalculation is two thirds of what a half-cycle costs. Replacing the
cards' `innerHTML` with targeted updates would do more than any
measurement library, and that is `tracer.js`, the 6502 repo's.

Where it does have a job, and these are real:

1. **The cards' heights without a reflow.** A readout card that changes
   text every half-cycle also changes height, and the page under it
   shifts. With `prepare` cached per distinct text (the instruction
   blob is one string, the block cards are a few dozen) and `layout` at
   35 µs, a card can be given its height before the text lands and the
   column under it stops moving. That is the "prevent layout shift"
   case in pretext's own README, and the numbers above say it holds in
   the house fonts.
2. **Canvas or SVG text for the drawing's labels.** The tracer's graph
   is 1,725 nodes as DOM elements; a label drawn with `fillText` needs
   its lines from somewhere, and pretext's `layoutWithLines` is that
   somewhere, measured to match the browser.
3. **A build-time check that the copy fits.** `prepare` needs a canvas,
   so it runs in a browser (or a headless one), not in `bun test`; but
   an e2e spec that lays every strip word, every card head and every
   button label out at the phone width and refuses a wrap is a check
   this site does by screenshot today. That one is this repo's, and it
   is the cheapest thing on this list to build.

The 20,661-character paragraph is the one thing on the page that a
reader would call the text blob, and it is a sentence-level decision
for the 6502 repo: split it, or fold it behind the block names it
describes. Nothing here measures its way out of that.

## Reproducing

The probe is a Playwright script (scratchpad `pt-entry.ts` bundled with
`bun build --format iife` from `extern/pretext/src/layout.ts`, injected
with `addScriptTag`); `extern/pretext` builds its own `dist/` with
`bun install && bun run build:package`, and `dist/` is not committed.

## What was built on it, 2026-08-27 (later the same day)

`components/Justify.tsx` and `/6502/<tool>/article` (PROJECTS.md, "the
companion articles"). Two measurements that the build turned up and the
first probe above did not: a run's `extraWidth` matters (the kit's `code`
has 5.2px of padding and a 1px border each side; 14 lines overflowed by up
to 22px until pretext was told), and a paragraph whose element would have
to straddle two lines is better left to the browser than cut. With both
in, 0 of 276 desk lines and 0 of 535 phone lines on the tracer article are
wider than their block.

## The tool page itself, 2026-08-27 (afternoon)

The articles set the prose in a reading column; the tool page still
carried it as it came, and the owner's ask was the tool page: on a phone
the tracer was 54,741 pixels of full-page screenshot, one 23,341-character
paragraph and one 6,604-character caption. So the same treatment now
reaches the tool page, from the same rule:

- `web/lib/prose.ts` holds the sentence-end split that `lib/article.ts`
  had (`cutsOf`, `splitRuns`, `splitParagraphs`), with no node import, so
  the browser bundle takes it too. `explorer()` applies `splitParagraphs`
  to every `section.bp-prose` on every tool page, and returns `splits`.
- `components/Justify.tsx` mounts on the tool page with a `select` (the
  prose paragraphs, the hero's lede, `p.bk-foot`; never the readouts),
  collects paragraphs under a hidden ancestor too (the tool's `#tc-main`
  is hidden until it boots), takes a paragraph's new children as its
  originals when the tool's script replaces them, and cuts a text-only
  paragraph longer than LONG at sentence ends into `.jg` parts before
  setting. That last is the caption: the tracer writes it as one string
  by `textContent` every step, and every step it is set again.
- Its CSS is `components/justify.css`, one copy, imported by the component.

Measured on a local build of this tree with the chip assets routed to the
live host, phone (390) and desk (1280): 47 of 50 paragraphs set by
pretext, 600 and 284 lines, 0 overflowing, 0 loose; the longest paragraph
817 characters; the caption 6,593 characters in 12 parts; no readout
touched. `web/e2e/tool-prose.spec.ts` holds those as assertions against
the live site, including a step that rewrites the caption.

Not done: the prose is still 23,000 characters under the instrument, now
as paragraphs. Folding it, or shortening it, is a design and writing
call, and the companion article is where the reading version lives.

## Folded, 2026-08-27 (later)

Owner's call: fold it after the first few paragraphs with a "Read on".
`foldSection` in `web/lib/prose.ts`: each prose section keeps its heading
and its first three paragraphs (the eyebrow is a `<p>` and is not
counted) and the rest goes under a native `<details class="read-on">`;
`explorer()` folds only when given the label, so the article, which is
the rest, never does. A section whose remainder carries anything but
paragraphs, lists and the section's own heading blocks is left whole
(the block page's instrument lives in its prose), and so is one whose
remainder is shorter than LONG. Measured on the tracer at 390: 6,502
pixels folded, 19,457 open; every paragraph behind the fold set and
fitting when opened. Chrome lays a closed details out
(content-visibility), so those paragraphs are set at load, not on open.

## Chunks, 2026-08-27 (afternoon, the riff)

Owner's brief: no interactive lab on the article; keep the two-tone
header; "Read on" shows faded text from the next paragraph and a pointer;
both pages get a heading for each chunk of related paragraphs, and the
folds break there; a table for the text blobs, which the site's Articles
section will grow out of.

- `data/articles.json` is the table: per tool, `chunks: [{heading, at}]`,
  `at` being the opening words of the sentence the chunk starts on. The
  tracer has 23. `web/lib/articles.ts` reads it.
- `splitParagraphs(html, chunks)` forces a paragraph break at every anchor
  before the length split runs between them, so every chunk starts a
  paragraph; an anchor the page does not carry fails the build in both
  `explorer()` and `article()` (the page changed under the table).
- `chunkSection` puts an `h3.chunk` (id from the heading) before each
  chunk; on the tool page each chunk's paragraphs go under a `<details>`
  behind a `.peek`, a copy of the first paragraph clipped to 4.2em under a
  mask fade, hidden once the details is open (`:has`). The summary reads
  "Read on ›" (`\203A` from a pseudo-element; `\2039` when open). A
  section's later heading blocks end a chunk and are never inside a fold.
  The article gets the headings and no folds.
- The article page's head is the tool's own hero (eyebrow, title, lede,
  statbar); the bench figure is gone; the tool's remainder is rendered
  hidden so the script still boots and fills the primer's slots.
- Pages without chunks keep the one-fold-per-section rule, with the peek.

Measured on a local build, phone: tool page 11,468 CSS px (23 folds
closed), article 17,510. Chrome lays a closed details out, so the folded
paragraphs are set at load.
