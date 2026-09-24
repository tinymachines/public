/**
 * The desk's geometry (app/components/Desk.tsx): where windows start, how
 * they are kept inside the desk, and their order. Pure, so the rules have
 * unit tests of their own (desk.test.ts).
 */

export type Rect = { x: number; y: number; w: number; h: number };
export interface Win extends Rect {
  z: number;
  open: boolean;
  max: boolean;
}
export type Layout = Record<string, Win>;

/** A window: its id and where it starts, as fractions of the desk (x, y, w, h), and whether it starts open. */
export interface WinSpec {
  id: string;
  at: [number, number, number, number];
  open?: boolean;
}

export const GAP = 8;
export const MIN_W = 200;
export const MIN_H = 120;

/** The window inside the desk: no smaller than the minimum, no larger than the desk, never over an edge. */
export function clamp(r: Win, W: number, H: number): Win {
  const w = Math.round(Math.min(Math.max(r.w, MIN_W), W));
  const h = Math.round(Math.min(Math.max(r.h, MIN_H), H));
  const x = Math.round(Math.min(Math.max(r.x, 0), W - w));
  const y = Math.round(Math.min(Math.max(r.y, 0), H - h));
  return { ...r, x, y, w, h };
}

/** Where the page puts every window on a desk of this size, stacked in the order given. */
export function initial(specs: WinSpec[], W: number, H: number): Layout {
  const out: Layout = {};
  specs.forEach((s, i) => {
    const [fx, fy, fw, fh] = s.at;
    out[s.id] = clamp(
      { x: fx * W + GAP / 2, y: fy * H + GAP / 2, w: fw * W - GAP, h: fh * H - GAP, z: i + 1, open: s.open !== false, max: false },
      W,
      H,
    );
  });
  return out;
}

/** `id` on top, the rest in their order, renumbered from one so the order never climbs without end. */
export function raise(l: Layout, id: string): Layout {
  const order = Object.keys(l).sort((a, b) => l[a].z - l[b].z).filter((k) => k !== id).concat(id);
  const out: Layout = {};
  order.forEach((k, i) => (out[k] = { ...l[k], z: i + 1 }));
  return out;
}
