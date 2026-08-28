import { test, expect } from "@playwright/test";
import { UPSTREAM, DESK, TOOL_PAGES } from "./lib";

/**
 * The ported pages against the pages they were ported from: the same
 * in-content links (the masthead and footer are ours), and the same state
 * from the same query. Skipped when UPSTREAM is unreachable.
 */
const norm = (h: string) => h.replace(/^https?:\/\/[^/]+/, "").replace(/^\/6502\//, "/").replace(/^\.\//, "").replace(/^\//, "");

async function links(page: import("@playwright/test").Page, url: string) {
  await page.goto(url, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(6000);
  return page.evaluate(() => [...document.querySelectorAll("a[href]")]
    // .changed-since: upstream fills it from markers in its own masthead menu, which the roof replaces with its menu; it cannot fill here.
    .filter((a) => !a.closest("header, footer, nav, .app-head, .app-foot, .menu-wrap, .site-head, .site-foot, .chip-transport, .changed-since"))
    .map((a) => a.getAttribute("href") || ""));
}

test.beforeAll(async () => {
  // redirect: "manual", because since the forward (2026-08-27) the subdomain
  // answers 301 to the apex; following it would compare each page to itself,
  // which is a check that passes on nothing.
  const r = await fetch(`${UPSTREAM}/`, { redirect: "manual" }).catch(() => null);
  test.skip(!r || r.status !== 200, `${UPSTREAM} is not serving pages (${r ? r.status : "unreachable"}): nothing to compare`);
});

for (const p of TOOL_PAGES) {
  const slug = p.replace("/6502/", "");
  test(`links on ${p} match upstream /${slug}`, async ({ page }) => {
    await page.setViewportSize(DESK);
    const up = (await links(page, `${UPSTREAM}/${slug === "explorer" ? "" : slug}`)).map(norm);
    const ours = new Set((await links(page, p)).map(norm));
    const missing = up.filter((h) => !ours.has(h));
    expect(missing, "upstream in-content links missing on the roof").toEqual([]);
  });
}

test("the schematic reads the same query state", async ({ page }) => {
  page.setViewportSize(DESK);
  const q = "?signal=dpc3_SBX&dir=back&depth=1";
  const cap = async (u: string) => { await page.goto(u, { waitUntil: "load" }); await page.waitForTimeout(8000); return page.locator(".sch-caption").first().textContent(); };
  const a = await cap(`${UPSTREAM}/schematic${q}`), b = await cap(`/6502/schematic${q}`);
  expect(a).toContain("dpc3_SBX");
  expect(b).toBe(a);
});

test("the block cards are the same twelve", async ({ page }) => {
  const cards = async (u: string) => { await page.goto(u, { waitUntil: "load" }); await page.waitForTimeout(4000); return page.locator(".bk-card").evaluateAll((els) => els.map((e) => e.getAttribute("href"))); };
  const a = await cards(`${UPSTREAM}/block`), b = await cards("/6502/block");
  expect(a.length).toBeGreaterThanOrEqual(12);
  expect(b).toEqual(a);
});
