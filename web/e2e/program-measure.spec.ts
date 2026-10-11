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
 * The first test is the check that holds the page's measuring to the
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

async function assembled(page: import("@playwright/test").Page, change?: (text: string) => string) {
  await page.setViewportSize(DESK);
  await open(page, "/nes/create?lesson=jump", 500);
  await expect(page.locator('[data-program-for="jump"]')).toHaveCount(1, { timeout: 15000 });
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

test("a lesson the page cannot measure yet shows no measurements", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/create?lesson=scroll", 500);
  await expect(page.locator('[data-program-for="scroll"]')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator("[data-program-assemble]")).toBeVisible({ timeout: 20000 });
  await page.locator("[data-program-assemble]").click();
  await expect(page.locator("[data-program-built]")).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator("[data-program-measured]")).toHaveCount(0);
});
