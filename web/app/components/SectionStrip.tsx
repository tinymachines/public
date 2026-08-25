"use client";

import { useEffect, useState } from "react";

/**
 * A strip of a page's sections, under the workbench bar.
 *
 * The Lab's tab row, applied to a page that reads top to bottom: the primer
 * is six questions and one scroll, the talk eight sections. Nothing here is
 * typed. On mount the strip reads the page's h2s, gives each an id it lacks,
 * and names it from the page's own words: the section's eyebrow where every
 * eyebrow on the page is distinct (the primer: "Question one", "Correction
 * one"), the heading itself where they repeat (the talk's "Written, not
 * measured" four times). A page with fewer than three sections gets no strip.
 *
 * Sticky under the bar, scrolling sideways with the same edge fade as the
 * Lab's strip, docking to the top edge in fullscreen (components.css, section
 * 28). The current section lights as the reader passes it.
 */

interface Sec { id: string; label: string; el: HTMLElement }

/** A label that fits a strip: whole words, an ellipsis where it stopped. */
const short = (s: string, max = 34) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max).replace(/\s+\S*$/, "");
  return (cut || s.slice(0, max)) + "\u2026";
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "section";

export function SectionStrip({ root = ".explorer-shell" }: { root?: string }) {
  const [secs, setSecs] = useState<Sec[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    // The first read happens after a frame rather than in the effect body:
    // a setState inside the body renders twice after paint (and the lint
    // rule says so). A frame is also the honest moment to read the page,
    // since the headings are the page's markup and the browser has finished
    // laying them out by then. Same shape as Launch.tsx.
    let io: IntersectionObserver | null = null;
    const frame = requestAnimationFrame(() => {
    const host = document.querySelector<HTMLElement>(root);
    if (!host) return;
    // One heading per <section>, and only headings that belong to a section:
    // the explorer's die stage names its panels with h2s too, and a strip of
    // sixteen panel names is not a map of the page.
    const seen = new Set<Element>();
    const heads = [...host.querySelectorAll<HTMLElement>("section h2")].filter((h) => {
      const sec = h.closest("section")!;
      // Top-level sections only: a section inside a section is a panel of
      // the page, not a part of it.
      if (sec.parentElement?.closest("section")) return false;
      if (seen.has(sec) || !h.textContent?.trim()) return false;
      seen.add(sec);
      return true;
    });
    if (heads.length < 3) return;

    const eyebrowOf = (h: HTMLElement) => {
      const sec = h.closest("section");
      const e = sec?.querySelector<HTMLElement>(".eyebrow") ?? (h.previousElementSibling as HTMLElement | null);
      const t = e?.classList.contains("eyebrow") ? e.textContent?.trim() ?? "" : "";
      return t;
    };
    const eyebrows = heads.map(eyebrowOf);
    const distinct = eyebrows.every(Boolean) && new Set(eyebrows).size === eyebrows.length;

    const used = new Set<string>();
    const list: Sec[] = heads.map((h, i) => {
      const sec = h.closest("section") as HTMLElement | null;
      let id = h.id || sec?.id || slug(h.textContent ?? "");
      while (used.has(id)) id += "-2";
      used.add(id);
      if (!h.id && !(sec && sec.id === id)) h.id = id;
      const label = short(distinct ? eyebrows[i] : h.textContent?.trim() ?? "");
      return { id, label, el: sec ?? h };
    });
    setSecs(list);

    // The current section: the last one whose top has passed the strip.
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrent((e.target as HTMLElement).dataset.stripId ?? null);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    for (const s of list) {
      s.el.dataset.stripId = s.id;
      io.observe(s.el);
    }
    });
    return () => {
      cancelAnimationFrame(frame);
      io?.disconnect();
    };
  }, [root]);

  if (!secs.length) return null;
  return (
    <nav className="wb-strip" aria-label="Sections">
      {secs.map((s) => (
        <a key={s.id} href={`#${s.id}`} aria-current={current === s.id ? "location" : undefined}>
          {s.label}
        </a>
      ))}
    </nav>
  );
}
