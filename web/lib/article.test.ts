import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { article, articlePages, htmlOf, isPlainInline, plain, runsOf, splitRuns, type Run } from "./article";

const SRC = path.join(process.cwd(), "..", "..", "6502", "web");

describe("the article reader", () => {
  test("every tool page with prose has an article, and the tracer's is the long one", () => {
    expect(articlePages().length).toBeGreaterThanOrEqual(17);
    const tracer = article("tracer.html");
    expect(tracer.chars).toBeGreaterThan(20000);
    expect((tracer.html.match(/<h2\b/g) ?? []).length).toBe(3);
    expect(tracer.splits, "the 20,661-character paragraph became paragraphs").toBeGreaterThan(10);
    for (const m of tracer.html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      expect(m[1].replace(/<[^>]+>/g, "").length, "no paragraph on the article is a blob").toBeLessThan(1400);
    }
    expect(tracer.html.includes("<script"), "no script rides along").toBe(false);
  });

  test("the widgets come through: slots, tables, the block page's instrument", () => {
    const primer = article("primer.html");
    const src = fs.readFileSync(path.join(SRC, "primer.html"), "utf8");
    // Counted inside the prose sections: the instrument carries four more
    // that are the figure's, not the article's.
    const srcSlots = [...src.matchAll(/<section class="wrap sec bp-prose[\s\S]*?<\/section>/g)].reduce((a, m) => a + (m[0].match(/data-fact=/g) ?? []).length, 0);
    expect(srcSlots).toBeGreaterThan(5);
    expect(primer.slots, "every [data-fact] slot the sections carry").toBe(srcSlots);
    const block = article("block.html");
    expect(block.html.includes('id="bk-svg"'), "the block page's instrument lives in its prose sections").toBe(true);
    expect(block.html.includes("<select"), "and its controls").toBe(true);
  });

  test("links point one segment deeper, at this site's tool pages", () => {
    const tracer = article("tracer.html");
    // The source writes them relative ("schematic"); one segment deeper that
    // would resolve under /6502/tracer/, where nothing answers.
    expect(tracer.html.includes('href="/6502/schematic"')).toBe(true);
    expect(tracer.html.includes('href="/6502/designer"')).toBe(true);
    expect(/href="(?:\/)?(?:block|schematic|primer|designer|trace|pinout)(?:[?#"])/.test(tracer.html), "no link left relative or at the subdomain's root").toBe(false);
  });

  test("runs keep the marks and the words, and go back to the same markup", () => {
    const inner = 'The <em>fetch</em> line, <span class="mono">abl</span>, see <a href="/block?b=alu">its page</a>.';
    expect(isPlainInline(inner)).toBe(true);
    expect(isPlainInline('A <b class="mono" data-fact="nodes">…</b> slot')).toBe(false);
    const runs = runsOf(inner);
    expect(runs).toEqual([
      { kind: "text", text: "The " }, { kind: "em", text: "fetch" }, { kind: "text", text: " line, " },
      { kind: "mono", text: "abl" }, { kind: "text", text: ", see " }, { kind: "a", text: "its page", href: "/block?b=alu" }, { kind: "text", text: "." },
    ]);
    expect(htmlOf(runs)).toBe(inner);
  });

  test("a split changes paragraph breaks and nothing else", () => {
    const src = fs.readFileSync(path.join(SRC, "tracer.html"), "utf8");
    const i = src.indexOf("<p>", src.indexOf("The tinted regions behind the graph") - 40);
    const j = src.indexOf("</p>", i);
    const original = plain(runsOf(src.slice(i + 3, j)));
    expect(original.length).toBeGreaterThan(20000);
    const parts = splitRuns(runsOf(src.slice(i + 3, j)));
    expect(parts.length).toBeGreaterThan(10);
    expect(parts.map(plain).join(" ")).toBe(original);
    // The same parts are what the article carries, in order.
    const tracer = article("tracer.html");
    const rewritten = (h: string) => h.replace(/href="\/?([a-z0-9-]+)/g, 'href="/6502/$1');
    for (const p of parts) expect(tracer.html.includes(rewritten(htmlOf(p)))).toBe(true);
    // And the split never lands inside a mono run.
    const long: Run[] = [{ kind: "text", text: "A sentence here. " }, { kind: "mono", text: "x.y" }, { kind: "text", text: " ends. " + "More words follow. ".repeat(80) }];
    for (const part of splitRuns(long, 200, 300)) for (const r of part) if (r.kind === "mono") expect(r.text).toBe("x.y");
  });

  test("a short paragraph is not split", () => {
    const runs: Run[] = [{ kind: "text", text: "One. Two. Three." }];
    expect(splitRuns(runs)).toEqual([runs]);
  });
});
