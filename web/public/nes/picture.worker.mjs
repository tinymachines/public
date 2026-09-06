/**
 * The picture, on a thread of its own: the signal path's boarded bundle,
 * one Pipeline on the three-line comb with its phase chained frame to
 * frame. One frame in (the console worker's dot planes and parity), one
 * RGBA frame out. It runs at its own rate; the console's pacing does not
 * wait for it, and a frame the console produced while this thread was
 * busy is never decoded, which the page counts.
 *
 *   main -> here   { id, path: 'hello' | 'frame', colour, emphasis, parity }
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 */

import init, { Pipeline } from "../ntsc/wasm/ntsc_wasm.js";

const ready = init();
let pipe = null;

self.onmessage = async (e) => {
  const { id, path } = e.data;
  try {
    await ready;
    if (!pipe) pipe = new Pipeline("comb3");
    if (path === "hello") {
      self.postMessage({ id, ok: true, answer: { width: pipe.width(), height: pipe.height() } });
      return;
    }
    if (path === "reset") {
      pipe = new Pipeline("comb3");
      self.postMessage({ id, ok: true, answer: { width: pipe.width(), height: pipe.height() } });
      return;
    }
    if (path === "frame") {
      const { colour, emphasis, parity } = e.data;
      const t0 = performance.now();
      const rgba = pipe.push_frame(colour, emphasis, parity);
      const pipeMs = performance.now() - t0;
      self.postMessage({ id, ok: true, answer: { rgba, pipeMs, width: pipe.width(), height: pipe.height() } }, [rgba.buffer]);
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
