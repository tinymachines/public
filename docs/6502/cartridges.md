---
title: Cartridges
description: A ROM, its tiles and the contract it was written to, in one gzipped JSON file.
order: 6
---

# Cartridges

A cartridge is one **gzipped JSON** file carrying the ROM (bytes, labels and
source), its tiles in both the binary form and as rows of `0..3`, and the
console addresses it was written to.

The contract travels *with* the bytes rather than beside them, because the
contract is the part an outside author has to agree with, and a page needs
eight addresses to play a game with no hardware to ask about any of them. A
contract in a different file is the copy that drifts.

`mtime` is zero, so minting the same cartridge twice gives the same bytes and
two of them can be diffed.

```bash
curl -s localhost:6502/v1/console                     # the contract, published
curl -s localhost:6502/v1/cartridge -d @cart.json \
     -H 'content-type: application/json' -o mine.cart.gz
curl -s 'localhost:6502/v1/cartridge?format=json' -d @cart.json ... | jq .verify
```

`GET /v1/console` is the contract as data, and it is the copy to read from a
program. This page is the reasoning; that route is the reference.

## Two things minting does that assembling cannot

**It refuses a layout that cannot work.** A ROM overlapping its own screen
assembles perfectly and then draws over itself; a contract byte inside the ROM
is the host writing into the code. Each is a 422 with the reason, not a
cartridge that fails later.

Reading the assembler's inclusive `end` as one-past made every one of those
checks a byte short, which `test_cartridge.py` now pins from both sides.

**It runs the thing.** A ROM that assembles, boots and never raises its tick
flag is a ROM that does not run on this console, and nothing short of running
it says so. The report carries frames completed, what each cost, whether the
screen changed, and which tiles are on it.

## The frame cost is measured on a ladder that ignores the cartridge

The cost is measured on an absolute ladder, 128 half-cycles up to 16k and then
1024, and deliberately not seeded from anything the cartridge declares.

Sizing the first step from a declared cost is right for a *host* and wrong for
a measurement. The same ROM minted at `frame_cost` 512 and at 20000 measured
6400 and 6250, each number being its own request rounded up.

This is not hypothetical. **The frame cost Die Runner's page claimed was its own
request read back.** The console asks for `frameCost` half-cycles and then
reports what it spent, so whatever was written there confirmed itself: 12,000
was a number the file had typed, not a number the chip had produced.

Measured on the ladder, Die Runner's steady frame is **8,704**, rock solid over
twelve frames, with the first at 5,440. That is about 28% less chip time a
frame than the page was buying.

## Loading one

The console page loads a cartridge from `?cart=<url>` or from the file picker,
and a loaded cartridge joins the picker rather than quietly replacing what the
label says is on screen. Its tiles replace the sheet, so a cartridge brings its
own art.

`games/deploy.sh` mints the sample rather than keeping it in the tree, so it
cannot go stale against `rom/dierunner.s` and every deploy exercises the
endpoint.

```bash
# Minted by the API, which refuses a layout that cannot work and then RUNS it.
python3 games/tools/mint.py --api https://6502.tinymachines.ai/api
```

## Cartridge zero

`rom/snake.rom`, 351 bytes, here to prove the pipe end to end.

Every address in its cartridge entry was read off the disassembly
(`rom/snake.lst`) and then confirmed on the running chip, never guessed. An
earlier reading had `2 = right`, and the snake walked downwards to say
otherwise.

| addr | what |
|---|---|
| `$0D` | tick flag: host clears, ROM raises |
| `$02` | requested direction, 1 up 2 down 3 left 4 right |
| `$03` | game over |
| `$0400-$04FF` | the screen, 16x16, `0` empty `1` snake `2` food |

The board **wraps** rather than having walls: `AND #$0F` on both nibbles of the
cell index.

*Provenance: written by Grok on the site owner's prompt, and owned by them
under xAI's consumer terms. It is not derived from the die data and carries
none of that data's obligations.*

## Cartridge one

`rom/dierunner.s`, **339 bytes**, written for this console and assembled by the
project's own assembler (`games/tools/asm.mjs` over `web/asm.js`, which inverts
the disassembler's table, so if it assembles it disassembles back to the same
lines).

You are a charge carrier descending the die. The world scrolls up to meet you.
Polysilicon gates bar the way with one opening; **pass-transistor gates have two
channels and only one conducts**, and every eighth frame the clock phase flips
and they swap. A channel that is shut now will be open in a moment, which is the
whole game. Charge packets score. The die wraps.

The seven tiles that arrived with the art are all in use, and none is
decoration for its own sake. The die used to be empty between barriers.

| tile | what it is | what it does |
|---:|---|---|
| 9 | poly bus | a run of three across the die. Scenery |
| 10 | power rail | runs **down** a column for three to six rows. Scenery |
| 11 | diff well | an occasional single. Scenery |
| 12 | poly T | where a rail comes in |
| 13 | metal L | where a rail turns and leaves |
| 14 | capacitor | worth **five** charge packets |
| 15 | bond pad | **signposts the gap** of the barrier above it |

The power rail is the one worth understanding: the ROM draws a single cell per
row, and it comes out as a rail *because the world scrolls*. A poly T caps the
end it comes in at and a metal L the end it leaves by, so a rail has a
direction without the ROM ever drawing a line.

Only a **plain** barrier gets a bond pad. Which channel of a *switched* gate is
open depends on a control line that will have moved by the time the player
arrives, so a signpost there would be pointing at a guess. See
[the console contract](/docs/6502/the-console-contract#the-gates-are-real).
