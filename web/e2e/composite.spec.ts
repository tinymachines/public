import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DESK, open } from "./lib";

/**
 * /ntsc/composite: the deep-dive is a measurement report whose figures
 * are slots filled from data/ntsc.json's `composite` record. This spec
 * covers the rule that makes it worth shipping: what it shows is what was
 * boarded, and the figures it shows are served.
 */

const record = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "data", "ntsc.json"), "utf8"),
) as {
  commit: string;
  composite: {
    loaded: { sync_tip_v: number; blanking_v: number; burst_pp_v: number; burst_over_sync: number };
    table: { burst_over_sync: number };
    ratio_unloaded_over_loaded: { sync_to_blank: number; burst_pp: number };
  };
};

test("the deep-dive states the boarded levels and serves its figures", async ({ page, request }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ntsc/composite", 500);

  const chips = page.locator("[data-boarded] .measured");
  await expect(chips).toHaveCount(5);
  await expect(chips.nth(0)).toContainText(record.composite.loaded.sync_tip_v.toFixed(3));
  await expect(chips.nth(1)).toContainText(record.composite.loaded.blanking_v.toFixed(3));
  await expect(chips.nth(2)).toContainText(record.composite.loaded.burst_pp_v.toFixed(3));
  await expect(chips.nth(3)).toContainText(record.composite.loaded.burst_over_sync.toFixed(2));
  await expect(chips.nth(4)).toContainText(record.composite.table.burst_over_sync.toFixed(2));

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).toContain(`${record.composite.ratio_unloaded_over_loaded.sync_to_blank.toFixed(2)} times larger`);
  expect(text).toContain(`${record.composite.ratio_unloaded_over_loaded.burst_pp.toFixed(2)} times larger`);
  expect(text).toContain(record.commit.slice(0, 7));

  for (const asset of [
    "/ntsc/composite/scanline.png",
    "/ntsc/composite/burst.png",
    "/ntsc/composite/overlay.png",
    "/ntsc/composite/histogram.png",
    "/ntsc/composite/decoded-menu-terminated.png",
  ]) {
    const img = page.locator(`.crt-figure img[src="${asset}"]`);
    await expect(img).toBeVisible();
    // Served AND decoded: a figure that is a box where a drawing should
    // be passes a visibility check and fails this one.
    await img.scrollIntoViewIfNeeded();
    await expect.poll(async () => img.evaluate((e) => (e as HTMLImageElement).naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);
    const r = await request.get(asset);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

test("the landing links to the deep-dive", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ntsc", 500);
  await expect(page.locator('main a[href="/ntsc/composite"]').first()).toBeVisible();
});

test("the Japanese deep-dive carries a Japanese body", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ja/ntsc/composite", 500);
  const text = await page.locator("main").innerText();
  expect(text).toContain("終端");
  expect(text).not.toContain("Why the terminator");
});
