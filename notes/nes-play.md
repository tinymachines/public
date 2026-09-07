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

## Third pass: the decode on WebGPU

The signal path's bridge (ntsc-crt 0.2.5) hands the encoded samples and
the decoder's constants out, held to push_frame's bytes in its own
test. The picture worker runs the comb decode as three compute passes
(the native shell's passes 1 to 3, the display gamma left off because
push_frame goes straight to bytes) into its own OffscreenCanvas and
sends an ImageBitmap; the page's canvas is never handed over, so a path
that fails is replaced by a fresh 2d canvas on the wasm path. Before
WebGPU is used the first frame is decoded both ways and must agree
within 2 of 255 (measured: 0), and the attempt races a five-second
clock. Measured from headless Chromium on this box: decode 0.9 ms
against 35 on wasm, 57 pictures a second against 29. The console still
drops source frames here for the same reason as before: the box.

Found on the way: Chrome under Xvfb gives the page a WebGPU adapter but
its workers none, and the software adapter could not present to a
canvas whose control the page had transferred, which is why the worker
owns its canvases and ships bitmaps.

## Fourth pass: the encoder on WebGPU too

ntsc-crt 0.2.6's bridge hands out the encoder's levels and grid and
advances the phase without encoding. The picture worker's shader gained
the NES source's encoder (the segment map and the signal rule ported
line for line) as a fourth compute pass writing the samples buffer the
decode reads, so only the two dot planes go up per frame. The first
frame's check now covers both: the GPU encoder against the wasm encoder
on every sample of every line (tolerance 1e-6 V, measured 0) and the
GPU path's bytes against the wasm decode (measured 0 of 255). The
picture thread's cost is a fraction of a millisecond; the console is
the page's limit now. Found on the way: eight storage buffers is the
default per-stage limit, so both planes share one buffer; a WGSL pointer
parameter to storage needs a feature this browser did not have; and
awaiting the queue's completion promise on the software adapter broke
the canvas ("A valid external Instance reference no longer exists"),
so the bitmap transfer is the sync point.

## 2026-09-07: the pad on the screen, and full screen

An NES-shaped pad under the screen (`play/Gamepad.tsx`): the cross on
the left, Select and Start in the middle, B and A on the right, driven
by pointer events with capture so a thumb can slide across the cross
and two thumbs can hold A and Up at once; each pointer owns the bits it
is over and the union goes to the engine as the register's byte, ORed
with the keyboard's (`setTouchPad`, `padByte`). The cross reads the
pointer's angle from its centre in eight sectors, so diagonals come
from the corners. Mobile first: the pad's three zones shrink with the
screen (a 390 phone holds them with room; the first cut forced the
stage to 468 and the mobile rule caught it), and the whole stage
(screen, pad, control) goes full screen through the Fullscreen API
where a browser has it and as a fixed overlay where it does not (an
iPhone has no element fullscreen), one flag either way: black ground,
the picture as large as 256 by 240 allows, the pad over the lower part
in portrait and at the sides in landscape. The faces are chrome on the
page and glass over black, lit in the accent under a press. `e2e/nes`
holds it on a phone: a press on A is bit 0, a slide across the cross
turns Right into Up with no second press, the stage becomes the
viewport and back. A synthetic pointer does not scroll, so the test
scrolls the pad into view first; a thumb is on the screen by
definition.
