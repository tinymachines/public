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
