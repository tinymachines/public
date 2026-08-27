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
| `extern/pretext` (submodule here) | **MIT**, chenglou's text layout library; embeds no die data and touches none |
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

## The coins question: decided, 2026-08-22

**Coins are never sold. They are given away.** The owner settled this on
2026-08-22, before any of it was built.

That is option 1 below, and it engages NonCommercial not at all: no money
changes hands for the derived work, so the question closes. Coins are a
quota, an anti-abuse budget and something to earn by playing.

**This is a constraint on what gets built, not a note about intent.** Anything
that would put a price on a coin, or on access to the chip work, reopens a
question that is currently closed, and it reopens it as a conversation with
the rightsholder rather than as a licence file edit. If that ever comes up,
stop and ask.

The other options are kept below because knowing why the closed one is closed
is worth more than the sentence saying it is. **I am not a lawyer and this is
not advice.**

1. **Coins that are never sold.** Rate limiting, quotas, an anti-abuse budget,
   something earned by playing. No money changes hands, so NonCommercial is
   not engaged. **This is the one chosen.**
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
