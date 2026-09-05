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
  c2c02: {
    commit: string;
    tests_green: number;
    mutate_red: number;
    p1_states: number;
    p3: { visible_dots: number; mean_ms: string; mean_inside_x: string; hit_line: number; hit_pixel: number };
  };
  n3: {
    traces_compared: number;
    traces_exact: number;
    apu_worlds: number;
    apu_half_steps: number;
    dma_frames: number;
    dmc_frames: number;
    real_time_x: string;
    noise_index12_die: number;
    noise_index12_published: number;
  };
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

  // The PPU's row of chips and its figures, from the same record.
  const ppu = page.locator("[data-boarded-ppu] .measured");
  await expect(ppu).toHaveCount(3);
  await expect(ppu.nth(0)).toContainText(String(record.c2c02.tests_green));
  await expect(ppu.nth(1)).toContainText(String(record.c2c02.mutate_red));
  await expect(ppu.nth(2)).toContainText(record.c2c02.commit.slice(0, 7));
  expect(text).toContain(String(record.c2c02.p1_states));
  expect(text).toContain(String(record.c2c02.p3.visible_dots));
  expect(text).toContain(`${record.c2c02.p3.mean_ms} ms`);
  expect(text).toContain(`${record.c2c02.p3.mean_inside_x} times`);
  expect(text).toContain(`(${record.c2c02.p3.hit_line}, ${record.c2c02.p3.hit_pixel})`);

  // The 2A03 ladder's row of chips and its prose, from the same record.
  const n3 = page.locator("[data-boarded-n3] .measured");
  await expect(n3).toHaveCount(3);
  await expect(n3.nth(0)).toContainText(`${record.n3.apu_worlds} worlds, ${record.n3.apu_half_steps} half-steps`);
  await expect(n3.nth(1)).toContainText(String(2 * record.n3.dma_frames + record.n3.dmc_frames));
  await expect(n3.nth(2)).toContainText(`${record.n3.real_time_x}x real time`);
  expect(text).toContain(`${record.n3.traces_compared} traces compare`);
  expect(text).toContain(`${record.n3.traces_exact} of them exact`);
  expect(text).toContain(`${record.n3.noise_index12_die} cycles where every published table says ${record.n3.noise_index12_published}`);
});

test("the PPU and APU figures serve and decode", async ({ page, request }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes", 500);
  for (const asset of ["/nes/ppu-sequencer.png", "/nes/ppu-sprite-world.png", "/nes/ppu-scroll-world.png", "/nes/apu-codes.png"]) {
    const img = page.locator(`.crt-figure img[src="${asset}"]`);
    await expect(img).toBeVisible();
    await img.scrollIntoViewIfNeeded();
    await expect.poll(async () => img.evaluate((e) => (e as HTMLImageElement).naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);
    const r = await request.get(asset);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
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
  expect(text).not.toContain("no list of exceptions at all");
});
