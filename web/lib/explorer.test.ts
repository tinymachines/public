import { describe, expect, test } from "bun:test";
import { explorer, rootRelative } from "./explorer";

/**
 * The scoper's root-anchored selectors, on the real stylesheet. Three
 * shapes upstream style.css has, and what each must become: a condition on
 * body stays outside the scope, bare body and its pseudo-elements stay dead
 * (a lookahead that took `::` turned the page's stipple into a fixed dot
 * grid on every element's ::before; measured 2026-08-28).
 */
describe("explorer(): root-anchored selectors", () => {
  const { style } = explorer("diegraph.html");
  test("body.<class> is a condition", () => {
    expect(style).toContain("body.no-scroll .explorer-shell #view");
  });
  test("body::before stays dead", () => {
    expect(style).not.toMatch(/body \.explorer-shell ::before/);
    expect(style).toContain(".explorer-shell body::before");
  });
  test("bare body stays dead", () => {
    expect(style).toMatch(/\.explorer-shell body \{/);
  });
});

/**
 * Relative links written for the 6502 site's /<tool>/ layout, rooted here
 * (site audit, 2026-10-03: "archive/" from an article was a 404).
 */
describe("rootRelative()", () => {
  test("./ is the tool itself, with its query or anchor", () => {
    expect(rootRelative('<a href="./">x</a>', "talk")).toBe('<a href="/6502/talk">x</a>');
    expect(rootRelative('<a href="./?lab=adc&amp;step=4">x</a>', "primer")).toBe('<a href="/6502/primer?lab=adc&amp;step=4">x</a>');
    expect(rootRelative('<a href="./#credit">x</a>', "talk")).toBe('<a href="/6502/talk#credit">x</a>');
  });
  test("archive/ is the archive", () => {
    expect(rootRelative('<a href="archive/">x</a>', "designer")).toBe('<a href="/6502/archive">x</a>');
    expect(rootRelative('<a href="/archive/#top">x</a>', "talk")).toBe('<a href="/6502/archive#top">x</a>');
  });
  test("other links are left alone", () => {
    const html = '<a href="archive.org/x">a</a><a href="../">b</a><a href="https://example.com/">c</a>';
    expect(rootRelative(html, "talk")).toBe(html);
  });
  test("no tool page or article keeps a bare ./ or archive/", () => {
    for (const f of ["talk.html", "designer.html", "primer.html"]) {
      expect(explorer(f).body).not.toMatch(/href="(\.\/|archive\/)/);
    }
  });
});
