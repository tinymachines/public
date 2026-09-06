/**
 * The console in the page, on a thread of its own (N8's second target,
 * in the shape the native shell settled on: the console on one thread
 * paced by the wall clock, the picture on another).
 *
 *   main -> here   { id, path: 'hello' }
 *                  { id, path: 'load', rom: ArrayBuffer }
 *                  { id, path: 'tick', dtNs, pad }
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 *
 * 'load' builds a console from the ROM bytes (NROM only; anything else is
 * refused by name) and a fresh pacer with its counters at zero. 'tick' is
 * one display callback: the drift policy decides from dtNs how many
 * frames are due (the signal path's own Pipeline carries that policy, so
 * an instance of it is the pacer here and pushes no frame; the rule is
 * the repository's, never restated), the console runs them with the pad
 * as it stands, and the answer carries the newest frame's dot planes and
 * parity, the 48 kHz sound those frames produced, the counters and the
 * milliseconds the console took. The picture worker takes the planes
 * from there. The ROM never leaves this browser.
 */

import initNes, { Nes } from "./wasm/nes_wasm.js";
import initNtsc, { Pipeline } from "../ntsc/wasm/ntsc_wasm.js";

const ready = Promise.all([initNes(), initNtsc()]);

let nes = null;
let pacer = null;

self.onmessage = async (e) => {
  const { id, path } = e.data;
  try {
    await ready;
    if (path === "hello") {
      self.postMessage({ id, ok: true, answer: { alive: true } });
      return;
    }
    if (path === "load") {
      const bytes = new Uint8Array(e.data.rom);
      if (nes) nes.free();
      nes = null;
      nes = new Nes(bytes);
      pacer = new Pipeline("comb3");
      self.postMessage({ id, ok: true, answer: { bytes: bytes.length } });
      return;
    }
    if (path === "tick") {
      if (!nes || !pacer) throw new Error("no cartridge loaded");
      const { dtNs, pad } = e.data;
      const advanced = pacer.tick(dtNs);
      const s = pacer.stats();
      const stats = { presented: s[0], duplicated: s[1], dropped: s[2] };
      if (advanced === 0) {
        self.postMessage({ id, ok: true, answer: { colour: null, emphasis: null, parity: 0, sound: null, stats, advanced, consoleMs: 0 } });
        return;
      }
      nes.set_pad(pad & 0xff);
      const t0 = performance.now();
      nes.run_frames(advanced);
      const colour = nes.colour();
      const emphasis = nes.emphasis();
      const parity = nes.parity();
      const sound = nes.sound();
      const consoleMs = performance.now() - t0;
      self.postMessage(
        { id, ok: true, answer: { colour, emphasis, parity, sound, stats, advanced, consoleMs } },
        [colour.buffer, emphasis.buffer, sound.buffer],
      );
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
