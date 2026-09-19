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
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 *
 * 'step' runs one frame on both (the second with pad | extra) and
 * answers both colour planes and how many dots differ. The ROM never
 * leaves this browser.
 */

import init, { Nes } from "./wasm/nes_wasm.js";

const ready = init();
let a = null;
let b = null;

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
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
