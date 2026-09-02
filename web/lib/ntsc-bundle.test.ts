import { describe, expect, test } from "bun:test";
// @ts-expect-error the boarded wasm glue is generated JS with no type file shipped
import { initSync, Pipeline } from "../public/ntsc/wasm/ntsc_wasm.js";

/**
 * The shipped bundle, executed. ntsc-bundle hashes are held to the record
 * by ntsc.test.ts; this holds the bundle to being a working pipeline, so a
 * deploy cannot ship bytes that verify and do not run. One frame through
 * each rung is enough: the repository's own suite is where the signal path
 * is verified, and re-proving it here would be a second copy of that suite.
 */

const DOTS_W = 341;
const DOTS_H = 262;
const OUT = 2048 * 240 * 4;

function solid(colour: number) {
  const c = new Uint8Array(DOTS_W * DOTS_H).fill(colour);
  const e = new Uint8Array(DOTS_W * DOTS_H);
  return { c, e };
}

describe("the boarded wasm bundle", () => {
  const wasm = Bun.file(new URL("../public/ntsc/wasm/ntsc_wasm_bg.wasm", import.meta.url));

  test("initialises, encodes and decodes a frame on both rungs", async () => {
    initSync({ module: await wasm.arrayBuffer() });
    for (const rung of ["notch", "comb3"]) {
      const p = new Pipeline(rung);
      expect(p.width()).toBe(2048);
      expect(p.height()).toBe(240);
      const { c, e } = solid(0x16);
      const rgba = p.push_frame(c, e, 0) as Uint8Array;
      expect(rgba.length).toBe(OUT);
      // A mid-luma red frame: the middle scanline must be lit and red-led,
      // not black and not grey, or the pipeline ran and decoded nothing.
      const row = 120 * 2048 * 4 + 1024 * 4;
      const [r, g] = [rgba[row], rgba[row + 1]];
      expect(r).toBeGreaterThan(60);
      expect(r).toBeGreaterThan(g + 20);
    }
  });

  test("a rung it does not have is refused at construction", async () => {
    initSync({ module: await wasm.arrayBuffer() });
    // The Rust side panics with the rung's name, but a panic crosses the
    // wasm boundary as a bare trap ("unreachable"), so the name a reader
    // sees lives in bench.worker.mjs's own guard, which refuses before the
    // wasm is touched. What this holds is the floor under that guard: a
    // wrong rung is a construction ERROR, never a pipeline.
    expect(() => new Pipeline("comb2")).toThrow();
  });

  test("the drift policy counts a slow display honestly", async () => {
    initSync({ module: await wasm.arrayBuffer() });
    const p = new Pipeline("notch");
    // Three callbacks of a display exactly 5x slower than the source: each
    // demands about five source frames, so roughly four per callback are
    // drops. Derived from the pair period (about 16.639 ms), not typed as
    // an exact count, because the chained remainder is the policy's own.
    const dt = (5 * (714_736 + 714_728) * 11 * 1e9) / (2 * 472_500_000);
    let advanced = 0;
    for (let i = 0; i < 3; i++) advanced += p.tick(dt);
    const [presented, duplicated, dropped] = p.stats() as number[];
    expect(presented).toBe(3);
    expect(duplicated).toBe(0);
    expect(advanced).toBeGreaterThanOrEqual(14);
    expect(dropped).toBe(advanced - 3);
  });
});
