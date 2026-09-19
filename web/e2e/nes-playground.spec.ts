import { test, expect } from "@playwright/test";
import { BASE, DESK, PHONE, open } from "./lib";

/**
 * /nes/playground: the hidden bench for a readable NES. It must stay
 * hidden (noindex, out of the sitemap) and its stations must be drawn
 * from the console running in the page, not from nothing: the colours
 * are measured through the signal path, so they cannot all be one
 * colour; the hue clock has a mark per hue it measured; the Mario map has
 * the dissection's rows.
 */

test("the playground is live, hidden from the index, and out of the sitemap", async ({ page }) => {
  const res = await page.request.get(`${BASE}/nes/playground`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  const sitemap = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
  // The sitemap is the real one (it lists the NES section's pages), and the playground is not in it.
  expect(sitemap).toContain("/nes/console</loc>");
  expect(sitemap).not.toContain("/nes/playground");
});

test("the playground's stations are drawn from the console in the page", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  await expect(page.locator("h1")).toHaveCount(1);

  // The colours, measured: every code a swatch, and far from all one colour.
  const swatches = page.locator(".pg-swatch");
  await expect(swatches).toHaveCount(64, { timeout: 30_000 });
  const colours = await swatches.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.background));
  expect(new Set(colours).size).toBeGreaterThan(40);

  // The hue clock: one mark per hue whose swing was found against the burst.
  expect(await page.locator(".pg-clock circle[fill]").count()).toBeGreaterThanOrEqual(10);

  // The beam's console shows a line number once the field is running.
  await expect(page.locator('.pg-hero .pg-console dd[data-k="line"]')).toHaveText(/^\d+$/, { timeout: 20_000 });

  // The wire station encoded a frame and drew its line.
  await expect(page.locator("#wire .pg-instr-h")).toContainText("Line", { timeout: 20_000 });

  // Mario's frame: the dissection's rows, and the shares counted from them.
  expect(await page.locator("#mario .pg-rows li").count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator("#mario .pg-legend")).toContainText("%");
});

test("the hero's console keeps its size while its values change", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const cons = page.locator(".pg-hero .pg-console");
  await expect(cons.locator("dd").first()).not.toHaveText("·", { timeout: 20_000 });
  const first = await cons.boundingBox();
  const next = await page.locator("#wire").boundingBox();
  const before = await cons.locator("dd").allTextContents();
  await page.waitForTimeout(1500);
  // The values moved (the beam ran), and nothing else did.
  expect(await cons.locator("dd").allTextContents()).not.toEqual(before);
  expect(await cons.boundingBox()).toEqual(first);
  expect(await page.locator("#wire").boundingBox()).toEqual(next);
});

test("the slow chip draws, and agrees with the fast chip on every dot it draws", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  await page.locator("#slow").scrollIntoViewIfNeeded();
  const cell = (k: string) => page.locator(`#slow .pg-console dd[data-k="${k}"]`);
  const num = async (k: string) => Number((await cell(k).textContent())!.replace(/[^0-9]/g, "") || "0");
  await expect.poll(() => num("agree"), { timeout: 60_000 }).toBeGreaterThan(2000);
  expect(await num("differ")).toBe(0);
  await expect(page.locator("#slow .pg-size")).toContainText("transistors");
});

test("spot the difference: one tap in one console, apart and together again", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const st = page.locator("#difference");
  await st.scrollIntoViewIfNeeded();
  const cell = (k: string) => st.locator(`.pg-console dd[data-k="${k}"]`);
  // The twins run: the frame count climbs before anything is tapped, and
  // with no tap they never differ.
  await expect.poll(async () => Number((await cell("frame").textContent())?.replace(/\D/g, "") || "0"), { timeout: 30_000 }).toBeGreaterThan(5);
  await expect(cell("now")).toHaveText("0");
  await st.locator(".pg-btn-hot").click();
  // Apart, then together again, each at a frame the console names.
  await expect(cell("first")).toHaveText(/^\d+$/, { timeout: 20_000 });
  await expect(cell("again")).toHaveText(/^\d+$/, { timeout: 20_000 });
  expect(Number((await cell("most").textContent())?.replace(/\D/g, ""))).toBeGreaterThan(0);
  // The engineers' x-ray, read from their encyclopedia: its path has steps.
  await expect(st.locator(".pg-xray .pg-note")).toContainText(/of \d+/);
  // The line where the tap gets in is marked on the listing, and it is the
  // line the x-ray names as the divergence.
  const diverge = (await st.locator(".pg-xray > .pg-now-record").first().textContent()) ?? "";
  const at = (await st.locator(".pg-xray .pg-now-record span").first().textContent()) ?? "";
  expect(diverge).toContain("diverge");
  expect(at).toMatch(/^h \d+/);
  await expect(st.locator('.pg-code-line[data-here="true"]')).toHaveCount(1);
  await expect(st.locator('.pg-code-line[data-here="true"]')).toContainText("$4016");
});

test("the playground fits a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, "/nes/playground", 500);
  await expect(page.locator(".pg-swatch")).toHaveCount(64, { timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
