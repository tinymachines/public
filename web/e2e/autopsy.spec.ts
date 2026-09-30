import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, DESK, JA_FLOOR, jaShare, open, PHONE, overflow, servedBody } from "./lib";

/**
 * The autopsy section, held to its record.
 *
 * Every figure on these pages is read from data/autopsy.json, so the spec
 * reads the same file and asks the served pages for what it says: a line
 * for every game, a page for every game with every routine the record
 * holds, a section for every pattern with the count the record gives. A
 * page that quietly lost a game would still look like a page.
 */

const RECORD = path.join(__dirname, "..", "..", "data", "autopsy.json");

type Game = { key: string; name: string; patterns: Record<string, number>; routine_list: unknown[]; table_list: unknown[] };

function record(): { games: Game[]; patterns: string[] } {
  const r = JSON.parse(fs.readFileSync(RECORD, "utf8")) as { games: Game[]; patterns: string[] };
  if (r.games.length < 2) throw new Error(`data/autopsy.json holds ${r.games.length} games; the spec would pass on nothing`);
  return r;
}

test("the games page lists every game in the record, and each opens its page", async ({ page }) => {
  await page.setViewportSize(DESK);
  const r = record();
  await open(page, "/autopsy/games", 200);
  await expect(page.locator("[data-autopsy-games] tbody tr")).toHaveCount(r.games.length);
  for (const g of r.games) {
    await expect(page.locator(`[data-autopsy-game="${g.key}"] a[href="/autopsy/games/${g.key}"]`), g.name).toHaveText(g.name);
  }
});

test("a game's page shows every routine and table the record holds for it", async ({ page }) => {
  await page.setViewportSize(DESK);
  const r = record();
  // The game with the most tables, and the one with the fewest routines: both ends.
  const most = [...r.games].sort((a, b) => b.table_list.length - a.table_list.length)[0];
  const least = [...r.games].sort((a, b) => a.routine_list.length - b.routine_list.length)[0];
  for (const g of [most, least]) {
    await open(page, `/autopsy/games/${g.key}`, 200);
    await expect(page.locator("h1"), g.key).toHaveText(g.name);
    await expect(page.locator("[data-autopsy-routines] tbody tr"), `${g.name}: its routines`).toHaveCount(g.routine_list.length);
    await expect(page.locator("[data-autopsy-tables] tbody tr"), `${g.name}: its tables`).toHaveCount(g.table_list.length);
    await expect(page.locator("[data-autopsy-found] li"), `${g.name}: the patterns named`).toHaveCount(Object.keys(g.patterns).length);
  }
});

test("the patterns page tells every pattern, with the number of games the record gives", async ({ page }) => {
  await page.setViewportSize(DESK);
  const r = record();
  await open(page, "/autopsy/patterns", 200);
  const told = await page.locator("[data-autopsy-pattern]").evaluateAll((ss) => ss.map((s) => [(s as HTMLElement).dataset.autopsyPattern, Number((s as HTMLElement).dataset.autopsyPatternGames)] as const));
  expect(told.length, "a section for each pattern").toBeGreaterThanOrEqual(r.patterns.length);
  for (const p of r.patterns) {
    const games = r.games.filter((g) => g.patterns[p]).length;
    expect(told.find((t) => t[0] === p)?.[1], `${p}: the games it was found in`).toBe(games);
    expect(games, `${p} is in the record because some game has it`).toBeGreaterThan(0);
  }
});

test("the landing links every part, and the section's strip names them", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/autopsy", 200);
  for (const href of ["/autopsy/games", "/autopsy/patterns", "/autopsy/method"]) {
    await expect(page.locator(`[data-parts] a[href="${href}"]`), href).toHaveCount(1);
  }
  const strip = await page.locator("[data-parts-strip] a").evaluateAll((as) => as.map((a) => (a.textContent ?? "").trim()));
  expect(strip).toEqual(expect.arrayContaining(["Overview", "Games", "Patterns", "Method"]));
});

test("a game's page in Japanese is Japanese, and fits a phone", async ({ page, request }) => {
  const r = record();
  const g = [...r.games].sort((a, b) => b.routine_list.length - a.routine_list.length)[0];
  const html = await (await request.get(`${BASE}/ja/autopsy/games/${g.key}`)).text();
  expect(jaShare(servedBody(html)), `${g.name}: the page with the most identifiers on it`).toBeGreaterThanOrEqual(JA_FLOOR);
  await page.setViewportSize(PHONE);
  await open(page, `/autopsy/games/${g.key}`, 200);
  const over = await overflow(page);
  expect(over.px, `nothing wider than the phone: ${over.out.join("; ")}`).toBe(0);
});
