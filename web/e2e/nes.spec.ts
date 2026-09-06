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
  console: {
    commit: string;
    tests_green: number;
    alignment: { cpu_phase: number; ppu_phase: number };
    gate1: { nmi_half_cycles: number; race_reads_set: number; race_reads_clear: number; alignments: number };
    real_time_x: [string, string];
    picture: {
      components_equal: number;
      phase: number;
      phase_frames: number;
      capture: { regions: number; within_all: number; luma_within: number; hue_within: number; hue_regions: number; worst_chroma: string; held: boolean };
    };
    shell: { gpu: Record<string, { worst: number; mean: number; ms_per_frame: string }>; wasm: { frames_per_s: string; frames: number } };
    sound: { tolerance_pct: number; stage: { tau_hp_ms: string; gain: string }; roms: Record<string, { rms_pct: string; rec_rms_pct: string }> };
    blargg: {
      instr_pass: number; instr_total: number;
      sprite_pass: number; sprite_total: number;
      vbl_nmi_pass: number; vbl_nmi_total: number;
    };
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

  // The console's row and its prose, from the same record.
  const con = page.locator("[data-boarded-console] .measured");
  await expect(con).toHaveCount(4);
  await expect(con.nth(0)).toContainText(String(record.console.tests_green));
  await expect(con.nth(1)).toContainText(`${record.console.blargg.instr_pass} of ${record.console.blargg.instr_total}`);
  await expect(con.nth(2)).toContainText(`${record.console.real_time_x[0]} to ${record.console.real_time_x[1]}x`);
  await expect(con.nth(3)).toContainText(record.console.commit.slice(0, 7));
  expect(text).toContain(`${record.console.blargg.sprite_pass} of ${record.console.blargg.sprite_total} sprite-hit`);
  expect(text).toContain(`${record.console.blargg.vbl_nmi_pass} of ${record.console.blargg.vbl_nmi_total} vblank`);
  expect(text).toContain(`cpu_phase ${record.console.alignment.cpu_phase}, ppu_phase ${record.console.alignment.ppu_phase}`);
  expect(text).toContain(`${record.console.gate1.nmi_half_cycles} of them agree`);
  expect(text).toContain(`${record.console.gate1.race_reads_set} reads around the flag`);
  expect(text).toContain(`all ${record.console.gate1.alignments} alignments`);
  // N6, the picture: the gate's figures and the capture roundtrip's
  // verdict, as boarded (a miss is boarded as a miss).
  const pic = record.console.picture;
  expect(text).toContain(`${pic.components_equal} components equal`);
  expect(text).toContain(`phase ${pic.phase};`);
  expect(text).toContain(`Of ${pic.capture.regions} regions, luma holds on ${pic.capture.luma_within}, hue on ${pic.capture.hue_within} of ${pic.capture.hue_regions}`);
  expect(text).toContain(`${pic.capture.within_all} hold all three, so the roundtrip ${pic.capture.held ? "closes" : "does not close"}`);
  expect(text).toContain(`a chroma vector of at most ${pic.capture.worst_chroma}`);
  // N7, the sound: the stage's constants and each ROM's console figure
  // beside the recording's.
  const snd = record.console.sound;
  expect(text).toContain(`a time constant of ${snd.stage.tau_hp_ms} ms, a gain of ${snd.stage.gain}`);
  for (const k of ["square", "triangle", "noise", "dmc"]) {
    expect(text).toContain(`${k} ${snd.roms[k].rms_pct} percent against ${snd.roms[k].rec_rms_pct}`);
  }
  // N8, the shell: the GPU gate's worst and the wasm rate, as boarded.
  const sh = record.console.shell;
  expect(text).toContain(`worst component differs by ${sh.gpu.authored.worst.toExponential(1)}`);
  expect(text).toContain(`A frame takes ${sh.gpu.authored.ms_per_frame} ms`);
  expect(text).toContain(`${sh.wasm.frames_per_s} frames a second`);
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
  for (const repo of ["nes-bus", "2a03", "2c02", "nes"]) {
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

test("the console runs a cartridge in the page and paints it", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/play", 500);
  // The repository's own test cartridge (nobody's game), from disk, as a
  // reader would load one. The worker builds the console and the pipeline.
  await page.locator("[data-play-rom]").setInputFiles("e2e/fixtures/testcart.nes");
  await expect(page.locator("[data-play-stats] .measured").first()).toContainText("testcart.nes", { timeout: 20_000 });
  await page.locator("[data-play-run]").click();
  // Frames shown climbs past a handful: the console ran, the comb decoded,
  // the canvas painted, the pacing counted.
  await expect
    .poll(async () => {
      const t = await page.locator("[data-play-stats]").innerText();
      const m = t.match(/frames shown:\s*(\d+)/);
      return m ? Number(m[1]) : 0;
    }, { timeout: 30_000 })
    .toBeGreaterThan(10);
  // The page's canvas shows bitmaps the picture worker painted on its own,
  // so the page cannot read pixels; the worker measures a painted row of
  // the first frame itself and the readout names the decode path. On
  // WebGPU the worker also held its decode to the wasm decode within the
  // tolerance before choosing it, and the readout says by how much.
  await expect(page.locator("[data-play-path]")).toHaveCount(1);
  const path = await page.locator("[data-play-path]").getAttribute("data-play-path");
  const text = (await page.locator("[data-play-stats]").innerText()).replace(/\s+/g, " ");
  const lit = await page.evaluate(() => (window as unknown as { __playLit?: number }).__playLit ?? -1);
  expect(lit).toBeGreaterThan(0);
  if (path === "webgpu") {
    const m = text.match(/within\s*(\d+) of 255 \(tolerance (\d+)\)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(Number(m![2]));
    const v = text.match(/within\s*([0-9.e-]+) V \(tolerance ([0-9.e-]+)\)/);
    expect(v).not.toBeNull();
    expect(Number(v![1])).toBeLessThanOrEqual(Number(v![2]));
  } else {
    expect(text).toContain("picture: wasm");
  }
  await expect(page.locator("[data-play-why]")).toHaveCount(0);
  expect(text).toMatch(/display callbacks:\s*\d+/);
});
