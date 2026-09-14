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
  const names = await page.locator(".piece-grid").first().locator("article.rail h3").allInnerTexts();
  expect(names.length).toBeGreaterThanOrEqual(3);
  expect(names).not.toContain("ntsc-crt");
  expect(names).toContain("The NES console");
});
