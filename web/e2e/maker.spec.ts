import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DESK, open } from "./lib";
import type { Lesson } from "../lib/lessons";

/**
 * The Sprite maker on /nes/create, without the generator (which wants a
 * signed-in browser): a PNG of our own, red, green and blue quarters on a
 * see-through ground, is fitted to three of the console's measured
 * colours and put into the jump lesson's tiles after its own, its codes
 * written into the program's sprite palette and the square drawn from the
 * new tiles; the program assembled is then the reader's, not the lesson's.
 */

const ROOT = path.join(__dirname, "..", "..");
const jump = () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  const l = r.lessons.find((x) => x.key === "jump");
  if (!l) throw new Error("no jump lesson in the record; the spec would pass on nothing");
  return l;
};

test("a picture of our own becomes three colours of tiles, and they go into the program", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/create?lesson=jump", 500);
  await expect(page.locator('[data-program-for="jump"]')).toHaveCount(1, { timeout: 15000 });
  // The console's colours are measured once something has been painted: play the lesson a moment.
  await page.locator("[data-desk-tab=maker]").click();
  await expect(page.locator("[data-play-run-sister]")).toBeEnabled({ timeout: 20000 });
  await page.locator("[data-play-run-sister]").click();
  await page.locator("[data-maker-file]").setInputFiles(path.join(__dirname, "fixtures", "sprite-quarters.png"));
  const codes = page.locator("[data-maker-codes]");
  await expect(codes).toHaveCount(1, { timeout: 30000 });
  const three = (await codes.getAttribute("data-maker-codes"))!.split(",");
  expect(three).toHaveLength(3);
  expect(new Set(three).size, "three different colours for three different quarters").toBe(3);
  // 16 pixels is four tiles. They go after the lesson's own three, so its
  // ground is not drawn over, and the program is edited to use them: the
  // three codes in its sprite palette, the square drawn from tiles 3 to 6.
  await page.locator("[data-maker-size='16']").click();
  await expect(page.locator("[data-maker-first]")).toHaveValue("3");
  const text = page.locator("[data-program-text]");
  const before = await text.inputValue();
  expect(before).toContain("    .byte $21,$16,$27,$30,");
  await page.locator("[data-maker-put]").click();
  await expect(page.locator("[data-maker-note]")).toContainText("3 to 6");
  const after = await text.inputValue();
  expect(after).toContain(`    .byte $21,${three.join(",")},$21,$16,$27,$30,`);
  expect(after.split("\n").map((l) => l.trim()).join(" ")).toContain("LDA #$03 STA $0201 LDA #$04 STA $0205 LDA #$05 STA $0209 LDA #$06 STA $020D");
  // Only those lines changed: the palette's one, and the draw's five become eight.
  expect(after.split("\n").length).toBe(before.split("\n").length + 3);
  await page.locator("[data-program-assemble]").click();
  const built = page.locator("[data-program-built]");
  await expect(built).toHaveCount(1, { timeout: 30000 });
  await expect(built).toHaveAttribute("data-program-same", "false");
  expect(await built.getAttribute("data-program-sha")).not.toBe(jump().sha256);
});
