import { test, expect } from "@playwright/test";
import { DESK, PHONE, open } from "./lib";

/**
 * The menu opens where the reader is.
 *
 * Opening it used to lock the page with overflow: hidden on html and body,
 * which made body the scroll container and unstuck the bar: opened anywhere
 * but the top of a page, the button and the panel were a page-height above
 * the viewport (in Chrome and WebKit, on a desk and on a phone), and on a
 * desk the vanished scrollbar reflowed the page as the panel opened. The
 * button also grew as its word changed, and the flag beside it moved.
 *
 * Its own file because it needs a browser WITH scrollbars: Playwright hides
 * them in headless Chrome, and the reflow this guards against is the
 * scrollbar leaving. launchOptions can only be set at the top of a file.
 */
test.use({ launchOptions: { executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", ignoreDefaultArgs: ["--hide-scrollbars"] } });
test.describe("opened where the reader is", () => {
  for (const [name, vp] of [["desk", DESK], ["phone", PHONE]] as const) {
    test(`the bar, the button and the panel are on screen, and nothing moves, ${name}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await open(page, "/nes/playground", 800);
      await page.mouse.move(100, 400);
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(400);
      const before = await page.evaluate(() => ({
        y: scrollY,
        width: document.documentElement.clientWidth,
        mark: document.querySelector(".wordmark")!.getBoundingClientRect().left,
        flag: document.querySelector(".topbar .lang-switch")!.getBoundingClientRect().left,
      }));
      expect(before.y).toBeGreaterThan(1000);
      await page.locator(".menu-btn").click();
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => {
        const b = document.querySelector(".menu-btn")!.getBoundingClientRect();
        const p = document.querySelector(".menu-panel")!.getBoundingClientRect();
        return {
          y: scrollY,
          width: document.documentElement.clientWidth,
          mark: document.querySelector(".wordmark")!.getBoundingClientRect().left,
          flag: document.querySelector(".topbar .lang-switch")!.getBoundingClientRect().left,
          button: { top: b.top, bottom: b.bottom },
          panel: { top: p.top, bottom: p.bottom },
          items: document.querySelectorAll(".menu-item").length,
        };
      });
      expect(after.items).toBeGreaterThan(0);
      expect(after.y, "the page did not jump").toBe(before.y);
      expect(after.button.top, "the button is on screen").toBeGreaterThanOrEqual(0);
      expect(after.button.bottom).toBeLessThanOrEqual(vp.height);
      expect(after.panel.top, "the panel is on screen").toBeGreaterThanOrEqual(0);
      expect(after.panel.bottom).toBeLessThanOrEqual(vp.height);
      expect(after.width, "the page kept its width (the scrollbar stayed)").toBe(before.width);
      expect(after.mark, "the wordmark did not move").toBe(before.mark);
      expect(after.flag, "the flag did not move (the button kept its width)").toBe(before.flag);
    });
  }
});
