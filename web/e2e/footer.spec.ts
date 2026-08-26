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
