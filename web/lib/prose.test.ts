import { describe, expect, test } from "bun:test";
import { explorer } from "./explorer";
import { cutsOf, splitText, splitParagraphs, LONG } from "./prose";

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
