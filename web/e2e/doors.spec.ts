import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, DESK, open } from "./lib";

/**
 * The three doors, and the notebook's kinds: the two pages read cold on
 * 2026-09-21.
 *
 * /read named three groups in its opening line and then showed ten entries
 * in one column, most of which opened another list; /docs/kinds showed
 * twenty-five reports in a meaningful order with nothing saying the order
 * meant anything, and codes with no key. What went on the pages is measured
 * or read from a record, so this spec holds each page to its record: the
 * doors to data/doors.json and data/site-map.json, the kinds to the shelves
 * the pull writes. A page that quietly lost a group would still look like a
 * page.
 */

const DOORS = path.join(__dirname, "..", "..", "data", "doors.json");
const MAP = path.join(__dirname, "..", "..", "data", "site-map.json");
const SHELVES = path.join(__dirname, "..", "..", "docs", "nes", "shelves.json");

type Group = { name?: string; what?: string; paths: string[] };
type Door = { key: string; path: string; name: string; groups: Group[] };

function doors(): Door[] {
  const d = (JSON.parse(fs.readFileSync(DOORS, "utf8")) as { doors: Door[] }).doors;
  if (d.length < 3) throw new Error(`data/doors.json holds ${d.length} doors`);
  return d;
}

test("every door shows every page behind it, in its groups", async ({ page }) => {
  await page.setViewportSize(DESK);
  for (const d of doors()) {
    await open(page, d.path, 200);
    const named = d.groups.filter((g) => g.name);
    await expect(page.locator(".door-h"), `${d.path} heads its named groups`).toHaveCount(named.length);
    for (const g of named) {
      await expect(page.locator(".door-h", { hasText: g.name! })).toHaveCount(1);
    }
    const all = d.groups.flatMap((g) => g.paths);
    await expect(page.locator(".door-item"), `${d.path} lists every page once`).toHaveCount(all.length);
    for (const href of all) {
      await expect(page.locator(`.door-item a[href="${href}"]`), `${d.path} opens ${href}`).toHaveCount(1);
    }
  }
});

test("the counts beside a door's pages are the crawl's, not typed", async ({ page }) => {
  const record = JSON.parse(fs.readFileSync(MAP, "utf8")) as {
    pages: Record<string, { words?: number; out?: number }>;
  };
  await page.setViewportSize(DESK);
  let checked = 0;
  for (const d of doors()) {
    await open(page, d.path, 200);
    for (const href of d.groups.flatMap((g) => g.paths)) {
      const row = record.pages[href];
      if (!row?.words || !row?.out) continue;
      const met = await page.locator(`.door-item:has(a[href="${href}"]) .door-met`).innerText();
      expect(met, `${href} carries its own word count`).toContain(row.words.toLocaleString("en"));
      expect(met, `${href} carries its own link count`).toContain(String(row.out));
      checked += 1;
    }
  }
  // A check that can pass on nothing is not a check: the doors hold thirty-odd
  // pages and the record has met nearly all of them.
  expect(checked).toBeGreaterThan(20);
});

test("the notebook by kind explains its letters and keeps the notebook's order", async ({ page }) => {
  const shelves = JSON.parse(fs.readFileSync(SHELVES, "utf8")) as {
    groups: { docs: { title: string; letter: string | null; kind: string }[] }[];
    cart: { title: string; letter: string | null; kind: string }[];
    kinds: { key: string; name: string }[];
    codes: { letter: string; what: string }[];
  };
  const all = [...shelves.groups.flatMap((g) => g.docs), ...shelves.cart];
  const used = [...new Set(all.map((d) => d.letter).filter(Boolean))] as string[];
  expect(used.length, "documents are filed under letters").toBeGreaterThan(2);

  await page.setViewportSize(DESK);
  await open(page, "/docs/kinds", 200);

  const key = await page.locator(".kind-key").innerText();
  for (const letter of used) {
    const code = shelves.codes.find((c) => c.letter === letter);
    expect(code, `${letter} is in the key`).toBeTruthy();
    expect(key, `the page prints what ${letter} means`).toContain(code!.what);
  }

  // The page says the lists are in the notebook's order, so they have to be:
  // each kind's rows, top to bottom, are that kind's documents in the order
  // the shelves keep them. A page that sorted them any other way would still
  // print the sentence.
  const order = await page.locator(".kind-order").innerText();
  expect(order, "the page says whose order the lists are in").toContain("notebook");
  let rows = 0;
  for (const kind of shelves.kinds) {
    const docs = all.filter((d) => d.kind === kind.key);
    expect(docs.length, `${kind.name} has documents`).toBeGreaterThan(0);
    const shown = await page
      .locator(".kind", { has: page.locator("h2", { hasText: kind.name }) })
      .locator(".kind-list li > a")
      .allTextContents();
    // textContent, not innerText: the kit CSS-uppercases some labels, and
    // innerText would hand back what the stylesheet did to the title.
    expect(shown.map((x) => x.trim()), `${kind.name} is in the notebook's order`).toEqual(docs.map((d) => d.title));
    rows += shown.length;
  }
  expect(rows, "every document is on the page once").toBe(all.length);
});
