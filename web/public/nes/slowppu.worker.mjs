/**
 * The slow chip, on a thread of its own: the engineers' switch-level 2C02
 * (wasm/slowppu, built by scripts/build-playground-wasm.py into ./slow/, never
 * committed because the netlist inside is NC-SA) stepped for as long as
 * the page allows each time it asks.
 *
 *   main -> here   { id, path: 'hello' }
 *                  { id, path: 'run', budgetMs }
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 *
 * 'hello' restores the chip from the state recorded after its reset and
 * answers its size (from the netlist), the frame's geometry (from the
 * contract), the lamps' node names and the fast chip's frame of the same
 * world. 'run' steps the chip in small batches until the budget is spent
 * and answers every dot it presented (vpos, hpos, colour, transistors
 * switched, four numbers each), the lamps, the half-step count and the
 * time the steps took, so the page can print the chip's own rate.
 */

import init, { SlowChip, fast_frame, geometry } from "./slow/slowppu.js";

const ready = init();
let chip = null;

self.onmessage = async (e) => {
  const { id, path } = e.data;
  try {
    await ready;
    if (path === "hello") {
      if (!chip) chip = new SlowChip();
      const fast = fast_frame();
      self.postMessage(
        {
          id,
          ok: true,
          answer: {
            size: Array.from(chip.size()),
            geometry: Array.from(geometry()),
            lampNames: Array.from(SlowChip.lamp_names()),
            lamps: Array.from(chip.lamps()),
            halfSteps: chip.half_steps(),
            fast,
          },
        },
        [fast.buffer],
      );
      return;
    }
    if (path === "run") {
      if (!chip) throw new Error("no chip; say hello first");
      const budget = Math.max(5, Math.min(200, e.data.budgetMs ?? 40));
      const parts = [];
      let steps = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < budget) {
        parts.push(chip.run(256));
        steps += 256;
      }
      const ms = performance.now() - t0;
      let n = 0;
      for (const p of parts) n += p.length;
      const dots = new Uint32Array(n);
      let at = 0;
      for (const p of parts) {
        dots.set(p, at);
        at += p.length;
      }
      self.postMessage(
        { id, ok: true, answer: { dots, steps, ms, lamps: Array.from(chip.lamps()), halfSteps: chip.half_steps() } },
        [dots.buffer],
      );
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
