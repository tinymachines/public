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

The real-console figures (2026-09-02 session; the M4 report's second
addendum tells the story, and `data/ntsc.json`'s `real_capture` block
records the numbers). Sources are the five raw scope records banked at
the bench (12 M points each at 125 MSa/s, gitignored in ntsc-crt as
bench data), decoded at `tinymachines/ntsc-crt@da405db` (tag v0.2.3):

- `decoded-smb-1-1.png`, `decoded-duckhunt.png`: fields decoded by
  `cargo run --release -p ntsc-source-cap --example recover-real --
  captures/<name>.u8 u8 125000000 --nes`, the 2271-wide PPM resized to
  640 x 480 with Lanczos. Verification path, editorial content: the
  frames show Nintendo's Super Mario Bros. and Duck Hunt, reproduced
  for commentary on the measurement.
- `broadcast-vs-nes.png`: the same capture decoded twice, without and
  with `--nes`, composited side by side. The hue roll on the left is
  the broadcast phase model chasing an NES signal; the finding that
  forced `recover_nes`.
- `real-scanline.png`: one scanline of the raw record plus a colorburst
  zoom, drawn by a matplotlib script from `captures/smb-1-1-paused.u8`
  directly (ADC counts, no decode involved).
- `colour-22-score.png`: the U-V plane figure of
  `examples/score-real-region.rs`'s printed numbers, the same run the
  boarded record quotes.

To refresh any of them: re-run the named command at the boarded commit
against the banked captures. Do not edit the pixels.

## composite/

The composite deep-dive's figures, drawn by `tools/composite-figures.py`
in tinymachines/ntsc-crt from two scope records (the terminated
`captures/loaded-a` and the unterminated `captures/smb-1-1-paused`,
both gitignored bench data there) at ntsc-crt@9fb2386; the numbers the
page states come from `docs/composite-figures.json` at that commit
through `scripts/board-ntsc.py`. `decoded-menu-terminated.png` is the
terminated record decoded by `recover-real --nes` (goldens/real-capture.ppm
there), resampled to 640 x 480 with Pillow; the frame is Nintendo's,
reproduced for commentary on the measurement.
