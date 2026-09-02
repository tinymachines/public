/**
 * The ntsc bench's pipeline, on a thread of its own.
 *
 * The lesson is the console's (engine/console-chip.worker.mjs): a frame here
 * is a synchronous run of a couple of hundred milliseconds, and on the main
 * thread that many milliseconds is a page that stops painting. On this
 * thread the page stays a page, and one RGBA frame crosses back per call.
 *
 *   main -> here   { id, path: 'hello' | 'step' | 'tick', rung, pattern, dtNs? }
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 *
 * 'hello' initialises the wasm and answers the output geometry. 'step'
 * advances the chosen rung's source by exactly one frame and returns it,
 * touching no pacing counter. 'tick' is one display callback: the pipeline's
 * own drift policy decides from dtNs how many source frames are due, the
 * source advances by that many (encoding only the one that is presented;
 * the skipped ones are what the dropped counter counts), and the answer
 * carries the frame, the stats and how long the encode+decode took.
 *
 * One pipeline per rung, built on first use, each with its own chained
 * phase origin and its own frame counter; a rung this bridge does not have
 * is refused by name here, before the wasm could turn the mistake into a
 * trap. The bundle is loaded module-relative, so this file and the wasm
 * move together or not at all.
 */

import init, { Pipeline } from "./wasm/ntsc_wasm.js";

const DOTS_W = 341;
const DOTS_H = 262;
const ACTIVE = 256;
const RUNGS = ["notch", "comb3"];

const ready = init();

/** rung -> { pipe, frame } */
const held = new Map();

function pipeline(rung) {
  if (!RUNGS.includes(rung)) {
    throw new Error(`this bridge runs "notch" or "comb3"; there is no rung ${JSON.stringify(rung)}`);
  }
  let h = held.get(rung);
  if (!h) {
    h = { pipe: new Pipeline(rung), frame: 0 };
    held.set(rung, h);
  }
  return h;
}

/**
 * The dot planes for one frame of a pattern, from the documented layout:
 * 341 x 262 row-major, colour u6 (luma high bits, hue low nybble),
 * emphasis u3. Only the first 256 columns are picture; the rest of each
 * row is sync, burst and blanking whose colour the encoder ignores, and
 * they are filled with the pattern anyway so the planes carry no second
 * shape. Parities alternate Even/OddShort, the rendering-enabled pattern
 * the pacing rate belongs to.
 */
function dots(pattern, frame) {
  const colour = new Uint8Array(DOTS_W * DOTS_H);
  const emphasis = new Uint8Array(DOTS_W * DOTS_H);
  for (let y = 0; y < DOTS_H; y++) {
    for (let x = 0; x < DOTS_W; x++) {
      const px = Math.min(x, ACTIVE - 1);
      let c;
      if (pattern === "hue-bands") {
        // Twelve bands across the picture, hues 1..12 at luma 2, the whole
        // wheel walking one band per frame: the golden the hero frame on
        // /ntsc came from.
        const band = Math.floor((px * 12) / ACTIVE);
        c = 0x20 | (1 + ((band + frame) % 12));
      } else if (pattern === "stripes") {
        // Alternating columns, the comb test's worst case: everything is a
        // vertical edge at dot frequency.
        c = x % 2 === 0 ? 0x16 : 0x2a;
      } else {
        // solid: one mid-luma red, the plainest DC frame.
        c = 0x16;
      }
      colour[y * DOTS_W + x] = c;
    }
  }
  return { colour, emphasis, parity: frame % 2 === 0 ? 0 : 2 };
}

function render(rung, pattern) {
  const h = pipeline(rung);
  const { colour, emphasis, parity } = dots(pattern, h.frame);
  const t0 = performance.now();
  const rgba = h.pipe.push_frame(colour, emphasis, parity);
  const ms = performance.now() - t0;
  return { rgba, ms, frame: h.frame, width: h.pipe.width(), height: h.pipe.height() };
}

self.onmessage = async (e) => {
  const { id, path, rung, pattern, dtNs } = e.data;
  try {
    await ready;
    if (path === "hello") {
      // Touch nothing: the page only wants to know the bridge is alive and
      // what shape a frame is.
      const p = pipeline(rung ?? "notch");
      self.postMessage({ id, ok: true, answer: { width: p.pipe.width(), height: p.pipe.height() } });
      return;
    }
    const h = pipeline(rung);
    let advanced = 1;
    let stats = null;
    if (path === "tick") {
      advanced = h.pipe.tick(dtNs);
      const s = h.pipe.stats();
      stats = { presented: s[0], duplicated: s[1], dropped: s[2] };
      if (advanced === 0) {
        // Nothing due: the previous frame stands (a duplicate, already
        // counted). No encode, no new picture.
        self.postMessage({ id, ok: true, answer: { rgba: null, stats, advanced } });
        return;
      }
      h.frame += advanced - 1; // the skipped frames, never encoded
    } else if (path !== "step") {
      throw new Error(`unknown path ${JSON.stringify(path)}`);
    }
    const out = render(rung, pattern);
    h.frame += 1;
    self.postMessage(
      { id, ok: true, answer: { ...out, stats, advanced } },
      [out.rgba.buffer],
    );
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
