import { test, expect } from "@playwright/test";
import { open, DESK } from "./lib";

/**
 * Full screen is the whole document: the bar leaves, the strip stays, the
 * control that entered leaves. Serial: native fullscreen is a per-window
 * state, and four headless windows requesting it at once left one request
 * neither resolved nor rejected.
 */
test.describe.configure({ mode: "serial" });
const has = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.classList.contains("has-fullscreen"));
for (const p of ["/6502/explorer", "/6502/games", "/6502/primer", "/6502/lab"]) {
  test(`full screen on ${p}`, async ({ page }) => {
    await page.setViewportSize(DESK);
    await open(page, p, 8000);
    const fs = page.locator(".tbtn.fs");
    expect(await fs.count(), "one full screen control").toBe(1);
    await fs.click();
    await expect.poll(() => has(page), { timeout: 5000 }).toBe(true);
    expect(await page.evaluate(() => (document.querySelector(".app-head") as HTMLElement).offsetHeight), "the bar is gone").toBe(0);
    expect(await fs.getAttribute("aria-pressed")).toBe("true");
    await fs.click();
    await expect.poll(() => has(page), { timeout: 5000 }).toBe(false);
    expect(await page.evaluate(() => (document.querySelector(".app-head") as HTMLElement).offsetHeight)).toBeGreaterThan(20);
  });
}
