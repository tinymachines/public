import { expect, test } from "@playwright/test";
import { DESK, PHONE, open, overflow } from "./lib";

/**
 * Console v2 (/6502/consolev2): the console stripped to a screen, four keys,
 * a shelf and a settings screen. The rules it is held to, from the owner's
 * brief (2026-08-28):
 *
 *   - fullscreen and black, the screen across the whole width with no line
 *     around it, the screen switches a small staggered stack at bottom-left
 *     (owner, 2026-08-28), nothing scrolls
 *   - the four movement keys are game.js's own `[data-dir]` contract
 *   - the shelf lists MORE than the two built-ins: the registry's playable
 *     cartridges, two columns at phone width; the headless programs (the
 *     explorer's system cartridges) are not on it
 *   - picking a shelf cartridge hands it to game.js: the console reads its
 *     name, and power boots it
 *   - the settings screen carries the engine and the speed
 */

const P = "/6502/consolev2";

test("black, fullscreen, the screen across the width, the switches bottom-left, and nothing scrolls", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, P);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".cv2")!).backgroundColor);
  expect(bg).toBe("rgb(0, 0, 0)");
  const line = await page.evaluate(() => getComputedStyle(document.querySelector(".cv2-screen")!).borderTopWidth);
  expect(line).toBe("0px");
  const screen = await page.locator(".cv2-screen").boundingBox();
  expect(screen!.width).toBe(PHONE.width);
  // The three switches: a column at bottom-left, each stepped in further than the one above.
  const tabs = await page.locator(".cv2-tab").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, h: r.height }; }));
  expect(tabs).toHaveLength(3);
  expect(tabs[0].x).toBeLessThan(tabs[1].x);
  expect(tabs[1].x).toBeLessThan(tabs[2].x);
  expect(tabs[0].y).toBeLessThan(tabs[1].y);
  expect(tabs[2].y + tabs[2].h).toBeLessThanOrEqual(PHONE.height);
  expect(tabs[2].y + tabs[2].h).toBeGreaterThan(PHONE.height * 0.8);
  expect((await overflow(page)).px).toBe(0);
  await expect(page.locator(".app-head, .site-head, .chip-transport")).toHaveCount(0);
});

test("the four keys are the contract's, and a press lands", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, P);
  const keys = page.locator(".cv2-play [data-dir]");
  await expect(keys).toHaveCount(4);
  expect(await keys.evaluateAll((els) => els.map((e) => e.getAttribute("data-dir")))).toEqual(["up", "left", "right", "down"]);
  // Every key is a finger's width at phone size.
  for (const box of await keys.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))) expect(box).toBeGreaterThanOrEqual(44);
});

test("the shelf holds the registry's playable cartridges and no headless program", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, P);
  await page.getByRole("button", { name: "cartridges" }).click();
  const cards = page.locator(".cv2-carts .cv2-card");
  // More than the two built-ins, and the registry has answered: no "reading" note left.
  await expect(page.locator(".cv2-carts .cv2-note")).toHaveCount(0, { timeout: 20_000 });
  const n = await cards.count();
  expect(n).toBeGreaterThan(2);
  const text = (await cards.allTextContents()).join("\n");
  expect(text).toContain("Die Runner");
  expect(text).not.toMatch(/by programs/);
  expect(text).not.toMatch(/Fibonacci|Multiply|Count the set bits/);
  // Two columns at phone width.
  const lefts = new Set(await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left))));
  expect(lefts.size).toBe(2);
});

test("picking a shelf cartridge hands it to game.js, and power boots it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, P);
  await page.getByRole("button", { name: "cartridges" }).click();
  await expect(page.locator(".cv2-carts .cv2-note")).toHaveCount(0, { timeout: 20_000 });
  const card = page.locator(".cv2-carts .cv2-card").filter({ hasText: /^(?!Die Runner|Silicon Snake)/ }).filter({ hasText: " B" }).first();
  const title = (await card.locator("b").textContent())!;
  await card.click();
  // Back on the play screen, with the loaded cartridge named in game.js's own readout.
  await expect(page.locator(".cv2-body")).toHaveAttribute("data-screen", "play");
  await expect(page.locator("#k-cart")).toContainText(title, { timeout: 20_000 });
  await expect(page.locator("#cart option")).toHaveCount(3);
  await page.locator("#b-power").click();
  await expect(page.locator("#b-power")).toHaveText("reset", { timeout: 90_000 });
  await expect(page.locator("#b-pause")).toBeEnabled();
  // The status screen counted the frames.
  await page.getByRole("button", { name: "settings" }).click();
  await expect.poll(async () => Number((await page.locator("#k-frames").textContent()) ?? "0"), { timeout: 30_000 }).toBeGreaterThan(0);
});

test("the settings screen has the engine and the speed", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, P);
  await page.getByRole("button", { name: "settings" }).click();
  const opts = page.locator(".cv2-settings .cv2-opt");
  await expect(opts).toHaveCount(4);
  await expect(opts.filter({ hasText: "API" })).toHaveCount(1);
  await opts.filter({ hasText: /^slow/ }).click();
  expect(await page.locator("[data-frame-ms]").getAttribute("data-frame-ms")).toBe("250");
  // The engine choice takes: over the API is always possible.
  await opts.filter({ hasText: "API" }).click();
  await expect(opts.filter({ hasText: "API" })).toHaveAttribute("aria-pressed", "true");
});
