import { test, expect } from "@playwright/test";
import { DESK, PHONE, open } from "./lib";

/**
 * A drawing in a document (a mermaid fence, components/Diagram.tsx): drawn
 * in the browser, whole, at the column's width, with its caption under it,
 * and full screen behind a press (owner, 2026-09-29: "the diagrams should
 * have thumbnails and a full screen version"). The desk's as-built page is
 * the first document with drawings, so it is the page under test; the
 * other fences on it keep their Copy control.
 *
 * Each assertion is against the rendered SVG, not the source: a fence that
 * failed to draw leaves its source behind, and a source is not a figure.
 */

const PAGE = "/docs/nes/workbench";

test("every drawing on the desk's page is drawn, captioned, and opens full screen", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, PAGE, 1500);
  const figs = page.locator("figure.diagram");
  const n = await figs.count();
  expect(n, "the page has drawings").toBeGreaterThanOrEqual(5);
  // Drawn, not pending and not failed; the wasm-sized library takes a moment.
  await expect(page.locator('figure.diagram[data-diagram="drawn"]')).toHaveCount(n, { timeout: 20_000 });
  await expect(page.locator('figure.diagram[data-diagram="failed"]')).toHaveCount(0);
  for (let i = 0; i < n; i++) {
    const f = figs.nth(i);
    const cap = (await f.locator("figcaption").innerText()).trim();
    expect(cap.length, `drawing ${i + 1} has a caption`).toBeGreaterThan(20);
    expect(cap, `drawing ${i + 1}'s caption says it opens`).toMatch(/\(Full screen\)$/);
    const svg = f.locator(".diagram-thumb svg");
    await expect(svg).toHaveCount(1);
    const box = (await svg.boundingBox())!;
    expect(box.width, `drawing ${i + 1} has a width`).toBeGreaterThan(200);
    expect(box.height, `drawing ${i + 1} has a height`).toBeGreaterThan(60);
    expect(box.height, `drawing ${i + 1} is a thumbnail, not the whole column`).toBeLessThan(440);
    // Words, wherever mermaid put them (flowchart labels are HTML in a
    // foreignObject, sequence labels are SVG text): the drawing's text.
    expect((await svg.evaluate((e) => e.textContent ?? "")).trim().length, `drawing ${i + 1} has words in it`).toBeGreaterThan(40);
    await expect(f.locator("pre"), `drawing ${i + 1} left its source behind`).toHaveCount(0);
  }

  // The first drawing full screen: fitted to the viewport, then at its own size, then closed by Escape.
  const first = figs.first();
  const thumb = (await first.locator(".diagram-thumb svg").boundingBox())!;
  await first.locator(".diagram-thumb").click();
  const dlg = first.locator("dialog.diagram-full");
  await expect(dlg).toHaveAttribute("open", "");
  const fitted = (await dlg.locator(".diagram-view svg").boundingBox())!;
  expect(fitted.width, "full screen is larger than the thumbnail").toBeGreaterThan(thumb.width * 1.3);
  expect(fitted.width).toBeLessThanOrEqual(DESK.width);
  expect(fitted.height).toBeLessThanOrEqual(DESK.height);
  await dlg.getByRole("button", { name: "Actual size" }).click();
  const actual = (await dlg.locator(".diagram-view svg").boundingBox())!;
  expect(actual.width, "actual size is a size").toBeGreaterThan(0);
  expect(actual.width, "actual size is not the fitted size").not.toBeCloseTo(fitted.width, -1);
  await expect(dlg.getByRole("button", { name: "Fit the screen" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg).not.toHaveAttribute("open", "");
});

test("the other code blocks beside the drawings keep their Copy control", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, PAGE, 1500);
  await expect(page.locator('figure.diagram[data-diagram="drawn"]').first()).toBeVisible({ timeout: 20_000 });
  const pres = page.locator(".prose pre");
  const btns = page.locator(".copy-pre .copy-btn");
  expect(await pres.count(), "the page has a code block that is not a drawing").toBeGreaterThanOrEqual(1);
  expect(await btns.count(), "one Copy per block").toBe(await pres.count());
});

test("the drawings stack on a phone without widening the page, and speak Japanese under /ja", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, `/ja${PAGE}`, 1500);
  const n = await page.locator("figure.diagram").count();
  await expect(page.locator('figure.diagram[data-diagram="drawn"]')).toHaveCount(n, { timeout: 20_000 });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide, "the page scrolls sideways").toBeLessThanOrEqual(0);
  await expect(page.locator("figure.diagram figcaption").first()).toContainText("(全画面)");
  // The body is English until translated, and the page says so.
  await expect(page.locator(".untranslated")).toHaveCount(1);
});
