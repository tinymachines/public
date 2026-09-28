import { expect, test } from "@playwright/test";

/**
 * The lab's unlisted test pages, at /lab/<name>.
 *
 * The bench asks the site to hold a test page now and then: one
 * self-contained HTML file in nes-bench's tools/, copied byte for byte by
 * pull-nesdocs.mjs into public/lab and served at /lab/<name>, so the owner
 * can open it from anywhere (the first one logs a phone's keydowns with the
 * pad on its USB-C port). They are tools, not documents: no entry in the
 * docs, no Japanese shadow, no link from any nav, index or sitemap, and each
 * carries its own noindex. This holds all of that from outside.
 */

const PAGES = ["pad-keydown"];

for (const name of PAGES) {
  test(`/lab/${name} is served as itself, saying noindex`, async ({ request }) => {
    const r = await request.get(`/lab/${name}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/html");
    const body = await r.text();
    // The file, not the site's not-found page dressed as a 200.
    expect(body.length).toBeGreaterThan(1000);
    expect(body).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(body).not.toContain("data-strip");
    const file = await request.get(`/lab/${name}.html`);
    expect(file.status()).toBe(200);
    expect(await file.text()).toBe(body);
  });

  test(`/lab/${name} has no Japanese shadow`, async ({ request }) => {
    const r = await request.get(`/ja/lab/${name}`);
    expect(r.status()).toBe(404);
  });
}

test("the keydown page logs a key and ticks it", async ({ page }) => {
  await page.goto("/lab/pad-keydown");
  await expect(page.locator("#e-KeyX")).not.toHaveClass(/seen/);
  await page.keyboard.press("x");
  await expect(page.locator("#e-KeyX")).toHaveClass(/seen/);
  await expect(page).toHaveTitle(/keydown: KeyX/);
});

test("the lab is in no sitemap and on no nav", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>");
  expect(sitemap).not.toContain("/lab/");
  for (const p of ["/", "/nes", "/docs/nes", "/ja/nes"]) {
    const html = await (await request.get(p)).text();
    expect(html).toContain("<a ");
    expect(html).not.toContain('href="/lab/');
  }
});
