---
title: The console contract
description: A frame is an agreement between a ROM and its host, not something the silicon knows about.
order: 5
---

# The console contract

Die Runner is a console on a transistor-level MOS 6502. The game is a 6502 ROM,
the screen is a page of that chip's memory, and the browser draws it. There is
no emulator: every frame settles 3510 switches on the real die through
[the API](/docs/6502/the-api).

## The console is a contract, not hardware

The chip has no video, and nothing here uses its interrupt line. So a "frame"
is not something the silicon knows about. It is an agreement between the ROM
and whatever drives it, and that agreement is the whole console:

```
the host clears a byte   ->  the ROM notices, runs one frame, sets it back
the host writes a byte   ->  that byte is the controller
the host reads a page    ->  that page is the screen
```

The ROM busy-waits on the flag, which is the only way to synchronise with the
outside when you have no interrupt and no timer. It works over HTTP *because*
the API is stateless: the frame boundary is a memory edit between two `/v1/step`
calls, and the whole machine travels in each one.

Nothing about this was designed for games. It falls out of a design that
carries the machine as a value.

## What a frame costs, measured

| | |
|---|---|
| First frame (init: clear 256 cells, place food) | 5,400 half-cycles |
| Every frame after | **600 half-cycles**, exactly |
| That in chip time | about 0.3 ms |
| A round trip to the engine | about 200 ms |

**The chip is not the bottleneck by three orders of magnitude.** The frame rate
is the round trip, and the page says so rather than hiding it.

A cartridge that free-runs instead of busy-waiting could have 333 frames in one
request, since the API caps at 200,000 half-cycles, at the cost of input
latency. The flag handshake buys responsiveness and pays one request per frame
for it.

## Tiles

8x8 pixels, **two bits per pixel, sixteen bytes per tile**: the NES shape,
because it is what every old-school sprite tool emits, and because four colours
per tile is the constraint that makes the art look like the era rather than
like a photograph.

```
bytes 0..7    bit 0 of each pixel, one byte per row, MSB is the leftmost pixel
bytes 8..15   bit 1 of each pixel
colour        (plane1 << 1) | plane0   ->  0..3
```

The palette is the die's own, the four colours the exploded view paints the
mask layers in. That is the conceit of Die Runner: the playfield *is* the chip.

| | | |
|---|---|---|
| 0 | `#0B1120` | substrate, the die with nothing on it |
| 1 | `#3E93A6` | diffusion, the switched layer |
| 2 | `#E0A24B` | polysilicon, the gates and anything that controls |
| 3 | `#4FBFD4` | metal, the wires and anything the runner rides |

Colour 0 is drawn, not skipped: this is a tiled screen, not a sprite layer.

`chr.js` carries a starter set drawn in code, so the console renders before any
art exists and so the spec is executable. Whatever a tool produces has to
decode to exactly that shape. `encodeCHR` is the inverse, so the art pipeline
and the console share one definition rather than two that drift.

## A cartridge that draws nothing

`console.kind: "headless"` is a program on the chip with no screen page and
no tick flag. It exists because the site had programs scattered through it
(the seven the explorer boots, the worked example on the API page) that were
never cartridges, so they were never minted, listed or measured. Now they
are: the same file, the same registry, the same rule that what is shown is
what the chip did.

What verifying one says is where it got to. The registry boots it, runs it
for `console.half_cycles`, and reads the registers and the bytes the
cartridge names in `console.peek` off the silicon. The last quarter of the
run is sampled four times, so the report can say whether the pc was still
moving at the end: a loop or a finished program on one side, a JAM on the
other. Nothing is drawn, and the listing says so ("draws nothing") rather
than showing a frame cost it does not have.

The layout checks that still mean something still apply: a ROM on the stack
page or over the vectors is refused. The screen checks do not, and the file
carries no screen fields, so nobody reads a default screen address off a
cartridge that has none. The console refuses to boot one, with the reason.

## The gates are real

Each gate is a **switch that exists on this die**, and it conducts exactly when
its own control line is high **on the chip running the game**. Nothing
simulates a clock phase; the phase is whatever the 6502 executing this code
happens to be doing at the end of a frame.

The host watches eight lines, packs their levels into a byte, and hands it to
the ROM. A gate cell carries its own gate index (`16+g` is the channel that
conducts while line `g` is high, `24+g` the one that conducts while it is low),
so **what is drawn and what kills you come from the same byte** and the picture
cannot lie about which way is open. The two channels are complementary, so
there is always a way through. That is not a kindness, it is what a pass
transistor is.

The eight were chosen by measurement, not taste: they are the lines that gate a
switch between two *named* nodes, ranked by how often they actually moved over
twenty-four frames of play. A line that never moves makes a gate that is always
shut or always open, which is scenery.

| gate | control line | high | flips | the switch it gates |
|---:|---|---:|---:|---|
| 0 | `dpc25_SBDB` | 16/24 | 10 | `sb0 - idb0` |
| 1 | `dpc9_DBADD` | 18/24 | 9 | `idb0 - alub0` |
| 2 | `dpc10_ADLADD` | 6/24 | 9 | `adl0 - alub0` |
| 3 | `dpc21_ADDADL` | 3/24 | 6 | `alu2 - adl2` |
| 4 | `dpc23_SBAC` | 4/24 | 4 | `sb0 - a0` |
| 5 | `dpc30_ADHPCH` | 21/24 | 4 | `pch3 - adh3` |
| 6 | `dpc40_ADLPCL` | 21/24 | 4 | `adl0 - pcl0` |
| 7 | `dpc2_XSB` | 2/24 | 2 | `x0 - sb0` |

Those labels are the hand-written ones. [The atlas
derives](/docs/6502/the-atlas#what-the-atlas-settled-that-a-hand-written-list-had-wrong)
them now and disagrees with three, including this table's `x0 - sb0`.

Gates 5 and 6 move together and always will: `ADHPCH` and `ADLPCL` are the
program counter's own round trip, and they fire on every opcode fetch. Two
gates that are really one event is a true thing about the chip, so both are
kept.

Sampling is one frame behind, and has to be: the chip must have run before
there is anything to read. So the gates you are threading are the state of the
CPU as it finished drawing the frame you are looking at.

## Two things that had to be measured rather than designed

- **The runner sits at row 2, not row 13.** New terrain appears at row 15 and
  scrolls up, so from row 13 a wall arrived two frames after it appeared: no
  warning at all at five frames a second. From row 2 the same wall is thirteen
  frames away, and it reads as descending into the die rather than being
  ambushed by it.
- **Gaps drift, they do not land anywhere.** A gap at a random column can be
  further away than the runner can walk before the barrier arrives, which is
  not difficulty but a death the player could not have avoided. Each gap steps
  -3 to +4 from the last, against six frames of travel.

## The screen moved to $0500

Adding scenery pushed the ROM from 359 bytes to 521, past `$0400`, which was
where its own screen lived. It assembles, it boots, and the picture eats the
code. `games/tools/asm.mjs --limit $0500` makes that a build failure instead of
a mystery, and the screen sits a page higher.

Moving it is four addresses, and **missing one is silent**. `$0410` is the
scroll's *source*, and with it left behind the game copied unrelated memory
into the screen every frame and drew an almost-empty die. Nothing errored.

That is the reason the contract travels inside the cartridge rather than beside
it. See [cartridges](/docs/6502/cartridges).
