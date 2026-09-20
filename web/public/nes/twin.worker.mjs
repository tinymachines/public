/**
 * Twin consoles for the playground's "spot the difference": two of the
 * console /nes/play runs (the same boarded bundle), built from the same
 * cartridge, fed the same buttons every frame, except that the second
 * can be handed extra buttons for one frame. Everything else about them
 * is the same, so any dot on which their pictures differ is that tap's
 * doing, and the frame they agree again is when the tap's effect ended.
 *
 *   main -> here   { id, path: 'load', url }  or  { id, path: 'load', rom }
 *                  { id, path: 'step', pad, extra }
 *                  { id, path: 'solo', pad }
 *                  { id, path: 'xray', script, at, extra, dots }
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 *
 * 'step' runs one frame on both (the second with pad | extra) and
 * answers both colour planes and how many dots differ. 'solo' runs the
 * first console alone, for a reader playing their own cartridge while
 * the page writes down the pad byte of every frame.
 *
 * 'xray' is that recording replayed twice from power on: both consoles
 * take the script frame for frame, and the second is handed `extra` for
 * the one frame `at`. Everything the two then differ by is that tap's
 * doing. It answers the dots apart in every frame, where on the screen
 * the first difference lay, and the frames of the worst one, which is
 * what a reader can see; what the engineers' own x-ray reads (the
 * instruction that diverged, the path through the code) is not in this
 * bundle, and the page says so.
 *
 * The ROM never leaves this browser.
 */

import init, { Nes } from "./wasm/nes_wasm.js";

const ready = init();
let a = null;
let b = null;
let rom = null;

self.onmessage = async (e) => {
  const { id, path } = e.data;
  try {
    await ready;
    if (path === "load") {
      let bytes;
      if (e.data.rom) bytes = new Uint8Array(e.data.rom);
      else {
        const res = await fetch(e.data.url);
        if (!res.ok) throw new Error(`${e.data.url} answered ${res.status}`);
        bytes = new Uint8Array(await res.arrayBuffer());
      }
      if (a) a.free();
      if (b) b.free();
      a = null;
      b = null;
      rom = bytes;
      a = new Nes(bytes);
      b = new Nes(bytes);
      self.postMessage({ id, ok: true, answer: { bytes: bytes.length } });
      return;
    }
    if (path === "step") {
      if (!a || !b) throw new Error("no cartridge loaded");
      const pad = e.data.pad & 0xff;
      a.set_pad(pad);
      b.set_pad((pad | e.data.extra) & 0xff);
      a.run_frames(1);
      b.run_frames(1);
      const left = a.colour();
      const right = b.colour();
      let differ = 0;
      for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) differ++;
      self.postMessage({ id, ok: true, answer: { left, right, differ } }, [left.buffer, right.buffer]);
      return;
    }
    if (path === "solo") {
      if (!a) throw new Error("no cartridge loaded");
      a.set_pad(e.data.pad & 0xff);
      a.run_frames(1);
      const left = a.colour();
      self.postMessage({ id, ok: true, answer: { left } }, [left.buffer]);
      return;
    }
    if (path === "xray") {
      if (!rom) throw new Error("no cartridge loaded");
      const script = e.data.script;
      const at = e.data.at | 0;
      const extra = e.data.extra & 0xff;
      // The dots a line: the page has it from the bundle's own geometry.
      const dots = e.data.dots | 0;
      if (!dots) throw new Error("the x-ray needs the frame's width");
      if (a) a.free();
      if (b) b.free();
      a = new Nes(rom);
      b = new Nes(rom);
      const apart = new Uint32Array(script.length);
      let firstAt = -1;
      let lastAt = -1;
      let worstAt = -1;
      let box = null;
      let left = null;
      let right = null;
      const t0 = performance.now();
      for (let f = 0; f < script.length; f++) {
        const pad = script[f] & 0xff;
        a.set_pad(pad);
        b.set_pad(f === at ? (pad | extra) & 0xff : pad);
        a.run_frames(1);
        b.run_frames(1);
        const la = a.colour();
        const lb = b.colour();
        let n = 0;
        let x0 = 1e9;
        let x1 = -1;
        let y0 = 1e9;
        let y1 = -1;
        for (let i = 0; i < la.length; i++) {
          if (la[i] === lb[i]) continue;
          n++;
          const x = i % dots;
          const y = (i / dots) | 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        apart[f] = n;
        if (n > 0) {
          if (firstAt < 0) {
            firstAt = f;
            box = [x0, y0, x1, y1];
          }
          lastAt = f;
          if (worstAt < 0 || n > apart[worstAt]) {
            worstAt = f;
            left = la.slice();
            right = lb.slice();
          }
        }
      }
      const ms = performance.now() - t0;
      const transfer = [apart.buffer];
      if (left) transfer.push(left.buffer, right.buffer);
      self.postMessage({ id, ok: true, answer: { apart, firstAt, lastAt, worstAt, box, left, right, ms } }, transfer);
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
