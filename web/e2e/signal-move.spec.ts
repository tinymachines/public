import { test, expect } from "@playwright/test";

/**
 * ntsc-crt joined the NES section on 2026-09-14, and its three pages moved
 * from /ntsc to /nes/signal. The old addresses are public (docs, search,
 * people's bookmarks), so each must land on its own new page, in its own
 * language: a redirect that sent all three to /nes/signal would still be a
 * 308. The files the pages load stay under /ntsc/ and must not be
 * redirected, which is why the rule names three exact paths.
 */

const MOVED: [string, string][] = [
  ["/ntsc", "/nes/signal"],
  ["/ntsc/bench", "/nes/signal/bench"],
  ["/ntsc/composite", "/nes/signal/composite"],
];

for (const lang of ["", "/ja"]) {
  for (const [from, to] of MOVED) {
    test(`${lang}${from} lands on ${lang}${to}`, async ({ request }) => {
      const r = await request.get(`${lang}${from}`, { maxRedirects: 0 });
      expect(r.status()).toBe(308);
      expect(new URL(r.headers()["location"], "https://tinymachines.ai").pathname).toBe(`${lang}${to}`);
      expect((await request.get(`${lang}${to}`)).status()).toBe(200);
    });
  }
}

test("the signal pages' own files still load from /ntsc/", async ({ request }) => {
  for (const f of ["/ntsc/wasm/ntsc_wasm_bg.wasm", "/ntsc/crt-hue-bands.png", "/ntsc/composite/scanline.png"]) {
    const r = await request.get(f, { maxRedirects: 0 });
    expect(r.status(), f).toBe(200);
  }
});

test("the front page no longer lists ntsc-crt as a project of its own", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  // textContent, not innerText: the names are set in capitals by CSS, and
  // an innerText of "NTSC-CRT" would let the not.toContain below pass on
  // nothing.
  const names = await page.locator(".piece-grid").first().locator("article.rail h3").evaluateAll((hs) => hs.map((h) => (h.textContent ?? "").trim()));
  expect(names.length).toBeGreaterThanOrEqual(3);
  expect(names).not.toContain("ntsc-crt");
  expect(names).toContain("The NES console");
});

/**
 * The signal pages wear the NES section's colours (owner's call,
 * 2026-09-14). They kept ntsc-crt's own silo through a nested
 * data-project when they moved; that wrapper is gone, and nothing on a
 * signal page may reinstate it. Compared with /nes's own computed accent
 * rather than a hard-coded colour, so a change to the NES palette cannot
 * fail this.
 */
test("the signal pages use the NES section's accent", async ({ page }) => {
  const accent = () =>
    page.evaluate(() => {
      const el = document.querySelector("main") ?? document.body;
      return getComputedStyle(el).getPropertyValue("--color-accent").trim();
    });
  await page.goto("/nes", { waitUntil: "load" });
  const nes = await accent();
  expect(nes, "no accent on /nes").not.toBe("");
  for (const p of ["/nes/signal", "/nes/signal/bench", "/nes/signal/composite"]) {
    await page.goto(p, { waitUntil: "load" });
    await expect(page.locator('[data-project="ntsc"]'), `${p} still wraps itself in the ntsc silo`).toHaveCount(0);
    expect(await accent(), p).toBe(nes);
  }
});
