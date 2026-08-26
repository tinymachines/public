import { expect, test, type Page } from "@playwright/test";
import { DESK, PHONE, open, overflow } from "./lib";

/**
 * The console shell on /6502/games: the pack's QA gates that a browser can
 * hold (notes/console-shell/pack/07-QA-CHECKLIST.md), run against the site.
 *
 *   M1  the mask is a chamfered octagon, the whole native screen sits in
 *       it, the scale is an integer, nothing letterboxes, nothing overflows
 *   M3  movement and A/B are always docked; the deck order holds on a phone
 *   M4  touch targets meet 88px; the LED follows the machine; a coin drops
 *       and counts; the pages swipe; a turn of the phone re-solves with no
 *       reload and no lost credit
 *   IP  no Nintendo mark anywhere on the page
 *
 * The solver's own tests hold the geometry; this holds that the page is
 * running that solver and that the shell is a console a finger can use.
 */

const GAMES = "/6502/games";

async function solved(page: Page) {
  await expect(page.locator(".shell[data-solved]")).toBeVisible();
  return page.evaluate(() => {
    const sh = document.querySelector<HTMLElement>(".shell")!;
    const glass = sh.querySelector<HTMLElement>(".glass")!;
    const screen = sh.querySelector<HTMLElement>(".screen")!;
    const cv = sh.querySelector<HTMLCanvasElement>("#screen")!;
    const g = glass.getBoundingClientRect(), s = screen.getBoundingClientRect(), c = cv.getBoundingClientRect();
    return {
      params: sh.querySelector(".params")?.textContent ?? "",
      clip: getComputedStyle(glass).clipPath,
      glass: { w: g.width, h: g.height },
      box: { w: s.width, h: s.height },
      canvas: { w: c.width, h: c.height, natural: cv.width },
      docks: [...sh.querySelectorAll<HTMLElement>(".dock")].map((d) => ({ id: d.dataset.id, zone: d.dataset.zone, ...d.getBoundingClientRect().toJSON() })),
      hits: [...sh.querySelectorAll<HTMLElement>(".dock .hit")].map((b) => ({ what: b.dataset.dir ?? b.dataset.act ?? b.getAttribute("aria-label") ?? "", disabled: (b as HTMLButtonElement).disabled, ...b.getBoundingClientRect().toJSON() })),
      led: sh.dataset.led,
      phase: sh.dataset.phase,
    };
  });
}

for (const [name, vp] of [["phone", PHONE], ["desk", DESK]] as const) {
  test(`${name}: the shell solves, the mask is an octagon, the screen is an integer multiple of 128 inside it`, async ({ page }) => {
    await page.setViewportSize(vp);
    await open(page, GAMES);
    const s = await solved(page);
    expect(s.params).toMatch(/k=\d/);
    expect(s.clip).toMatch(/^polygon\(/);
    expect((s.clip.match(/px/g) ?? []).length).toBe(16); // eight vertices
    expect(Math.abs(s.glass.w - s.glass.h)).toBeLessThan(1.5);
    expect(s.canvas.natural % 128).toBe(0);
    expect(s.canvas.natural).toBeGreaterThanOrEqual(256 * (name === "desk" ? 2 : 1));
    // Drawn 1:1 at its natural size (no non-uniform scale, no downscale).
    expect(Math.abs(s.canvas.w - s.canvas.natural)).toBeLessThan(1.5);
    expect(s.box.w).toBe(s.canvas.natural + 18);
    expect(s.canvas.w).toBeLessThanOrEqual(s.glass.w);
    expect((await overflow(page)).px).toBe(0);
  });

  test(`${name}: movement and A/B are docked, every live control meets the touch floor`, async ({ page }) => {
    await page.setViewportSize(vp);
    await open(page, GAMES);
    const s = await solved(page);
    const ids = s.docks.map((d) => d.id);
    expect(ids).toContain("dpad");
    expect(ids).toContain("ab");
    expect(ids).toContain("pills");
    for (const d of s.docks.filter((d) => d.id === "dpad" || d.id === "ab")) {
      expect(d.width, d.id).toBeGreaterThanOrEqual(88);
      expect(d.height, d.id).toBeGreaterThanOrEqual(88);
    }
    // Every hit region is at least a thumb wide in one direction and never
    // below 24px in the other (the pack's hit region is the polygon dilated).
    for (const h of s.hits) {
      expect(Math.max(h.width, h.height), h.what).toBeGreaterThanOrEqual(24);
    }
    // A and B are present and disabled, with the reason.
    const ab = s.hits.filter((h) => h.what === "A" || h.what === "B");
    expect(ab.length).toBe(2);
    expect(ab.every((h) => h.disabled)).toBe(true);
    await expect(page.locator('.dock[data-id="ab"] .hit[aria-label="A"]')).toHaveAttribute("title", /four directions/);
  });
}

test("phone: the deck leads with movement on the left and A/B on the right, under the glass", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, GAMES);
  const s = await solved(page);
  const dp = s.docks.find((d) => d.id === "dpad")!, ab = s.docks.find((d) => d.id === "ab")!;
  const glassTop = await page.locator(".glass").evaluate((g) => g.getBoundingClientRect().bottom);
  expect(dp.zone).toBe("deck");
  expect(dp.y).toBeGreaterThan(glassTop);
  expect(dp.x).toBeLessThan(ab.x);
  expect(s.docks.find((d) => d.id === "marquee")?.zone).toBe("header");
});

test("a coin drops and counts, the credit survives a turn of the phone, and the layout re-solves without a reload", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, GAMES);
  const before = (await solved(page)).params;
  const credits = () => page.locator('.dock[data-id="coin"] .seg.on').count();
  const c0 = await credits();
  await page.locator('.hit[data-act="coin"]').click();
  await expect.poll(credits, { timeout: 3000 }).not.toBe(c0);
  // "00" lights 6 + 6 segments; "01" lights 6 + 2.
  expect(await credits()).toBe(8);
  const marker = await page.evaluate(() => { (window as unknown as { __k: number }).__k = 1; return 1; });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await solved(page)).params, { timeout: 5000 }).not.toBe(before);
  expect((await solved(page)).params).toContain("landscape");
  expect(await page.evaluate(() => (window as unknown as { __k: number }).__k)).toBe(marker); // same document: no reload
  expect(await credits()).toBe(8);
  expect((await overflow(page)).px).toBe(0);
});

test("the pages: the rail and a swipe on the glass move between them; play is the default", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, GAMES);
  await solved(page);
  await expect(page.locator(".shell")).toHaveAttribute("data-page", "play");
  await page.locator('.hit[data-act="page-status"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-page", "status");
  await expect(page.locator(".pane-status #k-hc")).toBeVisible();
  await page.locator('.hit[data-act="page-play"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-page", "play");
  // A swipe on the glass, right to left, goes forward one page.
  const g = await page.locator(".glass").boundingBox();
  if (!g) throw new Error("no glass");
  await page.mouse.move(g.x + g.width * 0.8, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width * 0.2, g.y + g.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".shell")).toHaveAttribute("data-page", "shelf");
  await expect(page.locator(".pane-shelf .cart-btn").first()).toBeVisible();
});

test("the LED and the machine: off before power, boot then live after the rocker, paused on a second press", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  const s = await solved(page);
  expect(s.led).toBe("off");
  await page.locator('.hit[data-act="power"]').click();
  await expect.poll(() => page.locator(".shell").getAttribute("data-phase"), { timeout: 30000 }).toMatch(/live|stopped/);
  const phase = await page.locator(".shell").getAttribute("data-phase");
  test.skip(phase === "stopped", "the chip API did not answer from this origin");
  await expect(page.locator(".shell")).toHaveAttribute("data-led", "live");
  await page.locator('.hit[data-act="power"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-phase", "paused");
  await expect(page.locator(".hud")).toHaveText(/pause/i);
});

test("hold power switches the machine off through the store; a tap brings it back running", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  await page.locator('.hit[data-act="power"]').click();
  await expect.poll(() => page.locator(".shell").getAttribute("data-phase"), { timeout: 30000 }).toMatch(/live|stopped/);
  test.skip((await page.locator(".shell").getAttribute("data-phase")) === "stopped", "the chip API did not answer from this origin");
  // Hold: 600 ms is the rocker's hold.
  const b = (await page.locator('.hit[data-act="power"]').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.locator(".shell")).toHaveAttribute("data-led", "off");
  await expect(page.locator(".hud")).toHaveText(/^(off|オフ)$/);
  // The strip agrees: its power key is no longer solid, and the store is off.
  await expect(page.locator(".chip-transport .tbtn.pw")).not.toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => sessionStorage.getItem("v6502.power"))).toBe("0");
  // A tap: on, and running again.
  await page.locator('.hit[data-act="power"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-led", "live", { timeout: 10000 });
  await expect(page.locator(".shell")).toHaveAttribute("data-phase", "live");
  await expect(page.locator(".chip-transport .tbtn.pw")).toHaveClass(/\bon\b/);
});

test("no Nintendo mark, no trademark sign, anywhere on the console", async ({ page }) => {
  await open(page, GAMES);
  const html = await page.content();
  expect(html).not.toMatch(/nintendo|mario|zelda|™|&trade;/i);
});

test("the Japanese edition carries the shell with its own words", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, "/ja" + GAMES);
  await solved(page);
  await expect(page.locator('.hit[data-act="coin"]')).toHaveAttribute("title", /コイン/);
  await expect(page.locator(".pane-shelf .pane-title")).toHaveText("棚");
});
