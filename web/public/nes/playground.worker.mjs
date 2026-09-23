/**
 * The playground's console, on a thread of its own. The same two boarded
 * bundles /nes/play runs (the console and the signal path), asked
 * different questions: not "keep up with the wall clock" but "hand me
 * this frame so a person can look at it".
 *
 *   main -> here   { id, path: 'hello' }
 *                  { id, path: 'load', url }        a cartridge from this site
 *                  { id, path: 'load', rom }        one from the reader's disk
 *                  { id, path: 'run', n, pad }      n frames, then the planes
 *                  { id, path: 'wire', serial }     a recent frame as volts
 *                  { id, path: 'palette' }          the 64 codes, measured
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 *
 * 'palette' does not use a table of colours from anywhere. It lays the 64
 * colour codes out as blocks on one synthetic frame, sends that frame
 * through the model's own encoder and three-line comb decoder, and reads
 * the middle of each block back: the colours are what our television
 * shows for each code. It also hands back one line of the encoded frame,
 * so the page can draw each code's wave. The geometry (dots a line,
 * samples a line, where the picture starts) is asked of the bundle, never
 * restated.
 */

import initNes, { Nes } from "./wasm/nes_wasm.js";
import initNtsc, { Pipeline } from "../ntsc/wasm/ntsc_wasm.js";
import { learnShape as learn, measurePalette as measure } from "./palette.mjs";

const ready = Promise.all([initNes(), initNtsc()]);

let nes = null;
let last = null; // { colour, emphasis, parity } of the newest frame
const kept = new Map(); // serial -> planes, the last few frames, for 'wire'
let serial = 0;
let scope = null; // a pipeline used only to encode, so its phase is ours
let shape = null; // the frame's geometry, learned from the first encode
let palette = null;
let tv = null; // the decoder for the "through the television" view

function planes() {
  return { colour: nes.colour(), emphasis: nes.emphasis(), parity: nes.parity() };
}

self.onmessage = async (e) => {
  const { id, path } = e.data;
  try {
    await ready;
    if (path === "hello") {
      self.postMessage({ id, ok: true, answer: { alive: true } });
      return;
    }
    if (path === "load") {
      let bytes;
      if (e.data.rom) bytes = new Uint8Array(e.data.rom);
      else {
        const res = await fetch(e.data.url);
        if (!res.ok) throw new Error(`${e.data.url} answered ${res.status}`);
        bytes = new Uint8Array(await res.arrayBuffer());
      }
      if (nes) nes.free();
      nes = null;
      nes = new Nes(bytes);
      last = null;
      kept.clear();
      self.postMessage({ id, ok: true, answer: { bytes: bytes.length } });
      return;
    }
    if (path === "run") {
      if (!nes) throw new Error("no cartridge loaded");
      nes.set_pad(e.data.pad & 0xff);
      const before = nes.cpu_half_cycles();
      nes.run_frames(Math.max(1, e.data.n | 0));
      const halfCycles = nes.cpu_half_cycles() - before;
      last = planes();
      if (!shape) shape = learn(Pipeline, last);
      serial += 1;
      kept.set(serial, last);
      for (const k of kept.keys()) if (k <= serial - 4) kept.delete(k);
      const colour = last.colour.slice();
      let rgba = null;
      if (e.data.decode) {
        // The real signal path: encoded to volts and pulled apart by the
        // comb, exactly as /nes/play's picture thread does without WebGPU.
        if (!tv) tv = new Pipeline("comb3");
        rgba = tv.push_frame(last.colour, last.emphasis, last.parity);
      }
      const transfer = rgba ? [colour.buffer, rgba.buffer] : [colour.buffer];
      self.postMessage(
        { id, ok: true, answer: { serial, colour, rgba, parity: last.parity, halfCycles, shape } },
        transfer,
      );
      return;
    }
    if (path === "wire") {
      const f = kept.get(e.data.serial) ?? last;
      if (!f) throw new Error("no frame yet");
      if (!scope) scope = new Pipeline("comb3");
      const volts = scope.encode(f.colour, f.emphasis, f.parity);
      const colour = f.colour.slice();
      self.postMessage({ id, ok: true, answer: { volts, colour, shape } }, [volts.buffer, colour.buffer]);
      return;
    }
    if (path === "palette") {
      if (!shape) throw new Error("no frame yet");
      if (!palette) palette = measure(Pipeline, shape);
      self.postMessage({ id, ok: true, answer: palette });
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
