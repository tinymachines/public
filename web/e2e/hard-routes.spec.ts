import { expect, test, type Page } from "@playwright/test";
import { DESK, TOOL_PAGES } from "./lib";

/**
 * Every link into a page that a module builds is a full navigation.
 *
 * The rule is `isHardRoute()` in lib/nav.ts: the explorer's pages, the Lab and
 * the console are built by modules that bind this document at load and have
 * no teardown, so a client-side arrival gets the markup with nothing built in
 * it. A module already in the browser's registry does not run again, whatever
 * happens to the script tag. Measured 2026-08-28: the Lab arrived that way
 * with two rows of controls and no instrument, the console with a blank
 * screen and no handlers bound, and three more links (the tools directory,
 * the cartridge page, the editor) were pointing the same way.
 *
 * The check is the mechanism rather than the symptom. A marker is written on
 * the window, the link is clicked, and the marker has to be gone: a document
 * that survived the navigation is the client router having kept it, which is
 * exactly what these pages cannot have. That holds however each page is built
 * and needs no per-instrument idea of what "built" looks like.
 */

/** The routes that need a fresh document, in both languages. */
const HARD = new Set(
  [...TOOL_PAGES, "/6502/lab", "/6502/games"].flatMap((p) => [p, `/ja${p}`]),
);

/** Pages that link at instruments, and are themselves ordinary pages. */
const SOURCES = ["/", "/6502", "/6502/tools", "/6502/cart", "/6502/manage", "/ja/6502/tools"];

async function hardLinks(page: Page): Promise<string[]> {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>("a[href^='/']")].map((a) => a.getAttribute("href") ?? ""),
  );
  return [...new Set(hrefs.map((h) => h.split(/[?#]/)[0]).filter((h) => HARD.has(h)))];
}

test("every link into an instrument leaves the document behind", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  let checked = 0;
  const soft: string[] = [];

  for (const from of SOURCES) {
    const r = await page.goto(from, { waitUntil: "load" });
    expect(r?.status(), from).toBe(200);
    await page.waitForTimeout(800);
    for (const href of await hardLinks(page)) {
      await page.goto(from, { waitUntil: "load" });
      await page.waitForTimeout(500);
      // A marker on the window: a client-side navigation keeps the document,
      // and therefore the marker; a real one cannot.
      await page.evaluate(() => { (window as unknown as { __same?: boolean }).__same = true; });
      const link = page.locator(`a[href='${href}']`).first();
      if (!(await link.count())) continue;
      await link.click();
      await page.waitForURL(`**${href}`, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const survived = await page.evaluate(() => (window as unknown as { __same?: boolean }).__same === true);
      if (survived) soft.push(`${from} -> ${href}`);
      checked++;
    }
  }

  // A check that can pass on nothing is not a check.
  expect(checked, "links into instruments were found and followed").toBeGreaterThan(3);
  expect(soft, "these arrived through the client router, so the module never ran").toEqual([]);
});
