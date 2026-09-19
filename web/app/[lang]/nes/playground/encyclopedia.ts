import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "@/lib/docs";
import { slug } from "@/lib/rehype-headings.mjs";

/**
 * The encyclopedia's entries, read at build time from
 * docs/nes/encyclopedia.md: each entry's number and name from its
 * heading, and its "What it does." paragraph as written. The link to
 * each entry uses the site's own heading slug, so it lands where the
 * documents put the heading. The pictures are ours (Encyclopedia.tsx),
 * one per entry number; an entry the page has no picture for is shown
 * with its words alone, and a missing encyclopedia says so.
 */

export interface Entry {
  n: number;
  name: string;
  does: string;
  href: string;
}

export type Encyclopedia = { ok: true; entries: Entry[] } | { ok: false; reason: string };

export function encyclopedia(): Encyclopedia {
  const file = path.join(DOCS_DIR, "nes", "encyclopedia.md");
  if (!fs.existsSync(file)) return { ok: false, reason: "the encyclopedia is not in this build" };
  const md = fs.readFileSync(file, "utf8");
  const entries: Entry[] = [];
  const heads = [...md.matchAll(/^## (\d+)\. (.+)$/gm)];
  heads.forEach((h, i) => {
    const body = md.slice(h.index! + h[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined);
    const m = body.match(/\*\*What it does\.\*\*\s*([\s\S]*?)(?:\n\s*\n|$)/);
    entries.push({
      n: Number(h[1]),
      name: h[2].trim(),
      does: m ? m[1].replace(/\s+/g, " ").trim() : "",
      href: `/docs/nes/encyclopedia#${slug(h[0].replace(/^## /, ""))}`,
    });
  });
  if (entries.length < 3) return { ok: false, reason: `the encyclopedia has ${entries.length} numbered entries` };
  return { ok: true, entries };
}
