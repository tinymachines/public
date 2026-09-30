/**
 * The listing's worker: the open recording's cartridge and its flow
 * report in, and out come the listing (FORMAT.md in wasm/listing), the
 * same rendered with addresses and bytes, and the game model its marks
 * describe. The cartridge never leaves this browser.
 *
 *   main -> here   { id, rom, report }   (report: the flow report's JSON text)
 *   here -> main   { id, ok: true, answer: { src, rendered, model } } | { id, ok: false, error }
 */

import init, { listing_from_rom_and_run, listing_model, listing_render } from "./listing/listing.js";

const ready = init();

self.onmessage = async (e) => {
  const { id, rom, report } = e.data;
  try {
    await ready;
    const src = listing_from_rom_and_run(new Uint8Array(rom), report);
    const rendered = listing_render(src);
    const model = listing_model(src);
    self.postMessage({ id, ok: true, answer: { src, rendered, model } });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
