# Things in the documents that look wrong

Found 2026-09-20, while translating every published document into Japanese.
Eight readers went through all 58 pages line by line, which is the most
thorough reading these documents have had since they were written, and this is
what they stopped at.

None of it is fixed. Almost every document here is pulled into the site from a
sibling checkout at build time, so the repository named beside each item is
where the fix belongs. The Japanese translates what the English says today,
including the parts below, so a fix upstream wants a reread of the shadow in
`docs/ja/` afterwards.

The 14 items marked **checked** were read back against the document before
this note was written. The rest are the readers' reports, in their words as
far as possible: worth a look by somebody who knows what the measurement was.

The host address in the lab notebook and the build guide is not here. It has
its own note: `notes/host-detail-in-the-notebook.md`.

## nes-bench

**bench-v1b-uno.md: the 128-entry build has two sets of figures.** The
firmware bullet says "at 128 it reported 1521 and left 527 for the stack"; the
packing table's row for the same build says 1533 bytes of globals and 515
left. One of the two pairs is stale. **checked**

**bench-v1b-uno.md: an amendment reads as current and is not.** "The schedule
does not fit and never could; 128 is measured, not chosen, and three places
now refuse rather than truncate", while the document elsewhere says the
schedule has held 600 since 2026-09-19. The bullet is dated 2026-09-08 but
nothing in the sentence says it has been overtaken.

**bench-v1b-uno.md: the v1b parts list is behind parts.md.** "Parts (all on
hand)" lists C1 to C3, R1, J1 and J2, but not R2 (1 k) or C4 (100 pF), which
parts.md records as placed on the v1b sheet on 2026-09-15. The Timer1
paragraph still offers "add a 100 pF to ground on D5 and record it" as future
work, and parts.md has that filter fitted on CP.

**bench-v1b-uno.md: 290 lines against 289 changes.** "A whole minute's
schedule, 290 lines" sits beside "a minute of a hand playing Super Mario Bros.
through 1-1 is 289 changes of the byte". Probably 289 `AT` lines plus one
other, but as written the two numbers disagree.

**wiring.md: the measure-first step contradicts the measured pinout.** Step 2
says "port pin 7 to pin 1 reads 5 V", while the pinout table in the same file,
the one the file calls the one place the pinout is written down, puts +5 V on
pin 5 and marks pins 6 and 7 `n/c`.

**wiring.md: the isolator named in the steps is not the part in the
photographs.** Step 5 says "the 4N35's emitter goes to the ground side"; the
photographs section says the part is a PC817 module, with no 4N35 and no
series resistor.

**wiring.md: one list mixes the v1 and v1b builds.** Under "The head:
Raspberry Pi 4", the first bullet is "USB to the ESP32" and the last reasons
about "the UNO's USB cable".

**bench-report.md: the opening is stale against the end of its own page.**
"Nothing here has touched the part yet: the bridge is not built", while the
2026-09-08 sections below describe an UNO flashed over the network and a
sitting that holds, with the sketch answering STATUS on a real board.

**bench-report.md: a sentence says the opposite of what it means.** "It shows
every attempt, not the successful ones" reads as though successes are
excluded. The sense wanted is "not only the successful ones".

**rig.md: four checks, six named.** "Four checks, each PASS or FAIL" is
followed by light, still, board right, board middle, and the two side eyes.
Either the count is wrong or it is counting categories and does not say so.
**checked**

**rig.md against eyes-vs-scope.md: the reason given for blurring does not
hold.** rig.md says the television's picture is blurred "since the site
carries no commercial game screenshots", and eyes-vs-scope.md embeds
`/nes/lab/eyes-tv-title.jpg` and `/nes/lab/eyes-grabber-title.jpg`, which are
that cartridge's title screen.

**build-guide.md: step 6.1 contradicts itself about the trigger input.** The
bullets say the DS1054Z has no external trigger input, that the source EXT is
refused (MEASURED 2026-09-15), and that the lead goes to CH1. The generated
sentence after them still says "it arms the scope on EXT TRIG", and the parts
list under "Before the first sitting" still asks for a BNC lead to the scope's
rear EXT TRIG. **checked**

**build-guide.md: one sentence split across two list items.** "You will be
asked to hold a button; the game should see it," and "and the bridge's log
should carry the same byte at the same latches." Reads like a generator
artefact.

**build-guide.md: a link that lands nowhere.** `[procedures](procedures/README.md)`
is relative, so on the site it resolves to `/docs/nes/procedures/README.md`,
which is not part of the rendered tree.

**cheat-sheet-head.md: a sentence says a measurement is not written here, and
it is.** "Which two ways of the breakout are the reset pair is step 6.2's
measurement and is not written here", while the sheet-3 intro gives it
("RST_HI is 3 orange and RST_LO is 4 yellow"), the J3 table gives it, and step
6.2 carries it as MEASURED 2026-09-17.

**cheat-sheet-head.md: the two steps, one command.** The section covers 6.2
and 6.3, and the single command block passes `--step 6.2`, so running exactly
what is printed does one of the two.

**cheat-sheet.md: three headings carry a double space**, from the generator:
"U1: 74HCT04  at +5V" and two more. **checked**

**exercise.md: the closing paragraph is behind the table above it.** It ends
"what comes next is the regime's own next step, E3, a hand on the pad", while
a section headed "E3, a hand: 2026-09-19" and the table two paragraphs above
record E3 as met. That table's header also says "state on 2026-09-17" while
several rows carry 2026-09-18 and 2026-09-19. **checked**

**exercise.md: two row ranges for `$18` that cannot both be inclusive.** The
Duck Hunt table has "rows 226..240" and the PROFILE table has "183..239". 240
is one past the last row of a 240-row frame. The two may be measuring
different things, and the document does not say so.

**parts.md: the v1b row's note is missing the spare inputs.** U1's note reads
only "2.0 V threshold: safe on NMOS OUT0", while bench-v1b-uno.md records the
inverter's five spare inputs going onto the v1b schematic tied to GND on
2026-09-10. The bench-v1 and bench-v2 rows do carry a spare-inputs note.

**encyclopedia.md: a cross-reference points at the wrong entry.** Entry 1 says
"the seed of entry 3 (the dispatch from the pad's byte to the action)", and
entry 3 is "The game loop inside the interrupt". The dispatch from the pad's
byte is entry 7, which closes by saying it is the method entry 7 exists to
record. Reads like a reordering that left the number behind. **checked**

**mario-dissection.md: a heading quoted short.** The text says `see "Done on
the part"`; the heading is "Done on the part, the same night". **checked**

**mario-dissection.md: three runs for two press lengths.** "The press takes
with no reset, one and three (runs 193915, 194105, 194257)". The Japanese
keeps all three run ids and says one latch and three latches, because the
third could not be resolved from the page.

**build-the-cal-cart.md: the strip's tiles do not multiply.** Fifteen blocks
across and three rows down, "each block two tiles square (16 by 16 dots)", is
180 tiles, and sections 3 and 4 call it a ninety-tile strip, with the NMI
handler copying "the ninety strip tiles from `$20`". Either the block size or
the tile count is off by a factor of two.

**calibration-plan.md: sixteen cases where the gate above names four.** C1
says `MUTATE=1`, half a block off, "is red on all sixteen", and the C0 gate
above names four. Eight screens and eight re-sampled copies is the likely
sixteen, and the document does not say it.

**cartridge.md: a lost sentence break.** "...the stray sprite did not come
back at all. What this page records is how the third picture became possible:"
runs on in one source line, and reads as a missing paragraph split.

**bench-build-v1-v2.md: three counts of the drawings.** "Convention on all
four", "Five drawings go with this document", and eight images embedded, with
a bullet list describing five files. **checked**

**bench-build-v1-v2.md: a colon introducing nothing.** The intro ends "so no
sheet and its table can drift apart:" and what follows is the "Build v1b
first" paragraph, not a list.

**lab-notebook.md: six attempts between one date and the same date.** "6
attempts between 2026-09-08 and 2026-09-08". True to the log, and it reads as
a bug in the generator's range.

## 2c02

**p1-report.md: twelve level legs, and eleven.** The DAC gate bullet says
"which of the twelve level legs conducts"; "Measured en route" says "The
eleven DAC level legs were calibrated". Either a number is wrong or two
different sets are being counted without saying which. **checked**

**p3-report.md: a pointer to a section that is above it.** The end of Step 3
says "With the write path fixed (below)", and the write path's fix is in the
section above.

**p3-report.md: the next-work section lists work the same document reports as
done.** "## Next, inside P3" lists sprites, the register file and scroll,
which are Steps 2 and 3 of that document, both reported and gated.

**p3-report.md: two dot counts side by side, unexplained.** The dot golden
covers "every visible dot: 62,160 per frame", which the page explains as 256
pixels plus three lead-in dots over 240 rows, while the fit reports "0
mismatches of 61,440" and Steps 2 and 3 use 61,440. The difference is probably
the lead-in dots, and the page does not say so. **checked**

**p2-report.md: three, and three.** "Produced the classic three outcomes, and
the schedule pins three of them" reads as a redundancy; one of the two numbers
may be wrong, or the second clause may have meant scheduled reads.

## ntsc-crt

**m2-report.md: "-0.00 dB" at the 1.3 MHz point.** Reads as a rounding
artefact rather than a typo. Kept verbatim in the Japanese, since it is a
measurement.

**m1-report.md against m0-report.md: first and second commit, same day.** m1's
run stamp says "second commit of this repository" and m0's says "first
commit", both 2026-09-01. Consistent with each other; noted because the two
stamps carry the same date.

## nes

**sketch.md: "halfscore".** One occurrence in the whole repository, not in
`/docs/words`. Reads as a typo or private jargon. The Japanese renders it with
the English in parentheses so a reader can match it.

**n5-report.md: "Rung" capitalised mid-sentence** where every other use is
lowercase, in "Held by `tests/reads.rs` there (the Rung on a bus against rung
0 at the pins...)".

**n8-report.md: figures that do not line up with the run they describe.** Step
2 reports "600 redraws of full_palette.nes", then "134 of 1,467 over 16 ms"
and "74 drops in 1,394 periods". The 1,467 frames and 1,394 periods do not
follow from 600 redraws; they may be from a longer run than the sentence
names.

## 2a03

**a0-report.md: a missing possessive.** "Restates macros.js initChip statement
for statement". Cosmetic.

## 6502

**idioms.md: two clauses fused, and a "them" with nothing to point at.** "The
chip map draws every container the tracer lights them half-cycle by half-cycle."
The Japanese translates it as the two clauses it appears to intend. **checked**

**atlas.md against the-atlas.md: two counts of the containers.** atlas.md says
"132 groups over 23 kinds, covering all 1547 nodes exactly once, plus 138
containers that overlap on purpose"; the-atlas.md says the containers are "135
of them, overlapping, with 88 nodes in more than one". Two generated pages,
two numbers for the same layer. **checked**

**atlas.md: the class table has generator grammar in it.** "precharged, 1
legs, no pullup" for `dyn1`, and `nand2` reads "2-deep NAND" where the NOR
rows read "N-input NOR".

**findings-answers.md: `--` used as a dash in shipped prose**, twice in one
sentence: "wrote `false` into vcc's own storage cell -- the reference
implementation does exactly the same -- and it was unobservable". The house
rule keeps `--` for code comments. The Japanese uses brackets. **checked**

**walk-snake.md: a value the walk says X never held.** "X reads `$02` at one
point during the store, which is not a value X ever held", while the readouts
above show `X $02` throughout, and the walk is the pass where X is `$02`. The
sentence looks as though it lost its original value, or means a different
readout. **checked**
