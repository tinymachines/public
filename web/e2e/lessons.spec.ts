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
  const hrefs = await page.locator("[data-lessons] > li > a:first-child").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(record().map((l) => `/autopsy/lessons/${l.key}`));
  await open(page, "/autopsy", 200);
  await expect(page.locator('[data-parts] a[href="/autopsy/lessons"]')).toHaveCount(1);
});

for (const l of record()) {
  test(`${l.key}: the page's figures are the record's, beside the game's`, async ({ page }) => {
    await page.setViewportSize(DESK);
    await open(page, `/autopsy/lessons/${l.key}`, 200);
    expect(l.against, "every lesson so far carries its comparison").toBeTruthy();
    const rows = await page.locator("tr[data-lesson-row]").evaluateAll((rs) => rs.map((r) => [(r as HTMLElement).dataset.lessonRow, (r as HTMLElement).dataset.lessonOurs, (r as HTMLElement).dataset.lessonTheirs]));
    expect(rows.length, "a table of measures").toBeGreaterThan(2);
    for (const [k, ours, theirs] of rows) expect(ours && theirs, `${k}: both sides filled`).toBeTruthy();
    if (l.kind === "jump") {
      const a = l.against as typeof l.measures;
      expect(rows.filter((r) => r[0] === "jump").map((r) => [r[1], r[2]])).toEqual(l.measures.jumps.map((j, i) => [`${j.frames},${j.risen}`, `${a.jumps[i].frames},${a.jumps[i].risen}`]));
      expect(rows.find((r) => r[0] === "walk")?.[1]).toBe(String(l.measures.full_speed_after));
    } else if (l.kind === "status") {
      const a = l.against as typeof l.measures;
      expect(l.measures.split_line).toBe(a.split_line);
      expect(l.measures.other_bar_writes).toBe(0);
      expect(l.patterns?.["sprite-0-split"], "our own autopsy names our split").toBeTruthy();
    } else if (l.kind === "run") {
      const a = l.against as typeof l.measures;
      expect(l.measures.light_max).toBeLessThan(25);
      expect(l.measures.strong_min).toBeGreaterThanOrEqual(25);
      expect([a.light_max, a.strong_min]).toEqual([24, 25]);
      expect(rows.find((r) => r[0] === "walk")?.[1]).toBe(String(l.measures.walk_top));
    } else if (l.kind === "stomp") {
      expect(l.measures.compare?.some((c) => c.is_touch), "our own autopsy names our own touch test").toBe(true);
      await expect(page.locator("[data-lesson-found]")).toHaveCount(1);
      expect(rows.find((r) => r[0] === "flat")?.[1]).toBe(String(l.measures.stomp.flat));
    } else if (l.kind === "screens") {
      expect(rows.find((r) => r[0] === "values")?.[1]).toBe(l.measures.values.join(", "));
      expect(l.measures.engine, "our own autopsy finds our own jump engine").toBe(true);
    } else if (l.kind === "rooms") {
      const a = l.against as typeof l.measures;
      expect(rows.find((r) => r[0] === "slide")?.slice(1)).toEqual([String(l.measures.slide), String(a.slide)]);
      expect(rows.find((r) => r[0] === "wait")?.slice(1)).toEqual([String(l.measures.wait), String(a.wait)]);
    } else {
      const a = l.against as typeof l.measures;
      expect(rows.find((r) => r[0] === "strips")?.slice(1)).toEqual([String(l.measures.strips), String(a.strips)]);
      expect(rows.find((r) => r[0] === "tiles")?.slice(1)).toEqual([l.measures.tiles.join(" / "), a.tiles.join(" / ")]);
    }
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

test("a lesson's play button opens the play page with its cartridge in", async ({ page }) => {
  await page.setViewportSize(DESK);
  const l = record()[0];
  await open(page, `/autopsy/lessons/${l.key}`, 200);
  const href = await page.locator("[data-lesson-play]").getAttribute("href");
  expect(href).toBe(`/nes/play?lesson=${l.key}`);
  await open(page, href!, 500);
  await expect(page.locator("[data-play-status]")).toContainText(`${l.key}.nes`, { timeout: 20_000 });
  // A name that is not a lesson's loads nothing and says nothing went wrong.
  await open(page, "/nes/play?lesson=no-such-lesson", 1500);
  await expect(page.locator("[data-play-status]")).not.toContainText("no-such-lesson");
  await expect(page.locator("[data-play-why]")).toHaveCount(0);
});

test("each pattern our own autopsy found in a lesson points at that lesson", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/autopsy/patterns", 200);
  const told = await page.locator("[data-autopsy-pattern]").evaluateAll((ss) =>
    ss.map((s) => [(s as HTMLElement).dataset.autopsyPattern, [...s.querySelectorAll("[data-autopsy-pattern-lessons] a")].map((a) => a.getAttribute("href"))] as const));
  const want = new Map<string, string[]>();
  for (const l of record()) for (const p of Object.keys(l.patterns ?? {})) want.set(p, [...(want.get(p) ?? []), `/autopsy/lessons/${l.key}`]);
  expect(want.size, "the lessons hold patterns").toBeGreaterThan(2);
  for (const [p, hrefs] of told) expect(hrefs, String(p)).toEqual(want.get(String(p)) ?? []);
  // The two a lesson was written for are among them.
  expect(want.get("jump-engine")).toContain("/autopsy/lessons/screens");
  expect(want.get("position-compare")).toContain("/autopsy/lessons/stomp");
});
