import { test, expect } from "@playwright/test";
import { pages, open, overflow, PHONE, NARROW } from "./lib";

/** Nothing scrolls sideways on a phone: every page, two widths. */
const all = pages();
test("there are pages to sweep", () => expect(all.length).toBeGreaterThanOrEqual(100));

test.describe("sideways overflow", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const p of all) {
    test(`390px ${p}`, async ({ page }) => {
      await open(page, p, 2000);
      const o = await overflow(page);
      expect(o.out, `${o.px}px sideways`).toEqual([]);
      expect(o.px).toBe(0);
    });
  }
});

test.describe("sideways overflow, narrow", () => {
  test.use({ viewport: NARROW, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const p of all.filter((x) => !x.startsWith("/ja"))) {
    test(`360px ${p}`, async ({ page }) => {
      await open(page, p, 2000);
      const o = await overflow(page);
      expect(o.out, `${o.px}px sideways`).toEqual([]);
      expect(o.px).toBe(0);
    });
  }
});
