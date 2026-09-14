import { test, expect } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * The NES section's doors and the notebook they open onto.
 *
 * The notebook used to be one table of forty documents in the order they
 * were written, linked by file name ("n3-report"), so a reader looking for
 * the bench's wiring scrolled past every chip report. It is grouped by the
 * part of the console now, and /nes opens with a door per part, most of
 * them anchors into that index. An anchor that no longer matches a heading
 * still scrolls to the top of the page and looks like it worked, so each
 * door is followed and its target element is required to exist.
 */

const GROUPS = [
  "where-it-started", "the-chips", "the-signal", "the-console",
  "planning-the-bench", "building-the-bench", "what-happened-at-the-bench", "experiments-at-the-bench",
];

for (const lang of ["", "/ja"]) {
  test(`every door on ${lang}/nes reaches its part${lang ? ", in Japanese" : ""}`, async ({ page }) => {
    await page.setViewportSize(DESK);
    await open(page, `${lang}/nes`, 300);
    const hrefs = await page.locator("[data-parts] a").evaluateAll((as) => as.map((a) => a.getAttribute("href") as string));
    expect(hrefs.length, "the doors list is empty").toBeGreaterThanOrEqual(7);
    for (const href of hrefs) {
      expect(href.startsWith(`${lang}/`), `${href} is not in ${lang || "English"}`).toBe(true);
      // The status from a request: a goto from one anchor of a page to
      // another is a same-document jump and returns no response at all.
      const [where, hash] = href.split("#");
      expect((await page.request.get(where)).status(), href).toBe(200);
      await page.goto(href, { waitUntil: "load" });
      if (hash) await expect(page.locator(`[id="${hash}"]`), `${href}: no heading carries #${hash}`).toHaveCount(1);
    }
  });
}

test("the notebook is grouped, and every document is in it once, by its title", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/docs/nes", 300);
  const prose = page.locator(".prose").first();
  for (const id of GROUPS) await expect(prose.locator(`h2[id="${id}"]`), `no group #${id}`).toHaveCount(1);
  const links = await prose.locator("table a[href^='/docs/nes/']").evaluateAll((as) =>
    as.map((a) => ({ href: a.getAttribute("href") as string, text: (a as HTMLElement).innerText.trim() })),
  );
  expect(links.length, "the notebook lists no documents").toBeGreaterThanOrEqual(40);
  const hrefs = links.map((l) => l.href);
  expect(new Set(hrefs).size, "a document is listed twice").toBe(hrefs.length);
  // A file name as link text ("n3-report") is the thing this replaced.
  const slugs = links.filter((l) => /^[a-z0-9-]+$/.test(l.text));
  expect(slugs, "linked by file name, not title").toEqual([]);
  // Titles start with a capital: the four lowercase repository h1s were the casing bug.
  const lower = links.filter((l) => /^[a-z]/.test(l.text));
  expect(lower, "a title starting lowercase").toEqual([]);
});

test("the section's name is capitalised where the menu, the crumb and the heading show it", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes", 300);
  await expect(page.locator("h1").first()).toHaveText("The NES console");
  await page.locator(".menu-btn").click();
  const labels = await page.locator(".menu-item b").allInnerTexts();
  expect(labels).toContain("The NES console");
  expect(labels).not.toContain("the NES console");
});

test("the front page's overview tags are capitalised", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/", 300);
  // textContent, not innerText: the tags are set in capitals by CSS, so
  // innerText reads OVERVIEW whatever the source says. Other tags share
  // the class ("read it here"), so pick the overview ones by their word.
  const tags = (await page.locator(".piece-links .tag").evaluateAll((as) => as.map((a) => (a.textContent ?? "").trim())))
    .filter((t) => t.toLowerCase() === "overview");
  expect(tags.length).toBeGreaterThanOrEqual(3);
  expect(tags.filter((t) => t !== "Overview")).toEqual([]);
});

/**
 * Every document carries a title of ours and, where the repository files it
 * under a milestone, that label beside it: in the index's description cell,
 * on the page right under the h1, and on the part pages' shelves. The label
 * moved out of the title on 2026-09-14 ("N3 report: the 2A03 ladder" became
 * "The fast 2A03, built and checked"), so a title that still starts with one
 * is the old title back.
 */
test("the notebook shows each milestone label beside its title, not in it", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/docs/nes", 300);
  const rows = await page.locator(".prose table tr").evaluateAll((trs) =>
    trs
      .map((tr) => {
        const a = tr.querySelector("a[href^='/docs/nes/']");
        const cells = tr.querySelectorAll("td");
        return a && cells.length === 2
          ? { href: a.getAttribute("href") as string, title: (a.textContent ?? "").trim(), code: (cells[1].querySelector("strong")?.textContent ?? "").trim() }
          : null;
      })
      .filter(Boolean) as { href: string; title: string; code: string }[],
  );
  expect(rows.length).toBeGreaterThanOrEqual(40);
  // Titles no longer open with a milestone label.
  expect(rows.filter((r) => /^[NAPMBC][0-9]\b/.test(r.title))).toEqual([]);
  const coded = rows.filter((r) => r.code);
  // Every chip, signal and console milestone has one: at least N0, A0, A3, N3 x2, P0 to P3 x5, M0 to M5, N4 to N8 x8.
  expect(coded.length, "too few milestone labels in the notebook").toBeGreaterThanOrEqual(25);
  for (const r of coded) expect(r.code, r.href).toMatch(/^(([NAPMBC][0-9]( to [NAPMBC][0-9])? (plan|report))|Sketch v[0-9.]+|Specification v[0-9.]+)\.$/);

  // The same label under the page's own title.
  const one = coded.find((r) => r.href === "/docs/nes/n3-report") ?? coded[0];
  await open(page, one.href, 300);
  await expect(page.getByRole("heading", { level: 1, name: one.title })).toHaveCount(1);
  await expect(page.locator(".prose em", { hasText: `The ${one.code.replace(/\.$/, "")},` }).first()).toBeVisible();
});

test("the glossary exists, and every pulled document's footer links it", async ({ page, request }) => {
  await page.setViewportSize(DESK);
  expect((await request.get("/docs/words")).status()).toBe(200);
  expect((await request.get("/ja/docs/words")).status()).toBe(200);
  for (const doc of ["/docs/nes/p3-plan", "/docs/cart/calibration-plan"]) {
    await open(page, doc, 300);
    await expect(page.locator('.prose a[href="/docs/words"]').last(), `${doc}: no link to the glossary`).toBeVisible();
  }
});
