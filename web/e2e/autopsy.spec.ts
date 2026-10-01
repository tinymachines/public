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

type Game = { key: string; name: string; patterns: Record<string, number>; routine_list: unknown[]; table_list: { on?: string[]; kind?: string }[]; loop_list: { is: unknown[] }[]; array_list: { x?: number; y?: number }[]; object_list: { arrays: number; adds?: string[] }[] };

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
    const on = await page.locator("[data-autopsy-tables] tbody td[data-autopsy-table-on]").evaluateAll((tds) => tds.map((t) => Number((t as HTMLElement).dataset.autopsyTableOn)));
    expect(on, `${g.name}: the bytes that chose, by table`).toEqual(g.table_list.map((t) => (t.on ?? []).length));
    const kinds = await page.locator("[data-autopsy-tables] tbody td[data-autopsy-table-kind]").evaluateAll((tds) => tds.map((t) => (t as HTMLElement).dataset.autopsyTableKind));
    expect(kinds, `${g.name}: how each table is reached`).toEqual(g.table_list.map((t) => t.kind ?? "dispatch"));
    await expect(page.locator("[data-autopsy-found] li"), `${g.name}: the patterns named`).toHaveCount(Object.keys(g.patterns).length);
  }
});

test("a game's page shows the loops the rules named, each with its evidence", async ({ page }) => {
  await page.setViewportSize(DESK);
  const r = record();
  // The game that waits in the most places, and one that waits in none.
  const most = [...r.games].sort((a, b) => b.loop_list.length - a.loop_list.length)[0];
  expect(most.loop_list.length, "some game in the record has a named loop").toBeGreaterThan(0);
  await open(page, `/autopsy/games/${most.key}`, 200);
  await expect(page.locator("[data-autopsy-loops] tbody tr"), `${most.name}: its loops`).toHaveCount(most.loop_list.length);
  const marks = most.loop_list.reduce((n, l) => n + l.is.length, 0);
  await expect(page.locator("[data-autopsy-loops] tbody tr td:last-child div"), `${most.name}: a line of evidence for each mark`).toHaveCount(marks);
  const none = r.games.find((g) => g.loop_list.length === 0);
  if (none) {
    await open(page, `/autopsy/games/${none.key}`, 200);
    await expect(page.locator("[data-autopsy-loops]"), `${none.name}: no table for no loops`).toHaveCount(0);
  }
});

test("a game's page shows every array that holds a compared position", async ({ page }) => {
  await page.setViewportSize(DESK);
  const r = record();
  const holding = (g: Game) => g.array_list.filter((a) => (a.x ?? 0) + (a.y ?? 0) > 0);
  const most = [...r.games].sort((a, b) => holding(b).length - holding(a).length)[0];
  expect(holding(most).length, "some game in the record has an array holding positions").toBeGreaterThan(0);
  await open(page, `/autopsy/games/${most.key}`, 200);
  const shown = await page.locator("[data-autopsy-arrays] tbody tr[data-autopsy-holds]").evaluateAll((rows) => rows.map((r) => Number((r as HTMLElement).dataset.autopsyHolds)));
  expect(shown.length, `${most.name}: arrays holding positions`).toBe(holding(most).length);
  expect(shown.reduce((a, b) => a + b, 0), `${most.name}: positions held`).toBe(holding(most).reduce((n, a) => n + (a.x ?? 0) + (a.y ?? 0), 0));
});

test("a game's page shows the arrays that travel with its positions", async ({ page }) => {
  await page.setViewportSize(DESK);
  const r = record();
  const most = [...r.games].sort((a, b) => b.object_list.length - a.object_list.length)[0];
  expect(most.object_list.length, "some game in the record has an object table").toBeGreaterThan(0);
  await open(page, `/autopsy/games/${most.key}`, 200);
  const shown = await page.locator("[data-autopsy-objects] tbody tr").evaluateAll((rows) => rows.map((r) => Number((r as HTMLElement).dataset.autopsyObjectArrays)));
  expect(shown, `${most.name}: its tables, by how many arrays each has`).toEqual(most.object_list.map((o) => o.arrays));
  const adds = await page.locator("[data-autopsy-objects] tbody td[data-autopsy-object-adds]").evaluateAll((tds) => tds.map((t) => Number((t as HTMLElement).dataset.autopsyObjectAdds)));
  expect(adds, `${most.name}: the arrays added into positions, by table`).toEqual(most.object_list.map((o) => (o.adds ?? []).length));
  const none = r.games.find((g) => g.object_list.length === 0);
  if (none) {
    await open(page, `/autopsy/games/${none.key}`, 200);
    await expect(page.locator("[data-autopsy-objects]"), `${none.name}: no table for none`).toHaveCount(0);
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
