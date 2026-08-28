import { test, expect } from "@playwright/test";
import { pages, open, PHONE, DESK } from "./lib";

/**
 * One bar. The slots are the same on every page: the die tile, the page
 * name beside the mark on every page but the two homes, one flag, and the
 * menu at the same x on every page at a given width.
 */
// The console page carries no bar (console-full, owner's call 2026-08-26).
const sample = pages().filter((p) => !/\/6502\/games$/.test(p));
for (const [name, vp] of [["phone", PHONE], ["desk", DESK]] as const) {
  test.describe(`the bar, ${name}`, () => {
    test.use({ viewport: vp });
    test(`menu at one x across ${sample.length} pages`, async ({ page }) => {
      test.setTimeout(20 * 60_000);
      const xs = new Map<number, string[]>();
      let n = 0;
      for (const p of sample) {
        await open(page, p, 800);
        const r = await page.evaluate(() => {
          const menu = document.querySelector(".menu-wrap button")!.getBoundingClientRect();
          return {
            workbench: document.querySelectorAll(".wb-bar").length,
            bars: document.querySelectorAll(".topbar").length,
            die: document.querySelectorAll(".topbar .die").length,
            flags: document.querySelectorAll(".topbar a.lang-switch, .topbar .lang-switch a").length,
            flagHref: document.querySelector<HTMLAnchorElement>(".topbar a.lang-switch, .topbar .lang-switch a")?.getAttribute("href") ?? null,
            page: document.querySelectorAll(".topbar .tb-page").length,
            // The right edge: the label is wider in Japanese, the edge is the slot.
            menuX: Math.round(menu.right),
          };
        });
        expect(r.bars, `${p}: one bar`).toBe(1);
        expect(r.die, `${p}: the die tile`).toBe(1);
        expect(r.flags, `${p}: one flag`).toBe(1);
        // The flag is this page in the other language, and nothing else. It
        // pointed at /ja/en/... on every statically rendered English page
        // until 2026-08-28, because the internal spelling of an English path
        // carries the /en the rewrite adds and `delocalize` did not read it.
        const twin = p.startsWith("/ja") ? (p.slice(3) || "/") : (p === "/" ? "/ja" : `/ja${p}`);
        expect(r.flagHref, `${p}: the flag points at the same page in the other language`).toBe(twin);
        // The name beside the mark is the workbench bar's slot; a Shell page
        // names itself in the page head under the bar, so the bar carries the
        // mark alone there. One or the other, never both, never neither.
        expect(r.page, `${p}: page name in the bar iff workbench`).toBe(r.workbench);
        xs.set(r.menuX, [...(xs.get(r.menuX) ?? []), p]);
        n++;
      }
      expect(n).toBeGreaterThanOrEqual(100);
      const spread = [...xs.keys()];
      expect(spread, `menu x differs by page: ${JSON.stringify([...xs].map(([x, ps]) => [x, ps.slice(0, 3)]))}`).toHaveLength(1);
    });
  });
}
