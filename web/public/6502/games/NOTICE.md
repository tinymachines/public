# The console, and the terms on it

Everything in this directory except this file is **generated at build time**
by `web/scripts/pull-console.mjs`, read out of the `tinymachines/6502`
checkout beside this repository (`games/`), and gitignored. `upstream.json`
names the commit it was read from and every file's digest.

Three lines are patched on the way, by `web/lib/console-modules.ts`, each an
exact match that fails the build if the upstream line changes:

- `game.js` and `registry.js` read the chip API off the page
  (`[data-chip-api]`) rather than assuming it is at this origin, where it
  would be the roof's own API
- `game.js` links a cartridge's builder at the base the page declares
  (`[data-builders-base]`) rather than at a `/b/` this site does not serve

Everything else crosses byte for byte, and a test holds that.

## The terms

`../../../../NOTICE.md` is the position and this does not restate it, but the
sentence that reaches this directory is worth having beside the files:

> Die Runner and every cartridge, because a cartridge is a program running on a
> chip built from that data.

So **`rom/dierunner.rom` and `rom/snake.rom` carry CC BY-NC-SA 3.0**, and
NonCommercial and ShareAlike travel with anything derived from them. The die
data is Greg James / visual6502.org. That is why they are not committed
here: the site serves them from build output, from the one checkout that
holds them, the same arrangement as the explorer's die geometry.

The console code around them is ours, and it embeds no die data. It is
nonetheless useless without a chip to run on, which is the practical reason
this directory is treated as one thing rather than split down the middle.
