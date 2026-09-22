import { test, expect } from "@playwright/test";
import { DESK, en, open } from "./lib";

/**
 * The menu's section group carries the section's first level, and nothing
 * twice; what is deeper is one click away on the page above it. Four rules,
 * three of which have already failed silently once:
 *
 * - A project's pages belong in its group. /ntsc/composite shipped with
 *   no manifest surface, so no menu on the site could reach it, and a
 *   nav missing one link looks exactly like a nav; the NES group had the
 *   same gap for the notebook and the retrospective.
 * - One destination, one label. The landing's own surface used to appear
 *   beside "Overview" as a second label for the same href.
 * - The menu lists index pages, and every page is at most one click from
 *   something the menu lists (owner, 2026-09-22: eighty-four lines on a
 *   documentation page was too many to make sense of). The first half is
 *   checked on the groups, the second across the whole sitemap, because a
 *   menu that drops a page nothing else lists has hidden it, and a hidden
 *   page looks exactly like a menu that was tidied.
 * - The menu opens where the reader is: menu-open.spec.ts, on its own
 *   because it needs a browser with scrollbars.
 */

async function sectionGroup(page: import("@playwright/test").Page) {
  await page.locator(".menu-btn").click();
  const group = page.locator(".menu-group").first();
  const hrefs = await group.locator(".menu-item").evaluateAll((as) =>
    as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  const labels = await group.locator(".menu-item b").allInnerTexts();
  return { hrefs, labels };
}

test("the NES group reaches every part, the notebook and the retrospective", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes", 500);
  const { hrefs } = await sectionGroup(page);
  for (const want of ["/nes", "/nes/play", "/nes/chips", "/nes/console", "/nes/signal", "/nes/bench", "/nes/cart", "/docs/nes", "/docs/console-arc"]) {
    expect(hrefs, `missing ${want}`).toContain(want);
  }
  expect(new Set(hrefs).size, `duplicate destination in ${JSON.stringify(hrefs)}`).toBe(hrefs.length);
});

test("inside the signal pages, the NES group offers the signal's index, and the index lists all three", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/signal/composite", 500);
  const { hrefs } = await sectionGroup(page);
  for (const want of ["/nes", "/nes/signal"]) expect(hrefs, `missing ${want}`).toContain(want);
  // The two pages under the signal are the signal page's to list, not the panel's.
  expect(hrefs).not.toContain("/nes/signal/bench");
  expect(hrefs).not.toContain("/nes/signal/composite");
  expect(new Set(hrefs).size).toBe(hrefs.length);
  await open(page, "/nes/signal", 500);
  const listed = await bodyLinks(page);
  for (const want of ["/nes/signal/bench", "/nes/signal/composite"]) expect(listed, `/nes/signal does not list ${want}`).toContain(want);
});

/** Every internal destination linked from the page's own body: not the bar, the panel or the footer. */
async function bodyLinks(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .filter((a) => !a.closest(".app-head, .app-foot, .menu-panel"))
      .map((a) => (a.getAttribute("href") ?? "").split("#")[0].replace(/\/$/, "") || "/")
      .filter((h) => h.startsWith("/")),
  );
}

test("the menu lists index pages: the documentation's roots, and no explorer clusters", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/docs/nes/boards", 500);
  const { hrefs } = await sectionGroup(page);
  expect(hrefs.length).toBeGreaterThanOrEqual(5);
  for (const h of hrefs) expect(h.split("/").length, `${h} is not a root of the documentation`).toBe(3);
  await open(page, "/6502/explorer", 500);
  // Dispatched, not pointed: the explorer's boot overlay sits over the whole
  // page until the chip API answers, and a preview served without that API
  // never gets there, so a pointer click lands on the overlay.
  await page.locator(".menu-btn").dispatchEvent("click");
  await expect(page.locator(".menu-group").first()).toBeVisible();
  const titles = await page.locator(".menu-group h2").allInnerTexts();
  expect(titles, "the explorer's clusters are the Lab and tools page's, not the panel's").toHaveLength(3);
});

test("every page is one click from something the menu lists", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.setViewportSize(DESK);
  // The panel differs by section; the landings between them show every group.
  const menu = new Set<string>();
  for (const landing of ["/", "/docs", "/6502", "/hotbits", "/nes"]) {
    await open(page, landing, 500);
    await page.locator(".menu-btn").click();
    const hrefs = await page.locator(".menu-item").evaluateAll((as) =>
      as.map((a) => ((a as HTMLAnchorElement).getAttribute("href") ?? "").split("#")[0].replace(/\/$/, "") || "/"),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) menu.add(h);
  }
  expect(menu.size).toBeGreaterThanOrEqual(20);
  const reach = new Set(menu);
  for (const m of menu) {
    if (!m.startsWith("/") || m.startsWith("/api")) continue;
    const r = await page.goto(m, { waitUntil: "load", timeout: 45_000 });
    if (!r || r.status() !== 200) continue;
    await page.waitForTimeout(300);
    for (const h of await bodyLinks(page)) reach.add(h);
  }
  const all = en();
  expect(all.length).toBeGreaterThanOrEqual(100);
  const orphans = all.filter((p) => !reach.has(p));
  expect(orphans, `pages the menu does not list and no listed page links: ${orphans.join(" ")}`).toEqual([]);
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
