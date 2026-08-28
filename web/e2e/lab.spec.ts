import { expect, test, type Page } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * The Halfwave Lab, and the ways into it.
 *
 * The Lab is one ES module that builds this page's DOM once and has no
 * teardown, so every link into it has to be a real navigation. The flag was
 * the one that was not: reported by the owner as "nested windows when
 * changing to JPN" and measured (2026-08-28) as a page with the markup
 * rendered, nothing built in it, and two rows of controls, because the Lab's
 * own player is hidden only once the Lab has marked it driven.
 *
 * Re-inserting the script does not help and neither does waiting: a module
 * already in the browser's registry does not run again. So this holds the
 * arrival rather than the markup: after the flag, the Lab is built, its
 * player is driven, and there is one set of keys.
 */

const LAB = "/6502/lab";

/** What the Lab looks like when it is actually running. */
async function state(page: Page) {
  return page.evaluate(() => ({
    url: location.pathname,
    panels: document.querySelectorAll(".lab-shell .panel").length,
    // The Lab marks its own player `driven` when it registers with the site's
    // chip store, and lab.css hides it then. Not driven means two players.
    players: [...document.querySelectorAll<HTMLElement>(".lab-shell .player")].filter((p) => p.offsetWidth > 0).length,
    strips: document.querySelectorAll(".chip-transport").length,
    driver: (window as unknown as { tmChipStore?: { hasDriver(): boolean } }).tmChipStore?.hasDriver() ?? false,
    // A built Lab has values in it: the datapath's readouts are filled from
    // the trace, so an empty one is markup that never ran.
    filled: [...document.querySelectorAll(".lab-shell .panel")].some((p) => /\$[0-9A-F]{2}/.test(p.textContent ?? "")),
    ground: getComputedStyle(document.querySelector(".lab-shell")!).backgroundColor,
  }));
}

test("the Lab is built, dark, and shows one set of keys", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, LAB, 6000);
  const s = await state(page);
  expect(s.panels, "the Lab's panels").toBeGreaterThan(20);
  expect(s.filled, "with values in them").toBe(true);
  expect(s.driver, "registered with the site's chip store").toBe(true);
  expect(s.players, "its own player is hidden once the strip drives it").toBe(0);
  expect(s.strips, "one strip").toBe(1);
  // The workspace is the instrument ground, not paper (owner, 2026-08-28).
  expect(s.ground, "the dark ground").not.toBe("rgb(244, 242, 236)");
});

test("the flag is a real navigation: the Japanese Lab arrives built, not as markup", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, LAB, 6000);
  await expect(page.locator(".topbar a.lang-switch")).toHaveAttribute("href", "/ja/6502/lab");
  await page.locator(".topbar a.lang-switch").click();
  await page.waitForURL("**/ja/6502/lab", { timeout: 30000 });
  await page.waitForTimeout(6000);

  const s = await state(page);
  expect(s.url).toBe("/ja/6502/lab");
  expect(s.panels, "the Lab's panels").toBeGreaterThan(20);
  expect(s.filled, "built, with values in them").toBe(true);
  expect(s.driver, "registered with the store").toBe(true);
  expect(s.players, "one set of keys, not two").toBe(0);
  expect(s.strips, "one strip").toBe(1);
  // And back, which is the same navigation in the other direction.
  await expect(page.locator(".topbar a.lang-switch")).toHaveAttribute("href", "/6502/lab");
});

test("the engine key is grey here, and says why in the page's own words", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, LAB, 6000);
  const key = page.locator(".chip-transport .tbtn.eng");
  await expect(key).toBeDisabled();
  await expect(key).toHaveAttribute("data-engine", "api");
  // The reason is the page's, read off it: a grey key with no reason reads as
  // a broken control. The Lab records a trace the in-page chip cannot make.
  const why = await page.locator("[data-engine-why]").getAttribute("data-engine-why");
  expect(why, "the page states its reason").toMatch(/records/i);
  await expect(key).toHaveAttribute("title", why!);
});
