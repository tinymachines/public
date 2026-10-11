import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { clearGround, drawnBox, drawSquareFrom, hasOwnGround, fitColours, replaceTiles, setSpriteColours, shrink, tileCount, tileLines, toTiles, type Picture, type Rgb } from "./nesSprite";

const LESSONS = path.join(import.meta.dir, "..", "..", "lessons");
const lesson = (key: string, file: string) => fs.readFileSync(path.join(LESSONS, key, file), "utf8");
const keys = () => fs.readdirSync(LESSONS).filter((k) => fs.existsSync(path.join(LESSONS, k, "prg.s")));

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

  test("three colours go into sprite palette 0 of every lesson, and nowhere else", () => {
    expect(keys().length).toBeGreaterThan(20);
    for (const k of keys()) {
      const prg = lesson(k, "prg.s");
      const got = setSpriteColours(prg, [0x0a, 0x1b, 0x2c]);
      expect(got, k).not.toBeNull();
      const a = prg.split("\n"), b = got!.split("\n");
      expect(b.length, k).toBe(a.length);
      const changed = b.map((l, i) => (l === a[i] ? -1 : i)).filter((i) => i >= 0);
      expect(changed.length, k).toBe(1);
      const bytes = (l: string) => l.trim().replace(/^\.byte\s+/, "").split(",");
      const was = bytes(a[changed[0]]), is = bytes(b[changed[0]]);
      // The second line of the table: the ground colour kept, then the three, then the rest kept.
      expect(a[changed[0] - 2].trim(), k).toBe("colours:");
      expect(is, k).toEqual([was[0], "$0A", "$1B", "$2C", ...was.slice(4)]);
    }
    expect(setSpriteColours("main:\n    RTS\n", [1, 2, 3])).toBeNull();
  });

  test("the square is drawn from four tiles in reading order, and a second time over the first", () => {
    const prg = lesson("jump", "prg.s");
    const got = drawSquareFrom(prg, [3, 4, 5, 6])!;
    const want = ["LDA #$03", "STA $0201", "LDA #$04", "STA $0205", "LDA #$05", "STA $0209", "LDA #$06", "STA $020D"];
    const lines = got.split("\n").map((l) => l.trim());
    const at = lines.indexOf("LDA #$03");
    expect(lines.slice(at, at + 9)).toEqual([...want, "LDA #$00"]);
    expect(lines.length).toBe(prg.split("\n").length + 3);
    // Again, over its own work: the same eight lines with new numbers, nothing added.
    const again = drawSquareFrom(got, [9, 9, 9, 9])!;
    expect(again.split("\n").length).toBe(lines.length);
    expect(again).not.toContain("LDA #$03");
    expect(drawSquareFrom(again, [3, 4, 5, 6])).toBe(got);
  });

  test("the lessons that draw a square are found, and the four that do not are refused", () => {
    const none = keys().filter((k) => drawSquareFrom(lesson(k, "prg.s"), [3, 4, 5, 6]) === null).sort();
    expect(none).toEqual(["about", "flicker", "menu", "splash"]);
    // Where it is found, it is the square's run: the one that loaded tile 1.
    for (const k of keys().filter((x) => !none.includes(x))) {
      const a = lesson(k, "prg.s").split("\n"), b = drawSquareFrom(lesson(k, "prg.s"), [3, 4, 5, 6])!.split("\n");
      const i = b.findIndex((l, n) => l !== a[n]);
      expect(a[i].trim(), k).toBe("LDA #$01");
    }
  });

  test("a lesson's tiles are counted", () => {
    expect(tileCount(lesson("jump", "chr.s"))).toBe(3);
  });

  test("a picture that fills its frame loses its ground, shaded or flat, and keeps its subject", () => {
    // A red square with a black outline on a ground that shades from edge to middle.
    const subject = (x: number, y: number) => x >= 20 && x < 44 && y >= 20 && y < 44;
    const outline = (x: number, y: number) => subject(x, y) && (x < 22 || x >= 42 || y < 22 || y >= 42);
    const shade = (x: number, y: number): Rgb => {
      const d = Math.round(Math.hypot(x - 32, y - 32));
      return [40 + d, 90 + d, 40 + d];
    };
    const p = picture(64, 64, (x, y) => (outline(x, y) ? [0, 0, 0] : subject(x, y) ? [220, 30, 30] : shade(x, y)));
    expect(hasOwnGround(p)).toBe(true);
    expect(drawnBox(p)).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    const c = clearGround(p);
    expect(drawnBox(c)).toEqual({ x: 20, y: 20, w: 24, h: 24 });
    // Every pixel of the subject is as it was, and the first picture is not written over.
    for (let y = 20; y < 44; y++) for (let x = 20; x < 44; x++) expect([...c.data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)]).toEqual([...p.data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)]);
    expect(p.data[3]).toBe(255);
    // Then the three colours go to the subject: the ground takes none.
    const f = fitColours(shrink(c, 16), PALETTE);
    expect(f.indices.filter((v) => v === 0).length).toBe(0);
    expect(new Set(f.indices)).toEqual(new Set([1, 2]));
  });

  test("ground of another colour is not cleared by being reached, and enclosed ground is kept", () => {
    // A white ring on black: the black inside the ring is not reached from the edge.
    const ring = (x: number, y: number) => {
      const d = Math.hypot(x - 32, y - 32);
      return d >= 16 && d < 24;
    };
    const c = clearGround(picture(64, 64, (x, y) => (ring(x, y) ? [255, 255, 255] : [0, 0, 0])));
    const alpha = (x: number, y: number) => c.data[(y * 64 + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(32, 12)).toBe(255); // the ring
    expect(alpha(32, 32)).toBe(255); // the ground the ring encloses
  });

  test("a picture with see-through at its edge is left as it is", () => {
    const p = picture(64, 64, (x, y) => (x >= 10 && x < 30 && y >= 20 && y < 60 ? [255, 0, 0] : null));
    expect(hasOwnGround(p)).toBe(false);
    expect(clearGround(p)).toBe(p);
  });

  test("a big picture is cleared on a coarse grid and comes back at its own size", () => {
    const subject = (x: number, y: number) => x >= 300 && x < 468 && y >= 300 && y < 468;
    const p = picture(768, 768, (x, y) => (subject(x, y) ? [250, 250, 250] : [30, 60, 120]));
    const c = clearGround(p);
    expect([c.width, c.height]).toEqual([768, 768]);
    expect(drawnBox(c)).toEqual({ x: 300, y: 300, w: 168, h: 168 });
  });
});
