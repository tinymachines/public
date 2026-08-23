# The console, and the terms on it

`game.js`, `console.js` and `chr.js` are copied byte for byte from
`tinymachines/6502` (`games/`), with **two lines changed**, both in `game.js`
and both saying why at the line itself:

- the chip API is read from the page rather than assumed to be at this origin
- the "by <handle>" credit on a linked cartridge points at the builder pages,
  which are still on the subdomain, rather than at a `/b/` this site does not
  serve

The ROMs under `rom/` and the tile sheet under `art/` are copied unchanged.

## The terms

`../../../../NOTICE.md` is the position and this does not restate it, but the
sentence that reaches this directory is worth having beside the files:

> Die Runner and every cartridge, because a cartridge is a program running on a
> chip built from that data.

So **`rom/dierunner.rom` and `rom/snake.rom` carry CC BY-NC-SA 3.0**, and
NonCommercial and ShareAlike travel with anything derived from them. The die
data is Greg James / visual6502.org.

The console code around them is ours, and it embeds no die data. It is
nonetheless useless without a chip to run on, which is the practical reason
this directory is treated as one thing rather than split down the middle.

Nothing here is served to a browser that has not already loaded the site. The
console fetches the chip from `6502.tinymachines.ai/api`, which is the same
service that has always run it.
