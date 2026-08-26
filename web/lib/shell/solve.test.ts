import { describe, expect, test } from "bun:test";
import { containsRect, lint, rect, type Rect } from "./geom";
import { FRAME_U, lintSolved, solve } from "./solve";

/**
 * The pack's test matrix (05-SLICING-MANIFEST.json), at real device sizes,
 * plus the sizes the e2e suite shoots at and one that is below the floor.
 */
const MATRIX: [string, number, number][] = [
  ["9:19.5 phone", 390, 844],
  ["19.5:9 phone landscape", 844, 390],
  ["9:16", 1080, 1920],
  ["16:9", 1920, 1080],
  ["3:4", 768, 1024],
  ["4:3", 1024, 768],
  ["1:1", 1000, 1000],
  ["21:9", 2520, 1080],
  ["desk stage", 1280, 780],
  ["narrow phone", 360, 700],
  ["cramped", 200, 300],
];

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Rect, z: Rect) => a.x >= z.x && a.y >= z.y && a.x + a.w <= z.x + z.w && a.y + a.h <= z.y + z.h;

describe("solve", () => {
  test("is deterministic, and the seed reaches the facets", () => {
    for (const [, W, H] of MATRIX) {
      const a = JSON.stringify(solve(W, H, 3));
      const b = JSON.stringify(solve(W, H, 3));
      expect(a).toBe(b);
      const c = JSON.stringify(solve(W, H, 4).facets);
      // A seed changes the cut phase; a shell with no slab long enough to
      // cut is the one legitimate way for two seeds to agree.
      if (solve(W, H, 3).facets.some((f) => f.poly.length === 4 && f.family === "fill" && f.poly[0][0] !== f.poly[3][0]))
        expect(JSON.stringify(solve(W, H, 3).facets)).not.toBe(c);
    }
  });

  test("every polygon is on the 8u grid at 0, 45 or 90 degrees", () => {
    for (const [name, W, H] of MATRIX) {
      const faults = lintSolved(solve(W, H, 1));
      expect(faults.map((f) => `${name}: ${f.why}`)).toEqual([]);
    }
  });

  test("the mask is the short side less two margins, with m at 4 percent", () => {
    for (const [name, W, H] of MATRIX) {
      const s = solve(W, H);
      const short = Math.min(FRAME_U, s.Hu);
      expect(s.m, name).toBeGreaterThanOrEqual(8);
      expect(Math.abs(s.m - 0.04 * short), name).toBeLessThanOrEqual(4);
      expect(s.S, name).toBeGreaterThan(short - 2 * s.m - 16);
      expect(s.S, name).toBeLessThanOrEqual(short - 2 * s.m);
      expect(Math.abs(s.c - s.S / 9), name).toBeLessThanOrEqual(4);
      expect(s.mask.poly.length, name).toBe(8);
    }
  });

  test("the whole native screen sits inside the chamfer, at the largest integer scale that does", () => {
    for (const [name, W, H] of MATRIX) {
      const s = solve(W, H);
      const Spx = s.S * s.ppu, cpx = s.c * s.ppu;
      const fits = (k: number) => 128 * k <= Spx - 18 && 128 * k <= Spx - cpx;
      if (s.cramped) { expect(s.k, name).toBe(1); expect(fits(1), name).toBe(false); continue; }
      expect(fits(s.k), name).toBe(true);
      expect(s.k === 6 || !fits(s.k + 1), name).toBe(true);
      // In units: a centred square of the screen's edge inside the octagon.
      const a = s.screenPx / s.ppu;
      const r = rect(s.mask.x + (s.S - a) / 2, s.mask.y + (s.S - a) / 2, a, a);
      expect(containsRect(s.mask.poly, r), name).toBe(true);
    }
  });

  test("portrait biases the mask to the top by m; landscape centres it on the grid", () => {
    for (const [name, W, H] of MATRIX) {
      const s = solve(W, H);
      if (s.portrait) {
        const top = s.zones.header ? s.zones.header.h : 0;
        expect(s.mask.y - top, name).toBe(s.m);
      } else {
        const gapTop = s.mask.y, gapBottom = s.Hg - (s.mask.y + s.S);
        expect(Math.abs(gapTop - gapBottom), name).toBeLessThanOrEqual(8);
      }
      expect(s.mask.x, name).toBe((FRAME_U - s.S) / 2);
    }
  });

  test("zones: header and deck in portrait, wings in landscape, none in the square band", () => {
    const p = solve(390, 844);
    expect(p.zones.deck).toBeDefined();
    expect(p.zones.wingL).toBeUndefined();
    const l = solve(1920, 1080);
    expect(l.zones.wingL).toBeDefined();
    expect(l.zones.wingR).toBeDefined();
    expect(l.zones.deck).toBeUndefined();
    const q = solve(1000, 1000);
    expect(Object.keys(q.zones)).toEqual([]);
    expect(q.docks.every((d) => d.ghost)).toBe(true);
    expect(solve(1920, 1080).docks.some((d) => d.ghost)).toBe(false);
    expect(solve(390, 844).docks.some((d) => d.ghost)).toBe(false);
  });

  test("docks sit inside their zone, never overlap, and lead with movement then A/B", () => {
    for (const [name, W, H] of MATRIX) {
      const s = solve(W, H);
      for (const d of s.docks) {
        if (d.zone === "ghost") continue;
        expect(inside(d.box, s.zones[d.zone]!), `${name}: ${d.id} in ${d.zone}`).toBe(true);
      }
      for (let i = 0; i < s.docks.length; i++)
        for (let j = i + 1; j < s.docks.length; j++)
          expect(overlaps(s.docks[i].box, s.docks[j].box), `${name}: ${s.docks[i].id} over ${s.docks[j].id}`).toBe(false);
      const ids = s.docks.map((d) => d.id);
      if (!s.cramped) {
        expect(ids, name).toContain("dpad");
        expect(ids, name).toContain("ab");
      }
      // Priority is per zone: a speaker never docks in a zone whose leader is missing.
      const inZone = (z: string) => s.docks.filter((d) => d.zone === z).map((d) => d.id);
      if (inZone("deck").includes("speaker")) expect(inZone("deck"), `${name}: deck speaker before power`).toContain("power");
      if (inZone("wingR").includes("speaker")) expect(inZone("wingR"), `${name}: wing speaker before A/B`).toContain("ab");
    }
  });

  test("movement and A/B meet the 88px touch floor", () => {
    for (const [name, W, H] of MATRIX) {
      const s = solve(W, H);
      for (const d of s.docks.filter((d) => d.id === "dpad" || d.id === "ab")) {
        expect(d.box.h * s.ppu, `${name}: ${d.id}`).toBeGreaterThanOrEqual(88);
        expect(d.box.w * s.ppu, `${name}: ${d.id}`).toBeGreaterThanOrEqual(88);
      }
    }
  });

  test("facets: no facet crosses a dock or the mask, and each carries one of two tones", () => {
    for (const [name, W, H] of MATRIX) {
      const s = solve(W, H);
      expect(s.facets.length, name).toBeGreaterThanOrEqual(8);
      for (const f of s.facets) {
        expect(["lit", "shade"], name).toContain(f.tone);
        expect(lint(f.poly), name).toEqual([]);
        // A facet's bounding box against each dock: fills never cover a control.
        const xs = f.poly.map((p) => p[0]), ys = f.poly.map((p) => p[1]);
        const bb = rect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        for (const d of s.docks) if (!d.ghost) expect(overlaps(bb, d.box), `${name}: facet over ${d.id}`).toBe(false);
      }
    }
  });

  test("the params footer names every input", () => {
    const s = solve(390, 844, 7);
    for (const key of ["390x844px", "m=", "S=", "c=", "k=", "seed=7", "portrait"]) expect(s.params).toContain(key);
  });
});
