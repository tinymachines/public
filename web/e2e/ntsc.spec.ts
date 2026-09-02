import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DESK, open } from "./lib";

/**
 * /ntsc: the third project's landing is a measurement report, and its
 * figures are slots filled from data/ntsc.json (the boarded record). The
 * generic pages.spec covers the page's shape; this spec covers the rule
 * that makes the page worth shipping: what it shows is what was boarded.
 */

const record = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "data", "ntsc.json"), "utf8"),
) as {
  commit: string;
  tests_green: number;
  mutate_red: number;
  claims_verified: number;
  rates: { nes_full_hz: string; nes_pair_hz: string };
};

test("the landing shows the boarded figures, not remembered ones", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ntsc", 500);

  // The boarded chips carry the record's numbers and its commit. If a deploy
  // ships a re-boarded record, the page follows it with no edit; if the page
  // ever types a number instead, this is the test that notices the drift.
  const chips = page.locator("[data-boarded] .measured");
  await expect(chips).toHaveCount(5);
  await expect(chips.nth(0)).toContainText(String(record.tests_green));
  await expect(chips.nth(1)).toContainText(String(record.mutate_red));
  await expect(chips.nth(2)).toContainText(String(record.claims_verified));
  await expect(chips.nth(4)).toContainText(record.commit.slice(0, 7));

  // The rate correction states both quantities, from the record's slots.
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).toContain(record.rates.nes_full_hz);
  expect(text).toContain(record.rates.nes_pair_hz);
});

test("the CRT frame is served, and the page says it is illustrative", async ({ page, request }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ntsc", 500);

  const img = page.locator(".crt-figure img");
  await expect(img).toHaveAttribute("src", "/ntsc/crt-hue-bands.png");
  const r = await request.get("/ntsc/crt-hue-bands.png");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("image/png");
  await expect(page.locator(".crt-figure figcaption")).toContainText("Illustrative");

  // The repository is the story's home and must be linked.
  await expect(
    page.locator('main a[href^="https://github.com/tinymachines/ntsc-crt"]').first(),
  ).toBeVisible();
});

test("the bench decodes a frame in the page and counts it", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ntsc/bench", 500);

  // One step: the worker fetches the boarded wasm, encodes one frame of
  // hue bands and paints it. A blank canvas afterwards would mean the
  // bundle, the worker or the paint path is broken, whatever the page says.
  await page.getByRole("button", { name: "Step one frame" }).click();
  await expect(page.locator("[data-bench-stats] .measured").first()).toContainText("1", {
    timeout: 20_000,
  });
  const painted = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(".bench-screen");
    const d = c?.getContext("2d")?.getImageData(0, 120, c.width, 1).data;
    if (!d) return -1;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  });
  expect(painted).toBeGreaterThan(0);

  // No refusal notice: the boarded bundle answered.
  await expect(page.locator("[data-bench-why]")).toHaveCount(0);
});

test("the Japanese page carries a Japanese body, not a fallback", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ja/ntsc", 500);
  const text = await page.locator("main").innerText();
  expect(text).toContain("実測");
  expect(text).not.toContain("did not survive measurement");
});
