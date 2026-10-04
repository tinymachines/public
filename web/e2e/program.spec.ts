import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DESK, open } from "./lib";
import type { Lesson } from "../lib/lessons";

/**
 * The Program window on /nes/create: a lesson's program opened from the
 * lesson's page, assembled in the page by the same code that built the
 * lesson (wasm/listing's lesson.rs). Unchanged, it must give the lesson's
 * own cartridge byte for byte; changed, a cartridge of the reader's own;
 * broken, a reason and nothing built.
 */

const ROOT = path.join(__dirname, "..", "..");
const KEY = "jump";
function record(): Lesson {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === KEY);
  if (!l) throw new Error(`data/lessons.json holds no ${KEY} lesson; the spec would pass on nothing`);
  return l;
}
const PRG = fs.readFileSync(path.join(ROOT, "lessons", KEY, "prg.s"), "utf8");

test("a lesson's page opens its program on the desk, and unchanged it assembles to the lesson's own cartridge", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, `/autopsy/lessons/${KEY}`, 500);
  await expect(page.locator("[data-lesson-desk]")).toHaveAttribute("href", `/nes/create?lesson=${KEY}`);
  await open(page, `/nes/create?lesson=${KEY}`, 500);
  const w = page.locator(`[data-program-for="${KEY}"]`);
  await expect(w).toHaveCount(1, { timeout: 15000 });
  await expect(w).toBeVisible();
  expect(await page.locator("[data-program-text]").inputValue()).toBe(PRG);
  await page.locator("[data-program-assemble]").click();
  const built = page.locator("[data-program-built]");
  await expect(built).toHaveCount(1, { timeout: 30000 });
  await expect(built).toHaveAttribute("data-program-sha", record().sha256);
  await expect(built).toHaveAttribute("data-program-same", "true");
});

test("a changed program is the reader's own cartridge, and a broken one says why and builds nothing", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, `/nes/create?lesson=${KEY}`, 500);
  const text = page.locator("[data-program-text]");
  await expect(text).toHaveCount(1, { timeout: 15000 });
  // A higher jump: the start of the jump's speed upward, one step stronger.
  expect(PRG).toContain("LDA #$FC");
  await text.fill(PRG.replace("LDA #$FC", "LDA #$FB"));
  await page.locator("[data-program-assemble]").click();
  const built = page.locator("[data-program-built]");
  await expect(built).toHaveCount(1, { timeout: 30000 });
  await expect(built).toHaveAttribute("data-program-same", "false");
  expect(await built.getAttribute("data-program-sha")).not.toBe(record().sha256);
  // Broken: an instruction the 6502 does not have.
  await text.fill(`${PRG}    LDQ #$00\n`);
  await page.locator("[data-program-assemble]").click();
  await expect(page.locator("[data-program-why]")).toHaveCount(1, { timeout: 30000 });
  await expect(built).toHaveCount(0);
  // Back to ours puts the lesson's program back as written.
  await page.locator("[data-program-ours]").click();
  expect(await text.inputValue()).toBe(PRG);
});
