---
title: The console arc, in retrospect
description: What the sketch asked for, how each milestone was checked, what the chips and the ROMs taught, and what stays for a bench.
order: 3
---

# The console arc, in retrospect

The arc set out to put a whole console together from parts that had each
been proven on their own: a switch-level 6502 and the fast cores held to
it, a switch-level 2A03 and 2C02, an NTSC signal path simulated at the
waveform, and the authored glue of an NES-001 mainboard. The sketch that
ran it is [the first page of the notebook](/docs/nes/sketch); the figures
every page below states are on [the console page](/nes), recorded from the
repositories' own runs, and nothing here retypes them.

## The rule that shaped everything

A milestone is a document twice. The plan is written before the code,
with its checks named and its tolerances stated, and the report is written
after, with every figure a measurement carrying a run stamp. Between the
two sits one discipline: measure on the switch-level chip before
authoring, label what is authored as authored, and add a fix only when a
test fails without it. Each report keeps a list of what it did not do,
and the next plan starts from that list.

The rule earned its keep in the same way each time. When a fast chip and
a real program disagreed, the disagreement was located by running the
switch-level chip in lockstep beside it until they parted, measured
there, then authored and held by a fixture that goes red without it.
Nobody reasoned about what a chip does; the chip was asked.

## What the chips taught the engine

The fifth chip decided a question the engine had carried since its first
version. Four dies had never formed a group in which a layout pull and an
external drive contend; the 2A03's set-overflow chain forms three at
power-on, and its reference resolves them low. The engine's order was
changed to match, and the change was proven unobservable on every other
chip before it shipped.

The PPU found two engine divergences of its own, each fixed in the shared
library and re-proven across the family: a rail-conflict hold, and a
charge rule that had to be declared per netlist rather than assumed. The
latches the family had read as undefined at power-on turned out to be the
engine's rule, not the silicon's; once the rule was right, the PPU's
recorded runs replayed with no list of exceptions at all.

## What the console taught the fast chips

The fast chips had replayed every recorded trace exactly and still carried
misses that no trace had covered, because a trace is only as wide as its
encoding. Running blargg's test ROMs through the whole console with a real
CPU attached found them one by one: a carry that rides an undriven bus
line into the next instruction, a shift's carry read from the wrong
capture, three opcodes whose result is a bus fight the switch model
settles its own way, the half-cycle at which an interrupt input is
sampled, a byte latched later than the bus is asked for it. The APU's
misses were the same story on the other chip: a write's parity jitter, a
status latched a half-step late, a flag set for three cycles, a byte
counted off where its read lands. Each was measured on the die and held.

Two findings were not fixes. The console's interrupt reaches its CPU about
two dots later than the two chips, each held to its own measurements,
allow; the documented behaviour and the measured chips disagree, and a
scope on the real board is what settles it. And the PPU's picture with
rendering off, which the fast PPU had only ever authored as the
backdrop, is the palette entry the address register points at, with the
timing of a mid-line write against it now a fixture; a colour-bars
cartridge was blue stripes until that was measured.

## What the signal path taught the comparison

The picture through the television model is the signal path's own chain
with two things added by the console, the order of the frames and the
subcarrier phase carried from one to the next. The capture comparison
that was to close on a colour-bars cartridge did not close at the
tolerances the plan stated, and the report says so instead of widening
them. What it found first belonged to the instrument: the recovery's
level re-referencing was a histogram bin coarse, which read as a gain
across the whole frame, and a dark picture level could be taken for
blanking. Both were fixed in the signal path's own repository. What
remained is a small chroma residual that belongs to the capture model's
anti-alias filter against the encoder's square wave, and it is recorded
as the procedure question it is.

The sound went the other way. The board's audio stage, read off the
schematic, turned out to be already inside the published mixer table: its
two constants sit in the ratio of the board's summing resistors, and its
offset is the board's pulldown. blargg's mixer ROMs, each a channel
against the DMC's inverse, cancel through the whole console, and his
recordings of the same ROMs on real hardware, measured by the same code,
agree with the console on two channels to a fraction of a percent and
leave the real pulse and DMC curves as the scope's question on the other
two.

## What the shell taught about time

A frame's time on one core was measured before anything was written:
the console and the encoder fit a core with room, and the comb decode and
the CRT stages did not fit anywhere on the CPU. Those two became compute
passes on the GPU, held to the CPU chain on every component of every
pixel, a hundred times inside the stated tolerance and a hundred times
faster. The console runs on its own thread paced by the wall clock through
the signal path's drift policy, duplicates and drops counted, never
resampled in time; the first version put it on the render thread and ran
away the moment a tick was late, which the counters showed in the first
run. The window ran under a virtual display on a loaded box; a real
screen, a speaker and a hand are what remain.

One trap is worth its own sentence. The sabotage switch the family uses
everywhere is an environment variable, and the fast chip reads it too, so
a console-level sabotage once sabotaged the chip underneath and the check
went red for the wrong reason. A red that proves nothing is the kind the
house style warns about, and it was caught by asking what had actually
failed.

## What stays for a bench

Every open item is one scope session on the real console, and the
sketch's capture list already orders it: the video out under the bars
cartridge, terminated; the master clock beside the CPU's and the PPU's
own clocks over several power-ons, which settles the interrupt question
and gives the console the set of alignments it must draw from; the audio
out under the mixer ROMs; the reset chain at power-on; the cartridge
select lines against the clock. And on the desk beside it, the shell
with a screen.
