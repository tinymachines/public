import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DESK, open } from "./lib";
import type { Lesson } from "../lib/lessons";

/**
 * The Program window measures the cartridge it builds the way the lesson
 * was measured: the lesson's own pad script, run in the page with nobody
 * watching, and the same reading of the console's memory.
 *
 * The jump, run, stomp, walkers, camera, platforms and scroll lessons are
 * measured so far; scroll is the first to read a write log.
 *
 * The first test of each is the check that holds the page's measuring to the
 * record's: our own program, unchanged, must come out with exactly the
 * numbers data/lessons.json holds, which scripts/board-lessons.py wrote
 * from a different console build and a different language. The others
 * change the program and require the numbers to follow, and a program
 * that cannot be measured to say why.
 */

const ROOT = path.join(__dirname, "..", "..");
const jump = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "jump");
  if (!l || l.kind !== "jump") throw new Error("no jump lesson in the record; the spec would pass on nothing");
  return l;
};

async function assembled(page: import("@playwright/test").Page, change?: (text: string) => string, key = "jump") {
  await page.setViewportSize(DESK);
  await open(page, `/nes/create?lesson=${key}`, 500);
  await expect(page.locator(`[data-program-for="${key}"]`)).toHaveCount(1, { timeout: 15000 });
  const text = page.locator("[data-program-text]");
  await expect(text).not.toHaveValue("", { timeout: 15000 });
  if (change) {
    const was = await text.inputValue();
    const is = change(was);
    expect(is, "the change changes the program").not.toBe(was);
    await text.fill(is);
  }
  // The desk brings the window forward once the lesson has opened; wait for it.
  await expect(page.locator("[data-program-assemble]")).toBeVisible({ timeout: 20000 });
  await page.locator("[data-program-assemble]").click();
  await expect(page.locator("[data-program-built]")).toHaveCount(1, { timeout: 30000 });
}

const run = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "run");
  if (!l || l.kind !== "run") throw new Error("no run lesson in the record; the spec would pass on nothing");
  return l;
};

/** The run lesson's rows as the window keys them, from the record. A speed upward is shown positive. */
const runRows = () => {
  const m = run().measures;
  const want: Record<string, number | null> = { walk_top: m.walk_top, run_top: m.run_top, run_after: m.run_after, light_max: m.light_max, strong_min: m.strong_min };
  for (const [k, j] of [["walk", m.walk_jump], ["run", m.run_jump]] as const) {
    want[`${k}-first`] = -j.first;
    want[`${k}-held`] = j.held;
    want[`${k}-released`] = j.released;
    want[`${k}-rose`] = j.rose;
  }
  return want;
};

const read = (page: import("@playwright/test").Page) =>
  page.locator("[data-program-measure]").evaluateAll((trs) =>
    Object.fromEntries(trs.map((t) => [t.getAttribute("data-program-measure"), [Number(t.getAttribute("data-ours")), Number(t.getAttribute("data-yours"))]])),
  ) as Promise<Record<string, [number, number]>>;

test("our own program, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const m = jump().measures;
  expect(m.jumps.length, "the record has jumps to compare").toBeGreaterThan(1);
  await assembled(page);
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 30000 });
  const want: Record<string, [number, number]> = { full_speed_after: [m.full_speed_after, m.full_speed_after], full_speed: [m.full_speed, m.full_speed] };
  for (const j of m.jumps) {
    want[`frames-${j.held}`] = [j.frames, j.frames];
    want[`risen-${j.held}`] = [j.risen, j.risen];
  }
  expect(await read(page)).toEqual(want);
});

test("a stronger jump rises higher in the reader's column and ours stays as recorded", async ({ page }) => {
  const m = jump().measures;
  // The jump starts at 4 pixels a frame upward ($FC); 5 is $FB.
  await assembled(page, (t) => t.replace("    LDA #$FC\n    STA $17", "    LDA #$FB\n    STA $17"));
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "false");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 30000 });
  const got = await read(page);
  for (const j of m.jumps) {
    expect(got[`risen-${j.held}`][0]).toBe(j.risen);
    expect(got[`risen-${j.held}`][1], `held ${j.held}: a faster start rises higher`).toBeGreaterThan(j.risen);
  }
  // Walking was not touched.
  expect(got.full_speed).toEqual([m.full_speed, m.full_speed]);
  expect(await page.locator("[data-program-measure][data-same='false']").count()).toBeGreaterThan(0);
});

test("a program whose square never jumps is not given numbers, and says why", async ({ page }) => {
  // The routine that starts and carries a jump returns at once.
  await assembled(page, (t) => t.replace("jump:\n    LDA $03", "jump:\n    RTS\n    LDA $03"));
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 30000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("never left the ground");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

test("the run lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = runRows();
  expect(Object.values(want).every((v) => typeof v === "number"), "the record has a number in every row").toBe(true);
  await assembled(page, undefined, "run");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  // Forty-one runs, one after another.
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  expect(await read(page)).toEqual(Object.fromEntries(Object.entries(want).map(([k, v]) => [k, [v, v]])));
});

test("a square that speeds up faster reaches its running top sooner, and the rest stays as recorded", async ({ page }) => {
  const want = runRows();
  // Running adds 14/256 a frame ($0E); 28 is $1C.
  await assembled(page, (t) => t.replace("running:\n    CLC\n    LDA $12\n    ADC #$0E", "running:\n    CLC\n    LDA $12\n    ADC #$1C"), "run");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await read(page);
  expect(got.run_after[0]).toBe(want.run_after as number);
  expect(got.run_after[1]).toBeLessThan(want.run_after as number);
  for (const k of ["walk_top", "run_top", "walk-first", "walk-rose", "run-first"]) expect(got[k], k).toEqual([want[k] as number, want[k] as number]);
});

test("a run program with one jump for every speed is not given numbers, and says why", async ({ page }) => {
  // The strong jump starts at the light jump's speed.
  await assembled(page, (t) => t.replace("    INC $18\n    LDA #$FB", "    INC $18\n    LDA #$FC"), "run");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("no jump started at 5 pixels a frame");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

/** The stomp lesson's rows as the window keys them, from the record. */
const stompRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "stomp");
  if (!l || l.kind !== "stomp") throw new Error("no stomp lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const want: Record<string, number> = { walk: m.walk, "stomp-flat": m.stomp.flat };
  for (const [k, t] of [["stomp", m.stomp], ["hit", m.hit]] as const) {
    want[`${k}-frame`] = t.frame;
    want[`${k}-dx`] = t.dx;
    want[`${k}-dy`] = t.dy;
    want[`${k}-fall`] = t.fall;
    want[`${k}-after`] = t.after;
    want[`${k}-state`] = t.state[1];
  }
  return want;
};

test("the stomp lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = stompRows();
  expect(want["stomp-frame"], "the record has a stomp before its hit").toBeLessThan(want["hit-frame"]);
  await assembled(page, undefined, "stomp");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 30000 });
  expect(await read(page)).toEqual(Object.fromEntries(Object.entries(want).map(([k, v]) => [k, [v, v]])));
});

test("a walker made to stay flat twice as long does, and the stomp itself stays as recorded", async ({ page }) => {
  const want = stompRows();
  // A stomped walker stays flat 25 frames ($19); 50 is $32.
  await assembled(page, (t) => t.replace("    LDA #$19\n    STA $63", "    LDA #$32\n    STA $63"), "stomp");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 30000 });
  const got = await read(page);
  expect(got["stomp-flat"]).toEqual([want["stomp-flat"], want["stomp-flat"] * 2]);
  for (const k of ["walk", "stomp-frame", "stomp-dx", "stomp-dy", "stomp-fall", "stomp-after"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a stomp program where every touch is a hit is not given numbers, and says why", async ({ page }) => {
  await assembled(page, (t) => t.replace("    ORA $16\n    BEQ hit", "    JMP hit"), "stomp");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 30000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("never stomped the walker");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

/** The walkers lesson's rows as the window keys them, from the record: a list is its items joined by a space. */
const walkersRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "walkers");
  if (!l || l.kind !== "walkers") throw new Error("no walkers lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  return {
    pixels: String(m.pixels), every: String(m.every), wall_turns: String(m.wall_turns), meetings: String(m.meetings),
    inside: m.inside.map((b) => (b ? 1 : 0)).join(" "), overlap: m.overlap.join(" "),
  } as Record<string, string>;
};

/** The rows as attribute text, for a lesson whose record keeps lists. */
const readText = (page: import("@playwright/test").Page) =>
  page.locator("[data-program-measure]").evaluateAll((trs) =>
    Object.fromEntries(trs.map((t) => [t.getAttribute("data-program-measure"), [t.getAttribute("data-ours"), t.getAttribute("data-yours")]])),
  ) as Promise<Record<string, [string, string]>>;

test("the walkers lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = walkersRows();
  expect(Object.keys(want).length, "the record has the walkers' six measures").toBe(6);
  await assembled(page, undefined, "walkers");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 60000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("walkers made to step every frame do, and their pace in pixels stays as recorded", async ({ page }) => {
  const want = walkersRows();
  // The walkers move on the frames $44 is 1, which EOR toggles; always 1 is every frame.
  await assembled(page, (t) => t.replace("    LDA $44\n    EOR #$01\n    STA $44", "    LDA $44\n    LDA #$01\n    STA $44"), "walkers");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 60000 });
  const got = await readText(page);
  expect(got.every).toEqual([want.every, "1"]);
  expect(got.pixels).toEqual([want.pixels, want.pixels]);
});

test("walkers that walk through each other are not given numbers, and say why", async ({ page }) => {
  await assembled(page, (t) => t.replace("    CMP #$11\n    BCS resting", "    JMP resting"), "walkers");
  await expect(page.locator("[data-program-measure-why]")).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("0 meetings");
});

/** The camera lesson's rows as the window keys them, from the record; a yes or no is 1 or 0, none is "". */
const cameraRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "camera");
  if (!l || l.kind !== "camera") throw new Error("no camera lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const v = (x: number | null) => (x === null ? "" : String(x));
  return { starts_at: v(m.starts_at), holds_at: v(m.holds_at), eased: v(m.eased), back: m.back ? "1" : "0", back_at: v(m.back_at), restarts_at: v(m.restarts_at) } as Record<string, string>;
};

test("the camera lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = cameraRows();
  expect(want.back, "the record's camera comes back").toBe("1");
  await assembled(page, undefined, "camera");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 60000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a camera made to hold the square at 96 does, and where it starts stays as recorded", async ({ page }) => {
  const want = cameraRows();
  // The camera takes every pixel past $71 (113) and sets itself to x less $70 (112); 97 and 96.
  await assembled(page, (t) => t.replace("    CMP #$71\n    BCC hold", "    CMP #$61\n    BCC hold").replace("    SBC #$70\n    STA $20", "    SBC #$60\n    STA $20"), "camera");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 60000 });
  const got = await readText(page);
  expect(got.holds_at).toEqual([want.holds_at, "96"]);
  expect(got.starts_at).toEqual([want.starts_at, want.starts_at]);
});

test("a program whose camera is never moved is not given numbers, and says why", async ({ page }) => {
  await assembled(page, (t) => t.replace("    JSR camera\n", ""), "camera");
  await expect(page.locator("[data-program-measure-why]")).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("never moved right");
});

/** The platforms lesson's rows as the window keys them, from the record; a yes or no is 1 or 0, none is "". */
const platformsRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "platforms");
  if (!l || l.kind !== "platforms") throw new Error("no platforms lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const v = (x: number | null) => (x === null ? "" : String(x));
  return { axis: m.axis, step: v(m.step), every: v(m.every), travel: v(m.travel), standing: v(m.standing), stepped: v(m.stepped), same: v(m.same), steady: m.steady ? "1" : "0" } as Record<string, string>;
};

test("the platforms lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = platformsRows();
  expect(Number(want.same), "the record's lift carried the square").toBeGreaterThan(0);
  await assembled(page, undefined, "platforms");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 60000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a lift made to turn back sooner travels less, and its step stays as recorded", async ({ page }) => {
  const want = platformsRows();
  // The lift turns at x 80 and x 128 ($80); turning at 112 ($70) instead, it travels 32.
  await assembled(page, (t) => t.replace("    CMP #$80\n    BNE moved", "    CMP #$70\n    BNE moved"), "platforms");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 60000 });
  const got = await readText(page);
  expect(got.travel).toEqual([want.travel, "32"]);
  expect(got.step).toEqual([want.step, want.step]);
  expect(got.axis).toEqual([want.axis, want.axis]);
});

test("a program whose lift is never moved is not given numbers, and says why", async ({ page }) => {
  await assembled(page, (t) => t.replace("    JSR lift\n", ""), "platforms");
  await expect(page.locator("[data-program-measure-why]")).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("the lift never moved");
});

/** The scroll lesson's rows as the window keys them, from the record; a list is its items joined by a space. */
const scrollRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "scroll");
  if (!l || l.kind !== "scroll") throw new Error("no scroll lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const j = (v: (string | number)[]) => v.join(" ");
  return {
    strips: String(m.strips), every_min: String(m.every_min), every_max: String(m.every_max), every_mean: String(m.every_mean),
    frames: j(m.frames), columns: j(m.columns), tiles: j(m.tiles), colours: j(m.colours),
    ahead_min: String(m.ahead_min), ahead_max: String(m.ahead_max), column_frames: j(m.column_frames), last_write: j(m.last_write),
  } as Record<string, string>;
};

test("the scroll lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = scrollRows();
  expect(Number(want.strips), "the record has strips").toBeGreaterThan(0);
  await assembled(page, undefined, "scroll");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("strips built one further ahead land 32 pixels further past the edge, and the rest stays as recorded", async ({ page }) => {
  const want = scrollRows();
  // The strip built is eleven 32-pixel steps past the camera's; twelve is a strip further on.
  await assembled(page, (t) => t.replace("    ADC #$0B\n", "    ADC #$0C\n"), "scroll");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.ahead_min).toEqual([want.ahead_min, String(Number(want.ahead_min) + 32)]);
  expect(got.ahead_max).toEqual([want.ahead_max, String(Number(want.ahead_max) + 32)]);
  for (const k of ["strips", "frames", "columns", "tiles", "colours", "column_frames", "last_write"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a program that never starts a strip is not given numbers, and says why", async ({ page }) => {
  await assembled(page, (t) => t.replace("    LDA #$07\n    STA $23", "    LDA #$00\n    STA $23"), "scroll");
  await expect(page.locator("[data-program-measure-why]")).toHaveCount(1, { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("no strip was started");
});

test("a lesson the page cannot measure yet shows no measurements", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/create?lesson=rooms", 500);
  await expect(page.locator('[data-program-for="rooms"]')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator("[data-program-assemble]")).toBeVisible({ timeout: 20000 });
  await page.locator("[data-program-assemble]").click();
  await expect(page.locator("[data-program-built]")).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator("[data-program-measured]")).toHaveCount(0);
});
