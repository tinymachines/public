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
        captionHidden: cap.offsetHeight === 0 && cap.classList.contains("jp-long"),
        readoutTouched: !!document.querySelector("#tc-moved-sum.jp, .tc-regs .jp"),
        sideways: document.documentElement.scrollWidth - innerWidth,
        height: document.documentElement.scrollHeight,
      };
    });
    // Only what is on screen is set: the lede, the opening paragraphs and
    // the first peek; everything after the first closed fold waits.
    expect(r.set).toBeGreaterThan(2);
    expect(r.lines).toBeGreaterThan(10);
    expect(r.over, "no set line is wider than its block").toBe(0);
    expect(r.longest, "no paragraph on the page is a blob").toBeLessThan(1400);
    expect(r.captionChars, "the caption is still the script's, in the document").toBeGreaterThan(3000);
    expect(r.captionHidden, "and hidden: longer than a paragraph, nobody reads it there").toBe(true);
    expect(r.readoutTouched).toBe(false);
    expect(r.sideways).toBeLessThanOrEqual(0);
  });
}

test("the caption stays hidden after the script rewrites it on a step", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, "/6502/tracer", 9000);
  await page.evaluate(() => (document.querySelector("#tc-step") as HTMLButtonElement).click());
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const c = document.querySelector<HTMLElement>("#tc-caption")!; return { len: c.textContent!.length, hidden: c.offsetHeight === 0 }; });
  expect(r.len).toBeGreaterThan(3000);
  expect(r.hidden).toBe(true);
});

test("the prose folds chunk by chunk under its headings, each with a faded peek; opening one sets the rest", async ({ page }) => {
  test.slow();
  await page.setViewportSize(PHONE);
  await open(page, "/6502/tracer", 9000);
  const before = await page.evaluate(() => {
    const folds = [...document.querySelectorAll<HTMLElement>(".read-on")];
    const peekShown = folds.filter((f) => (f.querySelector(".peek") as HTMLElement).offsetHeight > 0).length;
    const peekClipped = folds.filter((f) => { const pk = f.querySelector(".peek") as HTMLElement; return pk.scrollHeight > pk.clientHeight; }).length;
    return {
      h: document.documentElement.scrollHeight,
      chunks: document.querySelectorAll("h3.chunk").length,
      folds: folds.length,
      closed: document.querySelectorAll(".read-on details:not([open])").length,
      peekShown, peekClipped,
      pointer: getComputedStyle(document.querySelector(".read-on summary")!, "::after").content,
      set: document.querySelectorAll(".jp-set").length,
    };
  });
  expect(before.chunks).toBe(12);
  expect(before.folds).toBe(12);
  expect(before.closed).toBe(12);
  expect(before.peekShown, "one fold shows its peek: the first; the rest wait").toBe(1);
  expect(before.peekClipped, "and the peek is cut short, fading").toBe(1);
  // Open the first: the second becomes the one showing.
  await page.evaluate(() => { (document.querySelector(".read-on details") as HTMLDetailsElement).open = true; });
  await page.waitForTimeout(300);
  const walked = await page.evaluate(() => {
    const folds = [...document.querySelectorAll<HTMLElement>(".read-on")];
    const showing = folds.map((f, i) => (f.querySelector("summary") as HTMLElement).offsetHeight > 0 ? i : -1).filter((i) => i >= 0);
    const heads = [...document.querySelectorAll<HTMLElement>("h3.chunk")].filter((h) => h.offsetHeight > 0).length;
    return { showing, heads };
  });
  expect(walked.showing, "the opened fold's summary is gone; the closed second is the one showing; the rest wait").toEqual([1]);
  expect(walked.heads, "two chunk headings are on the page").toBe(2);
  expect(before.pointer).toContain("\u203a");
  expect(before.h, "a phone's scroll with the prose folded").toBeLessThan(14000);
  const edges = await page.evaluate(() => ({
    summary: document.querySelector(".read-on > details > summary")!.getBoundingClientRect().left,
    link: document.querySelector(".wb-article-link a")!.getBoundingClientRect().left,
  }));
  expect(Math.abs(edges.link - edges.summary), "the article link lines up with the folds' summaries").toBeLessThan(1);
  await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>(".read-on details").forEach((d) => { d.open = true; }));
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => {
    let over = 0;
    for (const l of document.querySelectorAll(".read-on details .jp-set .jl:not(.jl-last)")) {
      const range = document.createRange(); range.selectNodeContents(l);
      if (range.getBoundingClientRect().width - (l as HTMLElement).clientWidth > 0.5) over++;
    }
    const peeks = [...document.querySelectorAll<HTMLElement>(".read-on .peek")].filter((p) => p.offsetHeight > 0).length;
    return { h: document.documentElement.scrollHeight, set: document.querySelectorAll(".jp-set").length, over, peeks };
  });
  expect(after.peeks, "open, the peeks go").toBe(0);
  expect(after.set).toBeGreaterThan(30);
  expect(after.over).toBe(0);
  expect(after.h).toBeGreaterThan(before.h * 1.5);
});

test("a page without chunks folds per heading block: /6502/exploded shows its three headings, each over a peek and Read on", async ({ page }) => {
  test.slow();
  await page.setViewportSize(PHONE);
  await open(page, "/6502/exploded", 9000);
  const r = await page.evaluate(() => {
    const heads = [...document.querySelectorAll<HTMLElement>(".bp-prose .sec-head h2")];
    return {
      headings: heads.length,
      visible: heads.filter((h) => h.offsetHeight > 0).length,
      folds: document.querySelectorAll(".read-on").length,
      closed: document.querySelectorAll(".read-on details:not([open])").length,
      peeks: [...document.querySelectorAll<HTMLElement>(".read-on .peek")].filter((p) => p.offsetHeight > 0 && p.scrollHeight > p.clientHeight).length,
      h: document.documentElement.scrollHeight,
    };
  });
  expect(r.headings).toBe(3);
  expect(r.visible, "the first heading shows; the others wait behind the travelling Read on").toBe(1);
  expect(r.folds).toBe(3);
  expect(r.closed).toBe(3);
  expect(r.peeks, "one clipped peek shows").toBe(1);
});
