/**
 * A picture made into NES sprite tiles: cropped to what is drawn, shrunk to
 * a square of 8, 16 or 32 pixels, its colours fitted to three of the
 * console's 64 (plus see-through), and written as pattern tiles, sixteen
 * bytes each, the way a cartridge holds them. Pure functions, so the desk's
 * Sprite maker and the tests run the same code.
 *
 * The 64 colours are not here: there is no RGB table on this site. They
 * are the measured ones the picture worker reports (public/nes/palette.mjs),
 * passed in by whoever calls.
 */

export type Rgb = [number, number, number];

/** An RGBA picture, as a canvas gives it. */
export interface Picture {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** A square of pixels: -1 see-through, otherwise an RGB colour. */
export interface Shrunk {
  size: number;
  pixels: (Rgb | null)[];
}

const SOLID = 128;

/** The smallest box holding every pixel more than half opaque, or null if none is. */
export function drawnBox(p: Picture): { x: number; y: number; w: number; h: number } | null {
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] >= SOLID) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Whether a picture has no see-through ground of its own: every pixel on its edge is solid. */
export function hasOwnGround(p: Picture): boolean {
  const solid = (x: number, y: number) => p.data[(y * p.width + x) * 4 + 3] >= SOLID;
  for (let x = 0; x < p.width; x++) if (!solid(x, 0) || !solid(x, p.height - 1)) return false;
  for (let y = 0; y < p.height; y++) if (!solid(0, y) || !solid(p.width - 1, y)) return false;
  return p.width > 0 && p.height > 0;
}

// The ground is found on a grid of at most this many cells a side, each the
// average of the pixels it covers: a generated picture's edges are soft
// over several pixels at full size, and a spread that follows soft edges
// walks straight into the subject.
const GROUND_GRID = 256;
// A cell joins the ground when it is this close to the ground cell beside
// it (so a ground that shades from edge to middle is followed) and this
// close to the edge's average colour (so the spread stops at a subject of
// another colour even where there is no outline). Tried on generated
// sprites, 2026-10-10: a larger step ate dark outlines on a dark ground.
const GROUND_STEP = 12 ** 2;
const GROUND_FAR = 110 ** 2;

/**
 * A picture with its ground made see-through. A picture that fills its
 * frame (a generated sprite stands on a flat or shaded colour) would
 * otherwise spend one of its three colours on that ground and be shrunk
 * frame and all. The ground is whatever is reached from the edge through
 * cells of nearly the same colour. A picture that already has see-through
 * at its edge is returned as it is.
 *
 * Not covered: a subject the colour of its ground with no outline between
 * them loses that part, and ground enclosed by the subject (between an arm
 * and a body) is kept, because nothing reaches it from the edge.
 */
export function clearGround(p: Picture): Picture {
  if (!hasOwnGround(p)) return p;
  const k = Math.max(1, Math.ceil(Math.max(p.width, p.height) / GROUND_GRID));
  const w = Math.ceil(p.width / k), h = Math.ceil(p.height / k);
  const cell = new Float64Array(w * h * 3);
  const count = new Uint32Array(w * h);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const c = Math.floor(y / k) * w + Math.floor(x / k), i = (y * p.width + x) * 4;
      cell[c * 3] += p.data[i];
      cell[c * 3 + 1] += p.data[i + 1];
      cell[c * 3 + 2] += p.data[i + 2];
      count[c]++;
    }
  }
  for (let c = 0; c < w * h; c++) for (let j = 0; j < 3; j++) cell[c * 3 + j] /= count[c];
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) edge.push(y * w, y * w + w - 1);
  const mean = [0, 1, 2].map((j) => edge.reduce((t, c) => t + cell[c * 3 + j], 0) / edge.length);
  const far = (c: number) => (cell[c * 3] - mean[0]) ** 2 + (cell[c * 3 + 1] - mean[1]) ** 2 + (cell[c * 3 + 2] - mean[2]) ** 2;
  const step = (a: number, b: number) => (cell[a * 3] - cell[b * 3]) ** 2 + (cell[a * 3 + 1] - cell[b * 3 + 1]) ** 2 + (cell[a * 3 + 2] - cell[b * 3 + 2]) ** 2;
  const ground = new Uint8Array(w * h);
  const queue: number[] = [];
  for (const c of edge) {
    if (!ground[c] && far(c) <= GROUND_FAR) {
      ground[c] = 1;
      queue.push(c);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q], x = c % w, y = (c - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const n = yy * w + xx;
      if (ground[n] || step(n, c) > GROUND_STEP || far(n) > GROUND_FAR) continue;
      ground[n] = 1;
      queue.push(n);
    }
  }
  const data = new Uint8ClampedArray(p.data);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (ground[Math.floor(y / k) * w + Math.floor(x / k)]) data[(y * p.width + x) * 4 + 3] = 0;
    }
  }
  return { width: p.width, height: p.height, data };
}

/**
 * The drawn part, shrunk into a square of `size`, kept in proportion and
 * centred: each new pixel is the average of the source pixels it covers,
 * weighted by how opaque they are, and see-through if less than half of
 * what it covers is solid.
 */
export function shrink(p: Picture, size: number): Shrunk {
  const box = drawnBox(p);
  const pixels: (Rgb | null)[] = new Array(size * size).fill(null);
  if (!box) return { size, pixels };
  const scale = Math.max(box.w, box.h) / size;
  const ox = (size - box.w / scale) / 2;
  const oy = (size - box.h / scale) / 2;
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const sx0 = box.x + (tx - ox) * scale, sy0 = box.y + (ty - oy) * scale;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy0 + scale); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx0 + scale); sx++) {
          n++;
          if (sx < box.x || sy < box.y || sx >= box.x + box.w || sy >= box.y + box.h) continue;
          const i = (sy * p.width + sx) * 4;
          const al = p.data[i + 3] / 255;
          r += p.data[i] * al;
          g += p.data[i + 1] * al;
          b += p.data[i + 2] * al;
          a += al;
        }
      }
      if (n && a / n >= 0.5) pixels[ty * size + tx] = [r / a, g / a, b / a];
    }
  }
  return { size, pixels };
}

const dist = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * The three of the 64 measured colours that draw the sprite with the least
 * error (every set of three is tried; each pixel takes the nearest of the
 * three), and each pixel's choice: 0 see-through, 1 to 3 the colours in
 * the order given. Colour codes that are the same measured colour as an
 * earlier code (the blacks) are tried once.
 */
export function fitColours(s: Shrunk, palette: Rgb[]): { codes: [number, number, number]; indices: number[]; error: number } {
  // Each distinct solid colour once, with how many pixels have it.
  const seen = new Map<string, { c: Rgb; n: number }>();
  for (const p of s.pixels) {
    if (!p) continue;
    const k = p.map((v) => Math.round(v)).join(",");
    const e = seen.get(k);
    if (e) e.n++;
    else seen.set(k, { c: p, n: 1 });
  }
  const colours = [...seen.values()];
  const codes = palette.map((_, i) => i).filter((i) => palette.findIndex((q) => dist(q, palette[i]) === 0) === i);
  // Every colour's distance to every candidate, weighted by how many pixels have it.
  const d = colours.map((c) => palette.map((q) => dist(c.c, q) * c.n));
  let best = { codes: [codes[0], codes[0], codes[0]] as [number, number, number], error: Infinity };
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      for (let k = j + 1; k < codes.length; k++) {
        const a = codes[i], b = codes[j], c = codes[k];
        let e = 0;
        for (let m = 0; m < d.length && e < best.error; m++) e += Math.min(d[m][a], d[m][b], d[m][c]);
        if (e < best.error) best = { codes: [a, b, c], error: e };
      }
    }
  }
  const pick = best.codes.map((c) => palette[c]);
  const indices = s.pixels.map((p) => {
    if (!p) return 0;
    let at = 0;
    for (let q = 1; q < 3; q++) if (dist(p, pick[q]) < dist(p, pick[at])) at = q;
    return at + 1;
  });
  return { codes: best.codes, indices, error: best.error };
}

/**
 * The square as pattern tiles, row by row of tiles from the top left: each
 * tile eight bytes of the low bit of its pixels, then eight of the high
 * bit, a row a byte, the leftmost pixel in the top bit.
 */
export function toTiles(indices: number[], size: number): Uint8Array {
  const across = size / 8;
  const out = new Uint8Array(across * across * 16);
  for (let ty = 0; ty < across; ty++) {
    for (let tx = 0; tx < across; tx++) {
      const t = (ty * across + tx) * 16;
      for (let row = 0; row < 8; row++) {
        let lo = 0, hi = 0;
        for (let col = 0; col < 8; col++) {
          const v = indices[(ty * 8 + row) * size + tx * 8 + col];
          lo |= (v & 1) << (7 - col);
          hi |= ((v >> 1) & 1) << (7 - col);
        }
        out[t + row] = lo;
        out[t + 8 + row] = hi;
      }
    }
  }
  return out;
}

/** Tiles as lines of a lesson's chr.s: one `.byte` line of sixteen bytes per tile. */
export function tileLines(tiles: Uint8Array): string[] {
  const lines: string[] = [];
  for (let t = 0; t < tiles.length; t += 16) {
    lines.push("    .byte " + [...tiles.slice(t, t + 16)].map((b) => "$" + b.toString(16).toUpperCase().padStart(2, "0")).join(","));
  }
  return lines;
}

/**
 * A lesson's tiles with some replaced: chr.s's `.byte` lines are tiles in
 * order from 0, and the new ones take the places from `first` on (lines
 * added as empty tiles if the file stops short). Comments are kept.
 */
export function replaceTiles(chr: string, first: number, lines: string[]): string {
  const all = chr.replace(/\n$/, "").split("\n");
  const at: number[] = [];
  all.forEach((l, i) => {
    if (l.trimStart().startsWith(".byte")) at.push(i);
  });
  const empty = "    .byte " + Array(16).fill("$00").join(",");
  while (at.length < first + lines.length) {
    all.push(empty);
    at.push(all.length - 1);
  }
  lines.forEach((l, k) => {
    all[at[first + k]] = l;
  });
  return all.join("\n") + "\n";
}

/** How many tiles a lesson's chr.s holds: the first tile number nothing uses yet. */
export function tileCount(chr: string): number {
  return chr.split("\n").filter((l) => l.trimStart().startsWith(".byte")).length;
}

const code = (n: number) => "$" + n.toString(16).toUpperCase().padStart(2, "0");

/**
 * A lesson's program with three colours written into its first sprite
 * palette: the table at the label `colours` is 32 bytes, the second 16
 * the sprites', and the three after the shared ground colour are sprite
 * palette 0's. Null when the program has no such table, so the caller
 * says so rather than believing the colours went in.
 */
export function setSpriteColours(prg: string, codes: readonly number[]): string | null {
  const all = prg.split("\n");
  const label = all.findIndex((l) => /^colours:\s*$/.test(l));
  if (label < 0) return null;
  // The table's bytes, each with the line it is on and its place there.
  const at: { line: number; n: number }[] = [];
  for (let i = label + 1; i < all.length && at.length < 32; i++) {
    const m = /^\s+\.byte\s+(.*)$/.exec(all[i]);
    if (!m) break;
    m[1].split(",").forEach((_, n) => at.push({ line: i, n }));
  }
  if (at.length < 20) return null;
  codes.slice(0, 3).forEach((c, k) => {
    const { line, n } = at[17 + k];
    const m = /^(\s+\.byte\s+)(.*)$/.exec(all[line])!;
    const bytes = m[2].split(",");
    bytes[n] = code(c);
    all[line] = m[1] + bytes.join(",");
  });
  return all.join("\n");
}

/**
 * A lesson's program with its square drawn from new tiles. The lessons
 * draw the square as four sprites, two by two, and give them their tile
 * in one run of lines: a number loaded, then stored to the tile byte of
 * four sprites in a row (top left, top right, bottom left, bottom
 * right). That run is rewritten to load `tiles[k]` for sprite k, so four
 * tiles in reading order show a 16 pixel picture whole. Null when the
 * program has no such run (four of the lessons draw no square).
 */
export function drawSquareFrom(prg: string, tiles: readonly [number, number, number, number]): string | null {
  const all = prg.split("\n");
  const load = /^(\s+)LDA #\$[0-9A-Fa-f]{2}\s*$/;
  const store = /^\s+STA \$(02[0-9A-Fa-f]{2})\s*$/;
  for (let i = 0; i < all.length; i++) {
    const indent = load.exec(all[i])?.[1];
    if (indent === undefined) continue;
    // Loads and stores from here on, until four tile bytes have been stored.
    const to: number[] = [];
    let j = i;
    for (; j < all.length && to.length < 4; j++) {
      const s = store.exec(all[j]);
      if (s) to.push(parseInt(s[1], 16));
      else if (!load.test(all[j]) || j + 1 >= all.length || !store.test(all[j + 1])) break;
    }
    if (to.length !== 4 || !to.every((a, k) => (a & 3) === 1 && a === to[0] + 4 * k)) continue;
    if (j < all.length && store.test(all[j])) continue; // a longer run is something else's
    const lines = to.flatMap((a, k) => [`${indent}LDA #${code(tiles[k])}`, `${indent}STA $${a.toString(16).toUpperCase().padStart(4, "0")}`]);
    all.splice(i, j - i, ...lines);
    return all.join("\n");
  }
  return null;
}
