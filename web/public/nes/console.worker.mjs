/**
 * The console in the page, on a thread of its own: both boarded bundles,
 * the console (nes_wasm: the 2A03's and the 2C02's fast rungs through
 * the authored glue, with the sound) and the signal path (ntsc_wasm: the
 * NES encoder and the three-line comb, whose Pipeline also carries the
 * drift policy). The shape is the ntsc bench's worker.
 *
 *   main -> here   { id, path: 'hello' }
 *                  { id, path: 'load', rom: ArrayBuffer }
 *                  { id, path: 'tick', dtNs, pad }
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 *
 * 'load' builds a console from the ROM bytes (NROM only; anything else is
 * refused by name) and a fresh pipeline with its counters at zero. 'tick'
 * is one display callback: the pipeline's pacing decides from dtNs how
 * many console frames are due, the console runs them with the pad as it
 * stands, the newest frame goes through the encoder and the comb, and the
 * answer carries the RGBA frame, the 48 kHz sound those frames produced,
 * the counters and the milliseconds the console and the pipeline took.
 * The ROM never leaves this browser.
 */

import initNes, { Nes } from "./wasm/nes_wasm.js";
import initNtsc, { Pipeline } from "../ntsc/wasm/ntsc_wasm.js";

const ready = Promise.all([initNes(), initNtsc()]);

let nes = null;
let pipe = null;

self.onmessage = async (e) => {
  const { id, path } = e.data;
  try {
    await ready;
    if (path === "hello") {
      const p = pipe ?? new Pipeline("comb3");
      self.postMessage({ id, ok: true, answer: { width: p.width(), height: p.height() } });
      return;
    }
    if (path === "load") {
      const bytes = new Uint8Array(e.data.rom);
      if (nes) nes.free();
      nes = null;
      nes = new Nes(bytes);
      pipe = new Pipeline("comb3");
      self.postMessage({ id, ok: true, answer: { width: pipe.width(), height: pipe.height(), bytes: bytes.length } });
      return;
    }
    if (path === "tick") {
      if (!nes || !pipe) throw new Error("no cartridge loaded");
      const { dtNs, pad } = e.data;
      const advanced = pipe.tick(dtNs);
      const s = pipe.stats();
      const stats = { presented: s[0], duplicated: s[1], dropped: s[2] };
      if (advanced === 0) {
        self.postMessage({ id, ok: true, answer: { rgba: null, sound: null, stats, advanced, consoleMs: 0, pipeMs: 0 } });
        return;
      }
      nes.set_pad(pad & 0xff);
      const t0 = performance.now();
      nes.run_frames(advanced);
      const colour = nes.colour();
      const emphasis = nes.emphasis();
      const parity = nes.parity();
      const sound = nes.sound();
      const t1 = performance.now();
      const rgba = pipe.push_frame(colour, emphasis, parity);
      const t2 = performance.now();
      self.postMessage(
        { id, ok: true, answer: { rgba, sound, stats, advanced, consoleMs: t1 - t0, pipeMs: t2 - t1, width: pipe.width(), height: pipe.height() } },
        [rgba.buffer, sound.buffer],
      );
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
