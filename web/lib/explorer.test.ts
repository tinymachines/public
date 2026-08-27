import { describe, expect, test } from "bun:test";
import { explorer } from "./explorer";

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
