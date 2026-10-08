import { test, expect } from "bun:test";
import { menuGroups } from "./nav";
import { hintIn } from "./i18n";

/**
 * Every hint in the menu reads Japanese on /ja. A hint is the first
 * sentence of a page's description without its full stop, and the
 * dictionary is keyed by the whole description, so a plain lookup missed
 * and the hints stayed English beside Japanese labels until hintIn learned
 * to find the description a hint begins. The range is written as escapes,
 * as lib/i18n.ts explains: the card's font check reads this tree for
 * Japanese it must draw, and a range's endpoints are not copy.
 */
test("every menu hint has a Japanese line", () => {
  const hints = menuGroups().flatMap((g) => g.items.map((i) => i.hint)).filter((h): h is string => !!h);
  expect(hints.length, "the menu has hints; the test would pass on nothing").toBeGreaterThan(3);
  const english = hints.filter((h) => !/[\u3040-\u30FF\u3400-\u9FFF]/.test(hintIn("ja", h)));
  expect(english).toEqual([]);
  for (const h of hints) expect(hintIn("en", h)).toBe(h);
});
