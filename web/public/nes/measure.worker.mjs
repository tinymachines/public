/**
 * A cartridge run through a pad script with nobody watching, for the
 * Program window's measurements: the console's memory as each frame ends.
 * It is the loop the lessons were measured with (the nes repository's
 * storyboard example): the script's pad byte is set, one frame runs, and
 * $0000 to $07FF is read with no side effect.
 *
 *   main -> here   { id, rom, script: [[frame, pad], ...], frames }
 *   here -> main   { id, ok: true, answer: { ram, frames } } | { id, ok: false, error }
 *
 * `ram` is frames * 2048 bytes, a frame after a frame. The script is
 * sorted by frame; a pad byte holds until the next line changes it.
 */

import initNes, { Nes } from "./wasm/nes_wasm.js";

const ready = initNes();
const CELLS = 0x800;

self.onmessage = async (e) => {
  const { id, rom, script, frames } = e.data;
  let nes = null;
  try {
    await ready;
    nes = new Nes(new Uint8Array(rom));
    const ram = new Uint8Array(frames * CELLS);
    let next = 0, pad = 0;
    for (let f = 0; f < frames; f++) {
      while (next < script.length && script[next][0] <= f) pad = script[next++][1];
      nes.set_pad(pad & 0xff);
      nes.run_frames(1);
      ram.set(nes.peek(0, CELLS), f * CELLS);
    }
    self.postMessage({ id, ok: true, answer: { ram: ram.buffer, frames } }, [ram.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  } finally {
    if (nes) nes.free();
  }
};
