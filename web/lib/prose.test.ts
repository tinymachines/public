import { describe, expect, test } from "bun:test";
import { explorer } from "./explorer";
import { cutsOf, chunkSection, foldSection, splitText, splitParagraphs, LONG } from "./prose";
import { article } from "./article";

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

describe("the chunks, from data/articles.json", () => {
  test("every chunk anchor is on the tracer, starts a paragraph, and gets its heading; the tool page folds each, the article none", () => {
    const x = explorer("tracer.html", "Read on");
    expect(x.chunks).toBe(12);
    expect(x.folds).toBe(12);
    const heads = x.body.match(/<h3 class="chunk" id="([^"]+)">([^<]+)<\/h3>/g) ?? [];
    expect(heads.length).toBe(12);
    expect(new Set(heads).size, "ids are unique").toBe(12);
    // Each heading is followed by its fold: a peek of the chunk's first
    // paragraph, then the details holding it.
    const folds = x.body.match(/<h3 class="chunk"[^>]*>[^<]+<\/h3>\n<div class="read-on"><div class="peek" aria-hidden="true"><p>[\s\S]*?<\/p><\/div><details><summary>Read on<\/summary>[\s\S]*?<\/details><\/div>/g) ?? [];
    expect(folds.length).toBe(12);
    // The chunk boundaries are paragraph breaks at the anchors' sentences.
    expect(x.body).toContain('<p>The double-ringed beads are the interrupt logic');
    expect(x.body).toContain('<p>The amber beads are the store-data pipeline');
    // The section's later heading blocks are not inside a chunk's fold.
    for (const f of folds) expect(f.includes("sec-head")).toBe(false);
    // No paragraph on the page is a blob, still.
    for (const m of x.body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) expect(m[1].replace(/<[^>]+>/g, "").length).toBeLessThan(1400);
    // The article: the same headings, nothing folded.
    const a = article("tracer.html");
    expect(a.chunks).toBe(12);
    expect(a.html.includes("<details")).toBe(false);
    expect((a.html.match(/<h3 class="chunk"/g) ?? []).length).toBe(12);
    expect(explorer("tracer.html").folds, "without a label nothing folds").toBe(0);
  });

  test("an anchor the page does not carry fails the build", () => {
    const html = '<section class="wrap sec bp-prose"><p>One thing. Another thing.</p></section>';
    const r = splitParagraphs(html, [{ heading: "H", at: "Another thing" }, { heading: "G", at: "Nowhere" }]);
    expect([...r.found]).toEqual(["Another thing"]);
    expect(r.html).toBe('<section class="wrap sec bp-prose"><p>One thing.</p>\n<p>Another thing.</p></section>');
    expect(chunkSection(r.html, [{ heading: "H", at: "Another thing" }], "Read on").folds).toBe(1);
  });

  test("a chunk shorter than a fold is worth still folds; a chunk with a widget does not", () => {
    const sec = '<section class="wrap sec bp-prose"><p>Opening.</p><p>Chunk one starts here.</p><p>Chunk two <b data-fact="n">…</b> here.</p></section>';
    const r = chunkSection(sec, [{ heading: "One", at: "Chunk one" }, { heading: "Two", at: "Chunk two" }], "Read on");
    expect(r.chunks).toBe(2);
    expect(r.folds).toBe(1);
    expect(r.html).toContain('<h3 class="chunk" id="two">Two</h3>\n<p>Chunk two');
  });
});

describe("the fold after a section's opening", () => {
  test("a page without chunks folds per heading block, its heading and lede outside; a widget block and the block page's instrument never", () => {
    const pages = ["exploded", "schematic", "halfshot", "timing", "decode", "primer", "trace", "talk", "chipmap", "block", "designer", "pinout", "diegraph", "blueprint", "programs", "blockdiagram"];
    for (const f of pages) {
      const x = explorer(f + ".html", "Read on");
      expect(x.chunks).toBe(0);
      for (const d of x.body.match(/<details>[\s\S]*?<\/details>/g) ?? []) {
        expect(d.includes("sec-head"), `${f}: no heading inside a fold`).toBe(false);
        expect(d.includes('class="lede"'), `${f}: no lede inside a fold`).toBe(false);
        expect(/<(div|table|button|select|svg|figure|input|form|canvas)\b|data-fact=/.test(d), `${f}: no widget inside a fold`).toBe(false);
      }
    }
    const ex = explorer("exploded.html", "Read on");
    expect(ex.folds, "the exploded page: one fold per heading block").toBe(3);
    expect((ex.body.match(/<div class="sec-head">/g) ?? []).length).toBe(3);
    expect(explorer("primer.html", "Read on").folds, "the primer's blocks carry the script's slots and demos: nothing folds").toBe(0);
    expect(explorer("block.html", "Read on").body.includes('id="bk-svg"')).toBe(true);
  });

  test("a heading block shorter than a fold is worth is not folded", () => {
    const head = '<div class="sec-head"><p class="eyebrow">E</p><h2>H</h2></div>';
    const p = "<p>One sentence here.</p>";
    const short = `<section class="wrap sec bp-prose">${head}<p class="lede">Lede.</p>${p}${p}</section>`;
    expect(foldSection(short, "Read on").folded).toBe(0);
    const long = `<section class="wrap sec bp-prose">${head}<p class="lede">Lede.</p><p>${"A sentence. ".repeat(60)}</p></section>`;
    const r = foldSection(long, "Read on");
    expect(r.folded).toBe(1);
    expect(r.html.indexOf('class="lede"')).toBeLessThan(r.html.indexOf("<details"));
});

  test("the headline is two tones: the clause after the first comma in the accent, as the explorer's own", () => {
    const x = explorer("tracer.html");
    expect(x.body).toContain('<h1>The whole circuit, <span class="hl">one half-cycle at a time.</span></h1>');
    const idx = explorer("index.html");
    expect((idx.body.match(/class="hl"/g) ?? []).length, "the explorer's own span is left as it is").toBe(1);
  });
});
