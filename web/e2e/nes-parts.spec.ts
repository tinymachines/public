import { test, expect } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * The NES section's part pages and the notebook agree about where each
 * document lives.
 *
 * Both are drawn from docs/nes/shelves.json, which the pull writes from
 * the one list that groups the documents. This holds the two renderings
 * to each other: a shelf on a part page lists exactly the documents the
 * notebook's index lists under the same group, in the same order. And
 * the bench page shares its path with the bench's served files, so one of
 * those is fetched too: a route that swallowed /nes/bench/ would still
 * render the page and quietly 404 every drawing package.
 */

const PARTS: Record<string, string[]> = {
  "/nes": ["start"],
  "/nes/chips": ["chips"],
  "/nes/console": ["console"],
  "/nes/bench": ["bench-plan", "bench-build", "bench-record", "bench-experiments"],
};

// A shelf's key and the notebook heading's anchor, as the pull names them.
const ANCHOR: Record<string, string> = {
  start: "where-it-started", chips: "the-chips", console: "the-console",
  "bench-plan": "planning-the-bench", "bench-build": "building-the-bench",
  "bench-record": "what-happened-at-the-bench", "bench-experiments": "experiments-at-the-bench",
};

test("every shelf on a part page lists what the notebook lists under its group", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/docs/nes", 300);
  const notebook: Record<string, string[]> = await page.evaluate((anchors) => {
    const out: Record<string, string[]> = {};
    for (const [key, id] of Object.entries(anchors)) {
      const h = document.getElementById(id);
      let el = h?.nextElementSibling;
      while (el && el.tagName !== "TABLE" && !/^H[12]$/.test(el.tagName)) el = el.nextElementSibling;
      out[key] = el?.tagName === "TABLE" ? [...el.querySelectorAll("a")].map((a) => a.getAttribute("href") as string) : [];
    }
    return out;
  }, ANCHOR);

  let shelves = 0;
  for (const [route, groups] of Object.entries(PARTS)) {
    await open(page, route, 300);
    for (const g of groups) {
      const hrefs = await page.locator(`[data-shelf="${g}"] li a`).evaluateAll((as) => as.map((a) => a.getAttribute("href") as string));
      expect(hrefs.length, `${route}: the ${g} shelf is empty`).toBeGreaterThan(0);
      expect(hrefs, `${route}: the ${g} shelf disagrees with the notebook`).toEqual(notebook[g]);
      shelves++;
    }
  }
  expect(shelves).toBe(7);
});

test("the cart page lists the cart section's documents, and serves the ROM", async ({ page, request }) => {
  await page.setViewportSize(DESK);
  await open(page, "/docs/cart", 300);
  const section = await page.locator(".prose table a[href^='/docs/cart/']").evaluateAll((as) => as.map((a) => a.getAttribute("href") as string));
  expect(section.length).toBeGreaterThanOrEqual(4);
  await open(page, "/nes/cart", 300);
  const shelf = await page.locator('[data-shelf="cart"] li a').evaluateAll((as) => as.map((a) => a.getAttribute("href") as string));
  expect(shelf).toEqual(section);
  for (const f of ["/nes/cal.nes", "/nes/cal.json"]) expect((await request.get(f)).status(), f).toBe(200);
});

test("the bench page and the bench's served files share a path without colliding", async ({ page, request }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/bench", 300);
  await expect(page.locator("h1, .mh-title").first()).toHaveText("The bench");
  const pdf = await page.locator("a[href^='/nes/bench/'][href$='.pdf']").first().getAttribute("href").catch(() => null);
  const target = pdf ?? "/nes/bench/bench-v1b-1.svg";
  const r = await request.get(target);
  expect(r.status(), target).toBe(200);
  expect(r.headers()["content-type"]).not.toContain("text/html");
});

test("the Japanese part pages carry Japanese shelves", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ja/nes/bench", 300);
  await expect(page.locator('[data-shelf="bench-build"] h2')).toHaveText("ベンチを組む");
  const hrefs = await page.locator('[data-shelf="bench-build"] li a').evaluateAll((as) => as.map((a) => a.getAttribute("href") as string));
  expect(hrefs.length).toBeGreaterThan(0);
  expect(hrefs.filter((h) => !h.startsWith("/ja/docs/nes/"))).toEqual([]);
});
