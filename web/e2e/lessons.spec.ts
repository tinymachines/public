import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, DESK, JA_FLOOR, jaShare, open, PHONE, overflow, servedBody } from "./lib";
import type { Lesson } from "../lib/lessons";

/**
 * The lessons: our own cartridges, built from lessons/ and measured on our
 * console. Each page is held to data/lessons.json, the cartridge it offers
 * to the record's bytes, and the program it shows to the file in lessons/.
 */

const ROOT = path.join(__dirname, "..", "..");
function record(): Lesson[] {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  if (!r.lessons.length) throw new Error("data/lessons.json holds no lessons; the spec would pass on nothing");
  return r.lessons;
}

test("the lessons page lists every lesson, and the autopsy's front door lists the lessons", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/autopsy/lessons", 200);
  const hrefs = await page.locator("[data-lessons] a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(record().map((l) => `/autopsy/lessons/${l.key}`));
  await open(page, "/autopsy", 200);
  await expect(page.locator('[data-parts] a[href="/autopsy/lessons"]')).toHaveCount(1);
});

for (const l of record()) {
  test(`${l.key}: the page's figures are the record's, beside the game's`, async ({ page }) => {
    await page.setViewportSize(DESK);
    await open(page, `/autopsy/lessons/${l.key}`, 200);
    expect(l.against, "the jump lesson carries its comparison").toBeTruthy();
    const rows = await page.locator('tr[data-lesson-row="jump"]').evaluateAll((rs) => rs.map((r) => [(r as HTMLElement).dataset.lessonOurs, (r as HTMLElement).dataset.lessonTheirs]));
    expect(rows).toEqual(l.measures.jumps.map((j, i) => [`${j.frames},${j.risen}`, `${l.against!.jumps[i].frames},${l.against!.jumps[i].risen}`]));
    await expect(page.locator('tr[data-lesson-row="walk"] td').nth(1)).toHaveText(String(l.measures.full_speed_after));
    await expect(page.locator("[data-lesson-pictures] img")).toHaveCount(l.pictures.length);
  });

  test(`${l.key}: the cartridge and the program served are the record's and the repository's`, async ({ page, request }) => {
    await page.setViewportSize(DESK);
    await open(page, `/autopsy/lessons/${l.key}`, 200);
    const rom = await request.get(`${BASE}/autopsy/lessons/${l.key}.nes`);
    expect(rom.status()).toBe(200);
    const bytes = Buffer.from(await rom.body());
    expect(bytes.equals(Buffer.from(l.rom, "base64")), "the served cartridge is the recorded one").toBe(true);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("NES\x1a");
    const src = await request.get(`${BASE}/autopsy/lessons/${l.key}.s`);
    const text = await src.text();
    expect(text).toBe(fs.readFileSync(path.join(ROOT, "lessons", l.key, "prg.s"), "utf8"));
    const shown = (await page.locator("[data-lesson-code]").textContent()) ?? "";
    expect(shown.length, "an excerpt is shown").toBeGreaterThan(200);
    expect(text.includes(shown), "the excerpt is the program's own text").toBe(true);
  });

  test(`${l.key}: in Japanese it is Japanese, and it fits a phone`, async ({ page, request }) => {
    const html = await (await request.get(`${BASE}/ja/autopsy/lessons/${l.key}`)).text();
    expect(jaShare(servedBody(html))).toBeGreaterThanOrEqual(JA_FLOOR);
    await page.setViewportSize(PHONE);
    await open(page, `/ja/autopsy/lessons/${l.key}`, 200);
    const o = await overflow(page);
    expect(o.out, `${o.px}px sideways`).toEqual([]);
  });
}
