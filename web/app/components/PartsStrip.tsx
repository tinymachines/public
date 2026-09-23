"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { delocalize } from "@/lib/lang";
import type { Section } from "@/lib/nav";

/**
 * The section's parts, as a strip under the bar on every page inside it:
 * the second level the panel no longer carries (lib/nav.ts sections() says
 * why and what is on it). The workbench pages carry their own strip of the
 * page's sections in the same shape (SectionStrip.tsx); this one is the
 * section's, on the reading pages, and the two never share a page.
 *
 * A client component only because it needs the pathname. The sections
 * arrive from the server derived and localized, and the strip picks the one
 * whose landing is a prefix of the path (compared unlocalized, so a
 * Japanese page is in its section too). The page you are on is marked
 * `page`; the part you are under (a document of the notebook, the signal's
 * bench) marks its part `location`, so a reader always sees where they are
 * in the section. Nothing renders outside a section.
 */
export function PartsStrip({ sections, label = "Parts of this section" }: { sections: Section[]; label?: string }) {
  const raw = usePathname() ?? "/";
  const { path } = delocalize(raw);
  const section = sections.find((s) => path === s.when || path.startsWith(s.when + "/"));
  const nav = useRef<HTMLElement>(null);
  // On a phone the strip is wider than the screen and scrolls sideways; the
  // part you are on is brought into the middle on arrival, so the strip
  // says where you are without a swipe (the chips page opened with its own
  // name half off the right edge, 2026-09-23). Sideways only: the page's
  // own scroll is not touched.
  useEffect(() => {
    const el = nav.current;
    const cur = el?.querySelector<HTMLElement>("[aria-current]");
    if (!el || !cur) return;
    el.scrollLeft = Math.max(0, cur.offsetLeft - (el.clientWidth - cur.offsetWidth) / 2);
  }, [raw]);
  if (!section) return null;
  const current = (href: string): "page" | "location" | undefined => {
    const { path: h } = delocalize(href);
    if (h === path) return "page";
    // Under a part, but never under the landing: every page is under that.
    if (h !== section.when && path.startsWith(h + "/")) return "location";
    return undefined;
  };
  return (
    <nav ref={nav} className="wb-strip parts-strip" aria-label={label} data-parts-strip={section.when}>
      {section.items.map((it) => {
        const cur = current(it.href);
        // Anything this build does not prerender, and every module page,
        // gets a plain anchor: the same rule the menu follows.
        return it.prerendered === false || it.hard ? (
          <a key={it.href} href={it.href.startsWith("/api") ? `${it.href}/` : it.href} aria-current={cur}>{it.label}</a>
        ) : (
          <Link key={it.href} href={it.href} aria-current={cur}>{it.label}</Link>
        );
      })}
    </nav>
  );
}
