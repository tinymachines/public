import { test, expect } from "@playwright/test";
import { open, PHONE, DESK } from "./lib";

/**
 * The companion articles: the tool's prose set by pretext, and the tool
 * alive in the figure. Two pages stand for the seventeen: the tracer (the
 * long one, 24,000 characters and the split paragraph) and the primer.
 */
for (const p of ["/6502/tracer/article", "/6502/primer/article"]) {
  for (const [name, size] of [["desk", DESK], ["phone", PHONE]] as const) {
    test(`${p} at ${name}: every justified line fits, and none is loose`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page, p, 6000);
      const r = await page.evaluate(() => {
        const set = [...document.querySelectorAll(".jp-set")];
        let lines = 0, over = 0, loose = 0;
        for (const para of set) for (const l of para.querySelectorAll(".jl:not(.jl-last)")) {
          lines++;
          const w = [...l.children].reduce((a, c) => a + c.getBoundingClientRect().width, 0);
          const d = w - (l as HTMLElement).clientWidth;
          if (d > 0.5) over++;
          if (d < -(l as HTMLElement).clientWidth * 0.3) loose++;
        }
        return {
          paragraphs: document.querySelectorAll(".jp").length, set: set.length, lines, over, loose,
          h1: document.querySelectorAll("h1").length,
          sideways: document.documentElement.scrollWidth - innerWidth,
          longest: Math.max(...[...document.querySelectorAll(".art-body .jp")].map((e) => e.textContent!.length)),
          bench: !!document.querySelector(".art-bench-frame .explorer-shell"),
        };
      });
      expect(r.paragraphs, "there is prose").toBeGreaterThan(5);
      expect(r.set, "every paragraph was set by pretext").toBe(r.paragraphs);
      expect(r.lines).toBeGreaterThan(20);
      expect(r.over, "no set line is wider than its block").toBe(0);
      expect(r.loose, "no set line is stretched past a third of its width").toBe(0);
      expect(r.h1).toBe(1);
      expect(r.sideways).toBeLessThanOrEqual(0);
      expect(r.longest, "no paragraph is a blob").toBeLessThan(1400);
      expect(r.bench, "the instrument is in the figure").toBe(true);
    });
  }
}

test("the tracer article's bench is the tracer, running", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, "/6502/tracer/article", 9000);
  const r = await page.evaluate(() => ({
    svg: !!document.querySelector(".art-bench-frame #tc-svg"),
    nodes: document.querySelectorAll(".art-bench-frame #tc-svg circle, .art-bench-frame #tc-svg use").length,
    run: !!document.querySelector(".art-bench-frame #tc-run"),
    heroInFigure: !!document.querySelector(".art-bench-frame .hero"),
    proseInFigure: !!document.querySelector(".art-bench-frame .bp-prose"),
  }));
  expect(r.svg, "the drawing").toBe(true);
  expect(r.nodes, "the die graph was drawn into it").toBeGreaterThan(1000);
  expect(r.run, "the tool's own controls are its own here").toBe(true);
  expect(r.heroInFigure).toBe(false);
  expect(r.proseInFigure, "the prose is the article, not the figure").toBe(false);
});
