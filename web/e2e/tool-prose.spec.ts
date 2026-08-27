import { test, expect } from "@playwright/test";
import { open, PHONE, DESK } from "./lib";

/**
 * The tool page's own prose, set by pretext, and the caption the tracer's
 * script writes under the drawing: 6,600 characters as one string, cut at
 * sentence ends in the browser (components/Justify.tsx). The readouts
 * beside it are left alone.
 */
for (const [name, size] of [["desk", DESK], ["phone", PHONE]] as const) {
  test(`/6502/tracer at ${name}: the prose and the caption are set, no line overflows, the readouts are untouched`, async ({ page }) => {
    test.slow();
    await page.setViewportSize(size);
    await open(page, "/6502/tracer", 9000);
    const r = await page.evaluate(() => {
      const set = [...document.querySelectorAll(".jp-set")];
      let lines = 0, over = 0;
      for (const para of set) for (const l of para.querySelectorAll(".jl:not(.jl-last)")) {
        lines++;
        const range = document.createRange(); range.selectNodeContents(l);
        if (range.getBoundingClientRect().width - (l as HTMLElement).clientWidth > 0.5) over++;
      }
      const cap = document.querySelector<HTMLElement>("#tc-caption")!;
      return {
        set: set.length, lines, over,
        longest: Math.max(...[...document.querySelectorAll(".bp-prose p")].map((e) => e.textContent!.length)),
        captionChars: cap.textContent!.length,
        captionParts: cap.querySelectorAll(".jg").length,
        captionSet: cap.classList.contains("jp-set"),
        readoutTouched: !!document.querySelector("#tc-moved-sum.jp, .tc-regs .jp"),
        sideways: document.documentElement.scrollWidth - innerWidth,
        height: document.documentElement.scrollHeight,
      };
    });
    expect(r.set).toBeGreaterThan(10);
    expect(r.lines).toBeGreaterThan(40);
    expect(r.over, "no set line is wider than its block").toBe(0);
    expect(r.longest, "no paragraph on the page is a blob").toBeLessThan(1400);
    expect(r.captionChars, "the caption is the script's, in full").toBeGreaterThan(3000);
    expect(r.captionSet, "and set by pretext").toBe(true);
    expect(r.captionParts, "as parts at sentence ends").toBeGreaterThan(3);
    expect(r.readoutTouched).toBe(false);
    expect(r.sideways).toBeLessThanOrEqual(0);
  });
}

test("the caption follows the script: a step rewrites it and it is set again", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, "/6502/tracer", 9000);
  const before = await page.evaluate(() => document.querySelector("#tc-caption")!.textContent);
  await page.click("#tc-step");
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const cap = document.querySelector<HTMLElement>("#tc-caption")!;
    return { text: cap.textContent, set: cap.classList.contains("jp-set"), parts: cap.querySelectorAll(".jg").length };
  });
  expect(r.set).toBe(true);
  expect(r.parts).toBeGreaterThan(3);
  expect(r.text!.length).toBeGreaterThan(3000);
  expect(before!.length).toBeGreaterThan(3000);
});
