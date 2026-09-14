import { test, expect } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * The NES section's doors and the notebook they open onto.
 *
 * The notebook used to be one table of forty documents in the order they
 * were written, linked by file name ("n3-report"), so a reader looking for
 * the bench's wiring scrolled past every chip report. It is grouped by the
 * part of the console now, and /nes opens with a door per part, most of
 * them anchors into that index. An anchor that no longer matches a heading
 * still scrolls to the top of the page and looks like it worked, so each
 * door is followed and its target element is required to exist.
 */

const GROUPS = [
  "where-it-started", "the-chips", "the-signal", "the-console",
  "planning-the-bench", "building-the-bench", "what-happened-at-the-bench", "experiments-at-the-bench",
];

for (const lang of ["", "/ja"]) {
  test(`every door on ${lang}/nes reaches its part${lang ? ", in Japanese" : ""}`, async ({ page }) => {
    await page.setViewportSize(DESK);
    await open(page, `${lang}/nes`, 300);
    const hrefs = await page.locator("[data-parts] a").evaluateAll((as) => as.map((a) => a.getAttribute("href") as string));
    expect(hrefs.length, "the doors list is empty").toBeGreaterThanOrEqual(7);
    for (const href of hrefs) {
      expect(href.startsWith(`${lang}/`), `${href} is not in ${lang || "English"}`).toBe(true);
      const r = await page.goto(href, { waitUntil: "load" });
      expect(r?.status(), href).toBe(200);
      const hash = href.split("#")[1];
      if (hash) await expect(page.locator(`[id="${hash}"]`), `${href}: no heading carries #${hash}`).toHaveCount(1);
    }
  });
}

test("the notebook is grouped, and every document is in it once, by its title", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/docs/nes", 300);
  const prose = page.locator(".prose").first();
  for (const id of GROUPS) await expect(prose.locator(`h2[id="${id}"]`), `no group #${id}`).toHaveCount(1);
  const links = await prose.locator("table a[href^='/docs/nes/']").evaluateAll((as) =>
    as.map((a) => ({ href: a.getAttribute("href") as string, text: (a as HTMLElement).innerText.trim() })),
  );
  expect(links.length, "the notebook lists no documents").toBeGreaterThanOrEqual(40);
  const hrefs = links.map((l) => l.href);
  expect(new Set(hrefs).size, "a document is listed twice").toBe(hrefs.length);
  // A file name as link text ("n3-report") is the thing this replaced.
  const slugs = links.filter((l) => /^[a-z0-9-]+$/.test(l.text));
  expect(slugs, "linked by file name, not title").toEqual([]);
  // Titles start with a capital: the four lowercase repository h1s were the casing bug.
  const lower = links.filter((l) => /^[a-z]/.test(l.text));
  expect(lower, "a title starting lowercase").toEqual([]);
});

test("the section's name is capitalised where the menu, the crumb and the heading show it", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes", 300);
  await expect(page.locator("h1").first()).toHaveText("The NES console");
  await page.locator(".menu-btn").click();
  const labels = await page.locator(".menu-item b").allInnerTexts();
  expect(labels).toContain("The NES console");
  expect(labels).not.toContain("the NES console");
});

test("the front page's overview tags are capitalised", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/", 300);
  const tags = await page.locator(".piece-links .tag.live").allInnerTexts();
  expect(tags.length).toBeGreaterThanOrEqual(3);
  expect(tags.filter((t) => t.trim() !== "Overview")).toEqual([]);
});
