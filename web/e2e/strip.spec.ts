import { test, expect } from "@playwright/test";
import { open, PHONE, DESK, STRIP_LIVE } from "./lib";

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
      const btns = kids.filter((k) => k.matches("button.tbtn:not(.fs)")) as HTMLButtonElement[];
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
        hidden: [...document.querySelectorAll("#btn-fullscreen, #cm-fullscreen, #tc-fullscreen, #sch-fullscreen, #btn-run, #bp-run, #tc-run, #ex-run, #sch-run, .dm-bar")].filter((e) => (e as HTMLElement).offsetWidth > 0).map((e) => e.id || e.className),
      };
    });
    expect(r, "the strip is on the page").not.toBeNull();
    // The primer runs its chip on load, so the key reads "pause" there.
    expect(r!.words.map((w, i) => (i === 3 ? "play|pause" : w))).toEqual(ORDER);
    expect(["play", "pause"]).toContain(r!.words[3]);
    expect(r!.play, "play is live: the chip registered").toBe(true);
    expect(r!.disabled[0], "power is disabled until the one engine").toBe(true);
    expect(r!.disabled[6], "op is disabled until the one engine").toBe(true);
    expect(r!.seekDisabled, "seek is disabled until the one engine").toBe(true);
    if (p.endsWith("/games")) {
      expect(r!.disabled.slice(1), "the console runs whole frames").toEqual([false, true, false, true, true, true]);
      expect(r!.rate).toBe(true);
    } else {
      expect(r!.disabled.slice(1, 6)).toEqual([false, false, false, false, false]);
    }
    expect(r!.last, "full screen is the last control").toBe(true);
    expect(DESK.width - r!.fsRight, "full screen at the right edge").toBeLessThanOrEqual(16);
    expect(r!.rows, "one row on a desk").toBe(1);
    expect(r!.hidden, "no second transport or fullscreen control").toEqual([]);
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
        return { keyRows: new Set(btns.map(mid)).size, sameRow: mid(fs) === mid(rate) && mid(fs) === mid(pos), fsRight: Math.round(fs.getBoundingClientRect().right), total: new Set([...row.children].map(mid)).size };
      });
      expect(r.keyRows, "the seven keys on one row").toBe(1);
      expect(r.sameRow, "rate, position and full screen share the second row").toBe(true);
      expect(r.total).toBe(2);
      expect(PHONE.width - r.fsRight).toBeLessThanOrEqual(16);
    });
  }
  test("the Lab's strip: full screen last, on the second row", async ({ page }) => {
    await open(page, "/6502/lab", 4000);
    const r = await page.evaluate(() => {
      const row = document.querySelector(".lab-shell .player .prow")!;
      const mid = (e: Element) => { const b = e.getBoundingClientRect(); return Math.round(b.top + b.height / 2); };
      const fs = row.querySelector(".tbtn.fs")!, rate = row.querySelector(".rate")!, tl = row.querySelector("#tlab")!;
      return { last: row.lastElementChild === fs, sameRow: mid(fs) === mid(rate) && mid(fs) === mid(tl), fsRight: Math.round(fs.getBoundingClientRect().right), rows: new Set([...row.children].map(mid)).size };
    });
    expect(r.last).toBe(true);
    expect(r.sameRow, "full sits with the rate and the counter, not on a third row").toBe(true);
    expect(r.rows).toBe(2);
    expect(PHONE.width - r.fsRight).toBeLessThanOrEqual(16);
  });
});
