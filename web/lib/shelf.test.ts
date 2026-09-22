import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Every place the site asks for a .nes file also offers the reader's shelf.
 *
 * The shelf exists so that somebody who owns cartridges picks them by name
 * wherever a cartridge is asked for. "Wherever" is the part a hand list would
 * lose: a fifth bench added next month would take a file from the disk, look
 * finished, and quietly not offer the shelf. So the list is not written down.
 * It is found, by looking for the file inputs themselves.
 */

const APP = path.join(import.meta.dir, "..", "app");
const ASKS = /type="file"[^>]*accept="\.nes"|accept="\.nes"[^>]*type="file"/s;

// The manager puts cartridges ON the shelf; it is the one asker that must not
// offer to load one from it.
const THE_MANAGER = path.join("[lang]", "nes", "shelf", "Manager.tsx");

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.tsx$/.test(e.name) ? [p] : [];
  });
}

describe("the shelf reaches every cartridge input", () => {
  const askers = sources(APP).filter((f) => ASKS.test(fs.readFileSync(f, "utf8")));
  const rel = (f: string) => path.relative(APP, f);

  test("the scan finds the askers it is about", () => {
    // Four on the day this was written, and the manager. Fewer means the scan
    // stopped matching, and everything below would pass on nothing.
    expect(askers.map(rel)).toContain(THE_MANAGER);
    expect(askers.length).toBeGreaterThanOrEqual(5);
  });

  test("each of them renders the picker", () => {
    const without = askers
      .filter((f) => rel(f) !== THE_MANAGER)
      .filter((f) => !/<ShelfPicker\b/.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(without, "these take a .nes from the disk and do not offer the shelf: add <ShelfPicker lang={lang} onPick={...} />").toEqual([]);
  });
});
