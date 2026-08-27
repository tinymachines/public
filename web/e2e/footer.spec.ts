import { test, expect } from "@playwright/test";
import { en, open, PHONE } from "./lib";

/** The locked footer states the running version, and never clips it on a phone. */
test.describe("footer", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test("the version on the page is the version the API runs", async ({ page, request }) => {
    const meta = await (await request.get("/api/v1/meta")).json();
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+$/);
    let checked = 0;
    for (const p of en().filter((x) => !/\/(explorer|lab|games|tracer|primer|blueprint|chipmap|decode|designer|diegraph|exploded|halfshot|pinout|programs|schematic|talk|timing|trace|block|blockdiagram)$/.test(x)).slice(0, 12)) {
      await open(page, p, 800);
      const foot = page.locator(".app-foot .foot-run");
      if (await foot.count() === 0) continue;
      await expect(foot).toContainText(`v${meta.version}`);
      const clipped = await foot.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > document.documentElement.clientWidth);
      expect(clipped, `${p}: footer clipped`).toBe(false);
      checked++;
    }
    expect(checked, "footers checked").toBeGreaterThanOrEqual(5);
  });
});

/**
 * The floor footer on a workbench (owner's call, 2026-08-27, on the Lab:
 * "the footer goes below everything, like the homepage"): locked to the
 * floor, the strip on top of it, and the two never overlap. The console
 * keeps its footer on the status page and is not here.
 */
test.describe("workbench floor", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const p of ["/6502/lab", "/6502/tracer", "/6502/explorer"]) {
    test(`the footer is the floor on ${p}`, async ({ page }) => {
      await open(page, p, 6000);
      const r = await page.evaluate(() => {
        const foot = document.querySelector<HTMLElement>(".wb-foot")!;
        const strip = document.querySelector<HTMLElement>(".chip-transport")!;
        const f = foot.getBoundingClientRect(), s = strip.getBoundingClientRect();
        return { pos: getComputedStyle(foot).position, footBottom: Math.round(f.bottom), footTop: Math.round(f.top), stripBottom: Math.round(s.bottom), vh: innerHeight, scrollY, padB: parseFloat(getComputedStyle(document.querySelector(".wb-main")!).paddingBottom), floor: Math.round(innerHeight - s.top) };
      });
      expect(r.pos, "locked").toBe("fixed");
      expect(r.footBottom, "on the floor, before any scrolling").toBe(r.vh);
      expect(Math.abs(r.stripBottom - r.footTop), "the strip sits on the footer").toBeLessThanOrEqual(1);
      expect(r.padB, "the page clears both").toBeGreaterThanOrEqual(r.floor);
      await expect(page.locator(".wb-foot .foot-run")).toHaveText(/v\d+\.\d+\.\d+ · [0-9a-f]{7} up /, { timeout: 10000 });
    });
  }

  test("the Lab is paper, with no link button", async ({ page }) => {
    await open(page, "/6502/lab", 6000);
    const r = await page.evaluate(() => {
      const lum = (c: string) => { const m = c.match(/\d+/g)!; return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]); };
      const panels = [...document.querySelectorAll<HTMLElement>(".lab-shell .panel")];
      return { panels: panels.length, dark: panels.filter((p) => lum(getComputedStyle(p).backgroundColor) < 128).length, ink: lum(getComputedStyle(panels[0]).color), share: document.querySelector<HTMLElement>("#share")!.offsetWidth };
    });
    expect(r.panels).toBeGreaterThan(10);
    expect(r.dark, "no panel on the dark ground").toBe(0);
    expect(r.ink, "ink on paper, not glass").toBeLessThan(128);
    expect(r.share, "the header's link button").toBe(0);
  });
});

