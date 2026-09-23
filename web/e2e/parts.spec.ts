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

test("on a phone the strip scrolls itself sideways, never the page", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, "/nes/chips", 500);
  const r = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("[data-parts-strip]")!;
    const cur = nav.querySelector<HTMLElement>("[aria-current]")!;
    return { wider: nav.scrollWidth > nav.clientWidth, sideways: document.documentElement.scrollWidth > innerWidth + 1, sticky: getComputedStyle(nav).position, curVisible: cur.getBoundingClientRect().right <= innerWidth + 1 };
  });
  expect(r.wider, "more parts than a phone's width holds").toBe(true);
  expect(r.sideways).toBe(false);
  expect(r.sticky).toBe("sticky");
  expect(r.curVisible, "the part you are on is in view without a swipe").toBe(true);
});
