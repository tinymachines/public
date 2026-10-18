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
 * The jump, run, stomp, walkers, camera, platforms, scroll, rooms, screens,
 * status, sound, pause, title, items, menu, splash, about, solid and flicker
 * lessons are measured so far; scroll, rooms, status, sound, pause, title, items,
 * menu, splash, about and solid read the write logs, pause two
 * pictures besides, and screens takes only the part of its record the page
 * can.
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

/** The rooms lesson's rows as the window keys them, from the record. */
const roomsRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "rooms");
  if (!l || l.kind !== "rooms") throw new Error("no rooms lesson in the record; the spec would pass on nothing");
  const m = l.measures, u = m.up;
  if (!u) throw new Error("the rooms record has no step up; the spec would pass on nothing");
  const v = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  const j = (x: (string | number)[]) => x.join(" ");
  const runs = (x: Record<string, number>) => Object.entries(x).map(([k, n]) => `${k} ${n}`).join("; ");
  return {
    mirroring: `${m.mirroring?.playing}${m.mirroring?.fixed ? " fixed" : ""}`,
    before: v(m.before), after: v(m.after), wait: v(m.wait), slide: v(m.slide), travel: v(m.travel), step: v(m.step),
    written_before: runs(m.written_before), written_during: runs(m.written_during),
    column_every: j(m.column_every), columns_from: v(m.columns_from), columns: v(m.columns),
    "up-before": v(u.before), "up-after": v(u.after), "up-rows": v(u.rows), "up-tiles": j(u.tiles), "up-first": v(u.first), "up-every": j(u.every),
    "up-upward": u.upward ? "1" : "0", "up-from_row": v(u.from_row), "up-to_row": v(u.to_row),
  } as Record<string, string>;
};

test("the rooms lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = roomsRows();
  expect(Number(want.columns), "the record's slide wrote columns").toBeGreaterThan(0);
  await assembled(page, undefined, "rooms");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a room that slides in twice as fast steps 8 pixels a frame and travels twice as far, and its columns stay as recorded", async ({ page }) => {
  const want = roomsRows();
  // Sliding left, the scroll moves 4 pixels a step for 64 steps; 8 is twice the step and twice the travel.
  await assembled(page, (t) => t.replace("    LDA $36\n    SBC #$04\n    STA $36", "    LDA $36\n    SBC #$08\n    STA $36"), "rooms");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.step).toEqual([want.step, String(Number(want.step) * 2)]);
  expect(got.travel).toEqual([want.travel, String(Number(want.travel) * 2)]);
  for (const k of ["before", "after", "columns", "column_every", "up-rows", "up-upward"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a program whose square never leaves its room is not given numbers, and says why", async ({ page }) => {
  await assembled(page, (t) => t.replace("leave:\n    STA $32", "leave:\n    RTS\n    STA $32"), "rooms");
  await expect(page.locator("[data-program-measure-why]")).toHaveCount(1, { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("never changed");
});

/** The screens lesson's rows as the window keys them, from the record: the part the page measures. */
const screensRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "screens");
  if (!l || l.kind !== "screens") throw new Error("no screens lesson in the record; the spec would pass on nothing");
  const m = l.measures, pz = m.pause;
  if (!pz) throw new Error("the screens record has no pause; the spec would pass on nothing");
  return { values: m.values.join(" "), changes: String(m.changes), "pause-before": String(pz.before), "pause-during": String(pz.during), "pause-frames": String(pz.frames) } as Record<string, string>;
};

test("the screens lesson, unchanged, measures in the page to exactly the numbers the record holds, and says what it does not take", async ({ page }) => {
  const want = screensRows();
  await assembled(page, undefined, "screens");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
  await expect(page.locator("[data-program-not-taken]")).toContainText("autopsy");
});

test("a pause that returns to the title instead of play shows in the values, and the pause itself stays as recorded", async ({ page }) => {
  const want = screensRows();
  // Start while paused sets the screen to 1, playing; 0 is the title.
  await assembled(page, (t) => t.replace("    LDA #$01\n    STA $40\nheld:", "    LDA #$00\n    STA $40\nheld:"), "screens");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.values).toEqual([want.values, want.values.replace(/ \d+$/, " 0")]);
  for (const k of ["changes", "pause-before", "pause-during", "pause-frames"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a program whose title never answers Start is not given numbers, and says why", async ({ page }) => {
  await assembled(page, (t) => t.replace("    JSR pressed\n    BEQ stay\n", "    JSR pressed\n    JMP stay\n"), "screens");
  await expect(page.locator("[data-program-measure-why]")).toHaveCount(1, { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("never changed");
});

/** The status lesson's rows as the window keys them, from the record. */
const statusRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "status");
  if (!l || l.kind !== "status") throw new Error("no status lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  return {
    split_line: String(m.split_line), split_frames: String(m.split_frames), frames: String(m.frames), bar_scroll: m.bar_scroll.join(" "),
    "timer-row": String(m.timer.row), "timer-column": String(m.timer.column), "timer-tiles": String(m.timer.tiles), "timer-writes": String(m.timer.writes), "timer-every": m.timer.every.join(" "),
    other_bar_writes: String(m.other_bar_writes),
  } as Record<string, string>;
};

test("the status lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = statusRows();
  expect(Number(want["timer-writes"]), "the record's timer was written").toBeGreaterThan(0);
  await assembled(page, undefined, "status");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a timer that ticks every 12 frames is written every 12 and twice as often, and the split stays as recorded", async ({ page }) => {
  const want = statusRows();
  // The timer's countdown is 24 ($18), set at power-on and at each tick; both become 12 ($0C).
  await assembled(page, (t) => t.split("    LDA #$18\n    STA $73").join("    LDA #$0C\n    STA $73"), "status");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got["timer-every"]).toEqual([want["timer-every"], "12"]);
  expect(got["timer-writes"]).toEqual([want["timer-writes"], String(Number(want["timer-writes"]) * 2)]);
  for (const k of ["split_line", "split_frames", "bar_scroll", "timer-row", "timer-column", "timer-tiles", "other_bar_writes"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a program that never sets the scroll while the picture draws is not given numbers, and says why", async ({ page }) => {
  await assembled(page, (t) => t.replace("    LDA $20\n    STA $2005\n    LDA #$00\n    STA $2005\n    JSR readpad", "    JSR readpad"), "status");
  await expect(page.locator("[data-program-measure-why]")).toHaveCount(1, { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("never split");
});

/** The sound lesson's rows as the window keys them, from the record; a measure the record leaves out is "". */
const soundRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "sound");
  if (!l || l.kind !== "sound") throw new Error("no sound lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const v = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  return { music_before: v(m.music_before), starts: v(m.starts), sweep_settings: v(m.sweep_settings), sweep_frames: (m.sweep_frames ?? []).join(" "), music_back: v(m.music_back) } as Record<string, string>;
};

test("the sound lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = soundRows();
  expect(Number(want.sweep_settings), "the record's jump sound set the sweep").toBeGreaterThan(0);
  await assembled(page, undefined, "sound");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a jump sound without the pitch sweep shows no sweep settings and nothing that hangs on them, and the music before stays as recorded", async ({ page }) => {
  const want = soundRows();
  // The jump sound's sweep setting is $9B, bit 7 the sweep on; $1B is the same with it off.
  await assembled(page, (t) => t.replace("    LDA #$9B\n    STA $4001", "    LDA #$1B\n    STA $4001"), "sound");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.sweep_settings).toEqual([want.sweep_settings, "0"]);
  for (const k of ["starts", "sweep_frames", "music_back"]) expect(got[k], k).toEqual([want[k], ""]);
  expect(got.music_before).toEqual([want.music_before, want.music_before]);
});

test("a lesson the page cannot measure yet shows no measurements", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/create?lesson=lives", 500);
  await expect(page.locator('[data-program-for="lives"]')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator("[data-program-assemble]")).toBeVisible({ timeout: 20000 });
  await page.locator("[data-program-assemble]").click();
  await expect(page.locator("[data-program-built]")).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator("[data-program-measured]")).toHaveCount(0);
});

/** The pause lesson's rows as the window keys them, from the record: lists joined by a space, yes and no as 1 and 0, none as "". */
const pauseRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "pause");
  if (!l || l.kind !== "pause") throw new Error("no pause lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const v = (x: number | null) => (x === null ? "" : String(x));
  const yn = (b: boolean) => (b ? "1" : "0");
  return {
    ignored_after: m.ignored_after.join(" "), a_pressed: yn(m.a_pressed), stops: v(m.stops), starts: v(m.starts), held: yn(m.held), wait: v(m.wait), drawn: v(m.drawn),
    same_picture: yn(m.same_picture), cut: yn(m.cut), chime_notes: v(m.chime_notes), chime_every: m.chime_every.join(" "), music_back: v(m.music_back),
  } as Record<string, string>;
};

test("the pause lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = pauseRows();
  expect(want.same_picture, "the record's two pictures taken while paused are the same; a comparison of nothing would say so too").toBe("1");
  expect(Number(want.chime_notes), "the record's chime has notes").toBeGreaterThan(0);
  await assembled(page, undefined, "pause");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a pause that ignores Start for half as long waits 16, loses the chime's note past the wait and brings the music back in 16, and the hold stays as recorded", async ({ page }) => {
  const want = pauseRows();
  // The press loads $54 with the frames Start is ignored: $20 is 32, $10 is 16.
  await assembled(page, (t) => t.replace("    LDA #$20\n    STA $54", "    LDA #$10\n    STA $54"), "pause");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.wait).toEqual([want.wait, "16"]);
  expect(got.music_back).toEqual([want.music_back, "16"]);
  expect(got.chime_notes).toEqual([want.chime_notes, String(Number(want.chime_notes) - 1)]);
  for (const k of ["ignored_after", "a_pressed", "stops", "starts", "held", "drawn", "same_picture", "cut", "chime_every"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a program whose Start never pauses is not given numbers, and says why", async ({ page }) => {
  // The new press of Start is tested and acted on; jumping past it leaves every press ignored.
  await assembled(page, (t) => t.replace("    AND #$10\n    BEQ none", "    AND #$10\n    JMP none"), "pause");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("0 of 3 presses of Start");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

/** The title lesson's rows as the window keys them, from the record: yes and no as 1 and 0, a part the record leaves out as "". */
const titleRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "title");
  if (!l || l.kind !== "title") throw new Error("no title lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const v = (x?: number | null) => (x === null || x === undefined ? "" : String(x));
  return {
    "title-frames": v(m.title.frames), "title-cleared": v(m.title.cleared), "title-tiles": v(m.title.tiles),
    "demo-frames": v(m.demo?.frames), "demo-scrolled": m.demo ? (m.demo.scrolled ? "1" : "0") : "",
    "cursor-tiles": v(m.cursor?.tiles), "cursor-step": v(m.cursor?.step), countdown: v(m.countdown), start_demo: v(m.start_demo), start_title: v(m.start_title),
  } as Record<string, string>;
};

test("the title lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = titleRows();
  for (const k of ["demo-frames", "cursor-tiles", "countdown", "start_demo", "start_title"]) expect(want[k], `the record holds ${k}; a match of two empty cells would pass on nothing`).not.toBe("");
  await assembled(page, undefined, "title");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a countdown of 9 steps instead of 18 runs out 180 frames sooner, and the title, the cursor and the demo stay as recorded", async ({ page }) => {
  const want = titleRows();
  // A Select starts the countdown over at $12 steps of 20 frames; $09 is half as many.
  await assembled(page, (t) => t.replace("    STA $44\n    LDA #$12\n    STA $45\n    RTS\nnoselect:", "    STA $44\n    LDA #$09\n    STA $45\n    RTS\nnoselect:"), "title");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.countdown).toEqual([want.countdown, String(Number(want.countdown) - 180)]);
  for (const k of ["title-frames", "title-cleared", "title-tiles", "demo-frames", "demo-scrolled", "cursor-tiles", "cursor-step"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a program that clears only half of each name table draws no title the page can find, and says why", async ({ page }) => {
  // Each table is cleared 4 times 256 writes; 2 times is half a table, never a whole one.
  await assembled(page, (t) => t.replace("    LDY #$04\n    TAX\nempty:", "    LDY #$02\n    TAX\nempty:"), "title");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("no title was drawn");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

/** The items lesson's rows as the window keys them, from the record: yes and no as 1 and 0. */
const itemsRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "items");
  if (!l || l.kind !== "items") throw new Error("no items lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const v = (x: number | null) => (x === null ? "" : String(x));
  const yn = (b: boolean) => (b ? "1" : "0");
  return {
    step: v(m.step), travel: v(m.travel), open_frames: v(m.open_frames), close_frames: v(m.close_frames), close_step: v(m.close_step),
    ignored: yn(m.ignored), split: yn(m.split), rows: v(m.rows), bottom_up: yn(m.bottom_up), every: v(m.every), rows_closing: v(m.rows_closing),
    fixed: yn(m.mirroring.fixed), changes: v(m.mirroring.changes),
  } as Record<string, string>;
};

test("the items lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = itemsRows();
  expect(Number(want.rows), "the record holds rows drawn; a match of no rows would pass on nothing").toBeGreaterThan(0);
  await assembled(page, undefined, "items");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("an item screen that stops 64 pixels short slides 16 frames less each way, at the same 4 pixels a frame", async ({ page }) => {
  const want = itemsRows();
  // The opening slide stops when the scroll is $40 down; $80 is 64 pixels, 16 frames of 4, sooner.
  await assembled(page, (t) => t.replace("    SBC #$04\n    STA $41\n    CMP #$40", "    SBC #$04\n    STA $41\n    CMP #$80"), "items");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.travel).toEqual([want.travel, String(Number(want.travel) - 64)]);
  expect(got.open_frames).toEqual([want.open_frames, String(Number(want.open_frames) - 16)]);
  expect(got.close_frames).toEqual([want.close_frames, String(Number(want.close_frames) - 16)]);
  for (const k of ["step", "close_step", "ignored", "split", "bottom_up", "every", "fixed", "changes"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a program that never reads Start never slides, and the page says why rather than giving numbers", async ({ page }) => {
  // The stage reads the pad's new presses masked to Start; masked to nothing, no press is ever seen.
  await assembled(page, (t) => t.replace("    AND $01\n    AND #$10\n    TAX", "    AND $01\n    AND #$00\n    TAX"), "items");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("the picture never slid after the Start that opens it");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

/** The menu lesson's rows as the window keys them, from the record: lists joined by a space, each A's pair as frames/tiles, yes and no as 1 and 0. */
const menuRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "menu");
  if (!l || l.kind !== "menu") throw new Error("no menu lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const v = (x: number | null) => (x === null ? "" : String(x));
  return {
    after_press: m.after_press.join(" "), wait: v(m.wait), every: v(m.every), width: v(m.width), wraps_to: v(m.wraps_to),
    typed: m.typed.map(([a, b]) => `${a}/${b}`).join(" "), behind: m.behind ? "1" : "0", "blink-on": v(m.blink[0]), "blink-off": v(m.blink[1]),
    moves: v(m.moves), clicks: v(m.clicks),
  } as Record<string, string>;
};

test("the menu lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = menuRows();
  for (const k of ["wait", "every", "wraps_to", "typed"]) expect(want[k], `the record holds ${k}; a match of two empty cells would pass on nothing`).not.toBe("");
  await assembled(page, undefined, "menu");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a held cursor that moves every 3 frames instead of 6 shows in the beat and the count, and the wait, the grid and the letters stay as recorded", async ({ page }) => {
  const want = menuRows();
  // Held, the cursor moves again every $06 frames after the first wait; $03 is twice as fast.
  await assembled(page, (t) => t.replace("    LDA #$06\n    STA $06\nstep:", "    LDA #$03\n    STA $06\nstep:"), "menu");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.every).toEqual([want.every, "3"]);
  expect(Number(got.moves[1]), "more moves in the same held second").toBeGreaterThan(Number(want.moves));
  for (const k of ["after_press", "wait", "width", "wraps_to", "typed", "behind", "blink-on", "blink-off"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a cursor that never answers the pad is not given numbers, and the page says why", async ({ page }) => {
  // The steering reads the pad's directions; masked to nothing, no press moves it.
  await assembled(page, (t) => t.replace("    LDA $01\n    AND #$0F\n    BEQ still\n    LDA $02", "    LDA $01\n    AND #$00\n    BEQ still\n    LDA $02"), "menu");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("the cursor never moved after the press at frame 20");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

/** The splash lesson's rows as the window keys them, from the record. */
const splashRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "splash");
  if (!l || l.kind !== "splash") throw new Error("no splash lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  return Object.fromEntries((["shown", "tiles", "turn_every", "turns", "fade_steps", "fade_frames", "fall", "loop"] as const).map((k) => [k, m[k] === null ? "" : String(m[k])])) as Record<string, string>;
};

test("the splash lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = splashRows();
  for (const k of ["turn_every", "fall", "loop"]) expect(want[k], `the record holds ${k}; a match of two empty cells would pass on nothing`).not.toBe("");
  await assembled(page, undefined, "splash");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("colours that turn every 4 frames instead of 8 turn twice as often, and the fade, the drops and the tiles stay as recorded", async ({ page }) => {
  const want = splashRows();
  // The word's colours turn when $44 counts to $08; $04 is twice as often.
  await assembled(page, (t) => t.replace("    LDA $44\n    CMP #$08", "    LDA $44\n    CMP #$04"), "splash");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.turn_every).toEqual([want.turn_every, "4"]);
  expect(Number(got.turns[1]), "more turns before the same fade").toBeGreaterThan(Number(want.turns));
  for (const k of ["tiles", "fade_steps", "fade_frames", "fall", "loop"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a splash whose colours never turn is not given numbers, and the page says why", async ({ page }) => {
  // A turn asks for the word's four colours to be written; asking for nothing writes none.
  await assembled(page, (t) => t.replace("    LDA #$01\n    STA $46\ncount:", "    LDA #$00\n    STA $46\ncount:"), "splash");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("no colours turned");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

/** The about lesson's rows as the window keys them, from the record: yes and no as 1 and 0. */
const aboutRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "about");
  if (!l || l.kind !== "about") throw new Error("no about lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  const v = (x: number | null) => (x === null ? "" : String(x));
  return {
    step: v(m.step), every: v(m.every), crawled: v(m.crawled), split: m.split ? "1" : "0", rows: v(m.rows),
    row_every: v(m.row_every), row_pixels: v(m.row_pixels), colours: v(m.colours), other: v(m.other), frames: v(m.frames),
  } as Record<string, string>;
};

test("the about lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = aboutRows();
  for (const k of ["step", "every", "row_every", "row_pixels"]) expect(want[k], `the record holds ${k}; a match of two empty cells would pass on nothing`).not.toBe("");
  await assembled(page, undefined, "about");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("words that crawl every frame instead of every second one write a row every 8 frames, and a row still stands for 8 pixels", async ({ page }) => {
  const want = aboutRows();
  // $42 flips every frame and the crawl waits while it is 1; flipped by nothing it stays 0, and the words move every frame.
  await assembled(page, (t) => t.replace("    LDA $42\n    EOR #$01\n    STA $42", "    LDA $42\n    EOR #$00\n    STA $42"), "about");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.every).toEqual([want.every, "1"]);
  expect(got.row_every).toEqual([want.row_every, String(Number(want.row_every) / 2)]);
  expect(Number(got.crawled[1]), "farther in the same time").toBeGreaterThan(Number(want.crawled));
  for (const k of ["step", "split", "row_pixels", "colours", "other"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("rows written half across are no rows of words, and the page says why rather than giving numbers", async ({ page }) => {
  // A row is 32 tiles; stopping the copy at $10 writes 16.
  await assembled(page, (t) => t.replace("    INX\n    CPX #$20\n    BNE row", "    INX\n    CPX #$10\n    BNE row"), "about");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("no whole row of words was written");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

/** The solid lesson's rows as the window keys them, from the record: a list joined by a space, yes and no as 1 and 0. */
const solidRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "solid");
  if (!l || l.kind !== "solid") throw new Error("no solid lesson in the record; the spec would pass on nothing");
  const m = l.measures;
  return {
    rising: String(m.rising), fall_frames: String(m.fall_frames), block_after: String(m.block_after), block_back: String(m.block_back),
    wall_x: String(m.wall_x), pushed_back: m.pushed_back ? "1" : "0", zeroed: String(m.zeroed), zeroed_every: m.zeroed_every.join(" "), pushing_frames: String(m.pushing_frames),
  } as Record<string, string>;
};

test("the solid lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = solidRows();
  expect(want.zeroed_every, "the record holds the wall's beat; a match of two empty cells would pass on nothing").not.toBe("");
  await assembled(page, undefined, "solid");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a bumped block that waits 6 frames instead of 12 comes back 6 frames sooner, and the jump and the wall stay as recorded", async ({ page }) => {
  const want = solidRows();
  // The bumped block waits $0C frames before its tiles come back; $06 is half.
  await assembled(page, (t) => t.replace("    LDA #$0C\n    STA $31", "    LDA #$06\n    STA $31"), "solid");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got.block_back).toEqual([want.block_back, String(Number(want.block_back) - 6)]);
  for (const k of ["rising", "fall_frames", "block_after", "wall_x", "pushed_back", "zeroed", "zeroed_every", "pushing_frames"]) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a bump that never draws its block is not given numbers, and the page says why", async ({ page }) => {
  // A bump sets the block's tiles to be blanked; setting nothing to do draws none.
  await assembled(page, (t) => t.replace("    LDA #$01\n    STA $30\n    LDA #$0C", "    LDA #$00\n    STA $30\n    LDA #$0C"), "solid");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("no block's tiles were written near the touch");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});

/** The flicker lesson's rows as the window keys them, from the record: the order kept and turning, each its five numbers. */
const flickerRows = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "flicker");
  if (!l || l.kind !== "flicker") throw new Error("no flicker lesson in the record; the spec would pass on nothing");
  const out: Record<string, string> = {};
  for (const w of ["kept", "turned"] as const) for (const [k, v] of Object.entries(l.measures[w])) out[`${w}-${k}`] = v === null ? "" : String(v);
  return out;
};

test("the flicker lesson, unchanged, measures in the page to exactly the numbers the record holds", async ({ page }) => {
  const want = flickerRows();
  expect(want["turned-cycle"], "the record holds the turning's cycle; a match of two empty cells would pass on nothing").not.toBe("");
  await assembled(page, undefined, "flicker");
  await expect(page.locator("[data-program-built]")).toHaveAttribute("data-program-same", "true");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("an order that turns round five figures instead of ten comes back every 5 frames, and the line stays as recorded", async ({ page }) => {
  const want = flickerRows();
  // The figure written first goes back to the first after $0A; $05 turns it round half of them.
  await assembled(page, (t) => t.replace("    CMP #$0A\n    BCC kept", "    CMP #$05\n    BCC kept"), "flicker");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "yes", { timeout: 90000 });
  const got = await readText(page);
  expect(got["turned-cycle"]).toEqual([want["turned-cycle"], "5"]);
  for (const k of Object.keys(want).filter((k) => k !== "turned-cycle")) expect(got[k], k).toEqual([want[k], want[k]]);
});

test("a program that never writes its figures is not given numbers, and the page says why", async ({ page }) => {
  // The NMI sets the frame flag the main loop waits for; setting it to 0 means the figures are never written.
  await assembled(page, (t) => t.replace("    LDA #$01\n    STA $00\n    PLA", "    LDA #$00\n    STA $00\n    PLA"), "flicker");
  await expect(page.locator("[data-program-measured]")).toHaveAttribute("data-program-measured", "no", { timeout: 90000 });
  await expect(page.locator("[data-program-measure-why]")).toContainText("no sprite was on the screen at frame 10");
  await expect(page.locator("[data-program-measure]")).toHaveCount(0);
});
