import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DESK, open } from "./lib";

/**
 * /nes: the fourth project's landing is a measurement report, and its
 * figures are slots filled from data/nes.json (the boarded record).
 * The generic pages.spec covers the page's shape; this spec covers the
 * rule that makes it worth shipping: what it shows is what was boarded.
 */

const record = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "data", "nes.json"), "utf8"),
) as {
  commit: string;
  tests_green: number;
  mutate_red: number;
  halfphi: string;
  a0: { transistors: string; golden_states: number };
  first_sound: { plateau_half_steps: number; timer_byte: number };
};

test("the landing shows the boarded figures, not remembered ones", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes", 500);

  const chips = page.locator("[data-boarded] .measured");
  await expect(chips).toHaveCount(4);
  await expect(chips.nth(0)).toContainText(String(record.tests_green));
  await expect(chips.nth(1)).toContainText(String(record.mutate_red));
  await expect(chips.nth(2)).toContainText(record.halfphi);
  await expect(chips.nth(3)).toContainText(record.commit.slice(0, 7));

  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).toContain(record.a0.transistors);
  expect(text).toContain(String(record.first_sound.plateau_half_steps));
});

test("the first-sound figure serves as committed bytes", async ({ page, request }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes", 500);

  await expect(page.locator('.crt-figure img[src="/nes/first-sound.png"]')).toBeVisible();
  const r = await request.get("/nes/first-sound.png");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("image/png");

  // The story's homes are linked.
  for (const repo of ["nes-bus", "2a03", "2c02"]) {
    await expect(
      page.locator(`main a[href*="github.com/tinymachines/${repo}"]`).first(),
    ).toBeVisible();
  }
});

test("the Japanese page carries a Japanese body, not a fallback", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ja/nes", 500);
  const text = await page.locator("main").innerText();
  expect(text).toContain("実測");
  expect(text).not.toContain("no exemption list at all");
});
