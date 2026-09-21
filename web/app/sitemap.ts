import type { MetadataRoute } from "next";
import { allPages } from "@/lib/docs";
import { explorerPages } from "@/lib/explorer";
import { articlePages } from "@/lib/article";
import { LANGS, localize } from "@/lib/lang";
import { abs } from "@/lib/seo";

/**
 * The sitemap, generated from the same sources the pages are.
 *
 * The static routes are the ones this tree has a page.tsx for and wants
 * found; the docs come from the tree lib/docs.ts walks, the explorer pages
 * from the list lib/explorer.ts builds them from. Nothing is typed twice.
 *
 * Not listed, and each for a reason:
 *   /admin, /style/zoo, /style/map
 *                      noindex pages; a sitemap entry would contradict it.
 *                      The map is about the site rather than part of it, and
 *                      it is linked from the style guide.
 *   /6502/manage         the editor. A tool with a token in it, not a page to
 *                        arrive at from a search
 *   /6502/builders/@x    the builder pages are rendered from the registry in
 *                        the browser, and listing them here would make the
 *                        build depend on a live service answering. They are
 *                        reachable from /6502/builders, which is listed.
 *   /api                 disallowed in robots
 *
 * Every entry carries both languages as alternates, the same pair the pages
 * themselves declare in hreflang.
 */

const STATIC = [
  "/",
  // The three doors: the site by what a visitor came to do (data/doors.json).
  "/watch",
  "/read",
  "/build",
  "/6502",
  "/6502/learn",
  "/6502/cart",
  "/6502/tools",
  "/6502/explorer",
  "/6502/reading",
  "/6502/lab",
  "/6502/games",
  "/6502/builders",
  "/6502/api",
  "/6502/archive",
  "/hotbits",
  "/hotbits/api",
  "/nes",
  "/nes/playground",
  "/nes/chips",
  "/nes/console",
  "/nes/signal",
  "/nes/signal/bench",
  "/nes/signal/composite",
  "/nes/bench",
  "/nes/cart",
  "/style",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    ...STATIC,
    ...allPages().map((p) => (p.slug.length ? `/docs/${p.slug.join("/")}` : "/docs")),
    ...explorerPages().map((p) => `/6502/${p.slug}`),
    // The companion articles: a tool's prose as a reading page (lib/article.ts).
    ...articlePages().map((p) => `/6502/${p.slug}/article`),
  ];
  const seen = new Set<string>();
  const out: MetadataRoute.Sitemap = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    const languages: Record<string, string> = {};
    for (const l of LANGS) languages[l] = abs(localize(l, path));
    for (const l of LANGS) {
      out.push({ url: abs(localize(l, path)), alternates: { languages } });
    }
  }
  return out;
}
