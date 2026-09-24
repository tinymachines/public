"use client";

import { useEffect, useState } from "react";
import { Strip } from "./Strip";

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
 * Sticky under the bar, docking to the top edge in fullscreen
 * (components.css, section 28), and drawn by Strip.tsx like the section's
 * strip on a reading page: too many sections for the width fold into one
 * button. The current section lights as the reader passes it.
 *
 * `more` is a page's neighbours, after a divider: Play's strip ends with
 * Create and Create's with Play, the two ways to use one console (owner,
 * 2026-09-24: the strip under Play had its three sections and no way to
 * Create).
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

export function SectionStrip({
  root = ".explorer-shell",
  more = [],
  label = "Sections",
  close = "Close",
}: {
  root?: string;
  more?: { href: string; label: string }[];
  label?: string;
  close?: string;
}) {
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
    <Strip
      label={label}
      fold={label}
      close={close}
      links={[
        ...secs.map((s) => ({ href: `#${s.id}`, label: s.label, group: "page", plain: true, current: current === s.id ? ("location" as const) : undefined })),
        ...more.map((m) => ({ href: m.href, label: m.label, group: "more" })),
      ]}
    />
  );
}
