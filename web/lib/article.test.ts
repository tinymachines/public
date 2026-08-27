import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { article, articlePages, plain, runsOf, splitRuns, type Run } from "./article";

describe("the article reader", () => {
  test("every tool page with prose has an article, and the tracer's is the long one", () => {
    const pages = articlePages();
    expect(pages.length).toBeGreaterThanOrEqual(17);
    const tracer = article("tracer.html");
    expect(tracer.chars).toBeGreaterThan(20000);
    expect(tracer.blocks.filter((b) => b.kind === "h2").length).toBe(3);
    expect(tracer.splits, "the 20,661-character paragraph became paragraphs").toBeGreaterThan(10);
    // No paragraph on the article is a blob any more.
    for (const b of tracer.blocks) if (b.kind === "p") expect(plain(b.runs).length).toBeLessThan(1400);
  });

  test("runs keep the marks and the words", () => {
    const runs = runsOf('The <em>fetch</em> line, <span class="mono">abl</span>, see <a href="/block?b=alu">its page</a> and <a href="/">home</a>.');
    expect(runs).toEqual([
      { kind: "text", text: "The " }, { kind: "em", text: "fetch" }, { kind: "text", text: " line, " },
      { kind: "mono", text: "abl" }, { kind: "text", text: ", see " }, { kind: "a", text: "its page", href: "/6502/block?b=alu" },
      { kind: "text", text: " and " }, { kind: "a", text: "home", href: "/6502/explorer" }, { kind: "text", text: "." },
    ]);
  });

  test("a split changes paragraph breaks and nothing else", () => {
    const tracer = article("tracer.html");
    // Rebuild the long paragraph's text from the article and compare to the
    // source paragraph: the words are the author's, joined by the one space
    // each split consumed.
    const src = fs.readFileSync(path.join(process.cwd(), "..", "..", "6502", "web", "tracer.html"), "utf8");
    const i = src.indexOf("The tinted regions behind the graph");
    const j = src.indexOf("</p>", i);
    const original = plain(runsOf(src.slice(i, j)));
    const parts = tracer.blocks.filter((b): b is { kind: "p"; runs: Run[] } => b.kind === "p" && plain(b.runs).startsWith("The tinted regions"));
    expect(parts.length).toBe(1);
    const idx = tracer.blocks.indexOf(parts[0]);
    let joined = plain(parts[0].runs);
    for (let k = idx + 1; k < tracer.blocks.length; k++) {
      const b = tracer.blocks[k];
      if (b.kind !== "p") break;
      const t = plain(b.runs);
      if (!original.includes(t.slice(0, 40))) break;
      joined += " " + t;
    }
    expect(joined).toBe(original);
    // And the split never lands inside a mono run.
    const long: Run[] = [{ kind: "text", text: "A sentence here. " }, { kind: "mono", text: "x.y" }, { kind: "text", text: " ends. " + "More words follow. ".repeat(80) }];
    for (const part of splitRuns(long, 200)) for (const r of part) if (r.kind === "mono") expect(r.text).toBe("x.y");
  });

  test("a short paragraph is not split", () => {
    const runs: Run[] = [{ kind: "text", text: "One. Two. Three." }];
    expect(splitRuns(runs)).toEqual([runs]);
  });
});
