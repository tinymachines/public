/**
 * The 2A03's five voices, on a thread of their own: the engineers' fast
 * sound unit and their DACs (wasm/apuvoices, built by
 * scripts/build-playground-wasm.py into ./voices/, never committed: the
 * sound unit's tables are measured out of NC-SA die data).
 *
 *   main -> here   { id, path: 'write', reg, value }
 *                  { id, path: 'render', n, perSample, mute }
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 *
 * 'render' answers n samples of sound (each the pins' mean over
 * perSample CPU half-cycles, muted voices held at zero before the DAC)
 * and the five voices' codes for the same samples, voice by voice.
 */

import init, { Voices } from "./voices/apuvoices.js";

const ready = init();
let voices = null;

self.onmessage = async (e) => {
  const { id, path } = e.data;
  try {
    await ready;
    if (!voices) voices = new Voices();
    if (path === "write") {
      voices.write(e.data.reg, e.data.value);
      self.postMessage({ id, ok: true, answer: null });
      return;
    }
    if (path === "render") {
      const sound = voices.render(e.data.n, e.data.perSample, e.data.mute);
      const codes = voices.codes();
      self.postMessage({ id, ok: true, answer: { sound, codes, status: voices.status() } }, [sound.buffer, codes.buffer]);
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
