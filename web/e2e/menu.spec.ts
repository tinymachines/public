import { test, expect } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * The menu's section group carries the section's contents, and nothing
 * twice. Two rules, each of which has already failed silently once:
 *
 * - A project's pages belong in its group. /ntsc/composite shipped with
 *   no manifest surface, so no menu on the site could reach it, and a
 *   nav missing one link looks exactly like a nav; the NES group had the
 *   same gap for the notebook and the retrospective.
 * - One destination, one label. The landing's own surface used to appear
 *   beside "Overview" as a second label for the same href.
 */

async function sectionGroup(page: import("@playwright/test").Page) {
  await page.locator(".menu-btn").click();
  const group = page.locator(".menu-group").first();
  const hrefs = await group.locator(".menu-item").evaluateAll((as) =>
    as.map((a) => (a as HTMLAnchorElement).getAttribute("href")),
  );
  const labels = await group.locator(".menu-item b").allInnerTexts();
  return { hrefs, labels };
}

test("the NES group reaches the notebook, the retrospective and Play", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes", 500);
  const { hrefs } = await sectionGroup(page);
  for (const want of ["/nes", "/nes/play", "/docs/nes", "/docs/console-arc"]) {
    expect(hrefs, `missing ${want}`).toContain(want);
  }
  expect(new Set(hrefs).size, `duplicate destination in ${JSON.stringify(hrefs)}`).toBe(hrefs.length);
});

test("the ntsc group reaches the composite deep-dive", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ntsc", 500);
  const { hrefs } = await sectionGroup(page);
  for (const want of ["/ntsc", "/ntsc/bench", "/ntsc/composite"]) {
    expect(hrefs, `missing ${want}`).toContain(want);
  }
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("the Japanese menu carries the same doors, localized", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ja/nes", 500);
  const { hrefs, labels } = await sectionGroup(page);
  for (const want of ["/ja/nes", "/ja/nes/play", "/ja/docs/nes", "/ja/docs/console-arc"]) {
    expect(hrefs, `missing ${want}`).toContain(want);
  }
  expect(labels.join(" ")).toContain("コンソールの弧のノート");
});
