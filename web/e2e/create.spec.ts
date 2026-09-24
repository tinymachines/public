import { test, expect, type Page } from "@playwright/test";
import { DESK, PHONE, open } from "./lib";

/**
 * /nes/create: the console with every tool as a window on one desk
 * (owner, 2026-09-24). On a desk the windows move, size, come forward,
 * fill the desk, close and open again from the tray, and the arrangement
 * survives a reload; on a phone they stack under the section strip. One
 * tree either way, so crossing between the two never stops the console.
 */

const OPEN = ["screen", "cartridge", "code", "cpu", "memory"];

async function rect(page: Page, sel: string) {
  return page.locator(sel).evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  });
}

async function openDesk(page: Page) {
  await page.setViewportSize(DESK);
  await open(page, "/nes/create", 500);
  await page.evaluate(() => localStorage.removeItem("tm.nes.create.desk"));
  await open(page, "/nes/create", 500);
  await expect(page.locator(".desk[data-mode=float][data-ready]")).toHaveCount(1);
}

test("the desk: a key for every window named by its own heading, the first five open, all inside the desk, the page not scrolling", async ({ page }) => {
  await openDesk(page);
  const keys = await page.locator("[data-desk-tab]").evaluateAll((bs) => bs.map((b) => (b.textContent ?? "").trim()));
  expect(keys).toEqual(["Screen", "Cartridge", "Code", "CPU", "Memory", "Palettes", "Sprites on screen", "Sprites", "Readouts", "About this page"]);
  const shown = await page.locator("[data-win]").evaluateAll((ws) => ws.filter((w) => (w as HTMLElement).offsetParent !== null).map((w) => (w as HTMLElement).dataset.win));
  expect(shown).toEqual(OPEN);
  const pressed = await page.locator("[data-desk-tab]").evaluateAll((bs) => bs.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => (b as HTMLElement).dataset.deskTab));
  expect(pressed).toEqual(OPEN);
  // A bar's name is its window's heading.
  await expect(page.locator("[data-win=code] .win-title")).toHaveText("Code");

  const desk = await rect(page, "[data-desk]");
  const strip = await rect(page, "[data-play-transport]");
  expect(desk.h, "the desk has room").toBeGreaterThan(300);
  expect(desk.bottom, "the desk stops above the strip on the floor").toBeLessThanOrEqual(strip.y + 1);
  for (const id of OPEN) {
    const w = await rect(page, `[data-win=${id}]`);
    expect(w.x, id).toBeGreaterThanOrEqual(desk.x - 1);
    expect(w.y, id).toBeGreaterThanOrEqual(desk.y - 1);
    expect(w.right, id).toBeLessThanOrEqual(desk.right + 1);
    expect(w.bottom, id).toBeLessThanOrEqual(desk.bottom + 1);
  }
  const scroll = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight, w: document.documentElement.scrollWidth, vw: innerWidth }));
  expect(scroll.h, "the page itself does not scroll").toBeLessThanOrEqual(scroll.vh);
  expect(scroll.w).toBeLessThanOrEqual(scroll.vw);
  // The picture keeps its 256 by 240 shape inside its window.
  const canvas = await rect(page, "[data-win=screen] canvas");
  const body = await rect(page, "[data-win=screen] .win-body");
  expect(Math.abs(canvas.w / canvas.h - 256 / 240)).toBeLessThan(0.02);
  expect(canvas.w).toBeLessThanOrEqual(body.w + 1);
  expect(canvas.h).toBeLessThanOrEqual(body.h + 1);
});

test("a window moves by its bar, stops at the desk's edge, sizes from its corner, comes forward, fills the desk, and keeps its place over a reload", async ({ page }) => {
  await openDesk(page);
  const desk = await rect(page, "[data-desk]");
  const z = (id: string) => page.locator(`[data-win=${id}]`).evaluate((e) => Number((e as HTMLElement).style.zIndex));

  // Move: the bar's middle, dragged left and up (the window starts on the desk's floor).
  const before = await rect(page, "[data-win=memory]");
  const bar = await rect(page, "[data-win=memory] [data-win-bar]");
  await page.mouse.move(bar.x + 40, bar.y + bar.h / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x - 260, bar.y + bar.h / 2 - 30, { steps: 8 });
  await page.mouse.up();
  const moved = await rect(page, "[data-win=memory]");
  expect(Math.round(moved.x - before.x)).toBe(-300);
  expect(Math.round(moved.y - before.y)).toBe(-30);
  expect(await z("memory"), "the window pressed is on top").toBe(10);

  // A drag far past the edge stops at it.
  await page.mouse.move(moved.x + 40, moved.y + 8);
  await page.mouse.down();
  await page.mouse.move(moved.x - 3000, moved.y + 3000, { steps: 6 });
  await page.mouse.up();
  const stopped = await rect(page, "[data-win=memory]");
  expect(Math.round(stopped.x)).toBe(Math.round(desk.x));
  expect(Math.round(stopped.bottom)).toBe(Math.round(desk.bottom));

  // Size from the corner.
  const grip = await rect(page, "[data-win=cpu] [data-win-grip]");
  const cpu0 = await rect(page, "[data-win=cpu]");
  await page.mouse.move(grip.x + 8, grip.y + 8);
  await page.mouse.down();
  await page.mouse.move(grip.x - 92, grip.y + 108, { steps: 6 });
  await page.mouse.up();
  const cpu1 = await rect(page, "[data-win=cpu]");
  expect(Math.round(cpu1.w - cpu0.w)).toBe(-100);
  expect(Math.round(cpu1.h - cpu0.h)).toBe(100);

  // A press anywhere on a window brings it forward.
  await page.locator("[data-win=code] .win-body").click({ position: { x: 20, y: 20 } });
  expect(await z("code")).toBe(10);

  // Fill the desk, and back.
  await page.locator("[data-win=code] [data-win-bar] .win-title").dblclick();
  const full = await rect(page, "[data-win=code]");
  expect(Math.round(full.w)).toBe(Math.round(desk.w));
  expect(Math.round(full.h)).toBe(Math.round(desk.h));
  await page.locator("[data-win=code] [data-win-max]").click();
  expect(Math.round((await rect(page, "[data-win=code]")).w)).toBeLessThan(Math.round(desk.w));

  // The arrangement is this browser's: a reload puts it back.
  await page.reload();
  await expect(page.locator(".desk[data-ready]")).toHaveCount(1);
  const again = await rect(page, "[data-win=memory]");
  expect(Math.round(again.x)).toBe(Math.round(stopped.x));
  expect(Math.round(again.y)).toBe(Math.round(stopped.y));
  expect(Math.round((await rect(page, "[data-win=cpu]")).w)).toBe(Math.round(cpu1.w));

  // Tidy puts every window back where the page starts it.
  await page.locator("[data-desk-tidy]").click();
  expect(Math.round((await rect(page, "[data-win=memory]")).x)).toBe(Math.round(before.x));
});

test("a window closes from its bar and opens again from the tray, on top; a sprite on screen opens the sprite window", async ({ page }) => {
  await openDesk(page);
  await page.locator("[data-win=cpu] [data-win-close]").click();
  await expect(page.locator("[data-win=cpu]")).toBeHidden();
  await expect(page.locator("[data-desk-tab=cpu]")).toHaveAttribute("aria-pressed", "false");
  await page.locator("[data-desk-tab=palettes]").click();
  await expect(page.locator("[data-win=palettes]")).toBeVisible();
  await expect(page.locator("[data-desk-tab=palettes]")).toHaveAttribute("data-front", "");
  // The tray key of the window on top closes it.
  await page.locator("[data-desk-tab=palettes]").click();
  await expect(page.locator("[data-win=palettes]")).toBeHidden();

  await page.locator("[data-play-rom]").setInputFiles("e2e/fixtures/testcart.nes");
  await expect(page.locator("[data-play-pos]")).toContainText("frame", { timeout: 20_000 });
  await page.locator("[data-play-frame]").click();
  await page.locator("[data-desk-tab=oam]").click();
  const tile = page.locator("[data-oam-tile]").first();
  await expect(tile).toBeVisible({ timeout: 15_000 });
  await tile.click();
  await expect(page.locator("[data-win=sprites]")).toBeVisible();
  await expect(page.locator("[data-desk-tab=sprites]")).toHaveAttribute("data-front", "");
});

test("the console runs in its window, the code window follows the steps, and a phone's width keeps it running", async ({ page }) => {
  await openDesk(page);
  await page.locator("[data-play-rom]").setInputFiles("e2e/fixtures/testcart.nes");
  await expect(page.locator("[data-play-power]")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  const framesRun = async () => Number(((await page.locator("[data-play-pos]").textContent()) ?? "").match(/frame\s+(\d+)/)?.[1] ?? -1);
  await page.locator("[data-play-frame]").click();
  await expect.poll(framesRun).toBe(1);
  await page.locator("[data-play-op]").click();
  await expect(page.locator("[data-win=code] [data-code-list]")).toHaveCount(1);
  const pc = await page.locator("[data-win=code] tr[aria-current]").getAttribute("data-code-line");
  await page.locator("[data-play-op]").click();
  await expect.poll(() => page.locator("[data-win=code] tr[aria-current]").getAttribute("data-code-line")).not.toBe(pc);

  await page.locator("[data-play-run]").click();
  await expect.poll(framesRun, { timeout: 15_000 }).toBeGreaterThan(10);
  // The canvas the engine paints is marked, the width drops to a phone's,
  // and the same canvas is still there with the console still running.
  await page.locator("[data-win=screen] canvas").evaluate((c) => ((c as unknown as { __mark: number }).__mark = 7));
  await page.setViewportSize(PHONE);
  await expect(page.locator(".desk[data-mode=stack]")).toHaveCount(1);
  expect(await page.locator("[data-win=screen] canvas").evaluate((c) => (c as unknown as { __mark?: number }).__mark)).toBe(7);
  const at = await framesRun();
  await expect.poll(framesRun, { timeout: 15_000 }).toBeGreaterThan(at + 10);
});

test("on a phone the windows stand one under another under the section strip, with the pad, and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, "/nes/create", 500);
  await expect(page.locator(".desk[data-mode=stack]")).toHaveCount(1);
  await expect(page.locator("[data-desk-tray]")).toHaveCount(0);
  expect(await page.locator("[data-win-bar]").evaluateAll((bs) => bs.filter((b) => (b as HTMLElement).offsetParent !== null).length)).toBe(0);
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll(".wb-strip a")].map((a) => (a.textContent ?? "").trim())))
    .toEqual(["Screen", "Cartridge", "Code", "CPU", "Memory", "Palettes", "Sprites on screen", "Sprites", "Readouts", "About this page"]);
  // Every window shows, the closed-by-default ones too, in page order.
  const tops = await page.locator("[data-win]").evaluateAll((ws) => ws.map((w) => w.getBoundingClientRect().top));
  expect(tops.every((t, i) => i === 0 || t > tops[i - 1])).toBe(true);
  await expect(page.locator("[data-win=screen] .play-stage [data-pad-grip]")).toHaveCount(1);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(PHONE.width);
});
