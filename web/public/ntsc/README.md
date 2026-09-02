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

`wasm/` is the bench's bundle: `ntsc_wasm.js` and `ntsc_wasm_bg.wasm`,
built by `scripts/board-ntsc.py --wasm` from a fresh clone at the boarded
commit (`wasm-pack build crates/ntsc-wasm --target web --release`), with
the sha256 of each file recorded in `data/ntsc.json`. Committed rather
than built per deploy because it is small, MIT throughout (no die data;
the LGPL oracle is native test rig outside the wasm dependency graph),
and pinned: rebuild it only through the boarding script, never by hand.

`bench.worker.mjs` is this repository's own code (the bench's thread),
not a build artefact.
