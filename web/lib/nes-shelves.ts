import fs from "node:fs";
import path from "node:path";
import type { Lang } from "./lang";
import { DOCS_DIR } from "./docs";

/**
 * The NES section's shelves: which notebook documents belong to which part
 * of the console, read from docs/nes/shelves.json.
 *
 * scripts/pull-nesdocs.mjs writes that file beside the documents it pulls,
 * from the one list that names each document's group, so /nes/chips, the
 * notebook's grouped index and the menu cannot disagree about where a
 * document lives. A build without it throws rather than rendering pages
 * with empty shelves, which would look like a section with nothing in it.
 */

/** `code` is the milestone label ("N3 report"), or null for a document without one. */
export type ShelfDoc = { route: string; title: string; code: string | null; description: string };
export type Shelf = {
  key: string;
  heading: string;
  intro: string;
  ja: { heading: string; intro: string };
  docs: ShelfDoc[];
};

type File = { groups: Shelf[]; cart: ShelfDoc[] };

let cache: File | null = null;

function read(): File {
  if (cache) return cache;
  const file = path.join(DOCS_DIR, "nes", "shelves.json");
  if (!fs.existsSync(file)) {
    throw new Error("docs/nes/shelves.json is missing: run bun scripts/pull-nesdocs.mjs (the build does)");
  }
  cache = JSON.parse(fs.readFileSync(file, "utf8")) as File;
  return cache;
}

/** One group, by key; throws on a key the pull does not write. */
export function shelf(key: string): Shelf {
  const g = read().groups.find((x) => x.key === key);
  if (!g) throw new Error(`docs/nes/shelves.json has no group "${key}"`);
  if (!g.docs.length) throw new Error(`the "${key}" shelf is empty`);
  return g;
}

/** Every group, in the order the pull writes them. */
export function allShelves(): Shelf[] {
  const gs = read().groups;
  if (!gs.length) throw new Error("docs/nes/shelves.json has no groups");
  return gs;
}

/** The calibration cart's documents. */
export function cartShelf(): ShelfDoc[] {
  const docs = read().cart;
  if (!docs.length) throw new Error("the cart shelf is empty");
  return docs;
}

export function shelfText(g: Shelf, lang: Lang): { heading: string; intro: string } {
  return lang === "ja" ? g.ja : { heading: g.heading, intro: g.intro };
}
