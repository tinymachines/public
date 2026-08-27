import { test, expect } from "@playwright/test";
import { open, PHONE, DESK, STRIP_LIVE, NO_SWITCH, NO_OP } from "./lib";

/**
 * The floor strip: the Lab's set on every instrument page, in order, a
 * control disabled where the page cannot honour it, full screen at the
 * right end, two rows on a phone and one on a desk.
 */
const ORDER = ["power", "start", "½", "play|pause", "½", "cyc", "op"];

for (const p of STRIP_LIVE) {
  test(`strip on ${p}`, async ({ page }) => {
    await page.setViewportSize(DESK);
    await open(page, p, 9000);
    const r = await page.evaluate(() => {
      const row = document.querySelector(".chip-transport .ct-row");
      if (!row) return null;
      const kids = [...row.children] as HTMLElement[];
      const btns = kids.filter((k) => k.matches("button.tbtn:not(.fs):not(.eng)")) as HTMLButtonElement[];
      const fs = row.querySelector<HTMLElement>(".tbtn.fs")!;
      const rate = row.querySelector<HTMLInputElement>(".ct-rate input")!;
      const seek = row.querySelector<HTMLInputElement>(".ct-seek")!;
      return {
        words: btns.map((b) => b.querySelector(".lb")!.textContent!.trim()),
        disabled: btns.map((b) => b.disabled),
        play: !btns[3].disabled,
        seekDisabled: seek.disabled, rate: rate.disabled,
        last: kids[kids.length - 1] === fs,
        fsRight: Math.round(fs.getBoundingClientRect().right),
        rows: new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2))).size,
        engines: row.querySelectorAll(".tbtn.eng").length + row.querySelectorAll(".ct-engine").length,
        engineWord: row.querySelector(".tbtn.eng .lb")?.textContent?.trim(),
        hidden: [...document.querySelectorAll("#btn-fullscreen, #cm-fullscreen, #tc-fullscreen, #sch-fullscreen, #btn-run, #bp-run, #tc-run, #ex-run, #sch-run, #tr-run, #hs-run, .dm-bar, .lab-shell .player")].filter((e) => (e as HTMLElement).offsetWidth > 0).map((e) => e.id || e.className),
      };
    });
    expect(r, "the strip is on the page").not.toBeNull();
    // The primer runs its chip on load, so the key reads "pause" there.
    expect(r!.words.map((w, i) => (i === 3 ? "play|pause" : w))).toEqual(ORDER);
    expect(["play", "pause"]).toContain(r!.words[3]);
    expect(r!.disabled[0], "power is a real key").toBe(NO_SWITCH.includes(p));
    if (p.endsWith("/games")) {
      // Off until a cartridge boots, so every other key is grey; engine.spec
      // boots it and reads the set it then offers.
      expect(r!.disabled.slice(1), "the console is off until it boots").toEqual([true, true, true, true, true, true]);
      expect(r!.seekDisabled).toBe(true);
      expect(r!.rate).toBe(true);
    } else {
      expect(r!.play, "play is live: the chip registered").toBe(true);
      expect(r!.disabled.slice(1), "every key the driver offers is live").toEqual([false, false, false, false, false, NO_OP.includes(p)]);
      expect(r!.seekDisabled, "seek is live").toBe(false);
    }
    expect(r!.last, "full screen is the last control").toBe(true);
    expect(DESK.width - r!.fsRight, "full screen at the right edge").toBeLessThanOrEqual(16);
    expect(r!.rows, "one row on a desk").toBe(1);
    expect(r!.hidden, "no second transport or fullscreen control").toEqual([]);
    expect(r!.engines, "one engine key, a toggle").toBe(1);
    expect(r!.engineWord, "the key names the engine that is stepping").toMatch(/^(local|api)$/);
    // The version on every page (owner's call, 2026-08-27), strip pages
    // included: the footer is in the flow on a workbench and on the status
    // page of the console. It reads the running API, so it arrives late.
    await expect(page.locator(".site-foot .foot-run")).toHaveText(/v\d+\.\d+\.\d+ · [0-9a-f]{7} up /, { timeout: 10000 });
  });
}

test.describe("phone", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const p of STRIP_LIVE) {
    test(`two rows on ${p}`, async ({ page }) => {
      await open(page, p, 9000);
      const r = await page.evaluate(() => {
        const row = document.querySelector(".chip-transport .ct-row")!;
        const mid = (e: Element) => { const b = e.getBoundingClientRect(); return Math.round(b.top + b.height / 2); };
        const btns = [...row.querySelectorAll("button.tbtn:not(.fs)")];
        const fs = row.querySelector(".tbtn.fs")!, rate = row.querySelector(".ct-rate")!, pos = row.querySelector(".ct-pos")!;
        return { keyRows: new Set(btns.map(mid)).size, fsWithKeys: Math.abs(mid(fs) - mid(btns[0])) <= 3, secondRow: mid(rate) === mid(pos) && mid(rate) > mid(btns[0]), fsRight: Math.round(fs.getBoundingClientRect().right), total: new Set([...row.children].map(mid)).size };
      });
      expect(r.keyRows, "the eight keys, the engine among them, on one row").toBe(1);
      expect(r.fsWithKeys, "full screen on the key row, at its right end").toBe(true);
      expect(r.secondRow, "rate and position share the second row").toBe(true);
      expect(r.total).toBe(2);
      expect(PHONE.width - r.fsRight).toBeLessThanOrEqual(16);
    });
  }
});
