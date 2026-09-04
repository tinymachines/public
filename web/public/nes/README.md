# /nes assets

`first-sound.png` is the A3 milestone's measurement drawn as a figure:
the square channel's output code sampled every CPU half-step off the
running switch-level 2A03, and the same run through the transcribed
mixer as the AD1 pin's level. Provenance:

- source: `cargo run --release -p v2a03-sim --example a3-dump` at
  `tinymachines/2a03@be0d3c9c` (the boarded commit in data/nes.json),
  the same program and harness the A3 gates replay
- drawn by a matplotlib script from that CSV directly; the palette is
  the dataviz reference set

To refresh: re-run the example at the boarded commit and redraw. Do
not edit the pixels.

## The PPU ladder's figures (2026-09-04)

- `ppu-sequencer.png`: what the 2C02's control lines do at each dot of
  one visible line, drawn from `examples/p3-fetch-probe.rs`'s per-dot
  record of the switch-level chip in the standard world
  (tinymachines/2c02 at ce73c2a, the CSV it writes; the fetch kind is
  the address the chip latched at ALE, classified by region). Drawn
  with matplotlib in this session's scratch; the figure is the
  measurement, not an illustration.
- `ppu-sprite-world.png`, `ppu-scroll-world.png`: the sprite world's and
  the scroll world's dot goldens (rung 0's own frames, the P3 gates'
  oracles) through the family's NTSC path, `examples/render-golden.rs`
  in tinymachines/2c02: ntsc-source-nes encode, Rung A decode, the five
  CRT stages (scale 3, mask pitch 1, barrel on), as `first light` was.
  Converted from PPM with Pillow. The pictures are the switch-level
  chip's; the sprites and tiles are the worlds' XOR VRAM function, not a
  game's.
