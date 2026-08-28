import { expect, test, type Page } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * The console's two engines, and the one claim they rest on.
 *
 * A frame is a whole machine handed to something that steps it, so the
 * console can hand it to halfwave over HTTP or to the wasm chip in the page
 * (games/localEngine.ts) and carry on mid-run. That is only true if the two
 * agree byte for byte, and "they are the same engine, built twice" is exactly
 * the kind of claim this suite exists to check rather than repeat: the first
 * test boots Die Runner and runs one frame on each and compares everything
 * that came back, including the eight gates the cartridge watches.
 *
 * The rest is the switch: the strip's engine key and the settings page's row
 * are two views of one choice, the console starts on the API, and when the
 * chip is in the page the frames keep coming while the request count stops.
 *
 * Every test needs the 6502 release at /6502/chip, which is nginx's on
 * production and absent from a preview, so each skips rather than fails
 * where the chip is not served.
 */

const GAMES = "/6502/games";

/** The eight lines Die Runner watches, and what it costs a frame. */
const WATCH = ["dpc25_SBDB", "dpc9_DBADD", "dpc10_ADLADD", "dpc21_ADDADL",
               "dpc23_SBAC", "dpc30_ADHPCH", "dpc40_ADLPCL", "dpc2_XSB"];
const FRAME = 8704;
const ORG = 0x0200;

async function chipServed(page: Page) {
  const ok = await page.evaluate(async () => (await fetch("/6502/chip/asset-manifest.json")).ok);
  test.skip(!ok, "the 6502 release is not served at /6502/chip on this origin");
}

test("the chip in the page and the chip behind the API answer the same frame identically", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  await chipServed(page);

  const out = await page.evaluate(async ({ WATCH, FRAME, ORG }) => {
    const manifest = await (await fetch("/6502/chip/asset-manifest.json")).json();
    const wasm = await import(/* webpackIgnore: true */ "/6502/chip/" + manifest["pkg/v6502_wasm.js"]);
    await wasm.default();
    const chip = new wasm.Machine();

    // Die Runner's ROM at $0200, and the reset vector at $FFFC, which is the
    // one thing no ROM can place for itself. The same image goes to both.
    const rom = new Uint8Array(await (await fetch("/6502/games/rom/dierunner.rom")).arrayBuffer());
    const pages: Record<string, string> = {};
    const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    for (let n = 0; n < rom.length; n += 256) {
      const addr = ORG + n, key = (addr >> 8).toString(16).padStart(2, "0"), off = addr & 0xff;
      const page = new Array(256).fill(0);
      for (let i = 0; i + off < 256 && n + i < rom.length; i++) page[off + i] = rom[n + i];
      pages[key] = hex(page);
    }
    const vec = new Array(256).fill(0);
    vec[0xfc] = ORG & 0xff; vec[0xfd] = ORG >> 8;
    pages.ff = hex(vec);
    const memory = { fill: "00", pages };

    const api = (document.querySelector("[data-chip-api]") as HTMLElement).dataset.chipApi;
    const post = async (path: string, body: unknown) => {
      const r = await fetch(`${api}/v1/${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    };

    const apiBoot = await post("boot", { memory, watch: WATCH });
    const apiStep = await post("step", { machine: apiBoot.machine, half_cycles: FRAME, watch: WATCH });

    chip.fillMemory(0);
    for (const [key, page] of Object.entries(memory.pages)) {
      const bytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) bytes[i] = parseInt((page as string).slice(i * 2, i * 2 + 2), 16);
      chip.load(parseInt(key, 16) << 8, bytes);
    }
    chip.powerCycle();
    const hereBoot = JSON.parse(chip.exportMachine());
    chip.runHalfCycles(FRAME);
    const hereStep = JSON.parse(chip.exportMachine());
    const hereWatch: Record<string, boolean> = {};
    for (const name of WATCH) hereWatch[name] = chip.isNodeHigh(chip.nodeId(name));

    const differs = (a: Record<string, string | number>, b: Record<string, string | number>, keys: string[]) =>
      keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    const memoryDiff = (a: { pages: Record<string, string> }, b: { pages: Record<string, string> }) =>
      [...new Set([...Object.keys(a.pages), ...Object.keys(b.pages)])].filter((k) => a.pages[k] !== b.pages[k]);
    const CHIP = ["value", "pullup", "pulldown", "trans_on", "half_cycle"];

    return {
      unknownNodes: WATCH.filter((n) => chip.nodeId(n) < 0),
      bootChip: differs(hereBoot.state, apiBoot.machine.state, CHIP),
      bootMemory: memoryDiff(hereBoot.memory, apiBoot.machine.memory),
      stepChip: differs(hereStep.state, apiStep.machine.state, CHIP),
      stepMemory: memoryDiff(hereStep.memory, apiStep.machine.memory),
      halfCycle: hereStep.state.half_cycle,
      apiHalfCycle: apiStep.machine.state.half_cycle,
      pages: Object.keys(hereStep.memory.pages).length,
      hereWatch,
      apiWatch: apiStep.observe.watch,
    };
  }, { WATCH, FRAME, ORG });

  // A check that can pass on nothing is not a check: the frame has to have
  // run and the memory has to be there before "no differences" means any.
  expect(out.halfCycle, "the frame ran in the page").toBe(FRAME);
  expect(out.apiHalfCycle, "and over the API").toBe(FRAME);
  expect(out.pages, "the machine carries its memory").toBeGreaterThan(2);
  expect(out.unknownNodes, "every watched line is a node on this die").toEqual([]);

  expect(out.bootChip, "the chip state after boot").toEqual([]);
  expect(out.bootMemory, "the memory after boot").toEqual([]);
  expect(out.stepChip, "the chip state after one frame").toEqual([]);
  expect(out.stepMemory, "the memory after one frame").toEqual([]);
  expect(Object.keys(out.hereWatch).length, "eight gates").toBe(8);
  expect(out.hereWatch, "the gates sampled on each chip").toEqual(out.apiWatch);
});

test("the engine key is live on the console, the console starts on the API, and the two switches are one choice", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  await chipServed(page);

  // A fresh profile has no recorded choice, and the console states its own.
  await expect(page.locator(".shell")).toHaveAttribute("data-engine", "api");
  const key = page.locator(".chip-transport .tbtn.eng");
  await expect(key).toBeEnabled();
  await expect(key).toHaveAttribute("data-engine", "api");
  expect(await page.evaluate(() => localStorage.getItem("v6502.engine"))).toBe("api");

  // The settings row moves the strip's key, because there is one choice.
  await page.locator('.hit[data-act="page-settings"]').click();
  await page.locator('.toys [data-engine-pick="local"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-engine", "local");
  await expect(key).toHaveAttribute("data-engine", "local");

  // And the key moves the row.
  await key.click();
  await expect(page.locator(".shell")).toHaveAttribute("data-engine", "api");
  await expect(page.locator('.toys [data-engine-pick="api"]')).toHaveAttribute("aria-pressed", "true");
});

test("with the chip in the page the frames keep coming and the request count stops", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  await chipServed(page);

  await page.locator('.hit[data-act="page-settings"]').click();
  await page.locator('.toys [data-engine-pick="local"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-engine", "local");

  await page.locator('.hit[data-act="reset"]').click();
  await expect.poll(() => page.locator(".shell").getAttribute("data-phase"), { timeout: 30000 }).toMatch(/live|stopped/);
  test.skip((await page.locator(".shell").getAttribute("data-phase")) === "stopped", "the chip did not boot on this origin");

  const read = async () => page.evaluate(() => ({
    frames: Number(document.getElementById("k-frames")?.textContent ?? "0"),
    requests: Number(document.getElementById("k-req")?.textContent ?? "0"),
    half: Number((document.getElementById("k-hc")?.textContent ?? "0").replace(/[^\d]/g, "")),
  }));
  await expect.poll(async () => (await read()).frames, { timeout: 30000 }).toBeGreaterThan(0);
  const first = await read();
  await page.waitForTimeout(4000);
  const then = await read();

  expect(then.frames, "frames are still arriving").toBeGreaterThan(first.frames);
  expect(then.half, "and the chip is stepping").toBeGreaterThan(first.half);
  // `requests` counts round trips, and there are none: the cartridge and its
  // tiles were fetched before the boot, the frames since have gone nowhere.
  expect(then.requests, "no request was made for a frame").toBe(first.requests);
});
