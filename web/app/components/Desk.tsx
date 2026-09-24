"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SectionStrip } from "./SectionStrip";
import { clamp, initial, raise, type Layout, type Rect, type Win, type WinSpec } from "@/lib/desk";
import "./desk.css";

export type { WinSpec } from "@/lib/desk";

/**
 * A desk of windows: the create page's layout (owner, 2026-09-24: "full
 * screen, moveable windows and toolbars"). A window is dragged by its bar,
 * sized from its corner, brought forward by a press anywhere on it, filled
 * to the desk by a double press on its bar, and closed from its bar; the
 * tray above the desk opens a closed one again and puts every window back
 * where it started. The arrangement is kept in this browser.
 *
 * The mechanics are the 6502 lab's floating console's (6502/web/
 * solo-palette.js): a press becomes a drag only past a slop that is larger
 * for a finger, the window is clamped inside the desk and clamped again
 * when the desk changes size, and the desk keeps position and state and
 * reports them rather than the content doing it. What it adds is several
 * windows, their order, and a corner to size them by.
 *
 * On a phone there is no desk (owner, 2026-09-24): the same windows stand
 * one under another with their own headings, and the section strip maps
 * them, as the play page does. It is one tree either way, so crossing the
 * breakpoint moves nothing: a window's content is never unmounted, and a
 * closed window is hidden, not removed, because the screen's canvas is what
 * the console is attached to and a new canvas would stop the console.
 *
 * A window's name is its content's own heading (the h2 inside it), read
 * after mount, so a panel is named in one place and the tray follows it.
 */


export type DeskMode = "float" | "stack";

export interface DeskLabels {
  tray: string;
  tidy: string;
  tidyTitle: string;
  close: string;
  max: string;
  restore: string;
  size: string;
}

/** Where a desk floats its windows; narrower or shorter, they stack. */
const FLOAT = "(min-width: 64rem) and (min-height: 36rem)";
const VERSION = 1;

function load(key: string): Layout | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { v?: number; wins?: Layout };
    return v.v === VERSION && v.wins ? v.wins : null;
  } catch {
    return null;
  }
}

function save(key: string, wins: Layout) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: VERSION, wins }));
  } catch {
    /* private mode: the arrangement lasts the page */
  }
}

type Dim = { W: number; H: number };

interface Ctx {
  mode: DeskMode | null;
  dim: Dim | null;
  layout: Layout | null;
  titles: Record<string, string>;
  labels: DeskLabels;
  front: (id: string) => void;
  place: (id: string, r: Partial<Win>) => void;
  show: (id: string, open?: boolean) => void;
}

const DeskCtx = createContext<Ctx | null>(null);

/** The desk around a window: its mode, and the verbs a content uses (open another window, say). */
export function useDesk(): Pick<Ctx, "mode" | "show"> {
  const c = useContext(DeskCtx);
  if (!c) throw new Error("useDesk outside a Desk");
  return { mode: c.mode, show: c.show };
}

export function Desk({
  storageKey,
  wins,
  labels,
  className,
  more = [],
  children,
}: {
  storageKey: string;
  wins: WinSpec[];
  labels: DeskLabels;
  className?: string;
  /** The page's neighbours, at the tray's far end and after the strip's divider (SectionStrip's `more`). */
  more?: { href: string; label: string }[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<DeskMode | null>(null);
  const [dim, setDim] = useState<Dim | null>(null);
  // What the reader arranged, unclamped, so a desk that shrinks and grows
  // again gives every window back its place; null until the browser's copy
  // is read, and null again after Tidy.
  const [kept, setKept] = useState<{ read: boolean; wins: Layout | null }>({ read: false, wins: null });
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    const mq = matchMedia(FLOAT);
    const f = () => setMode(mq.matches ? "float" : "stack");
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  // The names and the stored arrangement come from the page and the
  // browser after a frame, as the strip's sections and the pad's placement do.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const t: Record<string, string> = {};
      ref.current?.querySelectorAll<HTMLElement>("[data-win]").forEach((w) => {
        const h = w.querySelector(".win-body h2");
        t[w.dataset.win!] = (h?.textContent ?? w.dataset.win!).trim();
      });
      setTitles(t);
      setKept({ read: true, wins: load(storageKey) });
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

  // The desk's size, while it floats; every window is clamped into it again
  // when it changes (a window shrunk, a full screen entered or left).
  useEffect(() => {
    const el = ref.current;
    if (!el || mode !== "float") return;
    const measure = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (W > 0 && H > 0) setDim((d) => (d && d.W === W && d.H === H ? d : { W, H }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  // A window the page has and the stored arrangement lacks starts where the
  // page puts it; one the page dropped is forgotten.
  const layout = useMemo<Layout | null>(() => {
    if (!dim || !kept.read) return null;
    const fresh = initial(wins, dim.W, dim.H);
    const out: Layout = {};
    for (const s of wins) out[s.id] = clamp(kept.wins?.[s.id] ?? fresh[s.id], dim.W, dim.H);
    return out;
  }, [dim, kept, wins]);

  useEffect(() => {
    if (!kept.read) return;
    if (kept.wins) save(storageKey, kept.wins);
    else {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* private mode */
      }
    }
  }, [kept, storageKey]);

  const front = useCallback(
    (id: string) => {
      if (!layout?.[id] || layout[id].z === Math.max(...Object.values(layout).map((w) => w.z))) return;
      setKept({ read: true, wins: raise(layout, id) });
    },
    [layout],
  );

  const place = useCallback(
    (id: string, r: Partial<Win>) => {
      if (!layout?.[id] || !dim) return;
      setKept({ read: true, wins: { ...layout, [id]: clamp({ ...layout[id], ...r }, dim.W, dim.H) } });
    },
    [layout, dim],
  );

  const show = useCallback(
    (id: string, open = true) => {
      if (!layout?.[id]) return;
      const next = { ...layout, [id]: { ...layout[id], open } };
      setKept({ read: true, wins: open ? raise(next, id) : next });
    },
    [layout],
  );

  const tidy = () => setKept({ read: true, wins: null });

  const ctx = useMemo<Ctx>(() => ({ mode, dim, layout, titles, labels, front, place, show }), [mode, dim, layout, titles, labels, front, place, show]);
  const topZ = layout ? Math.max(...Object.values(layout).map((w) => w.z)) : 0;

  return (
    <DeskCtx.Provider value={ctx}>
      {mode === "stack" ? <SectionStrip root=".desk" more={more} label={labels.tray} close={labels.close} /> : null}
      {mode === "float" && layout ? (
        <div className="desk-tray" role="toolbar" aria-label={labels.tray} data-desk-tray>
          {wins.map((s) => {
            const w = layout[s.id];
            return (
              <button
                key={s.id}
                type="button"
                className="desk-tab"
                aria-pressed={w.open}
                data-front={w.open && w.z === topZ ? "" : undefined}
                onClick={() => (w.open && w.z === topZ ? show(s.id, false) : show(s.id, true))}
                data-desk-tab={s.id}
              >
                {titles[s.id] ?? s.id}
              </button>
            );
          })}
          <button type="button" className="desk-tab desk-tidy" title={labels.tidyTitle} onClick={tidy} data-desk-tidy>
            {labels.tidy}
          </button>
          {more.map((m) => (
            <Link key={m.href} href={m.href} className="desk-tab desk-more" data-desk-more>
              {m.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div ref={ref} className={"desk" + (className ? " " + className : "")} data-mode={mode ?? undefined} data-ready={layout ? "" : undefined} data-desk>
        {children}
      </div>
    </DeskCtx.Provider>
  );
}

const IC = {
  close: "M6 6l12 12M18 6L6 18",
  max: "M5 5h14v14H5z",
  restore: "M8 8h11v11H8zM5 16V5h11",
};

/**
 * One window. Its content is rendered in every mode; only the frame around
 * it changes, by the desk's data-mode, so nothing inside ever remounts.
 */
export function Window({ id, children }: { id: string; children: ReactNode }) {
  const c = useContext(DeskCtx);
  if (!c) throw new Error("Window outside a Desk");
  const { mode, dim, layout, titles, labels, front, place, show } = c;
  const el = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ kind: "move" | "size"; px: number; py: number; r: Rect; slop: number; moved: boolean } | null>(null);
  const w = layout?.[id];
  const float = mode === "float" && w;
  const r: Rect | null = float ? (w.max && dim ? { x: 0, y: 0, w: dim.W, h: dim.H } : w) : null;

  const begin = (kind: "move" | "size", e: React.PointerEvent<HTMLElement>) => {
    // A window that fills the desk stays put until it is restored.
    if (!float || e.button !== 0 || !r || w.max) return;
    if (kind === "move" && (e.target as Element).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind, px: e.clientX, py: e.clientY, r: { ...r }, slop: e.pointerType === "mouse" ? 3 : 8, moved: false };
  };
  // While the pointer moves, the frame is moved by its style alone; the
  // desk learns the new place when it lets go. A drag re-renders nothing.
  const moveTo = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    const box = el.current;
    if (!g || !box || !dim) return;
    const dx = e.clientX - g.px;
    const dy = e.clientY - g.py;
    if (!g.moved && Math.hypot(dx, dy) <= g.slop) return;
    g.moved = true;
    box.dataset.dragging = "";
    const next = clamp(
      g.kind === "move" ? { ...g.r, x: g.r.x + dx, y: g.r.y + dy, z: 0, open: true, max: false } : { ...g.r, w: g.r.w + dx, h: g.r.h + dy, z: 0, open: true, max: false },
      dim.W,
      dim.H,
    );
    box.style.left = `${next.x}px`;
    box.style.top = `${next.y}px`;
    box.style.width = `${next.w}px`;
    box.style.height = `${next.h}px`;
  };
  const end = () => {
    const g = gesture.current;
    const box = el.current;
    gesture.current = null;
    if (!g || !box) return;
    delete box.dataset.dragging;
    if (!g.moved) return;
    place(id, { x: box.offsetLeft, y: box.offsetTop, w: box.offsetWidth, h: box.offsetHeight, max: false });
  };

  const title = titles[id] ?? "";
  const isFront = !!(float && layout && w.z === Math.max(...Object.values(layout).map((o) => o.z)));
  return (
    <div
      ref={el}
      className="win"
      data-win={id}
      data-open={w ? String(w.open) : undefined}
      data-max={w?.max ? "" : undefined}
      data-front={isFront ? "" : undefined}
      style={r ? { left: r.x, top: r.y, width: r.w, height: r.h, zIndex: w!.z } : undefined}
      onPointerDownCapture={() => float && front(id)}
    >
      <div className="win-bar" onPointerDown={(e) => begin("move", e)} onPointerMove={moveTo} onPointerUp={end} onPointerCancel={end} onDoubleClick={(e) => { if (!(e.target as Element).closest("button")) place(id, { max: !w?.max }); }} data-win-bar>
        <span className="win-title">{title}</span>
        <button type="button" className="win-btn" title={w?.max ? labels.restore : labels.max} aria-label={`${w?.max ? labels.restore : labels.max}: ${title}`} onClick={() => place(id, { max: !w?.max })} data-win-max>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={w?.max ? IC.restore : IC.max} /></svg>
        </button>
        <button type="button" className="win-btn" title={labels.close} aria-label={`${labels.close}: ${title}`} onClick={() => show(id, false)} data-win-close>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={IC.close} /></svg>
        </button>
      </div>
      <div className="win-body">{children}</div>
      <div className="win-grip" title={labels.size} aria-hidden="true" onPointerDown={(e) => begin("size", e)} onPointerMove={moveTo} onPointerUp={end} onPointerCancel={end} data-win-grip />
    </div>
  );
}
