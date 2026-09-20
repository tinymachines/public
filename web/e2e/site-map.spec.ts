import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, DESK, open } from "./lib";

/**
 * /style/map: the house page that answers "how does a reader reach this
 * page", which nothing on this site could answer until 2026-09-20, the day
 * the playground was published and the owner could not find it.
 *
 * The page is a view of data/site-map.json, so the spec holds the two to
 * each other: every page in the record is on the page, and the pages the
 * record says have no door are named on it. A map that quietly lost half the
 * site would still look like a map.
 */

const RECORD = path.join(__dirname, "..", "..", "data", "site-map.json");

test("the map is a house page: served, noindex, and out of the sitemap", async ({ page }) => {
  const res = await page.request.get(`${BASE}/style/map`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toMatch(/<meta name="robots" content="noindex/);
  const sitemap = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
  expect(sitemap).toContain("/style</loc>");
  expect(sitemap).not.toContain("/style/map");
});

test("the map shows every page the record holds, and names the doorless ones", async ({ page }) => {
  const record = JSON.parse(fs.readFileSync(RECORD, "utf8")) as {
    pages: Record<string, { inbound: number; error?: string }>;
  };
  const paths = Object.entries(record.pages).filter(([, p]) => !p.error);
  // A check that can pass on nothing is not a check: the site has well over a
  // hundred pages, and a record holding a handful would be a failed crawl.
  expect(paths.length).toBeGreaterThan(100);

  await page.setViewportSize(DESK);
  await open(page, "/style/map", 400);
  await expect(page.locator(".map-row")).toHaveCount(paths.length);

  const body = await page.locator("main").innerText();
  for (const [href] of paths) expect(body, `${href} is on the map`).toContain(href);

  const doorless = paths.filter(([, p]) => p.inbound === 0).map(([href]) => href);
  expect(doorless.length).toBeGreaterThan(0);
  const findings = await page.locator(".map-findings").innerText();
  for (const href of doorless) expect(findings, `${href} is named as doorless`).toContain(href);
});

test("the map's own figures are the record's, not typed", async ({ page }) => {
  const record = JSON.parse(fs.readFileSync(RECORD, "utf8")) as {
    crawled: string;
    origin: string;
    pages: Record<string, { inbound: number; error?: string }>;
  };
  const pages = Object.values(record.pages).filter((p) => !p.error);
  const one = pages.filter((p) => p.inbound === 1).length;

  await page.setViewportSize(DESK);
  await open(page, "/style/map", 400);
  const text = await page.locator("main").innerText();
  expect(text).toContain(record.crawled);
  expect(text).toContain(record.origin);
  expect(text).toContain(String(pages.length));
  expect(text).toContain(`Pages with one door: ${one}`);
});
