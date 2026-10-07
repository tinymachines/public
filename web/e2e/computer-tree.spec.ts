import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, DESK, NARROW, open, overflow } from "./lib";

/**
 * /computer-tree: bradley.io's Computer Tree, drawn here from the same
 * dataset and layout (scripts/sync-computer-tree.sh). The page draws every
 * machine, answers a search, offers the dataset byte for byte, names
 * bradley.io's page as canonical in English, and fits a phone.
 */

const DATA = path.join(__dirname, "..", "data", "computer-tree");
const tree = JSON.parse(fs.readFileSync(path.join(DATA, "computer_tree.json"), "utf8")) as { nodes: { id: string; label: string }[]; links: unknown[] };

test("every machine is drawn, and a search moves the selection", async ({ page }) => {
  expect(tree.nodes.length, "the dataset holds machines; the spec would pass on nothing").toBeGreaterThan(100);
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize(DESK);
  await open(page, "/computer-tree", 200);
  await expect(page.locator(".ctree__nodes circle")).toHaveCount(tree.nodes.length);
  const target = tree.nodes.find((n) => n.id === "cray_1") ?? tree.nodes[1];
  await page.locator(".ctree__find input").fill(target.label);
  await expect(page.locator(".ctree__name")).toHaveText(target.label);
  await expect(page.locator(".ctree__lineage li").first()).toBeVisible();
  expect(errors, "no console errors").toEqual([]);
});

test("the English page names bradley.io's as canonical; the Japanese one is its own and speaks Japanese", async ({ page }) => {
  await open(page, "/computer-tree", 200);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://bradley.io/projects/computer-tree");
  await open(page, "/ja/computer-tree", 200);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/ja\/computer-tree$/);
  await expect(page.locator(".ctree__find span")).toHaveText("機械を探す");
});

test("the dataset is offered byte for byte", async ({ request }) => {
  for (const f of ["DATACARD.md", "nodes.csv", "edges.csv", "computer_tree.json"]) {
    const r = await request.get(`${BASE}/computer-tree/${f}`);
    expect(r.status(), f).toBe(200);
    expect(Buffer.compare(await r.body(), fs.readFileSync(path.join(DATA, f))), `${f} is the copy in web/data`).toBe(0);
  }
});

test("the page fits a phone", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await open(page, "/computer-tree", 200);
  expect(await overflow(page)).toEqual({ out: [], px: 0 });
});
