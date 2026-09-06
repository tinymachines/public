# /nes/play: the console in the page

Written before the code (2026-09-06). N8's report calls the wasm target
"the roof's item": the console with its sound behind wasm-bindgen exists
and measures at the repository's bench; what it lacks is a page.

## The shape

- One worker (`public/nes/console.worker.mjs`) holds both boarded
  bundles: the console (`/nes/wasm/nes_wasm.js`, built by
  `board-nes.py --wasm` at the boarded nes commit, hashes recorded in
  data/nes.json, never committed here because its chip tables are
  measured from NC-SA die data) and the signal path
  (`/ntsc/wasm/ntsc_wasm.js`, the ntsc bench's, already boarded). Per
  display tick the pipeline's own drift policy says how many console
  frames are due; the worker runs them, pushes the newest through the
  three-line comb and answers with the RGBA frame, the 48 kHz sound the
  frames produced, the drift counters and the milliseconds it took.
- The page (`app/[lang]/nes/play`) follows the bench's shape: the loop,
  the worker and the canvas at module scope in `playEngine.ts`, the
  component a follower. The ROM comes from the reader's own disk through
  a file input and never leaves the browser; only NROM loads, and the
  refusal is by name. The keyboard is controller 1 (arrows, Z and X,
  Enter, right Shift). Sound through WebAudio, each tick's samples
  scheduled gapless on a running cursor, underruns counted.
- The readouts are the counters, the last tick's cost split between the
  console and the pipeline, and the frames a second the page manages;
  the prose states the repository's node figure from the record and
  says the in-page rate is measured, not promised.

## Gate

e2e (`nes.spec.ts`): the page loads the repository's own test cartridge
(`e2e/fixtures/testcart.nes`, the console's plumbing program exported as
iNES, nobody's game), runs for a second, and the canvas is painted and
the counters advance; a refusal notice is a failure. `check-build.mjs`
refuses a build whose console bundle is missing or does not hash to the
record. The deploy's route list gains /nes/play and the bundle.

## Second pass, the same day: two workers

The first page ran the console and the signal path in one worker and
measured 16 pictures a second from a headless browser on this box, the
console asked for more frames each slow tick. The native shell's shape
was applied: the console worker keeps the source's rate and the sound,
the picture worker decodes the newest frame at its own rate, and a frame
that arrives while the picture is busy is counted as run but not
decoded. The pacer in the console worker is an instance of the signal
path's Pipeline that pushes no frame, so the drift rule is the
repository's and not restated. Measured the same way on the same loaded
box (load average about eight from other sessions), the pictures a
second did not move, because both threads contend for the same busy
cores; what changed is the shape, which is the right one for a desk.
