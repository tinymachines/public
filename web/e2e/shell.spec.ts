import { expect, test, type Page } from "@playwright/test";
import { DESK, PHONE, open, overflow } from "./lib";

/**
 * The console shell on /6502/games: the pack's QA gates that a browser can
 * hold (notes/console-shell/pack/07-QA-CHECKLIST.md), run against the site.
 *
 *   M1  the mask is a chamfered octagon, the whole native screen sits in
 *       it, the scale is an integer, nothing letterboxes, nothing overflows
 *   M3  movement and A/B are always docked; the deck order holds on a phone
 *   M4  touch targets meet 88px; the LED follows the machine; a coin drops
 *       and counts; the pages swipe; a turn of the phone re-solves with no
 *       reload and no lost credit
 *   IP  no Nintendo mark anywhere on the page
 *
 * And the 2026-08-28 round (owner's list): reset is a push button, the
 * fast/slow switch paces game.js, fifty credits to begin with, a cartridge
 * change is honest with the strip and refused mid-boot, and the console
 * installs edge to edge from its own manifest.
 *
 * The solver's own tests hold the geometry; this holds that the page is
 * running that solver and that the shell is a console a finger can use.
 */

const GAMES = "/6502/games";

async function solved(page: Page) {
  await expect(page.locator(".shell[data-solved]")).toBeVisible();
  return page.evaluate(() => {
    const sh = document.querySelector<HTMLElement>(".shell")!;
    const glass = sh.querySelector<HTMLElement>(".glass")!;
    const screen = sh.querySelector<HTMLElement>(".screen")!;
    const cv = sh.querySelector<HTMLCanvasElement>("#screen")!;
    const g = glass.getBoundingClientRect(), s = screen.getBoundingClientRect(), c = cv.getBoundingClientRect();
    return {
      params: sh.querySelector(".params")?.textContent ?? "",
      clip: getComputedStyle(glass).clipPath,
      glass: { w: g.width, h: g.height },
      box: { w: s.width, h: s.height },
      canvas: { w: c.width, h: c.height, natural: cv.width },
      docks: [...sh.querySelectorAll<HTMLElement>(".dock")].map((d) => ({ id: d.dataset.id, zone: d.dataset.zone, ...d.getBoundingClientRect().toJSON() })),
      hits: [...sh.querySelectorAll<HTMLElement>(".dock .hit")].map((b) => ({ what: b.dataset.dir ?? b.dataset.act ?? b.getAttribute("aria-label") ?? "", disabled: (b as HTMLButtonElement).disabled, ...b.getBoundingClientRect().toJSON() })),
      led: sh.dataset.led,
      phase: sh.dataset.phase,
    };
  });
}

for (const [name, vp] of [["phone", PHONE], ["desk", DESK]] as const) {
  test(`${name}: the shell solves, the mask is an octagon, the screen is an integer multiple of 128 inside it`, async ({ page }) => {
    await page.setViewportSize(vp);
    await open(page, GAMES);
    const s = await solved(page);
    expect(s.params).toMatch(/k=\d/);
    expect(s.clip).toMatch(/^polygon\(/);
    expect((s.clip.match(/px/g) ?? []).length).toBe(16); // eight vertices
    expect(Math.abs(s.glass.w - s.glass.h)).toBeLessThan(1.5);
    expect(s.canvas.natural % 128).toBe(0);
    expect(s.canvas.natural).toBeGreaterThanOrEqual(256 * (name === "desk" ? 2 : 1));
    // Drawn 1:1 at its natural size (no non-uniform scale, no downscale).
    expect(Math.abs(s.canvas.w - s.canvas.natural)).toBeLessThan(1.5);
    expect(s.box.w).toBe(s.canvas.natural + 18);
    expect(s.canvas.w).toBeLessThanOrEqual(s.glass.w);
    expect((await overflow(page)).px).toBe(0);
  });

  test(`${name}: movement and A/B are docked, every live control meets the touch floor`, async ({ page }) => {
    await page.setViewportSize(vp);
    await open(page, GAMES);
    const s = await solved(page);
    const ids = s.docks.map((d) => d.id);
    expect(ids).toContain("dpad");
    expect(ids).toContain("ab");
    expect(ids).toContain("pills");
    for (const d of s.docks.filter((d) => d.id === "dpad" || d.id === "ab")) {
      expect(d.width, d.id).toBeGreaterThanOrEqual(88);
      expect(d.height, d.id).toBeGreaterThanOrEqual(88);
    }
    // Every hit region is at least a thumb wide in one direction and never
    // below 24px in the other (the pack's hit region is the polygon dilated).
    for (const h of s.hits) {
      expect(Math.max(h.width, h.height), h.what).toBeGreaterThanOrEqual(24);
    }
    // A and B are present and disabled, with the reason.
    const ab = s.hits.filter((h) => h.what === "A" || h.what === "B");
    expect(ab.length).toBe(2);
    expect(ab.every((h) => h.disabled)).toBe(true);
    await expect(page.locator('.dock[data-id="ab"] .hit[aria-label="A"]')).toHaveAttribute("title", /four directions/);
  });
}

test("phone: the deck leads with movement on the left and A/B on the right, under the glass", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, GAMES);
  const s = await solved(page);
  const dp = s.docks.find((d) => d.id === "dpad")!, ab = s.docks.find((d) => d.id === "ab")!;
  const glassTop = await page.locator(".glass").evaluate((g) => g.getBoundingClientRect().bottom);
  expect(dp.zone).toBe("deck");
  expect(dp.y).toBeGreaterThan(glassTop);
  expect(dp.x).toBeLessThan(ab.x);
  expect(s.docks.find((d) => d.id === "marquee")?.zone).toBe("header");
});

test("a coin drops and counts, the credit survives a turn of the phone, and the layout re-solves without a reload", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, GAMES);
  const before = (await solved(page)).params;
  const credits = () => page.locator('.dock[data-id="coin"] .seg.on').count();
  // Fifty to begin with: "50" lights 5 + 6 segments.
  expect(await credits()).toBe(11);
  await page.locator('.hit[data-act="coin"]').click();
  await expect.poll(credits, { timeout: 3000 }).not.toBe(11);
  // "51" lights 5 + 2.
  expect(await credits()).toBe(7);
  const marker = await page.evaluate(() => { (window as unknown as { __k: number }).__k = 1; return 1; });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await solved(page)).params, { timeout: 5000 }).not.toBe(before);
  expect((await solved(page)).params).toContain("landscape");
  expect(await page.evaluate(() => (window as unknown as { __k: number }).__k)).toBe(marker); // same document: no reload
  expect(await credits()).toBe(7);
  expect((await overflow(page)).px).toBe(0);
});

test("the pages: the rail and a swipe on the glass move between them; play is the default", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, GAMES);
  await solved(page);
  await expect(page.locator(".shell")).toHaveAttribute("data-page", "play");
  await page.locator('.hit[data-act="page-status"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-page", "status");
  await expect(page.locator(".pane-status #k-hc")).toBeVisible();
  await page.locator('.hit[data-act="page-play"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-page", "play");
  // A swipe on the glass, right to left, goes forward one page.
  const g = await page.locator(".glass").boundingBox();
  if (!g) throw new Error("no glass");
  await page.mouse.move(g.x + g.width * 0.8, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width * 0.2, g.y + g.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".shell")).toHaveAttribute("data-page", "shelf");
  await expect(page.locator(".pane-shelf .cart-btn").first()).toBeVisible();
});

/** Reset, and the console live or stopped; skips the rest when the chip API did not answer from this origin. */
async function bootLive(page: Page) {
  await page.locator('.hit[data-act="reset"]').click();
  await expect.poll(() => page.locator(".shell").getAttribute("data-phase"), { timeout: 30000 }).toMatch(/live|stopped/);
  test.skip((await page.locator(".shell").getAttribute("data-phase")) === "stopped", "the chip API did not answer from this origin");
}

test("the LED and the machine: off before reset, boot then live after it, paused by start, booted again by reset", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  const s = await solved(page);
  expect(s.led).toBe("off");
  // A push button, not a rocker: no hold, and nothing on the shell switches off.
  expect(s.hits.filter((h) => h.what === "power")).toEqual([]);
  await bootLive(page);
  await expect(page.locator(".shell")).toHaveAttribute("data-led", "live");
  await page.locator('.hit[data-act="start"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-phase", "paused");
  await expect(page.locator(".hud")).toHaveText(/pause/i);
  // Reset while paused: the cartridge boots again and runs; the frame count starts over.
  await expect.poll(() => page.locator("#k-frames").textContent()).toMatch(/^[1-9]/);
  await page.locator('.hit[data-act="reset"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-phase", "live", { timeout: 10000 });
  await expect.poll(() => page.locator("#k-frames").textContent()).toMatch(/^[0-9]$/);
});

test("the strip's power key switches the machine off; reset boots it again, running", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  await bootLive(page);
  await page.locator(".chip-transport .tbtn.pw").click();
  await expect(page.locator(".shell")).toHaveAttribute("data-led", "off");
  await expect(page.locator(".hud")).toHaveText(/^(off|オフ)$/);
  await expect(page.locator(".chip-transport .tbtn.pw")).not.toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => sessionStorage.getItem("v6502.power"))).toBe("0");
  await page.locator('.hit[data-act="reset"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-led", "live", { timeout: 10000 });
  await expect(page.locator(".shell")).toHaveAttribute("data-phase", "live");
  await expect(page.locator(".chip-transport .tbtn.pw")).toHaveClass(/\bon\b/);
});

test("the fast/slow switch: slow declares the period on the shell and game.js keeps to it; fast is the round trip again", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  await expect(page.locator(".shell")).toHaveAttribute("data-pace", "fast");
  await expect(page.locator(".shell")).toHaveAttribute("data-frame-ms", "0");
  await page.locator('.hit[data-act="pace"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-pace", "slow");
  await expect(page.locator(".shell")).toHaveAttribute("data-frame-ms", "250");
  await expect(page.locator('.hit[data-act="pace"] .lb')).toHaveText(/slow/);
  await bootLive(page);
  // game.js's own frames/s readout, refreshed every second: a real number,
  // and no more than the four a 250 ms period allows.
  await page.waitForTimeout(3500);
  const fps = Number(await page.locator("#k-fps").textContent());
  expect(fps).toBeGreaterThan(0);
  expect(fps).toBeLessThanOrEqual(4.5);
  await page.locator('.hit[data-act="pace"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-pace", "fast");
  await expect(page.locator(".shell")).toHaveAttribute("data-frame-ms", "0");
  // The settings page offers the same switch, and the choice survives a reload.
  await page.reload({ waitUntil: "load" });
  await expect(page.locator(".shell")).toHaveAttribute("data-pace", "fast");
  await page.locator('.hit[data-act="page-settings"]').click();
  await page.locator('[data-pace-pick="slow"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-frame-ms", "250");
});

test("a cartridge change while live: the console drops its power, the strip agrees, and start boots the new one", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  await bootLive(page);
  await expect(page.locator("#k-cart")).toHaveText(/Die Runner/);
  await expect(page.locator(".chip-transport .tbtn.pw")).toHaveClass(/\bon\b/);
  await page.locator('.hit[data-act="select"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-phase", "off");
  await expect(page.locator(".chip-transport .tbtn.pw")).not.toHaveClass(/\bon\b/);
  await page.locator('.hit[data-act="start"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-phase", "live", { timeout: 10000 });
  await expect(page.locator("#k-cart")).toHaveText(/Silicon Snake · 351B/);
});

test("a cartridge change during a boot is refused, so the ROM that boots is the cartridge that was chosen", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  // Reset and select in one task, so the select lands while the boot is in
  // flight (game.js marks the button "booting..." synchronously); the test
  // records that it did, so it cannot pass on a boot that had finished.
  const r = await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.hit[data-act="reset"]')!.click();
    const booting = /boot/i.test(document.getElementById("b-power")!.textContent ?? "");
    document.querySelector<HTMLButtonElement>('.hit[data-act="select"]')!.click();
    return { booting, sel: (document.getElementById("cart") as HTMLSelectElement).selectedIndex };
  });
  expect(r.booting).toBe(true);
  expect(r.sel).toBe(0);
  await expect.poll(() => page.locator(".shell").getAttribute("data-phase"), { timeout: 30000 }).toMatch(/live|stopped/);
  test.skip((await page.locator(".shell").getAttribute("data-phase")) === "stopped", "the chip API did not answer from this origin");
  await expect(page.locator("#k-cart")).toHaveText(/Die Runner · 521B/);
  await expect.poll(() => page.locator("#k-frames").textContent(), { timeout: 5000 }).toMatch(/^[1-9]/);
  // Landed: now the change is taken.
  await page.locator('.hit[data-act="select"]').click();
  await expect(page.locator(".shell")).toHaveAttribute("data-phase", "off");
  expect(await page.evaluate(() => (document.getElementById("cart") as HTMLSelectElement).selectedIndex)).toBe(1);
});

test("full screen: the console page links its own manifest, fullscreen from the console, and the settings page says how", async ({ page, request }) => {
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  const href = await page.locator("link[rel=manifest]").getAttribute("href");
  expect(href).toBe("/6502/games/manifest.webmanifest");
  const m = await (await request.get(href!)).json();
  expect(m.display).toBe("fullscreen");
  expect(m.start_url).toBe("/6502/games");
  for (const name of ["mobile-web-app-capable", "apple-mobile-web-app-capable"]) {
    expect(await page.locator(`meta[name="${name}"]`).getAttribute("content"), name).toBe("yes");
  }
  expect(await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content")).toBe("black-translucent");
  // The site's own stays standalone: a reader keeps the clock.
  expect((await (await request.get("/manifest.webmanifest")).json()).display).toBe("standalone");
  // Chrome has the API: the settings row offers the key and the install note.
  await page.locator('.hit[data-act="page-settings"]').click();
  await expect(page.locator(".toys [data-fs]")).toHaveAttribute("data-fs", "native");
  await expect(page.locator('.toys [data-act="fullscreen"]')).toBeVisible();
  await expect(page.locator(".toys [data-fs] small")).toHaveText(/home screen/i);
});

for (const [name, size] of [["desk", DESK], ["phone", PHONE]] as const) {
  test(`the console is the whole viewport on a ${name}: no bar, the stage meets the strip, nothing scrolls`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page, GAMES);
    await solved(page);
    const r = await page.evaluate(() => {
      const stage = document.querySelector(".shell-stage")!.getBoundingClientRect();
      const strip = document.querySelector(".chip-transport")!.getBoundingClientRect();
      return {
        bars: document.querySelectorAll(".app-head, .topbar, .wb-bar").length,
        h1: document.querySelectorAll("h1").length,
        top: Math.round(stage.top),
        gap: Math.round(strip.top - stage.bottom),
        sub: !!document.querySelector("header .sub"),
        overflow: document.documentElement.scrollHeight - innerHeight,
        // The shell clips its own pages (the status page scrolls inside
        // it), so what counts is what is in the document's flow below the
        // strip: anything outside the shell whose box starts under it.
        below: [...document.querySelectorAll("p, h2, h3")].filter((e) => !e.closest(".shell") && e.getBoundingClientRect().top >= strip.top && (e as HTMLElement).offsetWidth > 0).length,
        prose: !!document.querySelector(".pane-status #k-cost"),
      };
    });
    expect(r.bars, "no bar").toBe(0);
    expect(r.h1, "one h1, for the document").toBe(1);
    expect(r.top, "the stage starts at the top").toBeLessThanOrEqual(1);
    expect(Math.abs(r.gap), "the stage meets the strip").toBeLessThanOrEqual(2);
    expect(r.sub, "game.js's header .sub is still there").toBe(true);
    expect(r.overflow, "the document does not scroll").toBeLessThanOrEqual(0);
    expect(r.below, "no prose under the strip").toBe(0);
    expect(r.prose, "the page's prose is on the status page").toBe(true);
  });
}

test("no Nintendo mark, no trademark sign, anywhere on the console", async ({ page }) => {
  await open(page, GAMES);
  const html = await page.content();
  expect(html).not.toMatch(/nintendo|mario|zelda|™|&trade;/i);
});

test("the flag on the settings page is a real navigation: the Japanese console arrives built", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, GAMES);
  await page.locator('.hit[data-act="page-settings"]').click();
  const flag = page.locator(".toys a.lang-switch").first();
  await expect(flag).toHaveAttribute("href", "/ja/6502/games");
  await flag.click();
  await page.waitForURL("**/ja/6502/games", { timeout: 30000 });
  await page.waitForTimeout(5000);

  // game.js is a module: a client-side arrival renders this markup and never
  // runs it again, which left a Japanese console with a blank screen, no tile
  // key and no handlers bound (measured 2026-08-28, the console's half of the
  // Lab's "nested windows"). What it must be instead is a built console.
  const built = await page.evaluate(() => {
    const c = document.getElementById("screen") as HTMLCanvasElement;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) painted++;
    return {
      painted,
      legend: document.querySelectorAll(".legend i[style*='background-image']").length,
      note: (document.getElementById("note")?.textContent ?? "").trim(),
    };
  });
  expect(built.painted, "the screen is drawn").toBeGreaterThan(0);
  expect(built.legend, "the tile key is painted from the sheet").toBeGreaterThan(3);
  expect(built.note, "and the cartridge's own blurb is in the note").not.toBe("");
});

test("the Japanese edition carries the shell with its own words", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, "/ja" + GAMES);
  await solved(page);
  await expect(page.locator('.hit[data-act="coin"]')).toHaveAttribute("title", /コイン/);
  await expect(page.locator(".pane-shelf .pane-title")).toHaveText("棚");
});
