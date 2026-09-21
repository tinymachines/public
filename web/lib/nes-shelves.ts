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
export type ShelfDoc = {
  route: string;
  title: string;
  code: string | null;
  /** The family the code is filed under ("N"), or null where there is no code. */
  letter: string | null;
  kind: string;
  description: string;
};

/** What a document IS: the notebook's second axis (pull-nesdocs.mjs KINDS). */
export type Kind = { key: string; name: string; what: string };

/** What a code's letter means (pull-nesdocs.mjs CODES). */
export type Code = { letter: string; what: string };
export type Shelf = {
  key: string;
  heading: string;
  intro: string;
  ja: { heading: string; intro: string };
  docs: ShelfDoc[];
};

type File = { groups: Shelf[]; cart: ShelfDoc[]; kinds: Kind[]; codes: Code[] };

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

/**
 * The documents by what they ARE, in the order the pull declares the kinds:
 * plans before reports, because that is the order they were written in, then
 * the things you follow, look up and keep.
 *
 * Every document appears exactly once. A document in two kinds would be a
 * second opinion about what it is, and the pull refuses to write one without
 * a kind at all.
 */
export function byKind(): { kind: Kind; docs: ShelfDoc[] }[] {
  const f = read();
  const all = [...f.groups.flatMap((g) => g.docs), ...f.cart];
  const out = f.kinds.map((kind) => ({ kind, docs: all.filter((d) => d.kind === kind.key) }));
  const placed = out.reduce((n, k) => n + k.docs.length, 0);
  if (placed !== all.length) {
    throw new Error(`docs/nes/shelves.json: ${all.length - placed} documents carry a kind nothing declares`);
  }
  return out;
}

/**
 * The key to the milestone codes, and the check that it is a key to
 * something. A page prints "A0 report" beside "M2 report", so it has to be
 * able to say what A and M are. The pull refuses a code whose letter it
 * cannot explain; this refuses the other direction, a key with no codes
 * under it, because a key that explains nothing would pass quietly.
 */
export function codes(): { code: Code; docs: ShelfDoc[] }[] {
  const f = read();
  const all = [...f.groups.flatMap((g) => g.docs), ...f.cart];
  if (!f.codes?.length) throw new Error("docs/nes/shelves.json carries no key to the milestone codes");
  const out = f.codes.map((code) => ({ code, docs: all.filter((d) => d.letter === code.letter) }));
  const filed = all.filter((d) => d.letter);
  if (!filed.length) throw new Error("docs/nes/shelves.json: no document carries a milestone code, so its key explains nothing");
  const placed = out.reduce((n, c) => n + c.docs.length, 0);
  if (placed !== filed.length) {
    throw new Error(`docs/nes/shelves.json: ${filed.length - placed} documents are filed under a letter the key does not name`);
  }
  return out;
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
