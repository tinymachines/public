import { test, expect } from "@playwright/test";
import { pages, isJa, open, visibleText, DESK } from "./lib";

/** Every page answers, is one document, and its text keeps house style. */
const all = pages();
test("the sitemap is the site: 100 or more pages, half of them Japanese", () => {
  expect(all.length).toBeGreaterThanOrEqual(100);
  const ja = all.filter(isJa).length;
  expect(ja).toBe(all.length - ja);
});

for (const p of all) {
  test(`page ${p}`, async ({ page }) => {
    await page.setViewportSize(DESK);
    await open(page, p, 1500);
    // One h1, a title, the html lang the path says.
    expect(await page.locator("h1").count(), "one h1").toBe(1);
    expect((await page.title()).length, "a title").toBeGreaterThan(3);
    expect(await page.getAttribute("html", "lang")).toBe(isJa(p) ? "ja" : "en");
    // The other language is linked from the bar: one flag, the other one's.
    const flags = page.locator("a.lang-switch, .lang-switch a");
    expect(await flags.count(), "one flag").toBe(1);
    const href = await flags.first().getAttribute("href");
    expect(href, "the flag has a target").toBeTruthy();
    expect(isJa(href!), "the flag is the other language").toBe(!isJa(p));
    // No em dash in shipped text (CLAUDE.md house style). Code is excluded.
    const text = await visibleText(page);
    const hits = text.split("\n").filter((l) => l.includes("—")).slice(0, 3);
    expect(hits, "em dashes in visible text").toEqual([]);
  });
}
