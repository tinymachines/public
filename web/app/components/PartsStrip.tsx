"use client";

import { usePathname } from "next/navigation";
import type { Section } from "@/lib/nav";
import { currentIn, sectionAt } from "@/lib/strip";
import { Strip } from "./Strip";

/**
 * The section's parts, as a strip under the bar on every page inside it:
 * the second level the panel no longer carries (lib/nav.ts sections() says
 * why and what is on it). The workbench pages carry their own strip of the
 * page's sections in the same shape (SectionStrip.tsx); this one is the
 * section's, on the reading pages, and the two never share a page.
 *
 * A client component only because it needs the pathname. The sections
 * arrive from the server derived and localized, and lib/strip.ts picks the
 * one this page is in and marks where it stands: the page you are on is
 * `page`, the part you are under (a document of the notebook, the signal's
 * bench) is `location`. Nothing renders outside a section. Strip.tsx draws
 * it: clusters with dividers, and one button instead of a row too wide for
 * the screen.
 */
export function PartsStrip({ sections, label = "Parts of this section", close = "Close" }: { sections: Section[]; label?: string; close?: string }) {
  const raw = usePathname() ?? "/";
  const section = sectionAt(sections, raw);
  if (!section) return null;
  return (
    <Strip
      label={label}
      fold={section.title}
      close={close}
      className="parts-strip"
      attrs={{ "data-parts-strip": section.when }}
      links={section.items.map((it) => ({
        // Anything this build does not prerender, and every module page,
        // gets a plain anchor: the same rule the menu follows.
        href: it.prerendered === false && it.href.startsWith("/api") ? `${it.href}/` : it.href,
        label: it.label,
        group: it.group,
        current: currentIn(section, raw, it.href),
        plain: it.prerendered === false || it.hard === true,
      }))}
    />
  );
}
