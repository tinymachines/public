import { expect, test, type Page } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * A cartridge arriving by link, and the sheet it draws in.
 *
 * `?cart=` is how a published cartridge is shared, so it is the first thing
 * many people see of this console, and what happens after it matters as much
 * as what happens on it. Reported by the owner and reproduced here
 * (2026-08-28): arrive on a linked cartridge, play it, choose Silicon Snake
 * from the shelf, and the snake and its food were drawn as invaders and a
 * ship. The loaded cartridge's CHR had replaced the module's tile sheet and
 * nothing put it back, so the next cartridge borrowed its sprites.
 *
 * The sheet is checked through the legend, which the page paints from the
 * tiles the screen actually draws from, as data: URLs. Comparing the canvas
 * would compare two games at whatever frame they had reached; the legend is
 * the sheet itself.
 */

const GAMES = "/6502/games";

/** The legend's swatches: the tile sheet, as the page draws it. */
async function sheet(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".legend i")].map((i) => i.style.backgroundImage ?? ""),
  );
}

async function pickSnake(page: Page) {
  await page.locator('.hit[data-act="page-shelf"]').click();
  const snake = page.locator(".pane-shelf .cart-btn", { hasText: "Silicon Snake" }).first();
  await snake.click();
  await expect(page.locator("#cart")).toHaveJSProperty("value", "1");
}

test("a linked cartridge draws in its own tiles, and the next cartridge gets its own back", async ({ page, request }) => {
  test.slow();
  await page.setViewportSize(DESK);

  // A published cartridge, from the registry rather than written down here.
  await open(page, GAMES);
  const api = await page.evaluate(() => document.querySelector<HTMLElement>("[data-chip-api]")!.dataset.chipApi!);
  const house = await sheet(page);
  expect(house.length, "the legend is on the page").toBeGreaterThan(3);

  const listing = await (await request.get(`${api}/v1/registry`)).json();
  const builders: { handle: string }[] = listing.builders ?? [];
  expect(builders.length, "the registry has builders").toBeGreaterThan(0);
  let cartUrl: string | null = null;
  for (const b of builders) {
    const one = await (await request.get(`${api}/v1/registry/b/${b.handle}`)).json();
    for (const rom of one.roms ?? []) {
      if (rom.cart_url) { cartUrl = `${api}${rom.cart_url}`; break; }
    }
    if (cartUrl) break;
  }
  test.skip(!cartUrl, "no published cartridge to arrive on");

  await open(page, `${GAMES}?cart=${encodeURIComponent(cartUrl!)}`, 6000);
  await expect(page.locator("#k-cart")).not.toHaveText("--", { timeout: 20000 });
  const linkedName = await page.locator("#k-cart").textContent();
  const linked = await sheet(page);

  // The point of the format: a cartridge carries its own tiles. If this one
  // does not, the rest of the test would pass on nothing.
  test.skip(JSON.stringify(linked) === JSON.stringify(house), `${linkedName} carries no tiles of its own`);

  // The picker blanks the readout until the next boot (game.js), so the
  // cartridge is confirmed by the select and the sheet is read straight away.
  await pickSnake(page);
  const after = await sheet(page);
  expect(after, "Silicon Snake draws in the house sheet, not the linked cartridge's").toEqual(house);

  // The house sheet arriving late must not take the screen from the
  // cartridge. The two fetches start together and landed two milliseconds
  // apart when this was measured, so the order is a coin toss; here the
  // house sheet is held back a second and a half and the cartridge has to
  // keep its own tiles.
  await page.route("**/6502/games/art/tiles.chr", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await open(page, `${GAMES}?cart=${encodeURIComponent(cartUrl!)}`, 6000);
  await expect(page.locator("#k-cart")).not.toHaveText("--", { timeout: 20000 });
  expect(await sheet(page), "the cartridge keeps its tiles when the house sheet lands after it").toEqual(linked);
  await page.unroute("**/6502/games/art/tiles.chr");

  // And it plays: the contract, the ROM and the sheet are one cartridge's.
  await pickSnake(page);
  expect(await sheet(page), "the house sheet is back for a built-in cartridge").toEqual(house);
  await page.locator('.hit[data-act="reset"]').click();
  await expect.poll(() => page.locator(".shell").getAttribute("data-phase"), { timeout: 30000 }).toMatch(/live|stopped/);
  test.skip((await page.locator(".shell").getAttribute("data-phase")) === "stopped", "the chip did not boot on this origin");
  await expect.poll(async () => Number(await page.locator("#k-frames").textContent()), { timeout: 20000 }).toBeGreaterThan(2);
  await expect(page.locator("#k-cart"), "the cartridge that booted is the one chosen").toHaveText(/Silicon Snake/);
  expect(await sheet(page), "and the sheet is still the house's while it runs").toEqual(house);
});
