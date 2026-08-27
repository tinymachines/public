import { test, expect } from "@playwright/test";
import { open, DESK, PHONE } from "./lib";

/**
 * The owner's round of 2026-08-28 on four tool pages: the block's circuit
 * fits its stage and its tail is Previous and Next; the block's full
 * screen is the schematic's study view with the block on the bench, and
 * that view under the apex has no bar, no bleed, the strip on the floor
 * and one transport; the graph's stage is dark; the exploded view has no
 * zoom group. Serial: fullscreen is per window.
 */
test.describe.configure({ mode: "serial" });
const has = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.classList.contains("has-fullscreen"));
const box = (page: import("@playwright/test").Page, sel: string) =>
  page.evaluate((sel) => { const e = document.querySelector(sel) as HTMLElement | null; if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, oh: e.offsetHeight, ow: e.offsetWidth }; }, sel);

for (const [name, vp] of [["phone", PHONE], ["desk", DESK]] as const) {
  test(`the block's circuit fits, and the tail is Previous and Next (${name})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await open(page, "/6502/block?b=alu", 6000);
    const stage = (await box(page, ".bk-stage"))!;
    const svg = (await box(page, "#bk-svg"))!;
    expect(stage.h, "the stage has a height").toBeGreaterThan(300);
    // The whole drawing, inside the stage: more than the two thirds asked for.
    expect(svg.top).toBeGreaterThanOrEqual(stage.top - 1);
    expect(svg.bottom).toBeLessThanOrEqual(stage.bottom + 1);
    expect(svg.right).toBeLessThanOrEqual(stage.right + 1);
    expect(await page.evaluate(() => document.querySelector(".bk-stage")!.scrollHeight - document.querySelector(".bk-stage")!.clientHeight), "nothing to scroll to").toBeLessThanOrEqual(1);
    expect((await box(page, ".bk-seealso"))!.oh, "the drawn-other-ways links are gone").toBe(0);
    expect((await box(page, ".bk-step-all"))!.oh, "All twelve blocks is gone").toBe(0);
    const nav = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("#bk-blocknav .bk-step")].filter((a) => a.offsetHeight > 0).map((a) => a.querySelector(".bk-step-dir")!.textContent));
    expect(nav).toEqual(["Previous", "Next"]);
    await expect(page.locator("#bk-root-link")).toHaveText(/Full screen$/);
    expect(await page.evaluate(() => (document.querySelector("#bk-root-link") as HTMLAnchorElement).href)).toMatch(/\/6502\/schematic\?signal=alu0&block=alu&solo=1/);
  });

  test(`arriving at the study view with no gesture: the cover, under the strip (${name})`, async ({ page }) => {
    await page.setViewportSize(vp);
    // A bookmark, or the block's link on a phone: no user activation, so
    // the native request is refused and upstream's by-hand cover goes up.
    await open(page, "/6502/schematic?signal=alu0&block=alu&solo=1", 6000);
    await expect.poll(() => page.evaluate(() => document.querySelector(".console")?.classList.contains("solo")), { timeout: 15000 }).toBe(true);
    await expect.poll(() => has(page), { timeout: 5000 }).toBe(true);
    expect(await page.evaluate(() => document.querySelector(".console")!.classList.contains("faux")), "the by-hand cover").toBe(true);
    expect(await page.evaluate(() => (document.querySelector(".app-head") as HTMLElement).offsetHeight), "no bar").toBe(0);
    expect(await page.evaluate(() => (document.querySelector(".wb-foot") as HTMLElement).offsetHeight), "no footer").toBe(0);
    const strip = (await box(page, ".chip-transport"))!;
    const con = (await box(page, ".console"))!;
    expect(Math.round(strip.bottom), "the strip on the floor").toBe(vp.height);
    expect(Math.abs(con.bottom - strip.top), "the console stops at the strip").toBeLessThanOrEqual(1);
    // No bleed: what is under a point in the drawing is the console.
    expect(await page.evaluate(() => !!document.elementFromPoint(innerWidth - 40, innerHeight * 0.5)?.closest(".console"))).toBe(true);
    // One transport: the palette's keys and clock select are gone, the strip drives it.
    for (const id of ["#solo-run", "#solo-step", "#solo-back", "#solo-clock-select"]) expect((await box(page, id))!.ow, `${id} hidden`).toBe(0);
    const clock = () => page.evaluate(() => document.querySelector("#solo-clock")!.textContent);
    const before = await clock();
    await page.click(".chip-transport button[title='Forward one half-cycle']");
    await expect.poll(clock).not.toBe(before);
    expect(await page.getAttribute(".tbtn.fs", "aria-pressed"), "the strip's key is lit").toBe("true");
    // The strip's key leaves the study view.
    await page.click(".tbtn.fs");
    await expect.poll(() => has(page), { timeout: 5000 }).toBe(false);
    expect(await page.evaluate(() => document.querySelector(".console")!.classList.contains("solo"))).toBe(false);
    expect(await page.evaluate(() => (document.querySelector(".app-head") as HTMLElement).offsetHeight)).toBeGreaterThan(20);
  });

  test(`the block's full screen, and the strip's key on the schematic, are the study view (${name})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await open(page, "/6502/block?b=alu", 6000);
    await page.click("#bk-root-link");
    await page.waitForLoadState("load");
    // A click's activation can carry into the next document (Chromium does),
    // so this may be native fullscreen on the console or the cover: either
    // way it is the study view and the site is in full screen.
    const solo = () => page.evaluate(() => document.querySelector(".console")?.classList.contains("solo") ?? false);
    const nativeOn = () => page.evaluate(() => document.fullscreenElement !== null);
    await expect.poll(solo, { timeout: 15000 }).toBe(true);
    await expect.poll(() => has(page), { timeout: 5000 }).toBe(true);
    expect(await page.evaluate(() => (document.querySelector(".app-head") as HTMLElement).offsetHeight), "no bar").toBe(0);
    if (await nativeOn()) {
      // Native shows the console subtree alone: its own keys are the transport there.
      expect((await box(page, "#solo-run"))!.ow, "the palette's run key stays in native fullscreen").toBeGreaterThan(0);
      await page.evaluate(() => document.exitFullscreen());
    } else {
      await page.click(".tbtn.fs");
    }
    await expect.poll(() => has(page), { timeout: 5000 }).toBe(false);
    await expect.poll(solo, { timeout: 5000 }).toBe(false);
    // On the schematic, the strip's full screen is the study view.
    await page.click(".tbtn.fs");
    await expect.poll(solo, { timeout: 5000 }).toBe(true);
    await expect.poll(() => has(page), { timeout: 5000 }).toBe(true);
    if (await nativeOn()) await page.evaluate(() => document.exitFullscreen()); else await page.click(".tbtn.fs");
    await expect.poll(() => has(page), { timeout: 5000 }).toBe(false);
    await expect.poll(solo, { timeout: 5000 }).toBe(false);
  });
}

test("the graph's stage is dark; the exploded view has no zoom group", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/6502/diegraph", 4000);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".dg-stage")!).backgroundColor);
  const m = bg.match(/\d+/g)!.map(Number);
  expect(m[0] + m[1] + m[2], `stage ${bg} is dark`).toBeLessThan(120);
  // And the drawing on it is drawn for that ground: a gate edge was the
  // paper theme's ink at 55% over the dark stage, 1,282 invisible edges
  // (2026-08-28). Lightness read off the edge's stroke, whatever its syntax.
  await page.waitForSelector(".dg-e-gate", { timeout: 20000 });
  const edge = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector(".dg-e-gate")!).stroke;
    const n = s.match(/[\d.]+/g)!.map(Number);
    // rgb(a) gives 0..255, color(srgb ...) gives 0..1: normalise to 0..1.
    const [r, g, b] = n.slice(0, 3).map((v) => (v > 1 ? v / 255 : v));
    return { s, l: (r + g + b) / 3 };
  });
  expect(edge.l, `gate edge ${edge.s} is light on the dark stage`).toBeGreaterThan(0.25);
  // The page's own body::before stipple is not painted by every element in
  // the shell (the scoper's lookahead once took `::`; lib/explorer.test.ts).
  const stippled = await page.evaluate(() =>
    [...document.querySelectorAll(".explorer-shell *")].filter((e) => /radial-gradient/.test(getComputedStyle(e, "::before").backgroundImage)).length);
  expect(stippled, "elements whose ::before paints the stipple").toBe(0);
  await open(page, "/6502/exploded", 4000);
  expect((await box(page, ".ex-zoom"))!.ow).toBe(0);
  expect((await box(page, "#ex-run"))!.ow, "the page's own transport stays hidden").toBe(0);
});
