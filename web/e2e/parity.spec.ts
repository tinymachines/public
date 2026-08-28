import { test, expect } from "@playwright/test";
import { DESK, TOOL_PAGES } from "./lib";
import { serveReleased, type Served } from "./served";

/**
 * The ported pages against the pages they were ported from: the same
 * in-content links (the masthead and footer are ours), and the same state
 * from the same query.
 *
 * "The pages they were ported from" was `6502.tinymachines.ai` until
 * 2026-08-28. Since the forward that subdomain answers 301 to the apex, so
 * this file skipped itself rather than compare each page to itself, and
 * twenty tests sat in every run reporting as passed-and-skipped while
 * checking nothing. The subdomain is on its way out entirely
 * (notes/forward.md), so waiting for it to come back was not a plan.
 *
 * It compares against the RELEASED pages now, served from the boarded
 * worktree over a loopback server (served.ts). That is the same tree the
 * build reads its markup from, at the same commit the engine gate holds
 * everything else to, so parity is now a statement about what this site
 * shipped from rather than about a host that may or may not answer.
 */
const norm = (h: string) => h.replace(/^https?:\/\/[^/]+/, "").replace(/^\/6502\//, "/").replace(/^\.\//, "").replace(/^\//, "");

let released: Served | null = null;

test.beforeAll(async () => {
  released = await serveReleased();
  // A clone with no 6502 worktree beside it cannot run these, and says so.
  // Everywhere the site is actually deployed from, the worktree is there:
  // deploy.sh stage 2e refuses without it.
  test.skip(!released, "no 6502 worktree beside this one (../6502-served): nothing to compare");
});

test.afterAll(async () => { await released?.close(); });

/** Upstream's URL for a tool page. The explorer is that site's front page. */
const up = (slug: string) => `${released!.origin}/${slug === "explorer" ? "" : slug}`;

async function links(page: import("@playwright/test").Page, url: string) {
  await page.goto(url, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(6000);
  return page.evaluate(() => [...document.querySelectorAll("a[href]")]
    // .changed-since: upstream fills it from markers in its own masthead menu, which the roof replaces with its menu; it cannot fill here.
    .filter((a) => !a.closest("header, footer, nav, .app-head, .app-foot, .menu-wrap, .site-head, .site-foot, .chip-transport, .changed-since"))
    .map((a) => a.getAttribute("href") || ""));
}

for (const p of TOOL_PAGES) {
  const slug = p.replace("/6502/", "");
  test(`links on ${p} match the released /${slug}`, async ({ page }) => {
    await page.setViewportSize(DESK);
    released!.misses.length = 0;
    const theirs = (await links(page, up(slug))).map(norm);
    // The released page ran. Without this the next line cannot be read: a
    // page that asked for a file the release does not have renders its
    // chrome, carries no instrument, and reports zero links to compare, which
    // is indistinguishable from a page that simply has none.
    expect(released!.misses, `${slug}: the released page asked for files the release does not have`).toEqual([]);
    // Four of the eighteen released pages carry every link in their chrome,
    // which this site replaces with its own. Skipped with the reason rather
    // than passed on an empty list: a check that can pass on nothing is not
    // a check, and this one did for as long as it ran.
    test.skip(theirs.length === 0, `the released /${slug} has no in-content links: nothing to compare`);
    const ours = new Set((await links(page, p)).map(norm));
    const missing = theirs.filter((h) => !ours.has(h));
    expect(missing, "released in-content links missing on the roof").toEqual([]);
  });
}

test("the schematic reads the same query state", async ({ page }) => {
  page.setViewportSize(DESK);
  const q = "?signal=dpc3_SBX&dir=back&depth=1";
  const cap = async (u: string) => { await page.goto(u, { waitUntil: "load" }); await page.waitForTimeout(8000); return page.locator(".sch-caption").first().textContent(); };
  const a = await cap(`${up("schematic")}${q}`), b = await cap(`/6502/schematic${q}`);
  expect(a).toContain("dpc3_SBX");
  expect(b).toBe(a);
});

test("the block cards are the same twelve", async ({ page }) => {
  const cards = async (u: string) => { await page.goto(u, { waitUntil: "load" }); await page.waitForTimeout(4000); return page.locator(".bk-card").evaluateAll((els) => els.map((e) => e.getAttribute("href"))); };
  const a = await cards(up("block")), b = await cards("/6502/block");
  expect(a.length).toBeGreaterThanOrEqual(12);
  expect(b).toEqual(a);
});
