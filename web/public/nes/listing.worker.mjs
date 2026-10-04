/**
 * The listing's worker: the open recording's cartridge and its flow
 * report in, and out come the listing (FORMAT.md in wasm/listing), the
 * same rendered with addresses and bytes, and the game model its marks
 * describe. The cartridge never leaves this browser.
 *
 *   main -> here   { id, rom, report }   (report: the flow report's JSON text)
 *   here -> main   { id, ok: true, answer: { src, rendered, model } } | { id, ok: false, error }
 *
 * And a lesson built in the page, from its parts (wasm/listing/src/
 * lesson.rs, the same code lessons/build.py runs):
 *
 *   main -> here   { id, lesson: { prg, chr, board: { mirroring, prg, org, chr } } }
 *   here -> main   { id, ok: true, answer: { built, rom } } | { id, ok: false, error }
 *                  (built: the JSON of the listing, its digest and counts; rom: the iNES file)
 */

import init, { listing_assemble, listing_from_rom_and_run, listing_lesson, listing_model, listing_render } from "./listing/listing.js";

const ready = init();

self.onmessage = async (e) => {
  const { id, rom, report, lesson } = e.data;
  try {
    await ready;
    if (lesson) {
      const b = lesson.board;
      const built = listing_lesson(lesson.prg, lesson.chr, b.mirroring, b.prg, b.org, b.chr);
      const image = listing_assemble(JSON.parse(built).src);
      self.postMessage({ id, ok: true, answer: { built, rom: image.buffer } }, [image.buffer]);
      return;
    }
    const src = listing_from_rom_and_run(new Uint8Array(rom), report);
    const rendered = listing_render(src);
    const model = listing_model(src);
    self.postMessage({ id, ok: true, answer: { src, rendered, model } });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
