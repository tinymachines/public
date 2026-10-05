import { describe, expect, test } from "bun:test";
import { drawnBox, fitColours, replaceTiles, shrink, tileLines, toTiles, type Picture, type Rgb } from "./nesSprite";

/** A picture of `w` by `h`, see-through, with `fill` painted where `at` says. */
function picture(w: number, h: number, at: (x: number, y: number) => Rgb | null): Picture {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (c) data.set([...c, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

// A made-up palette of eight colours for the tests: the site measures its
// own 64, and these stand in for them (two of them the same black).
const PALETTE: Rgb[] = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0], [128, 128, 128], [255, 255, 0]];

describe("nesSprite", () => {
  test("the drawn box ignores the see-through border", () => {
    const p = picture(64, 64, (x, y) => (x >= 10 && x < 30 && y >= 20 && y < 60 ? [255, 0, 0] : null));
    expect(drawnBox(p)).toEqual({ x: 10, y: 20, w: 20, h: 40 });
    expect(drawnBox(picture(4, 4, () => null))).toBeNull();
  });

  test("shrinking keeps proportion, centres, and leaves the rest see-through", () => {
    // A 40 tall by 20 wide red bar becomes 16 tall by 8 wide in a 16 square.
    const s = shrink(picture(64, 64, (x, y) => (x >= 10 && x < 30 && y >= 20 && y < 60 ? [255, 0, 0] : null)), 16);
    const solid = s.pixels.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    const cols = new Set(solid.map((i) => i % 16));
    expect(solid.length).toBe(16 * 8);
    expect([Math.min(...cols), Math.max(...cols)]).toEqual([4, 11]);
  });

  test("three colours are fitted from the palette, and each pixel takes its nearest", () => {
    // Quarters of red, green, near-blue and see-through.
    const s = shrink(picture(16, 16, (x, y) => (x < 8 ? (y < 8 ? [250, 5, 5] : [5, 250, 5]) : y < 8 ? [10, 10, 240] : null)), 16);
    const f = fitColours(s, PALETTE);
    expect([...f.codes].sort()).toEqual([1, 2, 3]);
    const name = (i: number) => (i ? f.codes[i - 1] : -1);
    expect(name(f.indices[0])).toBe(1);
    expect(name(f.indices[8 * 16])).toBe(2);
    expect(name(f.indices[8])).toBe(3);
    expect(f.indices[8 * 16 + 8]).toBe(0);
  });

  test("tiles: low plane then high plane, leftmost pixel in the top bit, tiles row by row", () => {
    // 16 square: colour 3 in the top-left pixel of tile 0, colour 1 in the
    // top-right pixel of tile 1, colour 2 in the bottom-left of tile 2.
    const idx = new Array(256).fill(0);
    idx[0] = 3;
    idx[15] = 1;
    idx[15 * 16] = 2;
    const t = toTiles(idx, 16);
    expect(t.length).toBe(64);
    expect([t[0], t[8]]).toEqual([0x80, 0x80]);
    expect([t[16], t[24]]).toEqual([0x01, 0x00]);
    expect([t[32 + 7], t[32 + 15]]).toEqual([0x00, 0x80]);
  });

  test("tile lines and replacing tiles in a lesson's chr.s", () => {
    const lines = tileLines(new Uint8Array(32).map((_, i) => i));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("    .byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F");
    const chr = ";; tiles\n    .byte " + Array(16).fill("$00").join(",") + "\n    .byte " + Array(16).fill("$FF").join(",") + "\n";
    const out = replaceTiles(chr, 1, lines).split("\n");
    expect(out[0]).toBe(";; tiles");
    expect(out[2]).toBe(lines[0]);
    expect(out[3]).toBe(lines[1]);
    expect(out.filter((l) => l.includes(".byte"))).toHaveLength(3);
  });
});
