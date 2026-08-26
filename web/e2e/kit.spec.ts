import { test, expect } from "@playwright/test";
import { open, DESK, TOOL_PAGES, STRIP_LIVE } from "./lib";

/**
 * The ported pages wear the kit's edge: no 2px borders, no radius above the
 * hair except the instrument box's --radius-mod (4px). And the pages' own
 * transports are hidden where the strip honours the action.
 */
const REDUNDANT = "#btn-reset, #btn-back, #btn-run, #btn-half, #btn-cycle, #speed, #bp-run, #bp-step, #bp-cycle, #bp-reset, #bp-speed, #tc-back, #tc-run, #tc-step, #tc-cycle, #tc-reset, #tc-speed, #ex-run, #ex-step, #ex-reset, #sch-run, #sch-step, #sch-reset, #btn-fullscreen, #cm-fullscreen, #tc-fullscreen, #sch-fullscreen";

for (const p of [...TOOL_PAGES, "/6502/lab"]) {
  test(`kit edge on ${p}`, async ({ page }) => {
    await page.setViewportSize(DESK);
    await open(page, p, 9000);
    const r = await page.evaluate((redundant) => {
      const bold: string[] = [], round: string[] = [];
      let seen = 0;
      for (const el of document.querySelectorAll<HTMLElement>(".explorer-shell *, .lab-shell *")) {
        const b = el.getBoundingClientRect(); if (b.width < 8 || b.height < 8) continue;
        const cs = getComputedStyle(el); seen++;
        const name = el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : "");
        if (parseFloat(cs.borderTopWidth) >= 2 && cs.borderTopStyle !== "none") bold.push(name);
        const rad = parseFloat(cs.borderRadius);
        if (rad > 2 && !(rad === 4 && el.matches(".console, .panel")) && !cs.borderRadius.includes("%")) round.push(`${name} ${cs.borderRadius}`);
      }
      const visible = [...document.querySelectorAll<HTMLElement>(redundant)].filter((e) => e.offsetWidth > 0).map((e) => e.id);
      return { seen, bold: [...new Set(bold)].slice(0, 10), round: [...new Set(round)].slice(0, 10), visible };
    }, REDUNDANT);
    expect(r.seen, "the page rendered").toBeGreaterThan(30);
    expect(r.bold, "borders of 2px or more").toEqual([]);
    expect(r.round, "radii above the hair").toEqual([]);
    if (STRIP_LIVE.includes(p)) expect(r.visible, "a page transport beside the strip").toEqual([]);
  });
}
