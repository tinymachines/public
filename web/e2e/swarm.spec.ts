import { expect, test } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * The Swarm, folded: /6502/swarm is the 6502 site's swarm page read out of
 * the served release like every other explorer page, its module loaded
 * from /6502/chip/ through the runtime manifest, its kernel (gpu.json)
 * located by the module's own URL rather than the page's.
 *
 * The wall itself needs a GPU, which headless has none of, so what this
 * holds is the fold and the honesty: the page renders with its root, its
 * source listing fills from the module (proof the module loaded and ran
 * from the release), and the status names its refusal by name rather
 * than sitting on "starting". Where an adapter does exist, the count
 * must climb instead.
 *
 * Skips where the 6502 release is not served, like the console suite.
 */
test("the swarm page folds in, loads its module from the release, and names its refusal or runs", async ({ page }) => {
  test.slow();
  await page.setViewportSize(DESK);
  await open(page, "/6502/swarm");
  const ok = await page.evaluate(async () => (await fetch("/6502/chip/asset-manifest.json")).ok);
  test.skip(!ok, "the 6502 release is not served at /6502/chip on this origin");

  await expect(page.locator("#swarm")).toHaveCount(1);
  await expect(page.locator("#swarm-wall")).toHaveCount(1);
  // The painter source is written by the module: an empty <pre> means the
  // module never ran from the release.
  await expect(page.locator("#swarm-src")).toContainText(".org $0200", { timeout: 30000 });

  // Either the adapter took the wall (count climbs) or the page said, by
  // name, why not. "starting" left standing is the one failure.
  await expect.poll(async () => {
    const status = ((await page.locator("#swarm-status").textContent()) ?? "").trim();
    const count = Number(((await page.locator("#swarm-count").textContent()) ?? "0").replace(/[^\d]/g, ""));
    return count > 0 || !/^(starting|fetching the kernel|booting one chip at the switches|asking the GPU)$/.test(status);
  }, { timeout: 60000 }).toBe(true);
  const status = ((await page.locator("#swarm-status").textContent()) ?? "").trim();
  const count = Number(((await page.locator("#swarm-count").textContent()) ?? "0").replace(/[^\d]/g, ""));
  const refused = /WebGPU|adapter|limit|pool/i.test(status);
  expect(refused || count > 0, `status ${JSON.stringify(status)}, count ${count}`).toBe(true);
  expect(status, "the page must not sit on its opening word").not.toMatch(/^starting$/);
});
