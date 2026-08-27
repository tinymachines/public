import { test, expect } from "@playwright/test";
import { open, PHONE, DESK } from "./lib";

/**
 * The docs index behind a Contents button on a phone (owner's call,
 * 2026-08-28): closed until pressed, the document first; the sidebar it
 * always was on a desk, with no button.
 */
test("the docs tree waits behind Contents on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, "/docs/6502/verification", 1500);
  const btn = page.locator(".docs-toc .toc-btn");
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText(/^Contents/);
  const list = page.locator("#docs-toc-list");
  expect(await list.evaluate((e) => (e as HTMLElement).offsetHeight), "the tree is closed").toBe(0);
  const h1 = await page.locator("h1").first().evaluate((e) => e.getBoundingClientRect().top);
  expect(h1, "the document's title is on the first screen").toBeLessThan(PHONE.height);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  expect(await list.evaluate((e) => (e as HTMLElement).offsetHeight), "the tree opens").toBeGreaterThan(300);
  expect(await list.locator("a").count()).toBeGreaterThan(10);
  // A page picked from the list arrives with the list closed again.
  await list.locator('a[href$="/docs/6502/api"], a[href$="/docs/6502/the-api"]').first().click().catch(() => list.locator("a").nth(3).click());
  await page.waitForTimeout(1200);
  await expect(btn).toHaveAttribute("aria-expanded", "false");
});

test("the docs tree is the sidebar on a desk", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/docs/6502/verification", 1500);
  expect(await page.locator(".docs-toc .toc-btn").evaluate((e) => (e as HTMLElement).offsetWidth), "no button").toBe(0);
  expect(await page.locator("#docs-toc-list").evaluate((e) => (e as HTMLElement).offsetHeight)).toBeGreaterThan(300);
});
