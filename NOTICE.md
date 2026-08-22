# Licensing, before anything ships

This repository is named `public`. That makes it the wrong place to be casual
about what may be published and under what terms, so the position is written
down first.

## The short version

**Our code is ours. The die data is not, and its terms travel with it.**

| | |
|---|---|
| `tinymachines/public` (this repo) | intended MIT, once it contains anything |
| `tinymachines/halfphi` | **MIT**, and it embeds **no die data**. That is the whole reason it can be depended on freely |
| `tinymachines/6502` | MIT code, but it embeds `netlist.bin`, which is **derived from CC BY-NC-SA 3.0 die data** |
| the die data itself | `segdefs.js` / `transdefs.js`, **CC BY-NC-SA 3.0**, Greg James / visual6502.org |

`extern/visual6502` is a git submodule in the 6502 repo rather than a copy,
precisely so that repository does not redistribute NC-SA data. That was a
deliberate choice and it should not be quietly undone here.

## What NonCommercial and ShareAlike actually reach

Both propagate. Anything shipped that embeds the die data, or is derived from
it, carries them:

- the netlist, and every artefact built from it
- the explorer, the atlas, the schematic, every measured table
- the API's responses, which are the chip's own state
- **Die Runner and every cartridge**, because a cartridge is a program running
  on a chip built from that data

`halfphi` is the clean piece. It parses and solves switch networks and names no
chip; adding die data to it would undo the only reason it is MIT.

## The coins question, stated plainly rather than left to be discovered

A token mechanism used as **coins for playing a game** is the first thing in
this project that points at commercial use, and the game is built on the
NC-licensed data. That is worth deciding deliberately, with the facts, before
it is built rather than after it ships. **I am not a lawyer and this is not
advice**; what follows is the shape of the question.

Roughly, the room to move is:

1. **Coins that are never sold.** Rate limiting, quotas, an anti-abuse budget,
   something earned by playing. No money changes hands, so NonCommercial is
   not engaged. This is the default and it needs no further thought.
2. **Money for something that is not the NC work.** Hosting, support, a
   private deployment of `halfphi` (which is MIT and carries none of this),
   consulting. The line is whether what is being paid for is the derived work.
3. **Money for access to the chip work.** This is the one that engages
   NonCommercial. It would need the rightsholder's permission, which is a
   conversation with Greg James and visual6502.org rather than a licence file
   edit.

There is a fourth option worth naming because it is real: **the visual6502
project is reachable and the archive work already touches its maintainers.**
Asking is cheap and a written permission is worth more than an interpretation.

## Attribution is not decoration

The archive builders refuse to emit a page without the attribution banner, and
the deploy refuses to publish an index missing the licence or the authors'
names. That is licence compliance implemented as a build failure, and the same
discipline belongs on anything this repo ships.

## The rule

**Surface this before any distribution or monetisation decision. Do not
silently relicense, and do not let a build quietly start embedding die data in
something advertised as MIT.**
