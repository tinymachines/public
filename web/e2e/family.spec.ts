import { test, expect } from "@playwright/test";
import { DESK, open } from "./lib";
import { ELECTRIC, FAMILY } from "../lib/family-data";

/**
 * The footer's family dots are the family's registry (meatball-labs/family,
 * copied in as lib/family-data.ts by scripts/sync-family.sh): one dot per
 * hue in its order, this site's marked, a site with an address linked, a
 * reserved one named but not linked, an open hue silent; then the electric
 * set the same way, each dot in its core tone.
 */

test("the footer's dots are the family registry, in its order", async ({ page }) => {
  expect(FAMILY.length, "the registry holds hues; the spec would pass on nothing").toBeGreaterThan(1);
  await page.setViewportSize(DESK);
  await open(page, "/", 500);
  const dots = page.locator("nav.family .family-dot");
  await expect(dots).toHaveCount(FAMILY.length + ELECTRIC.length);
  for (const [i, f] of FAMILY.entries()) {
    const d = dots.nth(i);
    await expect(d).toHaveAttribute("data-hue", f.hue);
    if (f.hue === "iris") {
      await expect(d).toHaveAttribute("aria-current", "page");
    } else if (f.href && f.name) {
      await expect(d).toHaveAttribute("href", f.href);
      await expect(d).toHaveAttribute("aria-label", f.name);
    } else if (f.reserved && f.name) {
      expect(await d.evaluate((e) => e.tagName)).toBe("SPAN");
      await expect(d).toHaveAttribute("aria-label", `${f.name}, coming`);
    } else {
      await expect(d).toHaveAttribute("aria-hidden", "true");
    }
  }
  for (const [j, e] of ELECTRIC.entries()) {
    const d = dots.nth(FAMILY.length + j);
    await expect(d).toHaveAttribute("data-electric", e.id);
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(e.tones.core.slice(k, k + 2), 16));
    expect(await d.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(`rgb(${r}, ${g}, ${b})`);
    if (e.href && e.who && !e.reserved) {
      await expect(d).toHaveAttribute("href", e.href);
      await expect(d).toHaveAttribute("aria-label", e.who);
    } else if (e.reserved && e.who) {
      await expect(d).toHaveAttribute("aria-label", `${e.who}, coming`);
    } else {
      await expect(d).toHaveAttribute("aria-hidden", "true");
    }
  }
});
