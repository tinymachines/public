/**
 * A cartridge run through a pad script with nobody watching, for the
 * Program window's measurements: the console's memory as each frame ends.
 * It is the loop the lessons were measured with (the nes repository's
 * storyboard example): the script's pad byte is set, one frame runs, and
 * $0000 to $07FF is read with no side effect.
 *
 *   main -> here   { id, rom, script: [[frame, pad], ...], frames, stop?, logs? }
 *   here -> main   { id, ok: true, answer: { ram, frames, logs } } | { id, ok: false, error }
 *
 * `ram` is frames * 2048 bytes, a frame after a frame. The script is
 * sorted by frame; a pad byte holds until the next line changes it.
 *
 * `stop: { from, cell }` ends the run early, after the first frame at or
 * past `from` that leaves `cell` non-zero: a measurement that reads
 * nothing later than that need not wait for the rest. `frames` in the
 * answer is how many were run.
 *
 * `logs`, a list from "vram", "scroll", "apu" and "mapper", asks for the
 * console's write log: what the program wrote to the picture chip's
 * memory, the scroll, the sound chip and the cartridge's own range, a
 * line a write, the text storyboard writes to vram.txt, scroll.txt,
 * apu.txt and mapper.txt (the record's measures read those files). The
 * log is switched on before the first frame, never across a loaded
 * state, and the console then runs a frame at a time inside, so the
 * frame numbers are storyboard's. It costs something (a trace every CPU
 * cycle), so it is off unless asked for. The answer's `logs` holds the
 * text of each kind asked for; with no `logs` asked it is {}.
 */

import initNes, { Nes } from "./wasm/nes_wasm.js";

const ready = initNes();
const CELLS = 0x800;

self.onmessage = async (e) => {
  const { id, rom, script, frames, stop, logs = [] } = e.data;
  let nes = null;
  try {
    await ready;
    nes = new Nes(new Uint8Array(rom));
    if (logs.length) nes.set_write_log(true);
    const ram = new Uint8Array(frames * CELLS);
    let next = 0, pad = 0, ran = 0;
    for (let f = 0; f < frames; f++) {
      while (next < script.length && script[next][0] <= f) pad = script[next++][1];
      nes.set_pad(pad & 0xff);
      nes.run_frames(1);
      ram.set(nes.peek(0, CELLS), f * CELLS);
      ran = f + 1;
      if (stop && f >= stop.from && ram[f * CELLS + stop.cell]) break;
    }
    const kept = ran === frames ? ram : ram.slice(0, ran * CELLS);
    // Each kind's lines, which empties it; a kind the console has no log for is refused by name.
    const texts = {};
    for (const kind of logs) texts[kind] = nes.take_writes(kind);
    self.postMessage({ id, ok: true, answer: { ram: kept.buffer, frames: ran, logs: texts } }, [kept.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  } finally {
    if (nes) nes.free();
  }
};
