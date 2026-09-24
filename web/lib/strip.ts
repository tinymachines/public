import { delocalize } from "./lang";
import type { MenuItem, Section } from "./nav";

/**
 * Where a path stands among the sections: which section it is inside, and
 * which of that section's parts it is on or under. Asked by the strip under
 * the bar and by the menu panel, which lists the same section first, so the
 * two cannot disagree about where the reader is. Paths are compared
 * unlocalized, so a Japanese page is in its section too.
 */

export function sectionAt(sections: Section[], raw: string): Section | undefined {
  const { path } = delocalize(raw);
  return sections.find((s) => path === s.when || path.startsWith(s.when + "/"));
}

/** `page` on the part itself; `location` under it (never under the landing: every page is). */
export function currentIn(section: Section, raw: string, href: string): "page" | "location" | undefined {
  const { path } = delocalize(raw);
  const { path: h } = delocalize(href);
  if (h === path) return "page";
  if (h !== section.when && path.startsWith(h + "/")) return "location";
  return undefined;
}

/** A section's items as its clusters, in order: a new cluster wherever the group changes. */
export function clusters<T extends Pick<MenuItem, "group">>(items: T[]): T[][] {
  const out: T[][] = [];
  items.forEach((it, i) => {
    if (i === 0 || it.group !== items[i - 1].group) out.push([]);
    out[out.length - 1].push(it);
  });
  return out;
}
