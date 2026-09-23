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
 * 'load' builds a console from the ROM bytes (the boards the console has,
 * seven at the time of writing; anything else is refused by name) and a
 * fresh pacer with its counters at zero. 'tick' is
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
// The bus range the page watches (the memory panel's page): sent back with
// every answer that ran the console, so the panel follows without asking.
let watch = { at: 0, len: 256 };

/**
 * What the machine holds, as the bundle reads it (nes-wasm's reads: no
 * side effect, no step). Flat byte vectors, parsed on the page.
 */
function state() {
  if (!nes || !nes.cpu_state) return null;
  const cpu = nes.cpu_state();
  const pc = cpu[5] | (cpu[6] << 8);
  // The bytes from the program counter, for the code panel's listing: a
  // page is more than a screen of instructions.
  return { cpu, ppu: nes.ppu_state(), palette: nes.palette(), oam: nes.oam(), watched: nes.peek(watch.at, watch.len), watchAt: watch.at, code: nes.peek(pc, 256), codeAt: pc };
}

/** The planes and the sound after a step, if a frame completed inside it. */
function afterStep(id, took) {
  const sound = nes.sound();
  if (nes.has_frame && nes.has_frame()) {
    const colour = nes.colour();
    const emphasis = nes.emphasis();
    const parity = nes.parity();
    self.postMessage({ id, ok: true, answer: { colour, emphasis, parity, sound, took, advanced: 1, halfCycles: nes.cpu_half_cycles(), state: state() } }, [colour.buffer, emphasis.buffer, sound.buffer]);
  } else {
    self.postMessage({ id, ok: true, answer: { colour: null, emphasis: null, parity: 0, sound, took, advanced: 0, halfCycles: nes.cpu_half_cycles(), state: state() } }, [sound.buffer]);
  }
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
      const bytes = new Uint8Array(e.data.rom);
      if (nes) nes.free();
      nes = null;
      nes = new Nes(bytes);
      pacer = new Pipeline("comb3");
      self.postMessage({ id, ok: true, answer: { bytes: bytes.length } });
      return;
    }
    // Power off: the console is dropped, the pacer with it. The page keeps
    // the cartridge and loads it again for power on, which is the only
    // reset this bundle has: a new console is the state it powered on into.
    // The page's look at the machine, on request: after a load, a power
    // cycle, and whenever a panel changes what it watches.
    if (path === "state") {
      if (!nes) throw new Error("no cartridge loaded");
      self.postMessage({ id, ok: true, answer: { state: state() } });
      return;
    }
    if (path === "watch") {
      watch = { at: e.data.at & 0xffff, len: Math.max(1, Math.min(4096, e.data.len | 0)) };
      self.postMessage({ id, ok: true, answer: { state: nes ? state() : null } });
      return;
    }
    if (path === "ciram") {
      if (!nes) throw new Error("no cartridge loaded");
      self.postMessage({ id, ok: true, answer: { ciram: nes.ciram(), chrRam: nes.chr_ram() } });
      return;
    }
    // The steps: the machine moved by one of its own units, with the pads
    // as they stand. The bundle keeps the newest completed frame where the
    // planes are read, so a step that finishes a frame paints it.
    if (path === "step") {
      if (!nes || !nes.step_instruction) throw new Error("this bundle cannot step");
      nes.set_pad(e.data.pad & 0xff);
      if (nes.set_pad2) nes.set_pad2(e.data.pad2 & 0xff);
      const kind = e.data.kind;
      let took = 0;
      if (kind === "half") took = nes.step_half_cycles(1);
      else if (kind === "cycle") took = nes.step_half_cycles(2);
      else if (kind === "op") took = nes.step_instruction();
      else if (kind === "line") took = nes.step_scanline();
      else throw new Error(`unknown step ${JSON.stringify(kind)}`);
      afterStep(id, took);
      return;
    }
    // The front panel's reset button: the CPU restarts at its vector,
    // everything else keeps what it holds.
    if (path === "reset") {
      if (!nes || !nes.reset) throw new Error("this bundle has no reset button");
      nes.reset();
      afterStep(id, 0);
      return;
    }
    if (path === "off") {
      if (nes) nes.free();
      nes = null;
      pacer = null;
      self.postMessage({ id, ok: true, answer: { off: true } });
      return;
    }
    // One frame, on the transport's frame key while paused: the pad as it
    // stands, the newest planes and the sound that frame made, the pacer's
    // counters untouched because no display callback happened.
    if (path === "frame") {
      if (!nes || !pacer) throw new Error("no cartridge loaded");
      nes.set_pad(e.data.pad & 0xff);
      if (nes.set_pad2) nes.set_pad2((e.data.pad2 ?? 0) & 0xff);
      const t0 = performance.now();
      nes.run_frames(1);
      const colour = nes.colour();
      const emphasis = nes.emphasis();
      const parity = nes.parity();
      const sound = nes.sound();
      const consoleMs = performance.now() - t0;
      const s = pacer.stats();
      const stats = { presented: s[0], duplicated: s[1], dropped: s[2] };
      self.postMessage(
        { id, ok: true, answer: { colour, emphasis, parity, sound, stats, advanced: 1, consoleMs, halfCycles: nes.cpu_half_cycles(), state: state() } },
        [colour.buffer, emphasis.buffer, sound.buffer],
      );
      return;
    }
    // The cartridge RAM at $6000, out and back: what a battery keeps. The
    // page is the battery (playEngine's keeper); the worker only hands the
    // bytes across. `has` is the header's battery bit, so the page knows
    // whether a save is worth keeping at all.
    if (path === "battery") {
      if (!nes) throw new Error("no cartridge loaded");
      if (e.data.ram) {
        nes.set_battery_ram(new Uint8Array(e.data.ram));
        self.postMessage({ id, ok: true, answer: { restored: true } });
        return;
      }
      const ram = nes.battery_ram();
      self.postMessage({ id, ok: true, answer: { has: nes.has_battery(), ram } }, [ram.buffer]);
      return;
    }
    if (path === "tick") {
      if (!nes || !pacer) throw new Error("no cartridge loaded");
      const { dtNs, pad } = e.data;
      const advanced = pacer.tick(dtNs);
      const s = pacer.stats();
      const stats = { presented: s[0], duplicated: s[1], dropped: s[2] };
      if (advanced === 0) {
        self.postMessage({ id, ok: true, answer: { colour: null, emphasis: null, parity: 0, sound: null, stats, advanced, consoleMs: 0, halfCycles: nes.cpu_half_cycles() } });
        return;
      }
      nes.set_pad(pad & 0xff);
      if (nes.set_pad2) nes.set_pad2((e.data.pad2 ?? 0) & 0xff);
      const t0 = performance.now();
      nes.run_frames(advanced);
      const colour = nes.colour();
      const emphasis = nes.emphasis();
      const parity = nes.parity();
      const sound = nes.sound();
      const consoleMs = performance.now() - t0;
      self.postMessage(
        { id, ok: true, answer: { colour, emphasis, parity, sound, stats, advanced, consoleMs, halfCycles: nes.cpu_half_cycles(), state: state() } },
        [colour.buffer, emphasis.buffer, sound.buffer],
      );
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
