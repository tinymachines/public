import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DESK, open } from "./lib";
import type { Lesson } from "../lib/lessons";

/**
 * The measuring worker's write logs: asked for, the text it hands back
 * for a lesson's own cartridge run through the lesson's own script must be
 * byte for byte the files storyboard wrote for the record's run
 * (lessons/<key>/build/run/vram.txt and the rest), since the record's
 * measures read those files. The log must not change the run: its memory
 * is the same with the log on and off. And the cost of the log is
 * measured here, not guessed: the test prints both runs' times.
 *
 * The runs are build output, not committed; on a box without them the
 * test says so rather than passing on nothing. The lessons are NROM
 * cartridges, so their mapper log is empty on both sides: that kind is
 * held only to being empty here, until a lesson with a mapper arrives.
 */

const ROOT = path.join(__dirname, "..", "..");
const KINDS = ["vram", "scroll", "apu", "mapper"] as const;

function recorded(key: string) {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: (Lesson & { rom: string })[] };
  const l = r.lessons.find((x) => x.key === key);
  if (!l) throw new Error(`no ${key} lesson in the record; the spec would pass on nothing`);
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "lessons", key, "lesson.json"), "utf8")) as { script: string; frames: number };
  const script = fs.readFileSync(path.join(ROOT, "lessons", key, meta.script), "utf8");
  const run = path.join(ROOT, "lessons", key, "build", "run");
  const files = Object.fromEntries(KINDS.map((k) => [k, path.join(run, `${k}.txt`)]));
  return { rom: l.rom, frames: meta.frames, script, files };
}

type Answer = { frames: number; logs: Record<string, string>; ms: number; ram: string };

/** Run the cartridge through the worker in the page, with or without the logs; the memory comes back hashed. */
async function measure(page: import("@playwright/test").Page, rom: string, script: string, frames: number, logs: string[]): Promise<Answer> {
  return page.evaluate(
    async ({ rom, script, frames, logs }) => {
      const bytes = Uint8Array.from(atob(rom), (c) => c.charCodeAt(0));
      const at = script
        .split("\n")
        .map((l) => l.trim().split(/\s+/))
        .filter((w) => w.length === 3 && w[0] === "AT")
        .map((w) => [Number(w[1]), parseInt(w[2], 16)] as [number, number]);
      const w = new Worker("/nes/measure.worker.mjs", { type: "module" });
      const t0 = performance.now();
      const answer = await new Promise<{ ram: ArrayBuffer; frames: number; logs: Record<string, string> }>((resolve, reject) => {
        w.onmessage = (e) => (e.data.ok ? resolve(e.data.answer) : reject(new Error(e.data.error)));
        w.onerror = () => reject(new Error("the worker failed to load"));
        w.postMessage({ id: 1, rom: bytes.buffer, script: at, frames, logs });
      });
      const ms = performance.now() - t0;
      w.terminate();
      const digest = await crypto.subtle.digest("SHA-256", answer.ram);
      return { frames: answer.frames, logs: answer.logs, ms, ram: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("") };
    },
    { rom, script, frames, logs },
  );
}

for (const key of ["scroll", "sound"]) {
  test(`the ${key} lesson's write logs from the worker are storyboard's files byte for byte, and the log does not change the run`, async ({ page }) => {
    const r = recorded(key);
    const missing = KINDS.filter((k) => !fs.existsSync(r.files[k]));
    test.skip(missing.length > 0, `the ${key} lesson's run has no ${missing.join(", ")} here; build the lessons first`);
    await page.setViewportSize(DESK);
    await open(page, "/nes/create", 300);
    const off = await measure(page, r.rom, r.script, r.frames, []);
    const on = await measure(page, r.rom, r.script, r.frames, [...KINDS]);
    expect(on.frames).toBe(r.frames);
    expect(off.logs).toEqual({});
    expect(Object.keys(on.logs).sort()).toEqual([...KINDS].sort());
    let lines = 0;
    for (const k of KINDS) {
      const want = fs.readFileSync(r.files[k], "utf8");
      expect(on.logs[k], `${k}.txt`).toBe(want);
      lines += want ? want.split("\n").length - 1 : 0;
    }
    expect(lines, "the files hold writes; a match over empty files would pass on nothing").toBeGreaterThan(0);
    expect(on.ram, "the log must not change what the program does").toBe(off.ram);
    console.log(`${key}: ${r.frames} frames, log off ${off.ms.toFixed(0)} ms, log on ${on.ms.toFixed(0)} ms, ${(on.ms / off.ms).toFixed(2)}x`);
  });
}

test("a write log the console does not keep is refused by name", async ({ page }) => {
  const r = recorded("scroll");
  await page.setViewportSize(DESK);
  await open(page, "/nes/create", 300);
  await expect(measure(page, r.rom, r.script, 10, ["oam"])).rejects.toThrow(/no write log is called "oam"/);
});

/**
 * The worker's picture grabs, for the pause lesson's run: the two frames
 * the record compares while paused come back the same byte for byte, a
 * frame before the pause differs, and each is storyboard's picture, pixel
 * for pixel: the colour index the worker hands back for every pixel and
 * the colour the record's frame-NNNNN.ppm holds there must pair off one
 * to one over the whole frame, both ways.
 */
test("the pause lesson's pictures from the worker are storyboard's frames, pixel for pixel", async ({ page }) => {
  const r = recorded("pause");
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "lessons", "pause", "lesson.json"), "utf8")) as { grabs: number[] };
  const ppm = (f: number) => path.join(ROOT, "lessons", "pause", "build", "run", `frame-${String(f).padStart(5, "0")}.ppm`);
  test.skip(!meta.grabs.every((f) => fs.existsSync(ppm(f))), "the pause lesson's run has no frame grabs here; build the lessons first");
  await page.setViewportSize(DESK);
  await open(page, "/nes/create", 300);
  const got = await page.evaluate(
    async ({ rom, script, frames, grabs }) => {
      const bytes = Uint8Array.from(atob(rom), (c) => c.charCodeAt(0));
      const at = script.split("\n").map((l) => l.trim().split(/\s+/)).filter((w) => w.length === 3 && w[0] === "AT").map((w) => [Number(w[1]), parseInt(w[2], 16)] as [number, number]);
      const w = new Worker("/nes/measure.worker.mjs", { type: "module" });
      const answer = await new Promise<{ pictures: Record<number, Uint8Array> }>((resolve, reject) => {
        w.onmessage = (e) => (e.data.ok ? resolve(e.data.answer) : reject(new Error(e.data.error)));
        w.onerror = () => reject(new Error("the worker failed to load"));
        w.postMessage({ id: 1, rom: bytes.buffer, script: at, frames, grabs });
      });
      w.terminate();
      return Object.fromEntries(Object.entries(answer.pictures).map(([f, p]) => [f, [...p]]));
    },
    { rom: r.rom, script: r.script, frames: r.frames, grabs: meta.grabs },
  );
  expect(Object.keys(got).map(Number).sort((a, b) => a - b)).toEqual([...meta.grabs].sort((a, b) => a - b));
  for (const f of meta.grabs) {
    const idx = got[f], rgb = fs.readFileSync(ppm(f));
    const head = "P6\n256 240\n255\n";
    expect(rgb.subarray(0, head.length).toString("latin1"), `frame ${f}'s file is a 256 by 240 picture`).toBe(head);
    expect(idx.length, `frame ${f}`).toBe(256 * 240);
    // One expect over the frame, not one a pixel: the first pixel whose pairing breaks is named.
    const toRgb = new Map<number, string>(), toIdx = new Map<string, number>();
    let broken: string | null = null;
    for (let i = 0; i < idx.length && broken === null; i++) {
      const c = rgb.subarray(head.length + i * 3, head.length + i * 3 + 3).toString("hex");
      const a = toRgb.get(idx[i]), b = toIdx.get(c);
      if ((a !== undefined && a !== c) || (b !== undefined && b !== idx[i])) broken = `pixel ${i}: index ${idx[i]} with colour ${c}, after index ${idx[i]} with ${a ?? "none"} and colour ${c} with index ${b ?? "none"}`;
      toRgb.set(idx[i], c);
      toIdx.set(c, idx[i]);
    }
    expect(broken, `frame ${f}`).toBeNull();
    expect(toRgb.size, `frame ${f} has more than one colour; a blank frame would pair off trivially`).toBeGreaterThan(1);
  }
  const [before, on, still] = meta.grabs;
  expect(got[on], "the two frames while paused").toEqual(got[still]);
  expect(got[before], "a frame before the pause").not.toEqual(got[on]);
});
