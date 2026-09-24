"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { clusters } from "@/lib/strip";

/**
 * The strip under the bar, in one shape for both of its uses: a section's
 * parts on a reading page (PartsStrip.tsx) and a page's own sections on a
 * workbench (SectionStrip.tsx).
 *
 * Clusters, not one run: the links arrive with a group, and a divider stands
 * wherever the group changes (the NES section is using it, its parts, and
 * reading about it; owner, 2026-09-24).
 *
 * It never scrolls sideways. When the row would not fit, it folds into one
 * button that names where you are and opens the same links as a list under
 * the strip (owner, same day: the strip's last parts were cut off at the
 * edge). Whether it fits is measured, not guessed from a breakpoint: a ghost
 * of the row, out of sight and out of the accessibility tree, is laid out at
 * its natural width and compared with the room the strip has, on every
 * resize. Until the script has measured, a phone's width folds and a wider
 * one does not (components.css section 28), so the first paint is almost
 * always the right one.
 */

export interface StripLink {
  href: string;
  label: string;
  group?: string;
  current?: "page" | "location";
  /** A plain anchor: a hash on this page, or a route the client router must not take. */
  plain?: boolean;
}

export function Strip({
  links,
  label,
  fold = "Parts",
  close = "Close",
  attrs,
  className,
}: {
  links: StripLink[];
  /** The nav's accessible name. */
  label: string;
  /** What the folded button says when nothing on the strip is current. */
  fold?: string;
  close?: string;
  /** data-* attributes the specs find the strip by. */
  attrs?: Record<string, string>;
  className?: string;
}) {
  const nav = useRef<HTMLElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const here = usePathname();

  // A route change closes the list, during render so it never paints open
  // over the page it just opened (the menu's rule, Menu.tsx).
  const [lastPath, setLastPath] = useState(here);
  if (lastPath !== here) {
    setLastPath(here);
    setOpen(false);
  }

  useLayoutEffect(() => {
    const el = nav.current;
    const g = ghost.current;
    if (!el || !g) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setFolded(g.scrollWidth > room + 0.5);
    };
    // An observer reports once on observing, after layout and before the
    // frame paints, so this is also the first measurement.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [links.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      nav.current?.querySelector<HTMLButtonElement>(".strip-fold")?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!nav.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const runs = clusters(links);
  const here1 = links.find((l) => l.current === "page") ?? links.find((l) => l.current);
  const link = (l: StripLink) =>
    l.plain ? (
      <a key={l.href} href={l.href} aria-current={l.current} onClick={() => setOpen(false)}>{l.label}</a>
    ) : (
      <Link key={l.href} href={l.href} aria-current={l.current}>{l.label}</Link>
    );

  return (
    <nav
      ref={nav}
      className={className ? `wb-strip ${className}` : "wb-strip"}
      aria-label={label}
      data-fold={folded === null ? undefined : folded ? "1" : "0"}
      data-open={open ? "" : undefined}
      {...attrs}
    >
      <div className="strip-row">
        {runs.map((run, i) => (
          <div className="strip-run" key={i}>
            {run.map((l) => link(l))}
          </div>
        ))}
      </div>
      {/* The row again, as spans, for measuring only. */}
      <div className="strip-row strip-ghost" ref={ghost} aria-hidden="true">
        {runs.map((run, i) => (
          <div className="strip-run" key={i}>
            {run.map((l) => <span key={l.href}>{l.label}</span>)}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="strip-fold"
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bars" aria-hidden="true"><i /><i /><i /></span>
        <span className="strip-here">{open ? close : (here1?.label ?? fold)}</span>
        <span className="strip-chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="strip-sheet" id={sheetId}>
          {runs.map((run, i) => (
            <div className="strip-sheet-run" key={i}>
              {run.map((l) => link(l))}
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
