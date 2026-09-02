# /ntsc assets

`crt-hue-bands.png` is a display frame from the ntsc-crt project's own
reference player, illustrative rather than verification, per that
repository's rule (docs/m3-report.md). Provenance:

- source: `goldens/m3-frame-0.ppm` at `tinymachines/ntsc-crt@498801ca7f097e0860a2b3eabb9dbacb8b811bf1`
- written there by `cargo run --release --example play-golden`
  (the recorded Even/OddShort colour-cycle golden through encode,
  Rung A decode and all five CRT stages: scale 3, mask pitch 1, barrel on)
- converted here with `pnmtopng`, recompressed with
  `convert -strip -define png:compression-level=9`

To refresh: re-run the example at the boarded commit (data/ntsc.json
records it) and convert again. Do not edit the pixels.
