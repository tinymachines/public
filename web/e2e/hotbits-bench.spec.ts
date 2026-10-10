import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DESK, NARROW, open, overflow } from "./lib";

/**
 * /hotbits/bench: the bench the pool comes from, shelved like /nes/bench.
 * Every drawing it draws loads, each shelf lists exactly what
 * docs/hotbits/shelves.json (written by pull-nesdocs.mjs) puts on it, a
 * page shelved from the NES notebook says so, the package link is a PDF,
 * the Japanese page has Japanese shelves and fits a phone, and the strip
 * reaches the page.
 */

type Doc = { route: string; lives?: string };
type Group = { key: string; ja: { heading: string }; docs: Doc[] };
const SHELVES = path.join(__dirname, "..", "..", "docs", "hotbits", "shelves.json");
const filled = (): Group[] => (JSON.parse(fs.readFileSync(SHELVES, "utf8")) as { groups: Group[] }).groups.filter((g) => g.docs.length);

test("every drawing on the bench page loads, under the revision note", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/hotbits/bench", 300);
  await expect(page.locator("h1, .mh-title").first()).toHaveText("The bench");
  const figs = page.locator("[data-bench-figure] img");
  const n = await figs.count();
  expect(n, "the page draws figures; a check over none would pass on nothing").toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    await figs.nth(i).scrollIntoViewIfNeeded();
    await expect.poll(() => figs.nth(i).evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.locator("[data-bench-revision]")).toContainText("revision D");
});

test("each shelf lists what the generated shelves put on it, in order", async ({ page }) => {
  const groups = filled();
  expect(groups.length, "docs/hotbits/shelves.json has filled shelves").toBeGreaterThan(0);
  expect(groups.find((g) => g.key === "instrument")?.docs.length).toBe(4);
  await page.setViewportSize(DESK);
  await open(page, "/hotbits/bench", 300);
  const drawn = await page.locator("[data-shelf]").evaluateAll((ss) => ss.map((s) => s.getAttribute("data-shelf")));
  expect(drawn).toEqual(groups.map((g) => g.key));
  for (const g of groups) {
    const hrefs = await page.locator(`[data-shelf="${g.key}"] li a`).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs, g.key).toEqual(g.docs.map((d) => d.route));
    const lives = await page.locator(`[data-shelf="${g.key}"] [data-shelf-lives]`).count();
    expect(lives, `${g.key}: a page shelved from another notebook says where it lives`).toBe(g.docs.filter((d) => d.lives).length);
  }
});

test("the package link is the PDF itself", async ({ page, request }) => {
  await page.setViewportSize(DESK);
  await open(page, "/hotbits/bench", 300);
  const href = await page.locator("[data-bench-package] a").getAttribute("href");
  expect(href).toMatch(/\.pdf$/);
  const r = await request.get(href as string);
  expect(r.status(), href as string).toBe(200);
  expect(r.headers()["content-type"]).toContain("pdf");
});

test("the Japanese bench page has Japanese shelves and fits a phone", async ({ page }) => {
  const groups = filled();
  await page.setViewportSize(NARROW);
  await open(page, "/ja/hotbits/bench", 300);
  for (const g of groups) {
    await expect(page.locator(`[data-shelf="${g.key}"] h2`)).toHaveText(g.ja.heading);
    const hrefs = await page.locator(`[data-shelf="${g.key}"] li a`).evaluateAll((as) => as.map((a) => a.getAttribute("href") as string));
    expect(hrefs.filter((h) => !h.startsWith("/ja/")), g.key).toEqual([]);
  }
  expect(await overflow(page)).toEqual({ out: [], px: 0 });
});

test("the hotbits strip reaches the bench", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/hotbits", 300);
  expect(await page.locator("a[href='/hotbits/bench']").count()).toBeGreaterThan(0);
});
