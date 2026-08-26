import { test, expect, type Page } from "@playwright/test";
import { open, DESK } from "./lib";

/**
 * The one engine, as far as it has arrived: power in the strip is real,
 * opcode step and seek are real on a wasm page, and the machine you leave
 * on one page is the machine you arrive at on the next.
 */

async function strip(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector(".chip-transport .ct-row");
    if (!row) return null;
    const btns = [...row.querySelectorAll("button.tbtn:not(.fs):not(.eng)")] as HTMLButtonElement[];
    const pos = row.querySelector(".ct-pos b");
    const seek = row.querySelector<HTMLInputElement>(".ct-seek")!;
    return {
      powerOn: btns[0].classList.contains("on"),
      pressed: btns[0].getAttribute("aria-pressed"),
      disabled: btns.map((b) => b.disabled),
      h: pos ? Number(pos.textContent) : null,
      seek: { disabled: seek.disabled, min: Number(seek.min), max: Number(seek.max), value: Number(seek.value) },
      strips: document.querySelectorAll(".chip-transport").length,
    };
  });
}

test("power is the first key, solid while the chip is on, and off greys the rest", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/6502/explorer", 9000);
  const on = await strip(page);
  expect(on, "the strip is on the page").not.toBeNull();
  expect(on!.strips, "one strip in the document").toBe(1);
  expect(on!.powerOn, "power is solid").toBe(true);
  expect(on!.pressed).toBe("true");
  expect(on!.disabled, "every key is live on a wasm page").toEqual([false, false, false, false, false, false, false]);
  expect(on!.seek.disabled, "seek is live").toBe(false);

  await page.click(".chip-transport .tbtn.pw");
  await page.waitForTimeout(300);
  const off = await strip(page);
  expect(off!.powerOn, "power is no longer solid").toBe(false);
  expect(off!.pressed).toBe("false");
  expect(off!.disabled.slice(1), "every other key is grey").toEqual([true, true, true, true, true, true]);
  expect(off!.seek.disabled).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem("v6502.power")), "the switch is written down").toBe("0");

  await page.click(".chip-transport .tbtn.pw");
  await page.waitForTimeout(500);
  const back = await strip(page);
  expect(back!.powerOn, "power on again").toBe(true);
  expect(back!.h, "on boots from the reset vector").toBe(0);
});

test("the opcode step lands on a fetch, and seek moves the count", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/6502/explorer?steps=51", 9000);
  const at = await strip(page);
  expect(at!.h).toBe(51);
  const opBtn = page.locator(".chip-transport .tbtn:not(.eng)").nth(6);
  await expect(opBtn).toBeEnabled();
  await opBtn.click();
  await page.waitForTimeout(200);
  const after = await strip(page);
  // One opcode: forward, and by no more than the longest instruction (seven
  // cycles, fourteen half-cycles). The harness upstream checks it lands on
  // SYNC against the machine itself; the page has no SYNC readout to read.
  expect(after!.h, "an opcode step goes forward").toBeGreaterThan(51);
  expect(after!.h! - 51, "by at most one instruction").toBeLessThanOrEqual(14);

  // Seek back inside the window the slider offers.
  const target = after!.seek.min + Math.floor((after!.seek.max - after!.seek.min) / 2);
  await page.evaluate((h) => {
    const s = document.querySelector<HTMLInputElement>(".chip-transport .ct-seek")!;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(s, String(h));
    s.dispatchEvent(new Event("input", { bubbles: true }));
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }, target);
  await page.waitForTimeout(200);
  const sought = await strip(page);
  expect(sought!.h, `seek to ${target}`).toBe(target);
});

test("the machine you leave is the machine you arrive at", async ({ page }) => {
  await page.setViewportSize(DESK);
  await page.evaluate(() => { try { sessionStorage.clear(); } catch { /* fresh anyway */ } }).catch(() => {});
  await open(page, "/6502/explorer?steps=51", 9000);
  expect((await strip(page))!.h).toBe(51);
  // A hard navigation to another instrument: the snapshot crosses it.
  await page.goto(page.url().replace("/6502/explorer?steps=51", "/6502/tracer"));
  await page.waitForTimeout(9000);
  const there = await strip(page);
  expect(there, "the tracer has the strip").not.toBeNull();
  expect(there!.h, "the tracer opens on the explorer's half-cycle").toBe(51);
});

test("the console offers power, start and play, and nothing it cannot honour", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/6502/games", 9000);
  const r = await strip(page);
  expect(r!.strips).toBe(1);
  // Power is live but the console has not booted: off, and the rest grey.
  expect(r!.disabled[0], "power is a real key on the console").toBe(false);
  expect(r!.powerOn, "not powered until a cartridge boots").toBe(false);
  await page.click(".chip-transport .tbtn.pw");
  await page.waitForFunction(() => document.querySelector(".chip-transport .tbtn.pw")?.classList.contains("on"), null, { timeout: 30000 });
  const on = await strip(page);
  expect(on!.disabled, "power, start and play; no half-step, cycle, op").toEqual([false, false, true, false, true, true, true]);
  expect(on!.seek.disabled).toBe(true);
});

test("the Lab is a view of the same store: its player is hidden, the strip drives it", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/6502/lab", 6000);
  const r = await strip(page);
  expect(r, "the strip is on the Lab").not.toBeNull();
  expect(r!.strips).toBe(1);
  expect(r!.powerOn, "the Lab boots powered").toBe(true);
  expect(r!.disabled, "every key: the Lab's driver offers the full set").toEqual([false, false, false, false, false, false, false]);
  expect(r!.seek.disabled).toBe(false);
  expect(r!.seek.max, "the recording has a length").toBeGreaterThan(10);
  const hidden = await page.evaluate(() => (document.querySelector(".lab-shell .player") as HTMLElement).offsetWidth);
  expect(hidden, "the Lab's own player is hidden").toBe(0);
  // The strip's op steps the Lab's cursor to the next fetch.
  const before = r!.h!;
  await page.locator(".chip-transport .tbtn:not(.eng)").nth(6).click();
  await page.waitForTimeout(200);
  const after = (await strip(page))!.h!;
  expect(after).toBeGreaterThan(before);
  // The Lab's own cursor is its scrub slider (its readout prints the row's
  // half-cycle number, which is one ahead of the index).
  const pos = await page.evaluate(() => (document.querySelector("#scrub") as HTMLInputElement).value);
  expect(Number(pos), "the Lab's own cursor moved with it").toBe(after);
  // Power off through the strip is the Lab's off state.
  await page.click(".chip-transport .tbtn.pw");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.body.classList.contains("off")), "the Lab shows its off note").toBe(true);
  expect((await strip(page))!.powerOn).toBe(false);
});

test("the engine switch: halfwave steps the chip over the API, the page draws the answer, local resumes from it", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, "/6502/explorer?steps=20", 9000);
  const eng = page.locator(".chip-transport .ct-engine .tbtn.eng");
  await expect(eng.nth(0)).toHaveClass(/\bon\b/);
  await expect(eng.nth(1)).toBeEnabled();
  await eng.nth(1).click();
  await expect(eng.nth(1)).toHaveClass(/\bon\b/);
  // Back and seek are refused: the API keeps no history.
  const r = await strip(page);
  expect(r!.disabled[2], "back is grey on the API").toBe(true);
  expect(r!.seek.disabled, "seek is grey on the API").toBe(true);
  expect(r!.disabled[4], "step is live").toBe(false);
  // One half-cycle, across the network, measured.
  await page.locator(".chip-transport .tbtn:not(.eng)").nth(6).click();
  await page.waitForTimeout(1500);
  const lat = page.locator(".chip-transport .ct-lat");
  await expect(lat).toHaveText(/api \d+ ms/);
  const after = await strip(page);
  expect(after!.h, "the count moved by the API's answer").toBeGreaterThan(20);
  // Run for a second at the default 1 Hz: two half-cycles a second, paced by the runner.
  await page.locator(".chip-transport .tbtn.play").click();
  await page.waitForTimeout(2200);
  await page.locator(".chip-transport .tbtn.play").click();
  await page.waitForTimeout(600);
  const ran = await strip(page);
  expect(ran!.h! - after!.h!, "about two half-cycles a second over the API").toBeGreaterThanOrEqual(2);
  expect(ran!.h! - after!.h!).toBeLessThanOrEqual(8);
  // Back to local: the machine continues from the API's last state.
  await eng.nth(0).click();
  await expect(eng.nth(0)).toHaveClass(/\bon\b/);
  await page.locator(".chip-transport .tbtn:not(.eng)").nth(6).click();
  await page.waitForTimeout(200);
  const local = await strip(page);
  expect(local!.h! - ran!.h!, "one local step from where the API left it").toBe(1);
  expect(local!.disabled[2], "back is live again").toBe(false);
});
