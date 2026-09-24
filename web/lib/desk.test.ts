import { describe, expect, test } from "bun:test";
import { clamp, GAP, initial, MIN_H, MIN_W, raise, type Win } from "./desk";

const win = (r: Partial<Win>): Win => ({ x: 0, y: 0, w: 300, h: 200, z: 1, open: true, max: false, ...r });

describe("a window stays on the desk", () => {
  test("dragged past any edge, it stops at that edge", () => {
    expect(clamp(win({ x: -50, y: -9 }), 1000, 600)).toMatchObject({ x: 0, y: 0, w: 300, h: 200 });
    expect(clamp(win({ x: 900, y: 590 }), 1000, 600)).toMatchObject({ x: 700, y: 400, w: 300, h: 200 });
  });
  test("sized below the minimum, it keeps the minimum", () => {
    expect(clamp(win({ w: 10, h: 10 }), 1000, 600)).toMatchObject({ w: MIN_W, h: MIN_H });
  });
  test("larger than the desk, it shrinks to the desk rather than hanging off it", () => {
    expect(clamp(win({ x: 40, y: 40, w: 2000, h: 900 }), 1000, 600)).toMatchObject({ x: 0, y: 0, w: 1000, h: 600 });
  });
  test("its order, its state and its fill are carried through untouched", () => {
    expect(clamp(win({ z: 7, open: false, max: true }), 1000, 600)).toMatchObject({ z: 7, open: false, max: true });
  });
});

describe("where the page puts the windows", () => {
  const specs = [
    { id: "a", at: [0, 0, 0.5, 1] as [number, number, number, number] },
    { id: "b", at: [0.5, 0, 0.5, 0.5] as [number, number, number, number], open: false },
  ];
  test("fractions of the desk, a gap between neighbours, in the order given, open unless said otherwise", () => {
    const l = initial(specs, 1000, 600);
    expect(l.a).toMatchObject({ x: GAP / 2, y: GAP / 2, w: 500 - GAP, h: 600 - GAP, z: 1, open: true });
    expect(l.b).toMatchObject({ x: 500 + GAP / 2, w: 500 - GAP, z: 2, open: false });
    expect(l.a.x + l.a.w + GAP).toBe(l.b.x);
  });
  test("on a desk too small for them, every window still fits inside it", () => {
    const l = initial(specs, 300, 150);
    for (const w of Object.values(l)) {
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.y).toBeGreaterThanOrEqual(0);
      expect(w.x + w.w).toBeLessThanOrEqual(300);
      expect(w.y + w.h).toBeLessThanOrEqual(150);
    }
  });
});

describe("bringing a window forward", () => {
  test("it goes on top, the others keep their order, and the numbers stay one to n", () => {
    const l = raise({ a: win({ z: 3 }), b: win({ z: 9 }), c: win({ z: 5 }) }, "a");
    expect([l.b.z, l.c.z, l.a.z].sort()).toEqual([1, 2, 3]);
    expect(l.a.z).toBe(3);
    expect(l.c.z).toBeLessThan(l.b.z);
  });
});
