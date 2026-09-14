---
title: Words the reports use
description: "The working words inside the NES reports, in plain sentences: recorded reference runs, checks, fast chips and filters, sabotage runs, what we measured and what we wrote, and the milestone letters."
order: 32
---

# Words the reports use

The plans and reports in [the notebook](/docs/nes) and
[the calibration cart](/docs/cart) were written by the people doing the
work, for each other, in the middle of it. We pull them onto this site
as they are, because rewriting a report is how a report quietly stops
being true. So they keep the shorthand we use among ourselves. This
page is that shorthand, a word at a time, in the sense the reports use
it.

## How the work is checked

**Golden.** A recorded reference run: the output of someone else's
simulator of the same chip, saved to a file, which ours has to replay
exactly. "Held to the golden" means our run and the recording were
compared, step by step, and agreed. A run stamp that says
`REQUIRE_GOLDEN=1` means the recordings were required for that run, not
skipped when absent.

**Oracle.** Anything independent we check against: a reference
simulator, a published test ROM such as blargg's, a standard's own
tables. When the reports say no external oracle exists, as they do for
the television's picture stages, they mean there was nothing real to
compare against, so the stage is checked against its own stated
mathematics instead.

**Gate.** A check a milestone has to pass, written into the plan
before the work starts, with how close counts as passing. A report
says which gates closed and which are still open.

**Mutation, and `MUTATE=1`.** A sabotage the tests must catch. Setting
`MUTATE=1` deliberately breaks one named thing (a wrong byte, a
missing table entry, an old rule switched back on), and the tests that
guard it have to go red. A test that still passes under the sabotage
was not testing anything, so each report says how many tests went red.

**Self-counts.** The documents' own numbers, checked. A scanner finds
every figure a document states and compares it with what the code or
the run actually says, so a report cannot drift away from the thing it
describes.

**Pinned.** Fixed to an exact version so it cannot change underneath
us: a data file pinned by its hash, a library pinned by its tag. A
timing that is "fitted once and pinned" was measured one time against
the recording and then written down, never adjusted again.

**Refused by name.** When something is asked for that does not apply
(a filter that cannot work on the NES's signal, a test that drives a pin
the chip does not have), the code declines and says why, instead of
producing a number that would look right and be wrong.

**Run stamp.** The line at the top of a report saying when it was run,
at which commit and with which tools, so every figure below it can be
traced to the run that printed it.

## What the models are made of

**Rung, and the ladder.** For the chips, a rung is one way of running
the same chip, and the ladder is all of them in order. Rung 0 is the
chip simulated transistor by transistor, which is slow and is the
truth. The higher rungs are faster versions (rung 3 is the fast core),
and each one is checked against rung 0 before anything relies on it.
In the signal path, the rungs are the decoder's filters instead: Rung A
is the notch filter, Rung B the two-line comb (which the NES's signal
cannot use, so it is refused), Rung C the three-line comb the NES was
built for, and Rung D a comb across frames, which the measurements
corrected. In ntsc-crt's own reports,
"the ladder" also means its run of milestones, M0 to M5.

**Authored, and measured.** Measured means read off something: the
transistor-level chip, a scope, a recording. Authored means we wrote
it ourselves, from a datasheet, a schematic or a wiki, because nothing
could be measured yet. The reports label every authored value as
authored, so nobody mistakes a choice we made for a fact about the
hardware.

**World.** A test scene: a fixed set of memory contents and register
writes that a chip runs from power-on, such as the standard world, the
sprite world and the scroll world for the picture chip. The patterns
look like noise on purpose, so a single wrong dot has nowhere to hide.

**Harness.** In the chip reports, the simulated surroundings a chip
runs inside: its memory and a bus that feeds it register writes the
way a real CPU would. In the bench documents, a harness is the plain
kind, the bundle of wires inside the console.

**Fixture.** One recorded scripted run the tests replay, named after
what it exercises (a stalled CPU, a reset in the middle of a run).

**Divergence.** A place where our model knowingly differs from a
reference, written down with the reason and how large the difference
is. [The signal path's list](/docs/nes/ntsc-divergences) is one.

**Lockstep.** Running two chips side by side on the same input, one
step at a time, comparing as they go: the transistor-level chip against
its fast version until they disagree, or one chip against another
through the pins they share. It is how the fast chips' mistakes were
found.

## The milestone letters

Each repository numbers its milestones with a letter of its own. A
plan is written before a milestone's work and a report after it.

| | |
|---|---|
| **N** | the console as a whole: the contract (N0), the fast 2A03 (N3), the glue, the console, its picture, its sound and its window (N4 to N8) |
| **A** | the 2A03, the NES's CPU and sound chip, at the transistor level |
| **P** | the 2C02, the picture chip, from the transistor level to its fast version |
| **M** | ntsc-crt, the composite signal between the console and the television |
| **B** | the bench, where a real console and the model get the same controller presses |
| **C** | the calibration cartridge |

## What this page does not cover

The names of signals and registers inside the chips (`pal_d`,
`$2002`, `OAM`) are the chips' own, and the
[nesdev wiki](https://www.nesdev.org/wiki/) explains them far better
than we could. Code identifiers and file paths in the reports point
into the repositories and mean what the code says. If a report uses a
working word that is not here, that is a gap on this page, and we would
like to hear about it.
