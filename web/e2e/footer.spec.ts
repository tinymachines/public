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

  /**
   * The Lab's ground, and it has moved: paper from 2026-08-25, and the
   * instrument ground again from 2026-08-28 (owner: "Lab workspace should be
   * dark theme"). The Lab is twenty-six panels of values read off storage on
   * a running die, so STYLE.md's rule puts it on panel; what paper bought is
   * kept as the Lab's own light theme, under the toggle it has always had.
   * Both halves are held here, because a theme with one half checked is a
   * theme that half works.
   */
  test("the Lab is dark, paper under its own toggle, and has no link button", async ({ page }) => {
    await open(page, "/6502/lab", 6000);
    // Computed colours come back as rgb() or as color(srgb 0..1) depending on
    // how the value was authored, and reading the second as the first is how
    // a light ink reads as a dark one.
    const read = () => page.evaluate(() => {
      const lum = (c: string) => {
        const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const scale = c.startsWith("color(") ? 255 : 1;
        return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) * scale;
      };
      const panels = [...document.querySelectorAll<HTMLElement>(".lab-shell .panel")];
      const shell = document.querySelector<HTMLElement>(".lab-shell")!;
      return {
        panels: panels.length,
        light: panels.filter((p) => lum(getComputedStyle(p).backgroundColor) >= 128).length,
        ground: lum(getComputedStyle(shell).backgroundColor),
        ink: lum(getComputedStyle(panels[0]).color),
        share: document.querySelector<HTMLElement>("#share")!.offsetWidth,
      };
    });

    const dark = await read();
    expect(dark.panels).toBeGreaterThan(10);
    expect(dark.light, "no panel on paper").toBe(0);
    expect(dark.ground, "the shell is the instrument ground").toBeLessThan(64);
    expect(dark.ink, "glass ink, read on panel").toBeGreaterThan(128);
    expect(dark.share, "the header's link button").toBe(0);

    // The Lab's own toggle writes data-theme on <html>; light is the paper set
    // (lab.css), so the switch is a choice between two house grounds.
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    const light = await read();
    expect(light.panels, "the same panels").toBe(dark.panels);
    expect(light.light, "every one of them on paper").toBe(light.panels);
    expect(light.ground, "and the shell with them").toBeGreaterThan(128);
    expect(light.ink, "ink on paper, not glass").toBeLessThan(128);
  });
});

