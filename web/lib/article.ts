import fs from "node:fs";
import { CHIP_SRC } from "./chip-src";
import path from "node:path";
import { explorerPages } from "./explorer";
import { PROSE_SECTION, chunkSection, foldSection, splitParagraphs, unescape } from "./prose";
import { chunksFor } from "./articles";

/**
 * The article: a tool page's prose sections, lifted out of the instrument.
 *
 * Every 6502 tool page carries its documentation under the instrument as
 * `section.bp-prose` blocks. On the tool page that prose sits below a
 * full-viewport instrument and, on the tracer, one of its paragraphs is
 * 20,661 characters long; measured 2026-08-27 (notes/pretext.md), nobody
 * reads it there. The companion page (/6502/<tool>/article) sets the same
 * sections in a reading column, justified through pretext in place
 * (components/Justify.tsx), with the rest of the instrument as a live
 * figure.
 *
 * The sections are kept as the markup they are, not reduced to text. The
 * first version of this reader took only the paragraphs and lost what the
 * sections also carry: across the seventeen tools, 147 divs, 26 buttons,
 * tables, figures, and 36 `[data-fact]` slots the tool's own script fills
 * with measured numbers (block's whole instrument lives inside one). Those
 * are the inline widgets the article is for. So the HTML goes through
 * whole, and this module changes exactly two things about it:
 *
 * - A paragraph longer than LONG whose markup is plain inline (links,
 *   emphasis, mono spans) is split at sentence ends into paragraphs of
 *   about TARGET characters (lib/prose.ts, the same rule the tool page
 *   itself now applies). The sentences are the author's; only the
 *   paragraph breaks are new, and lib/article.test.ts checks that the
 *   parts' text joined back is the original text.
 * - Links are rewritten to this site's paths, as lib/explorer.ts does.
 */

const SRC = path.join(CHIP_SRC, "web");

export type { Run, RunKind } from "./prose";
export { htmlOf, isPlainInline, plain, runsOf, splitRuns } from "./prose";

export interface Article {
  slug: string;
  title: string;
  description: string;
  /** The prose sections, as HTML, each still `section.wrap.sec.bp-prose`. */
  html: string;
  /** How many paragraph breaks the split added. */
  splits: number;
  /** Characters of text in the sections. */
  chars: number;
  /** `[data-fact]` slots carried through, for the page and the test. */
  slots: number;
  /** Chunk headings placed (data/articles.json). */
  chunks: number;
}

const slugs = () => new Set(explorerPages().map((p) => p.file.replace(/\.html$/, "")));

export function article(file: string, readOn?: string): Article {
  const html = fs.readFileSync(path.join(SRC, file), "utf8");
  const s = slugs();
  const sections: string[] = [];
  const specs = chunksFor(file.replace(/\.html$/, ""));
  const found = new Set<string>();
  let splits = 0;
  let chars = 0;
  let chunks = 0;
  for (const m of html.matchAll(PROSE_SECTION)) {
    // Scripts never ride along: the tool's script is booted once, by the
    // figure, from the runtime manifest.
    let sec = m[0].replace(/<script\b[\s\S]*?<\/script>/g, "");
    // The long plain paragraphs, split.
    const split = splitParagraphs(sec, specs);
    sec = split.html; splits += split.splits; chars += split.chars;
    for (const a of split.found) found.add(a);
    // The chunk headings, and, with a label, the folds: the same reading
    // rules as the tool page (owner's call, 2026-08-27, later: the same
    // treatment on the article).
    if (specs.length) {
      const c = chunkSection(sec, specs, readOn);
      sec = c.html; chunks += c.chunks;
    } else if (readOn) {
      sec = foldSection(sec, readOn).html;
    }
    // Links to the tool pages, one segment deeper here (lib/explorer.ts).
    // Both forms the tool pages use: "/block?b=x" and "block?b=x". From the
    // article, one segment deeper, the relative one would resolve under
    // /6502/<tool>/, where nothing answers.
    sec = sec.replace(/href="\/?([a-z0-9-]+)((?:\?[^"#]*)?(?:#[^"]*)?)"/g, (whole, slug: string, tail: string) =>
      s.has(slug) ? `href="/6502/${slug}${tail}"` : whole);
    sec = sec.replace(/href="\/"/g, 'href="/6502/explorer"');
    sections.push(sec);
  }
  if (!sections.length) throw new Error(`6502/web/${file}: no section.bp-prose; there is no article to lift`);
  const missing = specs.filter((c) => !found.has(c.at));
  if (missing.length) throw new Error(`6502/web/${file}: data/articles.json names chunk(s) not on the page: ${missing.map((c) => JSON.stringify(c.at)).join(", ")}`);
  const out = sections.join("\n");
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  return {
    slug: file.replace(/\.html$/, ""),
    title: titleMatch ? unescape(titleMatch[1].split(/[·|]/)[0].trim()) : file,
    description: descMatch ? unescape(descMatch[1]) : "",
    html: out,
    splits,
    chars,
    slots: (out.match(/data-fact=/g) ?? []).length,
    chunks,
  };
}

/** The tool pages that have an article: every one with a prose section. */
export function articlePages(): { slug: string; file: string }[] {
  return explorerPages().filter((p) => {
    const html = fs.readFileSync(path.join(SRC, p.file), "utf8");
    return /<section class="wrap sec bp-prose/.test(html);
  });
}
