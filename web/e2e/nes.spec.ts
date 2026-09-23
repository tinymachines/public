import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DESK, PHONE, open } from "./lib";

/**
 * The NES section's measurement pages, /nes/chips and /nes/console (the
 * landing's reports until 2026-09-14), whose figures are slots filled
 * from data/nes.json (the boarded record). The generic pages.spec covers
 * the pages' shape; this spec covers the rule that makes them worth
 * shipping: what they show is what was boarded.
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
    nodes: string;
    masked_latches_p0: number;
    masked_latches_p1: number;
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
      capture: { margin_dots: number; held: boolean; rows: Record<string, { regions: number; within_all: number; worst_luma: string; worst_hue_deg: string }> };
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

test("the chips page shows the boarded figures, not remembered ones", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/chips", 500);

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
  expect(text).toContain(`every one of ${record.c2c02.nodes} nodes`);
  expect(text).toContain(`The ${record.c2c02.masked_latches_p0} and then ${record.c2c02.masked_latches_p1} latches`);
  expect(text).toContain(String(record.c2c02.p3.visible_dots));
  expect(text).toContain(`${record.c2c02.p3.mean_ms} ms`);
  expect(text).toContain(`${record.c2c02.p3.mean_inside_x} times`);
  expect(text).toContain(`(${record.c2c02.p3.hit_line}, ${record.c2c02.p3.hit_pixel})`);

  // The 2A03 ladder's row of chips and its prose, from the same record.
  const n3 = page.locator("[data-boarded-n3] .measured");
  await expect(n3).toHaveCount(3);
  await expect(n3.nth(0)).toContainText(`${record.n3.apu_worlds} test scenes, ${record.n3.apu_half_steps} half-steps`);
  await expect(n3.nth(1)).toContainText(String(2 * record.n3.dma_frames + record.n3.dmc_frames));
  await expect(n3.nth(2)).toContainText(`${record.n3.real_time_x}x real time`);
  expect(text).toContain(`${record.n3.traces_compared} traces compare`);
  expect(text).toContain(`${record.n3.traces_exact} of them exact`);
  expect(text).toContain(`${record.n3.noise_index12_die} cycles where every published table says ${record.n3.noise_index12_published}`);
});

test("the console page shows the boarded figures, not remembered ones", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/console", 500);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");

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
  expect(text).toContain(`${pic.capture.margin_dots} dots in from its edges`);
  for (const k of ["1", "2", "3", "0"]) {
    const row = pic.capture.rows[k];
    expect(text).toContain(`luma row ${k}: ${row.within_all} of ${row.regions} regions hold all three (worst luma ${row.worst_luma}, hue ${row.worst_hue_deg} degrees`);
  }
  expect(text).toContain(pic.capture.held ? "The roundtrip closes." : "The roundtrip does not close.");
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
  await open(page, "/nes/chips", 500);
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
  await open(page, "/nes/chips", 500);

  await expect(page.locator('.crt-figure img[src="/nes/first-sound.png"]')).toBeVisible();
  const r = await request.get("/nes/first-sound.png");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("image/png");

  // The story's homes are linked: the chip repositories here, the
  // console's on its own page.
  for (const repo of ["nes-bus", "2a03", "2c02"]) {
    await expect(
      page.locator(`main a[href*="github.com/tinymachines/${repo}"]`).first(),
    ).toBeVisible();
  }
  await open(page, "/nes/console", 500);
  await expect(page.locator('main a[href*="github.com/tinymachines/nes/"]').first()).toBeVisible();
});

test("the Japanese page carries a Japanese body, not a fallback", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ja/nes/chips", 500);
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

test("the play page has a pad a thumb can hold and a full screen mode, on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, "/nes/play", 500);
  const pad = page.locator("[data-play-pad]");
  await expect(pad).toHaveCount(1);
  // Nothing scrolls sideways with the pad on the page.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  // A press on A is bit 0 of the register's byte; a release clears it.
  // (A thumb is on the screen by definition; the synthetic pointer is
  // not, so the pad is scrolled into view first.)
  await pad.scrollIntoViewIfNeeded();
  const a = page.locator('[data-pad-btn="a"]');
  const box = (await a.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(pad).toHaveAttribute("data-play-pad", "01");
  await page.mouse.up();
  await expect(pad).toHaveAttribute("data-play-pad", "00");
  // The cross: a press on its right arm is Right (bit 7); sliding the
  // same press to the top arm becomes Up (bit 4), no second press.
  const cross = (await page.locator('[data-pad-btn="cross"]').boundingBox())!;
  await page.mouse.move(cross.x + cross.width * 0.85, cross.y + cross.height / 2);
  await page.mouse.down();
  await expect(pad).toHaveAttribute("data-play-pad", "80");
  await page.mouse.move(cross.x + cross.width / 2, cross.y + cross.height * 0.15, { steps: 4 });
  await expect(pad).toHaveAttribute("data-play-pad", "10");
  await page.mouse.up();
  await expect(pad).toHaveAttribute("data-play-pad", "00");
  // Full screen is the document's, from the strip on the floor (the page
  // is a workbench since 2026-09-22): the bar leaves, the stage takes the
  // viewport above the strip, the strip stays with the way out, and the
  // picture keeps its 256 by 240 shape at the width of the screen.
  const fs = page.locator(".tbtn.fs");
  await expect(fs).toHaveCount(1);
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("has-fullscreen")), { timeout: 5000 }).toBe(true);
  expect(await page.evaluate(() => (document.querySelector(".app-head") as HTMLElement).offsetHeight), "the bar is gone").toBe(0);
  const r = await page.evaluate(() => {
    const stage = document.querySelector("[data-play-stage]")!.getBoundingClientRect();
    const strip = document.querySelector(".chip-transport")!.getBoundingClientRect();
    const screen = document.querySelector(".bench-screen")!.getBoundingClientRect();
    return { stage: { w: stage.width, h: stage.height, top: stage.top, bottom: stage.bottom }, strip: { top: strip.top, bottom: strip.bottom }, screen: { w: screen.width, h: screen.height }, vw: innerWidth, vh: innerHeight };
  });
  expect(Math.round(r.stage.w)).toBe(r.vw);
  expect(Math.round(r.stage.top)).toBe(0);
  expect(Math.abs(r.stage.bottom - r.strip.top), "the stage ends where the strip begins").toBeLessThanOrEqual(1);
  expect(Math.round(r.strip.bottom), "the strip on the floor").toBe(r.vh);
  expect(Math.abs(r.screen.w / r.screen.h - 256 / 240)).toBeLessThan(0.02);
  expect(r.screen.w).toBeGreaterThan(r.vw * 0.9);
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("has-fullscreen")), { timeout: 5000 }).toBe(false);
  expect(await page.evaluate(() => (document.querySelector(".app-head") as HTMLElement).offsetHeight)).toBeGreaterThan(20);
});

test("the play page is a workbench: the bar, the strip of its sections, the transport on the floor", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/play", 500);
  const r = await page.evaluate(() => ({
    bar: document.querySelectorAll(".workbench > .app-head.wb-bar").length,
    name: document.querySelector(".topbar .tb-page")?.textContent?.trim() ?? "",
    strip: [...document.querySelectorAll(".wb-strip a")].map((a) => (a.textContent ?? "").trim()),
    foot: getComputedStyle(document.querySelector(".wb-foot")!).position,
    keys: [...document.querySelectorAll(".chip-transport .ct-row button.tbtn:not(.fs)")].map((b) => ({ word: b.querySelector(".lb")?.textContent?.trim(), disabled: (b as HTMLButtonElement).disabled, title: b.getAttribute("title") ?? "" })),
    seek: (document.querySelector(".ct-seek") as HTMLInputElement).disabled,
    rate: (document.querySelector(".ct-rate input") as HTMLInputElement).disabled,
    pos: document.querySelector("[data-play-pos]")?.textContent?.trim(),
  }));
  expect(r.bar, "one workbench bar").toBe(1);
  expect(r.name).toBe("Play");
  expect(r.strip, "the strip is the page's sections").toEqual(["Screen", "Cartridge", "CPU", "Memory", "Palettes", "Sprites on screen", "Code", "Sprites", "Readouts", "About this console"]);
  expect(r.foot, "the footer on the floor").toBe("fixed");
  // The keys, in the chip transport's order; every one grey before a cartridge.
  expect(r.keys.map((k) => k.word)).toEqual(["power", "reset", "play", "½", "cyc", "op", "line", "frame"]);
  expect(r.keys.every((k) => k.disabled)).toBe(true);
  expect(r.keys[5].title).toContain("opcode fetch");
  expect(r.seek && r.rate, "rate and seek are grey, not gone").toBe(true);
  expect(r.pos).toBe("no cartridge");

  // A cartridge: power, start and play light; frame lights while paused
  // and runs exactly one frame; power off keeps the cartridge and greys
  // the rest; power on brings the console back at power on.
  await page.locator("[data-play-rom]").setInputFiles("e2e/fixtures/testcart.nes");
  await expect(page.locator("[data-play-stats] .measured").first()).toContainText("testcart.nes", { timeout: 20_000 });
  await expect(page.locator("[data-play-power]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-play-run]")).toBeEnabled();
  await expect(page.locator("[data-play-frame]")).toBeEnabled();
  const framesRun = async () => Number(((await page.locator("[data-play-pos]").textContent()) ?? "").match(/frame\s+(\d+)/)?.[1] ?? -1);
  expect(await framesRun()).toBe(0);
  await page.locator("[data-play-frame]").click();
  await expect.poll(framesRun).toBe(1);
  await page.locator("[data-play-frame]").click();
  await expect.poll(framesRun).toBe(2);
  await page.locator("[data-play-run]").click();
  await expect.poll(framesRun, { timeout: 15_000 }).toBeGreaterThan(10);
  await expect(page.locator("[data-play-frame]"), "no frame step while running").toBeDisabled();
  await page.locator("[data-play-run]").click();
  await page.locator("[data-play-power]").click();
  await expect(page.locator("[data-play-power]")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-play-run]")).toBeDisabled();
  await expect(page.locator("[data-play-off]")).toHaveCount(1);
  await expect(page.locator("[data-play-stats]")).toContainText("testcart.nes");
  await page.locator("[data-play-power]").click();
  await expect(page.locator("[data-play-power]")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(framesRun).toBe(0);
  await expect(page.locator("[data-play-run]")).toBeEnabled();
});

test("sprites from the bytes: the sheet, a painted pixel, the patch in the console and out as IPS", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/play", 500);
  // The section says what it is before a cartridge, and draws nothing.
  await expect(page.locator("[data-spr]")).toHaveAttribute("data-spr-count", "0");
  await expect(page.locator("[data-spr-sheet]")).toHaveCount(0);

  // The site's own calibration cartridge: 8 KiB of CHR, 512 tiles, one
  // pattern table of 256 at a time.
  await page.locator("[data-play-rom]").setInputFiles("public/nes/cal.nes");
  await expect(page.locator("[data-play-stats] .measured").first()).toContainText("cal.nes", { timeout: 20_000 });
  await expect(page.locator("[data-spr]")).toHaveAttribute("data-spr-count", "512");
  await expect(page.locator("[data-spr-table] option")).toHaveCount(2);
  await expect(page.locator("[data-spr-changed-line]")).toContainText("changed: 0 tiles, 0 bytes");
  await expect(page.locator("[data-spr-running]")).toHaveAttribute("data-spr-running", "base");
  for (const b of ["[data-spr-apply]", "[data-spr-revert]", "[data-spr-ips]", "[data-spr-nes]"]) await expect(page.locator(b)).toBeDisabled();

  // Open tile 1 (second column, first row of table 0) and paint its top-left
  // pixel with colour 3. The sheet's pixel takes the brush's colour, the
  // edit is one tile and sixteen bytes, and the buttons light.
  // Locator clicks, not the mouse at a point: the sheet is below the fold
  // at desk height, and a locator scrolls it into view first.
  const sheet = page.locator("[data-spr-sheet]");
  const cell = (await sheet.boundingBox())!.width / 16;
  await sheet.click({ position: { x: cell * 1.5, y: cell * 0.5 } });
  await expect(page.locator("[data-spr-picked]")).toHaveAttribute("data-spr-picked", "1");
  await page.locator('[data-spr-slot="3"]').click();
  const edit = page.locator("[data-spr-edit]");
  const eb = (await edit.boundingBox())!;
  const ecell = eb.width / 8;
  const before = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("[data-spr-sheet]")!;
    return Array.from(c.getContext("2d")!.getImageData(3 * 8 + 1, 1, 1, 1).data.slice(0, 3));
  });
  await edit.click({ position: { x: ecell / 2, y: ecell / 2 } });
  await expect(page.locator("[data-spr]")).toHaveAttribute("data-spr-changed", "1");
  // One pixel is one or two bytes of the tile (one per plane whose bit
  // changed), and the patch carries exactly those, not the whole tile.
  await expect(page.locator("[data-spr-changed-line]")).toContainText(/changed: 1 tiles, [12] bytes/);
  const changedBytes = Number(((await page.locator("[data-spr-changed-line]").textContent()) ?? "").match(/, (\d+) bytes/)![1]);
  const after = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("[data-spr-sheet]")!;
    const slot = (document.querySelector('[data-spr-slot="3"]') as HTMLElement).style.background;
    return { px: Array.from(c.getContext("2d")!.getImageData(3 * 8 + 1, 1, 1, 1).data.slice(0, 3)), slot };
  });
  expect(after.px, "the sheet's pixel changed").not.toEqual(before);
  expect(after.slot.replace(/\s/g, "")).toContain(`rgb(${after.px.join(",")})`);
  for (const b of ["[data-spr-apply]", "[data-spr-revert]", "[data-spr-ips]", "[data-spr-nes]"]) await expect(page.locator(b)).toBeEnabled();

  // The patch out as IPS: PATCH, one record of the changed bytes inside
  // tile 1's sixteen (header, 32 KiB of PRG, then the tile), EOF.
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("[data-spr-ips]").click()]);
  expect(dl.suggestedFilename()).toBe("cal.ips");
  const ips = fs.readFileSync((await dl.path())!);
  expect(ips.subarray(0, 5).toString("latin1")).toBe("PATCH");
  expect(ips.subarray(ips.length - 3).toString("latin1")).toBe("EOF");
  const at = (ips[5] << 16) | (ips[6] << 8) | ips[7];
  const tileAt = 16 + 32768 + 16;
  expect(at).toBeGreaterThanOrEqual(tileAt);
  expect(at + changedBytes).toBeLessThanOrEqual(tileAt + 16);
  expect((ips[8] << 8) | ips[9]).toBe(changedBytes);
  expect(ips.length).toBe(5 + 5 + changedBytes + 3);

  // The patch into the console: the cartridge reloads at power on with the
  // patched image, the readout says so, and a power cycle keeps it.
  await page.locator("[data-spr-apply]").click();
  await expect(page.locator("[data-spr-running]")).toHaveAttribute("data-spr-running", "patch", { timeout: 20_000 });
  await expect(page.locator("[data-play-patched]")).toHaveCount(1);
  await expect(page.locator("[data-spr-apply]")).toBeDisabled();
  await page.locator("[data-play-start]").click();
  await expect(page.locator("[data-play-patched]")).toHaveCount(1);
  await expect(page.locator("[data-play-frame]")).toBeEnabled({ timeout: 20_000 });

  // Revert: the edits go, and the console runs the file as loaded again.
  await page.locator("[data-spr-revert]").click();
  await expect(page.locator("[data-spr]")).toHaveAttribute("data-spr-changed", "0");
  await expect(page.locator("[data-spr-running]")).toHaveAttribute("data-spr-running", "base", { timeout: 20_000 });
  await expect(page.locator("[data-play-patched]")).toHaveCount(0);
});

test("reads out of the engine: the CPU, the memory monitor, the palettes and the sprites on screen, from the bundle", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/play", 500);
  // Before a cartridge every panel says why it is empty.
  await expect(page.locator("[data-state-why]")).toContainText("No cartridge");
  await page.locator("[data-play-rom]").setInputFiles("public/nes/cal.nes");
  await expect(page.locator("[data-play-stats] .measured").first()).toContainText("cal.nes", { timeout: 20_000 });
  // At power on, before a frame: the registers are read, the PC is in the cartridge.
  const pc = async () => parseInt(((await page.locator('[data-reg="PC"]').textContent()) ?? "").replace("$", ""), 16);
  await expect(page.locator('[data-reg="PC"]')).toHaveCount(1, { timeout: 10_000 });
  expect(await pc()).toBeGreaterThanOrEqual(0x8000);
  await expect(page.locator("[data-flags] i")).toHaveCount(8);
  // The beam is read as a place on the frame. One whole frame later it is
  // back where it started, so what a frame moves is the count, not the beam.
  await expect(page.locator("[data-ppu-beam]")).toHaveText(/line \d+, dot \d+/);
  await page.locator("[data-play-frame]").click();
  await expect(page.locator("[data-play-pos]")).toContainText("frame 1");
  await expect(page.locator("[data-ppu-beam]")).toHaveText(/line \d+, dot \d+/);
  // The memory monitor follows the page asked for: zero page, then the
  // reset vector's page, whose last two bytes are the vector the header's
  // program starts at (the PC read above, at power on).
  await expect(page.locator("[data-mem-dump]")).toHaveAttribute("data-mem-dump", "0000");
  await expect(page.locator("[data-mem-dump] .dump-row")).toHaveCount(16);
  await page.locator("[data-mem-page]").fill("FF00");
  await expect(page.locator("[data-mem-dump]")).toHaveAttribute("data-mem-dump", "FF00", { timeout: 10_000 });
  const last = await page.locator("[data-mem-dump] .dump-row").last().locator(".bytes u").allTextContents();
  const vector = parseInt(last[13] + last[12], 16) & 0xffff; // $FFFC and $FFFD: the reset vector, low byte first
  const cal = fs.readFileSync("public/nes/cal.nes");
  const fileVector = cal[16 + 32768 - 4] | (cal[16 + 32768 - 3] << 8);
  expect(vector, "the reset vector read off the bus is the file's").toBe(fileVector);
  // Palette RAM: the backdrop and eight palettes of four, every cell a code.
  await expect(page.locator("[data-pal-cell]")).toHaveCount(1 + 32);
  const cells = await page.locator("[data-pal-cell]").allTextContents();
  for (const c of cells) expect(c).toMatch(/^[0-9A-F]{2}$/);
  // OAM: either sprites on screen with their tiles, or the panel saying none are.
  const rows = await page.locator("[data-oam-row]").count();
  if (rows > 0) {
    await page.locator("[data-oam-tile]").first().click();
    await expect(page.locator("[data-spr-picked]")).not.toHaveAttribute("data-spr-picked", "");
  } else {
    await expect(page.locator("[data-oam-none]")).toHaveCount(1);
  }
  // The sheet can paint with the console's own palettes now.
  await expect(page.locator("[data-spr-source] option")).toHaveCount(9);
  // Power off: the panels say so; power on: the reads are back.
  await page.locator("[data-play-power]").click();
  await expect(page.locator("[data-state-why]")).toContainText("Power is off");
  await page.locator("[data-play-power]").click();
  await expect(page.locator('[data-reg="PC"]')).toHaveCount(1, { timeout: 20_000 });
});

test("control and the code panel: the steps by the machine's units, the reset, and a block captured off the listing", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/play", 500);
  await page.locator("[data-play-rom]").setInputFiles("public/nes/cal.nes");
  await expect(page.locator("[data-play-stats] .measured").first()).toContainText("cal.nes", { timeout: 20_000 });
  await expect(page.locator('[data-reg="PC"]')).toHaveCount(1, { timeout: 10_000 });
  const cyc = async () => Number(((await page.locator("[data-play-pos]").textContent()) ?? "").match(/cyc\s+(\d+)/)?.[1] ?? -1);
  const pc = async () => parseInt(((await page.locator('[data-reg="PC"]').textContent()) ?? "").replace("$", ""), 16);
  const line = async () => Number(((await page.locator("[data-ppu-beam]").textContent()) ?? "").match(/line (\d+)/)?.[1] ?? -1);
  // The position shows cycles, which are half-cycles halved: two half
  // steps are one cycle on it, and a cycle step is one more.
  await expect(page.locator("[data-play-half]")).toBeEnabled();
  const c0 = await cyc();
  await page.locator("[data-play-half]").click();
  await page.locator("[data-play-half]").click();
  await expect.poll(cyc).toBe(c0 + 1);
  await page.locator("[data-play-cycle]").click();
  await expect.poll(cyc).toBe(c0 + 2);
  // An instruction step moves the program counter, and the listing's lit
  // line is the instruction at the new counter.
  const p0 = await pc();
  await page.locator("[data-play-op]").click();
  await expect.poll(pc).not.toBe(p0);
  const lit = page.locator("[data-code-list] tr[aria-current]");
  await expect(lit).toHaveCount(1);
  expect(parseInt((await lit.getAttribute("data-code-line"))!, 16)).toBe(await pc());
  // A scanline step moves the beam one line.
  const l0 = await line();
  await page.locator("[data-play-line]").click();
  await expect.poll(line).toBe((l0 + 1) % 262);
  // Reset: the CPU restarts; zero page keeps what it holds. The counter
  // moved on (the button is held for a frame), and the PC is in the
  // cartridge again.
  const cBefore = await cyc();
  await page.locator("[data-play-start]").click();
  // The button is held for a frame, which is 29,780 CPU cycles (89,342
  // dots of eight master half-steps, twelve to a CPU half-cycle).
  await expect.poll(cyc, { timeout: 15_000 }).toBeGreaterThanOrEqual(cBefore + 29_780);
  expect(await pc()).toBeGreaterThanOrEqual(0x8000);
  // A block: the lit line and the next, captured, labelled, and exported
  // in the encyclopedia's shape with the addresses in it.
  await expect(page.locator("[data-code-list] tbody tr")).not.toHaveCount(0);
  const rows = page.locator("[data-code-list] tbody tr");
  const a = (await rows.nth(0).getAttribute("data-code-line"))!;
  const b = (await rows.nth(1).getAttribute("data-code-line"))!;
  await rows.nth(0).click();
  await rows.nth(1).click();
  await expect(page.locator("[data-code-selection]")).toHaveAttribute("data-code-selection", "2");
  await page.locator("[data-code-capture]").click();
  await expect(page.locator("[data-code]")).toHaveAttribute("data-code-blocks", "1");
  await page.locator("[data-code-label]").fill("the loop");
  await page.locator("[data-code-note]").fill("two instructions off the listing");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("[data-code-export-md]").click()]);
  expect(dl.suggestedFilename()).toBe("cal.blocks.md");
  const md = fs.readFileSync((await dl.path())!, "utf8");
  expect(md).toContain("## 1. the loop");
  expect(md).toContain("**What it does.** two instructions off the listing");
  expect(md).toContain(`${a}  `);
  expect(md).toContain(`${b}  `);
  await page.locator("[data-code-remove]").click();
  await expect(page.locator("[data-code]")).toHaveAttribute("data-code-blocks", "0");
});
