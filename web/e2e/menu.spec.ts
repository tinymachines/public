import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { DESK, en, open } from "./lib";

/**
 * The menu is the top level, and each choice opens an index page.
 *
 * Owner's call, 2026-09-22, in two steps: first the panel lost everything
 * below a section's first level (it had been eighty-four lines on a
 * documentation page), then the section group itself: "just site and
 * projects". Three rules follow, and each half of the bargain is checked,
 * because a menu that drops a page nothing else lists has hidden it, and a
 * hidden page looks exactly like a menu that was tidied:
 *
 * - The panel is the site's sections and the projects, the same on every
 *   page, and nothing twice (the landing's own surface used to appear beside
 *   "Overview" as a second label for one href).
 * - Each project's landing links every surface that has arrived. /ntsc/composite
 *   once shipped with no manifest surface, so nothing on the site reached it;
 *   the NES landing lacked the notebook until the menu stopped carrying it.
 * - Every page in the sitemap is reached from the menu by walking the pages
 *   it lists: the menu, then each listed page's body links, and so on.
 *
 * The scrolled-open rule is menu-open.spec.ts, on its own because it needs
 * a browser with scrollbars.
 */

/** Every internal destination linked from the page's own body: not the bar, the panel or the footer. */
async function bodyLinks(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .filter((a) => !a.closest(".app-head, .app-foot, .menu-panel"))
      .map((a) => (a.getAttribute("href") ?? "").split("#")[0].replace(/\/$/, "") || "/")
      .filter((h) => h.startsWith("/")),
  );
}

/** The panel's items, opened by a dispatched click: the explorer's boot
 *  overlay sits over the bar until the chip API answers, and a preview served
 *  without that API never gets there, so a pointer click lands on the overlay. */
async function panel(page: import("@playwright/test").Page) {
  await page.locator(".menu-btn").dispatchEvent("click");
  await expect(page.locator(".menu-group").first()).toBeVisible();
  // textContent, not innerText: the headings are CSS-uppercased.
  const titles = await page.locator(".menu-group h2").evaluateAll((hs) => hs.map((h) => h.textContent ?? ""));
  const hrefs = await page.locator(".menu-item").evaluateAll((as) =>
    as.map((a) => ((a as HTMLAnchorElement).getAttribute("href") ?? "").split("#")[0].replace(/\/$/, "") || "/"),
  );
  const labels = await page.locator(".menu-item b").evaluateAll((bs) => bs.map((b) => b.textContent ?? ""));
  return { titles, hrefs, labels };
}

/** The brief groups under a section (or the whole panel outside one): the site and the projects. */
async function brief(page: import("@playwright/test").Page) {
  const titles = await page.locator(".menu-group:not(.menu-section) > h2").evaluateAll((hs) => hs.map((h) => h.textContent ?? ""));
  const hrefs = await page.locator(".menu-group:not(.menu-section) .menu-item").evaluateAll((as) =>
    as.map((a) => ((a as HTMLAnchorElement).getAttribute("href") ?? "").split("#")[0].replace(/\/$/, "") || "/"),
  );
  return { titles, hrefs };
}

test("the site and the projects are the same on every page, nothing twice; inside a section the panel opens on it first", async ({ page }) => {
  // Owner, 2026-09-24: on /nes the panel was the site's map and nothing of
  // the section the reader stood in. Inside a section it now opens on the
  // section's parts under the section's name, the strip's links in the
  // strip's order; the site and the projects follow, unchanged.
  await page.setViewportSize(DESK);
  let first: string[] | null = null;
  for (const [p, section] of [["/", null], ["/docs/nes/boards", null], ["/nes/play", "The NES console"], ["/6502/explorer", "6502"], ["/hotbits", "hotbits"]] as const) {
    await open(page, p, 500);
    const { titles } = await panel(page);
    const b = await brief(page);
    expect(b.titles, `${p}: the two groups`).toEqual(["The site", "Projects"]);
    expect(titles, `${p}: the section first, by its name`).toEqual(section ? [section, "The site", "Projects"] : ["The site", "Projects"]);
    expect(b.hrefs.length, `${p}: the doors`).toBeGreaterThanOrEqual(6);
    for (const want of ["/", "/docs", "/6502", "/nes"]) expect(b.hrefs, `${p}: missing ${want}`).toContain(want);
    expect(new Set(b.hrefs).size, `${p}: duplicate destination in ${JSON.stringify(b.hrefs)}`).toBe(b.hrefs.length);
    if (first) expect(b.hrefs, `${p}: a different site and projects from the front page's`).toEqual(first);
    first = b.hrefs;
    if (section) {
      const mine = await page.locator(".menu-section .menu-item").evaluateAll((as) => as.map((a) => (a.getAttribute("href") ?? "").replace(/\/$/, "")));
      // A workbench carries its own strip, so the section's is read off a reading page of it.
      const landing = mine[0];
      await page.keyboard.press("Escape");
      await open(page, landing, 300);
      const strip = await page.locator("[data-parts-strip] .strip-row:not(.strip-ghost) a").evaluateAll((as) => as.map((a) => (a.getAttribute("href") ?? "").replace(/\/$/, "")));
      expect(mine, `${p}: the section's parts are the strip's`).toEqual(strip);
    }
  }
  // Where the reader is in the section is marked there too.
  await open(page, "/nes/signal/bench", 300);
  await panel(page);
  await expect(page.locator(".menu-section .menu-item[aria-current=location] b")).toHaveText("The signal");
  await expect(page.locator(".menu-section .menu-item b").nth(3)).toHaveText("Learn");
  await expect(page.locator(".menu-section .menu-item").nth(3).locator("span")).toHaveText("The NES at human speed");
});

test("the Japanese panel carries the same doors, localized", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ja/nes", 500);
  const { titles, labels } = await panel(page);
  const b = await brief(page);
  expect(titles).toEqual(["NES コンソール", "サイト", "プロジェクト"]);
  for (const want of ["/ja", "/ja/docs", "/ja/6502", "/ja/nes"]) expect(b.hrefs, `missing ${want}`).toContain(want);
  expect(labels.join(" ")).toContain("NES コンソール");
  expect(labels).toContain("作る");
});

// The manifest, read the way the site reads it (lib/projects.ts arrivedSurfaces):
// a surface has arrived when it is not "not started" and its path is settled.
function arrivedByLanding(): Map<string, string[]> {
  const raw = fs.readFileSync(path.join(__dirname, "..", "..", "data", "projects.json"), "utf8");
  const manifest = JSON.parse(raw) as { projects: { key: string; landing?: string | null; surfaces: { lands_at: string; lands_at_settled: boolean; status: string }[] }[] };
  const out = new Map<string, string[]>();
  for (const p of manifest.projects) {
    if (p.key === "roof" || !p.landing) continue;
    out.set(p.landing, p.surfaces.filter((s) => s.status !== "not started" && s.lands_at_settled && s.lands_at !== p.landing).map((s) => s.lands_at));
  }
  if (out.size < 3) throw new Error(`data/projects.json names ${out.size} projects with a landing; expected three or more`);
  return out;
}

test("each project's landing links every surface that has arrived, or the surface above it does", async ({ page }) => {
  await page.setViewportSize(DESK);
  let n = 0;
  for (const [landing, surfaces] of arrivedByLanding()) {
    expect(surfaces.length, `${landing}: no arrived surfaces in the manifest`).toBeGreaterThan(0);
    await open(page, landing, 500);
    const listed = new Map<string, string[]>([[landing, await bodyLinks(page)]]);
    for (const s of surfaces) {
      // A surface a segment deeper than the project's first level is the
      // page above it's to list, when that page is one of the project's own:
      // the signal's bench and its composite deep-dive are on /nes/signal.
      const above = s.replace(/\/[^/]+$/, "");
      const index = above !== landing && surfaces.includes(above) ? above : landing;
      if (!listed.has(index)) {
        await open(page, index, 500);
        listed.set(index, await bodyLinks(page));
      }
      expect(listed.get(index), `${index} does not link its part ${s}`).toContain(s);
      n++;
    }
  }
  expect(n).toBeGreaterThanOrEqual(15);
});

test("the signal's page lists the two pages under it", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/signal", 500);
  const listed = await bodyLinks(page);
  for (const want of ["/nes/signal/bench", "/nes/signal/composite"]) expect(listed, `/nes/signal does not list ${want}`).toContain(want);
});

test("every page is reached from the menu by walking the pages it lists", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.setViewportSize(DESK);
  await open(page, "/", 500);
  const { hrefs } = await panel(page);
  expect(hrefs.length).toBeGreaterThanOrEqual(6);
  const all = en();
  expect(all.length).toBeGreaterThanOrEqual(100);
  const inSitemap = new Set(all);
  // Breadth first from the menu, through pages this site prerenders. The
  // API's own pages are uvicorn's and are not walked; a document that is
  // not in the sitemap is not walked either, since it is not a page of the
  // site as the site describes itself.
  const reached = new Set<string>(hrefs);
  const queue = hrefs.filter((h) => inSitemap.has(h));
  const walked = new Set<string>();
  while (queue.length) {
    const m = queue.shift()!;
    if (walked.has(m)) continue;
    walked.add(m);
    const r = await page.goto(m, { waitUntil: "load", timeout: 45_000 });
    if (!r || r.status() !== 200) continue;
    await page.waitForTimeout(200);
    for (const h of await bodyLinks(page)) {
      if (!reached.has(h)) {
        reached.add(h);
        if (inSitemap.has(h)) queue.push(h);
      }
    }
  }
  expect(walked.size).toBeGreaterThanOrEqual(50);
  const orphans = all.filter((p) => !reached.has(p));
  expect(orphans, `pages nothing on the way from the menu lists: ${orphans.join(" ")}`).toEqual([]);
});
