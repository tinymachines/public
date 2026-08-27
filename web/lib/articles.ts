import fs from "node:fs";
import path from "node:path";

/**
 * The articles' table: data/articles.json, the chunks each tool page's
 * prose breaks into (heading, and the words the chunk starts on). Owner's
 * call, 2026-08-27: a place to keep track of the text blobs, which the
 * site's Articles section will grow out of.
 */
const FILE = path.join(process.cwd(), "..", "data", "articles.json");

export interface Chunk { heading: string; at: string }
interface Table { [slug: string]: { chunks: Chunk[] } | string }

let cache: Table | null = null;
function table(): Table {
  return (cache ??= JSON.parse(fs.readFileSync(FILE, "utf8")) as Table);
}

/** The chunks for a tool page, or none. */
export function chunksFor(slug: string): Chunk[] {
  const e = table()[slug];
  return typeof e === "object" && e ? e.chunks : [];
}

/** A heading's id: the words, lower-case, hyphenated. */
export const chunkId = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
