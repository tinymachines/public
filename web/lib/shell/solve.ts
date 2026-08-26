import { GRID, type Poly, type Rect, area, ceilTo, floorTo, lint, octagon, rect, snap } from "./geom";

/**
 * The layout solver: `solve(W, H, seed)` gives the whole shell for one
 * viewport, in units, and nothing draws until it has.
 *
 * It follows notes/console-shell/ (the handoff pack) section by section, in
 * the pack's terms: a chamfered-octagon mask sized to the short side, flex
 * zones that take what the ratio leaves over, controls docked into the zones
 * by priority, and deterministic 45-degree facets absorbing the rest. Where
 * this console differs from the pack's assumed machine the difference is
 * filed in ISSUES.md there, and the code says which issue at the line.
 *
 * Pure. Same (W, H, seed) in, same object out, byte for byte; the tests hash
 * it to hold that. Nothing in here reads the DOM or the clock.
 */

/** The frame is 256 units wide, always: 1u = W/256 px. */
export const FRAME_U = 256;

export interface SolveOptions {
  /** Native screen edge in px. This console: 16 tiles of 8px (ISSUES #1). */
  native?: number;
  /** What game.js subtracts from its box before choosing a scale. */
  inset?: number;
  /** game.js's own cap on the integer scale. */
  maxScale?: number;
  /** Minimum touch target, px at device scale (pack, geometry section 8). */
  touchPx?: number;
}

export type ZoneId = "header" | "deck" | "wingL" | "wingR";
export type ControlId =
  | "dpad" | "ab" | "pills" | "power" | "coin" | "speaker" | "shelf" | "quick" | "rail" | "marquee" | "credits";

export interface Dock {
  id: ControlId;
  zone: ZoneId | "ghost";
  /** Bounding box, units, frame coordinates. Local origin for the part is its centre. */
  box: Rect;
  /** "stack" where a wing was too narrow for the part's row form. */
  variant?: "row" | "stack";
  /** Overlaid on the bezel at reduced opacity: only in the 1:1 band. */
  ghost?: boolean;
}

export interface Facet {
  poly: Poly;
  family: "bezel" | "fill";
  tone: "lit" | "shade";
}

export interface Solved {
  W: number;
  H: number;
  /** px per unit */
  ppu: number;
  /** frame height in units (not grid-snapped: it is the viewport's) */
  Hu: number;
  /** the grid-snapped height the shell draws within */
  Hg: number;
  portrait: boolean;
  /** 1:1 within 10 percent: zones collapse and controls ghost over the bezel */
  square: boolean;
  m: number;
  S: number;
  c: number;
  /** integer scale of the native screen */
  k: number;
  /** the native screen's px edge after scaling */
  screenPx: number;
  /** what the mask element must be, px, for game.js to choose the same k */
  boxPx: number;
  /** below the console's floor: k would be 0, held at 1 and reported */
  cramped: boolean;
  mask: { x: number; y: number; poly: Poly };
  block: Rect;
  zones: Partial<Record<ZoneId, Rect>>;
  docks: Dock[];
  facets: Facet[];
  /** the touch floor in units, after grid rounding */
  touchU: number;
  seed: number;
  /** the sheet footer: every parameter that produced this */
  params: string;
}

const DEF: Required<SolveOptions> = { native: 128, inset: 18, maxScale: 6, touchPx: 88 };

/**
 * Part sizes in units at a 240u mask, pack 03-COMPONENTS.md, rounded onto
 * the grid (ISSUES #3). They scale with the mask, not the frame (ISSUES #4):
 * the pack's sizes fit a portrait deck and are wider than a landscape wing.
 */
export const PART = {
  dpad: { w: 24, h: 24 },
  ab: { w: 40, h: 24 },        // two 16u octagons, staggered
  pills: { w: 104, h: 16 },    // two 48x16 pills, 8 apart
  pillsStack: { w: 48, h: 40 },
  power: { w: 112, h: 24 },    // rocker 56, reset 32, led 8, gaps
  powerStack: { w: 56, h: 56 },
  coin: { w: 64, h: 56 },      // acceptor plate + 2-digit counter
  speaker: { w: 48, h: 24 },
  shelf: { w: 0, h: 40 },      // width is the zone's
  shelfStack: { w: 48, h: 0 }, // height is the zone's
  quick: { w: 120, h: 24 },
  quickStack: { w: 56, h: 56 },
  rail: { w: 64, h: 8 },
  credits: { w: 40, h: 16 },
  marquee: { w: 0, h: 16 },
} as const;

export function solve(W: number, H: number, seed = 0, opts: SolveOptions = {}): Solved {
  const o = { ...DEF, ...opts };
  const ppu = W / FRAME_U;
  const Hu = H / ppu;
  const Hg = floorTo(Hu);
  const portrait = Hu > FRAME_U;
  const square = Math.abs(W / H - 1) <= 0.1;
  const short = Math.min(FRAME_U, Hu);

  // Pack, geometry 2: m = 4 percent of the short side, on the grid; the
  // mask is the short side less two margins, its chamfer a ninth of that.
  const m = Math.max(GRID, snap(0.04 * short));
  // S on a 16u step so the centring offset (short - S) / 2 lands on the grid.
  const S = Math.max(16, floorTo(short - 2 * m, 16));
  const c = Math.max(GRID, snap(S / 9));
  const touchU = ceilTo(o.touchPx / ppu);

  // Mask position. Portrait: biased to the top, gap m (under the header when
  // there is one). Landscape: centred vertically on the grid.
  const headerH = 24;
  const deckMin = Math.max(PART.dpad.h, touchU) + 2 * GRID;
  const header = portrait && Hg - (S + 2 * m) >= headerH + deckMin;
  const mx = (FRAME_U - S) / 2;
  const my = portrait ? (header ? headerH : 0) + m : floorTo((Hg - S) / 2);
  const maskPoly = octagon(mx, my, S, c);
  const block = rect(mx - m, my - m, S + 2 * m, S + 2 * m);

  // The integer scale, in px. Two ceilings besides game.js's own cap: the
  // screen must clear the inset game.js subtracts, and the whole native
  // square must sit inside the chamfer (a centred square of edge a fits an
  // octagon of edge S and chamfer c iff a <= S - c). ISSUES #1: the window
  // that is guaranteed visible is the entire screen, 128 of 128.
  const Spx = S * ppu;
  const cpx = c * ppu;
  let k = Math.min(o.maxScale, Math.floor((Spx - o.inset) / o.native), Math.floor((Spx - cpx) / o.native));
  const cramped = k < 1;
  if (cramped) k = 1;
  const screenPx = k * o.native;
  const boxPx = screenPx + o.inset;

  // Zones.
  const zones: Partial<Record<ZoneId, Rect>> = {};
  if (!square) {
    if (portrait) {
      if (header) zones.header = rect(0, 0, FRAME_U, headerH);
      const top = my + S + m;
      if (Hg - top >= GRID) zones.deck = rect(0, top, FRAME_U, Hg - top);
    } else {
      const wl = block.x;
      const wr = FRAME_U - (block.x + block.w);
      if (wl >= 2 * GRID) zones.wingL = rect(0, 0, wl, Hg);
      if (wr >= 2 * GRID) zones.wingR = rect(block.x + block.w, 0, wr, Hg);
    }
  }

  const docks: Dock[] = [];
  const rows: Rect[] = []; // occupied bands, for the fill facets
  const ps = Math.min(1, Math.max(0.5, S / 240));
  const scaled = (v: number) => (v === 0 ? 0 : Math.max(GRID, snap(v * ps)));
  const sized = (id: keyof typeof PART, floor = false) => {
    const p = { w: scaled(PART[id].w), h: scaled(PART[id].h) };
    // The touch floor, and for A/B a 32u floor besides: each key is half the
    // box and an octagon needs 16u to carry a chamfer on the half module.
    const lo = id === "ab" ? Math.max(touchU, 32) : touchU;
    return floor ? { w: Math.max(p.w, lo), h: Math.max(p.h, lo) } : p;
  };

  if (zones.header) {
    const z = zones.header;
    const cr = sized("credits");
    const rl = sized("rail");
    const x0 = m, x1 = FRAME_U - m;
    docks.push({ id: "credits", zone: "header", box: rect(x1 - cr.w, (z.h - cr.h) / 2, cr.w, cr.h) });
    docks.push({ id: "rail", zone: "header", box: rect(x1 - cr.w - GRID - rl.w, (z.h - rl.h) / 2, rl.w, rl.h) });
    const mw = x1 - cr.w - GRID - rl.w - GRID - x0;
    if (mw >= 32) docks.push({ id: "marquee", zone: "header", box: rect(x0, (z.h - PART.marquee.h) / 2, floorTo(mw), PART.marquee.h) });
    rows.push(rect(z.x, z.y, z.w, z.h)); // the whole strip is a band: only its side gaps facet
  }

  if (zones.deck) {
    // Pack, geometry 6, deck order: movement, A/B, select/start, coin and
    // power, speaker, shelf lip. Built as rows, dropped from the bottom.
    const z = zones.deck;
    const x0 = m, x1 = FRAME_U - m, iw = x1 - x0;
    const dp = sized("dpad", true), ab = sized("ab", true), pl = sized("pills"), pw = sized("power"), cn = sized("coin"), sp = sized("speaker");
    type Item = { id: ControlId; w: number; h: number; pri: number };
    const rowA: Item[] = [{ id: "dpad", ...dp, pri: 1 }, { id: "ab", ...ab, pri: 2 }];
    const rowB: Item[] = [];
    const pillsInA = dp.w + GRID + pl.w + GRID + ab.w <= iw;
    if (pillsInA) rowA.splice(1, 0, { id: "pills", ...pl, pri: 3 });
    else rowB.push({ id: "pills", ...pl, pri: 3 });
    rowB.push({ id: "coin", ...cn, pri: 4 }, { id: "power", ...pw, pri: 4 }, { id: "speaker", ...sp, pri: 5 });
    const rowC: Item[] = [{ id: "shelf", w: iw, h: PART.shelf.h, pri: 6 }];
    const plan = [rowA, rowB, rowC];
    // A row wider than the zone wraps: its lowest priority moves to a new
    // row after it, and the height check below decides whether that row lives.
    const width = (r: Item[]) => r.reduce((a, it) => a + it.w, 0) + GRID * Math.max(0, r.length - 1);
    for (let i = 0; i < plan.length; i++) {
      while (plan[i].length > 1 && width(plan[i]) > iw) {
        const worst = plan[i].reduce((a, b) => (b.pri >= a.pri ? b : a));
        plan[i].splice(plan[i].indexOf(worst), 1);
        plan.splice(i + 1, 0, [worst]);
      }
    }
    // Drop, lowest priority first, until the rows fit the zone.
    const rowH = (r: Item[]) => (r.length ? Math.max(...r.map((i) => i.h)) : 0);
    const total = () => plan.filter((r) => r.length).reduce((a, r) => a + rowH(r) + GRID, GRID);
    while (total() > z.h) {
      const all = plan.flat();
      if (!all.length) break;
      const worst = all.reduce((a, b) => (b.pri >= a.pri ? b : a));
      for (const r of plan) { const i = r.indexOf(worst); if (i >= 0) r.splice(i, 1); }
    }
    // Space out along the zone axis when roomy.
    const live = plan.filter((r) => r.length);
    const used = live.reduce((a, r) => a + rowH(r), 0);
    const gap = live.length ? floorTo((z.h - used) / (live.length + 1)) : 0;
    let y = z.y + gap;
    for (const r of live) {
      const h = rowH(r);
      // Widths, then positions: first item left, last right, middle centred.
      const place = (it: Item, x: number) => {
        docks.push({ id: it.id, zone: "deck", box: rect(x, y + floorTo((h - it.h) / 2), it.w, it.h) });
      };
      if (r.length === 1) place(r[0], x0 + floorTo((iw - r[0].w) / 2));
      else {
        // Coin and power sit together as one strip; everything else spreads.
        const ws = r.reduce((a, it) => a + it.w, 0);
        const free = iw - ws;
        const step = floorTo(free / (r.length - 1));
        let x = x0;
        r.forEach((it, i) => {
          place(it, i === r.length - 1 ? x1 - it.w : x);
          x += it.w + step;
        });
      }
      rows.push(rect(z.x, y, z.w, h));
      y += h + gap;
    }
  }

  const wing = (zone: "wingL" | "wingR", z: Rect, list: ControlId[]) => {
    // Pack, geometry 6: stacked in priority order, centred across the wing,
    // dropped from the bottom, spaced out when roomy.
    // A narrow wing gives its whole width to the parts; a roomy one keeps a
    // grid step of shell either side.
    const iw = z.w <= 6 * GRID ? z.w : z.w - 2 * GRID;
    const items: { id: ControlId; w: number; h: number; variant?: "row" | "stack" }[] = [];
    for (const id of list) {
      let s: { w: number; h: number }, variant: "row" | "stack" | undefined;
      if (id === "dpad" || id === "ab") s = sized(id, true);
      else if (id === "power" || id === "pills" || id === "quick") {
        s = sized(id);
        if (s.w > iw) { s = sized(`${id}Stack`); variant = "stack"; }
      } else if (id === "shelf") { s = { w: sized("shelfStack").w, h: 0 }; variant = "stack"; }
      else s = sized(id);
      if (s.w > iw) continue;
      items.push({ id, ...s, variant });
    }
    const fixed = () => items.filter((i) => i.id !== "shelf").reduce((a, i) => a + i.h + GRID, GRID);
    while (fixed() > z.h && items.length) items.pop();
    // The cartridge bay takes what is left, at least two carts tall.
    const bay = items.find((i) => i.id === "shelf");
    if (bay) {
      const left = floorTo(z.h - fixed() - GRID);
      if (left < 2 * scaled(40) + GRID) items.splice(items.indexOf(bay), 1);
      else bay.h = left;
    }
    const used = items.reduce((a, i) => a + i.h, 0);
    const gap = items.length ? floorTo((z.h - used) / (items.length + 1)) : 0;
    let y = z.y + gap;
    for (const it of items) {
      const x = z.x + floorTo((z.w - it.w) / 2);
      docks.push({ id: it.id, zone, box: rect(x, y, it.w, it.h), variant: it.variant });
      rows.push(rect(z.x, y, z.w, it.h));
      y += it.h + gap;
    }
  };
  if (zones.wingL) wing("wingL", zones.wingL, ["dpad", "coin", "power", "shelf"]);
  if (zones.wingR) wing("wingR", zones.wingR, ["ab", "pills", "quick", "rail", "speaker"]);

  // The one overlay case the pack allows: ghost octagons on the bezel
  // corners, in the 1:1 band and wherever else the wings came out too narrow
  // for movement (4:3 on a small screen is squarish enough to count).
  if (!cramped) {
    const dp = sized("dpad", true), ab = sized("ab", true);
    const bx = block.x, by = block.y, bw = block.w;
    if (!docks.some((d) => d.id === "dpad")) docks.push({ id: "dpad", zone: "ghost", ghost: true, box: rect(bx, by + bw - dp.h, dp.w, dp.h) });
    if (!docks.some((d) => d.id === "ab")) docks.push({ id: "ab", zone: "ghost", ghost: true, box: rect(bx + bw - ab.w, by + bw - ab.h, ab.w, ab.h) });
  }
  if (square) {
    const bx = block.x, by = block.y, bw = block.w;
    if (!docks.some((d) => d.id === "rail")) docks.push({ id: "rail", zone: "ghost", ghost: true, box: rect(bx + floorTo((bw - PART.rail.w) / 2), by, PART.rail.w, PART.rail.h) });
  }

  // Facets. Bezel family: the block less the octagon, cut by the 45-degree
  // lines the chamfers already are, which gives four corner pieces and four
  // side slabs. Fill family: every zone slab no control occupies, sliced.
  const facets: Facet[] = [];
  const bx = block.x, by = block.y, bw = block.w;
  const x0 = mx, y0 = my, x1 = mx + S, y1 = my + S;
  facets.push(
    { family: "bezel", tone: "lit", poly: [[bx, by], [x0 + c, by], [x0 + c, y0], [x0, y0 + c], [bx, y0 + c]] },
    { family: "bezel", tone: "lit", poly: [[x1 - c, by], [bx + bw, by], [bx + bw, y0 + c], [x1, y0 + c], [x1 - c, y0]] },
    { family: "bezel", tone: "shade", poly: [[bx + bw, y1 - c], [bx + bw, by + bw], [x1 - c, by + bw], [x1 - c, y1], [x1, y1 - c]] },
    { family: "bezel", tone: "shade", poly: [[bx, y1 - c], [x0, y1 - c], [x0 + c, y1], [x0 + c, by + bw], [bx, by + bw]] },
    { family: "bezel", tone: "lit", poly: [[x0 + c, by], [x1 - c, by], [x1 - c, y0], [x0 + c, y0]] },
    { family: "bezel", tone: "lit", poly: [[bx, y0 + c], [x0, y0 + c], [x0, y1 - c], [bx, y1 - c]] },
    { family: "bezel", tone: "shade", poly: [[x1, y0 + c], [bx + bw, y0 + c], [bx + bw, y1 - c], [x1, y1 - c]] },
    { family: "bezel", tone: "shade", poly: [[x0 + c, y1], [x1 - c, y1], [x1 - c, by + bw], [x0 + c, by + bw]] },
  );
  for (const z of Object.values(zones) as Rect[]) {
    // Horizontal slabs between the occupied bands, then the side gaps beside
    // each band's controls.
    const bands = rows.filter((r) => r.x === z.x && r.w === z.w && r.y >= z.y && r.y + r.h <= z.y + z.h).sort((a, b) => a.y - b.y);
    let y = z.y;
    for (const b of [...bands, rect(z.x, z.y + z.h, z.w, 0)]) {
      if (b.y - y >= GRID) facets.push(...sliceSlab(rect(z.x, y, z.w, b.y - y), seed));
      y = b.y + b.h;
    }
    for (const b of bands) {
      const inBand = docks.filter((d) => d.zone !== "ghost" && d.box.y >= b.y && d.box.y + d.box.h <= b.y + b.h && d.box.x >= z.x && d.box.x + d.box.w <= z.x + z.w)
        .sort((a, c2) => a.box.x - c2.box.x);
      let x = z.x;
      for (const d of [...inBand.map((d) => d.box), rect(z.x + z.w, b.y, 0, b.h)]) {
        if (d.x - x >= GRID) facets.push(...sliceSlab(rect(x, b.y, d.x - x, b.h), seed));
        x = d.x + d.w;
      }
    }
  }

  const params = `${W}x${H}px ppu=${+ppu.toFixed(4)} m=${m}u S=${S}u c=${c}u k=${k} screen=${screenPx}px seed=${seed}` +
    (portrait ? " portrait" : " landscape") + (square ? " square" : "") + (header ? " header" : "") + (cramped ? " cramped" : "");

  return { W, H, ppu, Hu, Hg, portrait, square, m, S, c, k, screenPx, boxPx, cramped, mask: { x: mx, y: my, poly: maskPoly }, block, zones, docks, facets, touchU, seed, params };
}

/**
 * Pack, geometry 7, step 3: a slab is cut with alternating 45-degree lines
 * on the grid, one every 48u along its long axis, the phase set by the seed
 * so two shells with different seeds facet differently and one seed always
 * facets the same. Tones alternate. Thin slabs (under 16u across) are one
 * facet; a cut is skipped where its foot would leave the slab.
 */
export function sliceSlab(r: Rect, seed: number): Facet[] {
  const out: Facet[] = [];
  const horizontal = r.w >= r.h;
  const L = horizontal ? r.w : r.h;   // long axis
  const T = horizontal ? r.h : r.w;   // thickness
  const PITCH = 48;
  const phase = (Math.abs(seed | 0) % 6) * GRID;
  if (T < 2 * GRID || L < PITCH + T) {
    out.push({ family: "fill", tone: "lit", poly: [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]] });
    return out;
  }
  // Cut positions along the long axis, as (start, end) pairs at the two
  // faces: a "\" cut runs from p on the near face to p + T on the far face,
  // a "/" cut from p + T to p.
  const cuts: [number, number][] = [[0, 0]];
  let i = 0;
  for (let p = phase + PITCH; p + T <= L; p += PITCH, i++) cuts.push(i % 2 === 0 ? [p, p + T] : [p + T, p]);
  cuts.push([L, L]);
  for (let j = 0; j + 1 < cuts.length; j++) {
    const [a0, a1] = cuts[j], [b0, b1] = cuts[j + 1];
    const poly: [number, number][] = horizontal
      ? [[r.x + a0, r.y], [r.x + b0, r.y], [r.x + b1, r.y + r.h], [r.x + a1, r.y + r.h]]
      : [[r.x, r.y + a0], [r.x, r.y + b0], [r.x + r.w, r.y + b1], [r.x + r.w, r.y + a1]];
    // A degenerate first or last piece (cut exactly at the edge) is dropped.
    const dedup = poly.filter((p, k, arr) => k === 0 || p[0] !== arr[k - 1][0] || p[1] !== arr[k - 1][1]);
    if (dedup.length >= 3 && area(dedup) > 0) out.push({ family: "fill", tone: j % 2 === 0 ? "lit" : "shade", poly: dedup });
  }
  return out;
}

/** Every polygon the solver emitted, for the lint. */
export function polygons(s: Solved): Poly[] {
  return [s.mask.poly, ...s.facets.map((f) => f.poly)];
}

/** The lint over a solved shell: an empty list is a pass. */
export function lintSolved(s: Solved) {
  return polygons(s).flatMap((p) => lint(p));
}
