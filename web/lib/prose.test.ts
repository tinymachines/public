import { describe, expect, test } from "bun:test";
import { explorer } from "./explorer";
import { cutsOf, foldSection, splitText, splitParagraphs, LONG } from "./prose";

describe("long paragraphs, split at sentence ends", () => {
  test("the tool page itself carries the split: no paragraph on the tracer is a blob", () => {
    const x = explorer("tracer.html");
    expect(x.splits, "the 23,000-character paragraph became paragraphs").toBeGreaterThan(10);
    const prose = x.body.match(/<section class="wrap sec bp-prose[\s\S]*?<\/section>/g) ?? [];
    expect(prose.length).toBeGreaterThan(0);
    for (const sec of prose) for (const m of sec.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      expect(m[1].replace(/<[^>]+>/g, "").length).toBeLessThan(1400);
    }
    // And the instrument above it is not touched: the caption's paragraph
    // keeps its id (the script asks for it by name).
    expect(x.body.includes('<p class="bk-foot muted" id="tc-caption"></p>')).toBe(true);
  });

  test("a plain string is cut the way the markup is, and joins back", () => {
    const s = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} says a thing about a node.`).join(" ");
    expect(s.length).toBeGreaterThan(LONG);
    const parts = splitText(s);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(p.length).toBeLessThan(1400);
    expect(parts.join(" ")).toBe(s);
    expect(splitText("Short. Text.")).toEqual(["Short. Text."]);
    expect(cutsOf("a".repeat(2000)), "no sentence end, no cut").toEqual([]);
  });

  test("a paragraph with an id, or a widget, is left alone", () => {
    const long = "A sentence. ".repeat(200);
    expect(splitParagraphs(`<p id="x">${long}</p>`).splits).toBe(0);
    expect(splitParagraphs(`<p>A <b data-fact="n">…</b> ${long}</p>`).splits).toBe(0);
    expect(splitParagraphs(`<p>${long}</p>`).splits).toBeGreaterThan(1);
  });
});

describe("the fold after a section's opening", () => {
  test("the tracer's prose folds; the block page's instrument does not", () => {
    const x = explorer("tracer.html", "Read on");
    expect(x.folds).toBeGreaterThan(0);
    const folded = x.body.match(/<details class="read-on"><summary>Read on<\/summary>[\s\S]*?<\/details>/g) ?? [];
    expect(folded.length).toBe(x.folds);
    // Three paragraphs before each fold, the long one inside it.
    for (const sec of x.body.match(/<section class="wrap sec bp-prose[\s\S]*?<\/section>/g) ?? []) {
      const before = sec.split("<details")[0];
      if (sec.includes("<details")) expect((before.match(/<p\b(?![^>]*eyebrow)/g) ?? []).length, "three paragraphs before the fold, the eyebrow not counted").toBe(3);
    }
    const inside = folded.join("").replace(/<[^>]+>/g, "").length;
    expect(inside, "most of the page's prose is behind the fold").toBeGreaterThan(15000);
    const block = explorer("block.html", "Read on");
    for (const d of block.body.match(/<details class="read-on"[\s\S]*?<\/details>/g) ?? []) {
      expect(d.includes('id="bk-svg"'), "the instrument is never folded away").toBe(false);
    }
    expect(explorer("tracer.html").folds, "without a label nothing folds: the article is the rest").toBe(0);
  });

  test("a short remainder is not folded", () => {
    const p = "<p>One sentence here.</p>";
    const sec = `<section class="wrap sec bp-prose">${p}${p}${p}${p}</section>`;
    expect(foldSection(sec, "Read on").folded).toBe(false);
    const long = `<section class="wrap sec bp-prose">${p}${p}${p}<p>${"A sentence. ".repeat(150)}</p></section>`;
    expect(foldSection(long, "Read on").folded).toBe(true);
  });
});
