import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { DESK, PHONE, open } from "./lib";

/**
 * The section's parts, as a strip under the bar on every page inside a
 * project (components/PartsStrip.tsx): the second level the panel no longer
 * carries, which the owner missed on a phone the morning after the panel
 * was cut to the site and the projects (2026-09-23).
 *
 * Three rules. The strip is on every reading page of a section and on
 * none of the site's own pages; it carries the section's first level, so
 * every arrived surface one segment under the landing is on it (read from
 * the manifest, the way the site reads it); and it says where you are: the
 * page itself, or the part you are under.
 */

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "projects.json"), "utf8")) as {
  projects: { key: string; landing?: string | null; surfaces: { lands_at: string; lands_at_settled: boolean; status: string }[] }[];
};
const sections = manifest.projects
  .filter((p) => p.key !== "roof" && p.landing)
  .map((p) => ({
    landing: p.landing as string,
    first: p.surfaces
      .filter((s) => s.status !== "not started" && s.lands_at_settled)
      .map((s) => s.lands_at)
      .filter((h) => h.startsWith(p.landing + "/") && h.slice(p.landing!.length + 1).indexOf("/") < 0),
  }));

async function strip(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const nav = document.querySelector("[data-parts-strip]");
    if (!nav) return null;
    return {
      section: nav.getAttribute("data-parts-strip"),
      links: [...nav.querySelectorAll("a")].map((a) => ({ href: (a.getAttribute("href") ?? "").replace(/\/$/, ""), label: (a.textContent ?? "").trim(), current: a.getAttribute("aria-current") })),
      sideways: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

test("every section's landing carries its first level, and marks itself", async ({ page }) => {
  await page.setViewportSize(DESK);
  expect(sections.length).toBeGreaterThanOrEqual(3);
  for (const s of sections) {
    await open(page, s.landing, 500);
    const r = await strip(page);
    expect(r, `${s.landing}: the strip`).not.toBeNull();
    expect(r!.section).toBe(s.landing);
    expect(r!.links.length).toBeGreaterThanOrEqual(2);
    expect(r!.links[0], `${s.landing}: the landing first, as the page you are on`).toMatchObject({ href: s.landing, current: "page" });
    const hrefs = r!.links.map((l) => l.href);
    expect(new Set(hrefs).size, "nothing twice").toBe(hrefs.length);
    // Every first-level surface is on the strip, or on a page the strip
    // reaches: the 6502's tracks list their own (the console and the editor
    // on Cart, the explorer and the Lab on Lab and tools), and the strip
    // carries the tracks. The index-page bargain, checked rather than trusted.
    const missing = s.first.filter((h) => !hrefs.includes(h));
    if (missing.length) {
      const reached = new Set<string>();
      for (const h of hrefs.filter((h) => h !== s.landing && !h.startsWith("/api"))) {
        const res = await page.goto(h, { waitUntil: "load", timeout: 45_000 });
        if (!res || res.status() !== 200) continue;
        for (const l of await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("main a[href]")].map((a) => (a.getAttribute("href") ?? "").split("#")[0].replace(/\/$/, "")))) reached.add(l);
      }
      for (const h of missing) expect([...reached], `${s.landing}: its part ${h} is neither on the strip nor on a page the strip reaches`).toContain(h);
    }
  }
});

test("inside a part, the strip marks the part; on a site page there is no strip", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/signal/composite", 500);
  const r = await strip(page);
  expect(r!.section).toBe("/nes");
  expect(r!.links.find((l) => l.href === "/nes/signal")?.current).toBe("location");
  expect(r!.links.filter((l) => l.current).length, "one place at a time").toBe(1);
  await open(page, "/ja/nes/chips", 500);
  const ja = await strip(page);
  expect(ja!.links[0].href).toBe("/ja/nes");
  expect(ja!.links.some((l) => l.href === "/ja/nes/chips" && l.current === "page")).toBe(true);
  // Outside a section, and on a workbench page, which carries its own strip
  // of the page's sections instead: no parts strip.
  for (const p of ["/", "/docs", "/style", "/docs/nes/boards", "/nes/play"]) {
    await open(page, p, 300);
    expect(await strip(page), `${p}: no parts strip here`).toBeNull();
  }
});

test("the NES strip: Overview, Play, Create, Record, Learn, then the parts, then Notebook and Retro, a divider between, all on one row at a desk", async ({ page }) => {
  // Owner, 2026-09-24: Create was missing, the phrases ran the row off the
  // edge, and the parts wanted to read as a cluster of their own.
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/nes", 500);
  const r = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("[data-parts-strip]")!;
    const runs = [...nav.querySelectorAll(".strip-row:not(.strip-ghost) > .strip-run")].map((run) => [...run.querySelectorAll("a")].map((a) => (a.textContent ?? "").trim()));
    const row = nav.querySelector<HTMLElement>(".strip-row:not(.strip-ghost)")!;
    const last = [...row.querySelectorAll("a")].pop()!.getBoundingClientRect();
    return { fold: nav.dataset.fold, runs, rowShown: getComputedStyle(row).display !== "none", lastRight: last.right, vw: innerWidth };
  });
  expect(r.runs).toEqual([
    ["Overview", "Play", "Create", "Record", "Learn"],
    ["The chips", "The console", "The signal", "The bench", "The calibration cart"],
    ["Notebook", "Retro"],
  ]);
  expect(r.fold, "measured, and it fits").toBe("0");
  expect(r.rowShown).toBe(true);
  expect(r.lastRight, "the last part is on screen, not cut at the edge").toBeLessThanOrEqual(r.vw);
  // The one-word labels are the strip's: the crumb and the heading keep the name.
  await open(page, "/nes/playground", 500);
  expect(await page.locator("[data-parts-strip] a[aria-current=page]").first().textContent()).toBe("Learn");
});

test("where the row does not fit, the strip scrolls inside itself with every link, the current one in view; the page never scrolls sideways", async ({ page }) => {
  // Owner, 2026-09-26: the list reads better than the folded button, which
  // hid half the create desk's windows. The row scrolls, as it did before
  // 2026-09-24; the fold is kept in the code and hidden.
  for (const vp of [PHONE, { width: 900, height: 900 }]) {
    await page.setViewportSize(vp);
    await open(page, "/nes/chips", 500);
    const nav = page.locator("[data-parts-strip]");
    await expect(nav, "measured, and it does not fit").toHaveAttribute("data-fold", "1");
    await expect(nav.locator(".strip-fold")).toBeHidden();
    const r = await nav.evaluate((n) => {
      const row = n.querySelector<HTMLElement>(".strip-row:not(.strip-ghost)")!;
      const rr = row.getBoundingClientRect();
      const cur = row.querySelector<HTMLElement>("a[aria-current]")!.getBoundingClientRect();
      return {
        shown: getComputedStyle(row).display !== "none",
        links: [...row.querySelectorAll("a")].map((a) => (a.textContent ?? "").trim()),
        scrolls: row.scrollWidth > row.clientWidth,
        curIn: cur.left >= rr.left - 1 && cur.right <= rr.right + 1,
        // Sideways only: nothing to scroll up and down (owner, 2026-09-27).
        y: getComputedStyle(row).overflowY,
        yRoom: row.scrollHeight - row.clientHeight,
        yMoves: (() => { row.scrollTop = 5; const t = row.scrollTop; row.scrollTop = 0; return t; })(),
      };
    });
    expect(r.shown, `${vp.width}: the row shows`).toBe(true);
    expect(r.links, `${vp.width}: every link is in the row`).toEqual(expect.arrayContaining(["Overview", "Play", "Create", "The chips", "Retro"]));
    expect(r.scrolls, `${vp.width}: the row scrolls inside the strip`).toBe(true);
    expect(r.curIn, `${vp.width}: the current part is in view`).toBe(true);
    expect(r.y, `${vp.width}: the row does not scroll vertically`).toBe("hidden");
    expect(r.yMoves, `${vp.width}: a vertical nudge does not move the row (${r.yRoom}px of it)`).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${vp.width}: the page does not scroll sideways`).toBeLessThanOrEqual(vp.width);
    // A link in the row goes there.
    await nav.locator(".strip-row:not(.strip-ghost) a", { hasText: "Create" }).click();
    await expect(page).toHaveURL(/\/nes\/create$/);
  }
});

