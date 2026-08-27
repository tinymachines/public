import fs from "node:fs";
import { CHIP_SRC } from "./chip-src";
import path from "node:path";
import { explorerPages } from "./explorer";
import type { MenuGroup } from "./nav";

/**
 * The explorer's own menu, taken from the explorer's own menu.
 *
 * The 6502 site organises its eighteen pages into named clusters ("Start
 * here", "The chip, drawn", "Measured tables") with a short hand-written hint
 * per page, and that structure lives in one exported const in their
 * `site-menu.js`. Restating it here would be the ten-hand-copied-navs mistake
 * with extra steps, so this reads theirs instead, the same way `apidoc.ts`
 * reads their reference and `explorer.ts` reads their pages.
 *
 * Read as TEXT and evaluated, not imported: the module calls `renderMenu()` at
 * its top level, which touches `document`, so importing it needs a DOM this
 * build does not have. The MENU const itself is a pure literal (their own
 * comment requires that), so slicing it out and evaluating just the array is
 * safe, and everything about the shape is checked below before anything
 * ships. If their file changes form, this THROWS and the build stops, rather
 * than shipping a menu quietly missing a section.
 */

const SRC = path.join(CHIP_SRC, "web", "site-menu.js");

interface TheirItem {
  label: string;
  hint?: string;
  /** Their page slug ('' is index, i.e. the explorer itself). */
  page?: string;
  /** A section anchor on the index rather than a page of its own. */
  hash?: string;
  /** Their own external links (API, halfwave, halfphi, the archive). */
  href?: string;
  off?: boolean;
}

interface TheirGroup {
  title: string;
  items: TheirItem[];
}

function readTheirMenu(): TheirGroup[] {
  const js = fs.readFileSync(SRC, "utf8");
  // The array ends at the first `];` at column zero: inner arrays close
  // indented, so this cannot end early inside a group.
  const m = js.match(/export const MENU = (\[[\s\S]*?\n\]);/);
  if (!m) {
    throw new Error(
      "6502/web/site-menu.js: expected `export const MENU = [...];` and did not find it. " +
        "Their menu module changed shape; fix the extraction in lib/explorer-menu.ts.",
    );
  }
  // new Function rather than an import: build-time, on a literal this file
  // has just verified the shape of, from a tree this repository already
  // treats as source.
  return new Function(`return ${m[1]}`)() as TheirGroup[];
}

export function explorerMenu(): MenuGroup[] {
  const theirs = readTheirMenu();
  const real = new Set(explorerPages().map((p) => p.slug));
  const explorerRoutes = explorerPages().map((p) => `/6502/${p.slug}`);

  const groups: MenuGroup[] = [];
  for (const g of theirs) {
    const items = [];
    for (const it of g.items) {
      // Their external entries fall in two kinds, and only one is skipped.
      // Entries that stay on the tinymachines estate (their api/, the
      // halfwave subdomain, archive/) are pages of this site's own 6502
      // group already, and repeating them would put the same destination in
      // two groups of one panel. An entry that LEAVES the estate (halfphi on
      // GitHub) has no other home in this menu, so it keeps its place as the
      // plain external link it is; the menu audit found it was the one entry
      // of their twenty-six with no apex equivalent.
      if (it.off || it.href) {
        const href = it.href ?? "";
        const external =
          href.startsWith("https://") && !/https:\/\/[a-z0-9-]+\.tinymachines\.ai/.test(href);
        if (!external) continue;
        items.push({ href, label: it.label, hint: it.hint, prerendered: false });
        continue;
      }
      const slug = it.page === "" ? "explorer" : it.page;
      if (!slug) continue;
      if (!real.has(slug)) {
        throw new Error(
          `6502/web/site-menu.js names page "${slug}" and 6502/web has no such document. ` +
            "Either their menu or their tree changed alone; the two disagree.",
        );
      }
      const anchor = it.hash ? `#${it.hash}` : "";
      items.push({
        href: `/6502/${slug}${anchor}`,
        hard: true,
        label: it.label,
        hint: it.hint,
      });
    }
    // Shown on the explorer's own pages and nowhere else. On the 6502
    // landing, the console or the editor these eight clusters were a
    // directory of eighteen pages under a recipe card, which is the
    // pollution the owner named. Inside the explorer they are the map.
    if (items.length) groups.push({ title: g.title, when: "/6502", only: explorerRoutes, items });
  }

  // The checks that make the extraction trustworthy rather than hopeful. The
  // numbers are floors, not the current counts: their menu has six shipping
  // groups and twenty-odd internal entries today, and shrinking past this is
  // a change somebody should look at, not absorb.
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (groups.length < 5 || total < 15) {
    throw new Error(
      `site-menu.js extraction found ${groups.length} groups and ${total} items; ` +
        "expected at least 5 and 15. The menu shrank or the extraction broke.",
    );
  }
  return groups;
}

/**
 * The short name the explorer's own menu gives a page, for the workbench bar.
 *
 * The bar carried each document's <title> ("Primer: how the 6502 actually
 * works"), which is the page's claim, not its name, and truncated to
 * "PRIMER: HOW THE 6…" on a phone. The menu already names every page in a
 * word or two; the bar reads the same entry, so the two cannot disagree.
 * Undefined for a page the menu does not list, and the caller keeps the
 * title it had.
 */
export function explorerLabel(slug: string): string | undefined {
  const href = `/6502/${slug}`;
  for (const g of explorerMenu()) {
    for (const it of g.items) {
      if (it.href.replace(/#.*$/, "") === href) return it.label;
    }
  }
  return undefined;
}
