/**
 * The shell's geometry vocabulary, in units.
 *
 * One unit is 1/256 of the frame's width (the handoff's 1u = 30px at a
 * 7680-wide master, which is the same statement). Every shape the shell
 * draws is a closed polygon whose vertices sit on the 8u module grid and
 * whose edges run at 0, 45 or 90 degrees. Circles are the listed exception:
 * the coin, the LEDs, the d-pad pivot.
 *
 * `lint` is the rule made executable. The solver's tests run it over every
 * polygon it emits, and so does the sheet script, because a grid that is
 * only a convention is one nobody notices leaving.
 */

export type Pt = readonly [number, number];
export type Poly = readonly Pt[];
export interface Rect { x: number; y: number; w: number; h: number }

export const GRID = 8;

/** Nearest multiple of the grid. */
export const snap = (v: number, g = GRID) => Math.round(v / g) * g;
/** The largest grid multiple not above v. */
export const floorTo = (v: number, g = GRID) => Math.floor(v / g) * g;
/** The smallest grid multiple not below v. */
export const ceilTo = (v: number, g = GRID) => Math.ceil(v / g) * g;

export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
export const rectPoly = (r: Rect): Poly => [
  [r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h],
];

/**
 * A chamfered octagon: the square (x, y, s) with each corner cut back by c
 * along both edges. c = 0 degenerates to the square, which lint accepts.
 */
export function octagon(x: number, y: number, s: number, c: number): Poly {
  if (c <= 0) return rectPoly(rect(x, y, s, s));
  return [
    [x + c, y], [x + s - c, y],
    [x + s, y + c], [x + s, y + s - c],
    [x + s - c, y + s], [x + c, y + s],
    [x, y + s - c], [x, y + c],
  ];
}

/** Translate every vertex. */
export const move = (p: Poly, dx: number, dy: number): Poly => p.map(([x, y]) => [x + dx, y + dy] as const);

/** SVG `points=` for a polygon, at a scale. */
export const points = (p: Poly, k = 1) => p.map(([x, y]) => `${+(x * k).toFixed(3)},${+(y * k).toFixed(3)}`).join(" ");

/** CSS `polygon()` for a clip-path, in px at a scale. */
export const clipPolygon = (p: Poly, k = 1) =>
  `polygon(${p.map(([x, y]) => `${+(x * k).toFixed(2)}px ${+(y * k).toFixed(2)}px`).join(", ")})`;

export interface LintFault { poly: Poly; at: number; why: string }

/**
 * Every vertex on the grid, every edge at 0, 45 or 90 degrees, at least
 * three vertices, no zero-length edge. Returns the faults; an empty list is
 * a pass. `g` lets a component drawn on a finer grid state it; the module
 * grid is the default and the shell's own shapes never say otherwise.
 */
export function lint(poly: Poly, g = GRID): LintFault[] {
  const out: LintFault[] = [];
  if (poly.length < 3) return [{ poly, at: 0, why: `${poly.length} vertices` }];
  const eps = 1e-6;
  poly.forEach(([x, y], i) => {
    if (Math.abs(x / g - Math.round(x / g)) > eps || Math.abs(y / g - Math.round(y / g)) > eps)
      out.push({ poly, at: i, why: `vertex (${x}, ${y}) off the ${g}u grid` });
  });
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    if (dx < eps && dy < eps) out.push({ poly, at: i, why: `zero-length edge at ${i}` });
    else if (dx > eps && dy > eps && Math.abs(dx - dy) > eps)
      out.push({ poly, at: i, why: `edge ${i} at ${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)} degrees` });
  }
  return out;
}

/** Area by the shoelace formula, in square units. Always positive. */
export function area(p: Poly): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Whether a convex polygon contains the whole rectangle (all four corners inside). */
export function containsRect(poly: Poly, r: Rect): boolean {
  const corners: Pt[] = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  return corners.every((c) => insideConvex(poly, c));
}

export function insideConvex(poly: Poly, [px, py]: Pt): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
