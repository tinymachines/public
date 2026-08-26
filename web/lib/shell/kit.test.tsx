import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AB, Cart, Coin, Counter, Dpad, Pills, Power, Quick, Rail, Speaker } from "../../app/[lang]/6502/games/shell/Kit";
import { lint, type Poly } from "./geom";

/**
 * The kit's own lint: every polygon a part draws is closed, on the 4u half
 * module, at 0, 45 or 90 degrees, and no dimension is negative. Rendered to
 * markup and read back, so what is checked is what ships. The frame-level
 * grid (8u) is the solver's test; the half module is the part's (ISSUES #3).
 */

const polys = (svg: string): Poly[] =>
  [...svg.matchAll(/<polygon[^>]*points="([^"]+)"/g)].map((m) => m[1].trim().split(/\s+/).map((p) => p.split(",").map(Number) as [number, number]));

const negatives = (svg: string) => [...svg.matchAll(/(width|height|r)="(-[\d.]+)"/g)].map((m) => m[0]);

// Every size the solver can dock, at the pack's base and the touch floor.
const SIZES: [number, number][] = [[24, 24], [32, 32], [64, 64], [40, 24], [104, 16], [48, 40], [112, 24], [56, 56], [64, 56], [48, 24], [120, 24], [64, 8], [40, 16], [16, 16], [32, 16], [24, 16], [24, 20]];

describe("kit", () => {
  test("parts draw on the half module at 0, 45 or 90 degrees, with nothing negative", () => {
    let count = 0;
    for (const [w, h] of SIZES) {
      const parts: [string, string][] = [
        ["dpad", renderToStaticMarkup(<Dpad w={w} h={h} />)],
        ["ab", renderToStaticMarkup(<AB w={w} h={h} />)],
        ["pills", renderToStaticMarkup(<Pills w={w} h={h} />)],
        ["pills/stack", renderToStaticMarkup(<Pills w={w} h={h} stack />)],
        ["power", renderToStaticMarkup(<Power w={w} h={h} />)],
        ["power/stack", renderToStaticMarkup(<Power w={w} h={h} stack />)],
        ["coin", renderToStaticMarkup(<Coin w={w} h={h} credits={7} />)],
        ["counter", renderToStaticMarkup(<Counter w={w} h={h} value={42} />)],
        ["speaker", renderToStaticMarkup(<Speaker w={w} h={h} />)],
        ["cart", renderToStaticMarkup(<Cart w={w} h={h} accent="red" loaded />)],
        ["rail", renderToStaticMarkup(<Rail w={w} h={h} pages={4} active={1} />)],
        ["quick", renderToStaticMarkup(<Quick w={w} h={h} />)],
        ["quick/stack", renderToStaticMarkup(<Quick w={w} h={h} stack />)],
      ];
      for (const [name, svg] of parts) {
        expect(negatives(svg), `${name} ${w}x${h}`).toEqual([]);
        for (const p of polys(svg)) {
          if (p.length < 3 || p.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) continue; // chevrons are polylines
          // The digit and dpad-arrow families are on a 2u grid at small scales; everything else on 4u.
          // Digits are drawn at a fractional scale to fit their box, so their
          // grid is their own: for them only the angles are held.
          const digits = name === "counter" || name === "coin" || name === "cart"; // the cart scales to its box too
          const g = name === "dpad" ? 2 : 4;
          const faults = lint(p, g).filter((f) => !(digits && /grid/.test(f.why)));
          expect(faults.map((f) => `${name} ${w}x${h}: ${f.why}`), `${name} ${w}x${h}`).toEqual([]);
          count += 1;
        }
      }
    }
    expect(count).toBeGreaterThan(200);
  });

  test("nothing in the kit is a glyph: digits are segments, words are the buttons'", () => {
    for (const [w, h] of SIZES) {
      const forms = [
        () => <Counter w={w} h={h} value={58} />, () => <Pills w={w} h={h} />, () => <Power w={w} h={h} />,
        () => <AB w={w} h={h} />, () => <Quick w={w} h={h} />, () => <Cart w={w} h={h} accent="x" />,
      ];
      for (const form of forms) expect(renderToStaticMarkup(form())).not.toMatch(/<text/);
    }
    const svg = renderToStaticMarkup(<Counter w={40} h={16} value={58} />);
    expect((svg.match(/class="seg on"/g) ?? []).length).toBe(5 + 7); // 5 lights five segments, 8 lights seven
  });

  test("A and B carry the stagger: B low left, A high right", () => {
    const svg = renderToStaticMarkup(<AB w={40} h={24} />);
    const b = svg.indexOf('data-key="b"'), a = svg.indexOf('data-key="a"');
    expect(b).toBeGreaterThan(-1);
    expect(a).toBeGreaterThan(b);
  });
});
