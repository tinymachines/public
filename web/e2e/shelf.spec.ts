import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, PHONE, overflow } from "./lib";

/**
 * Your own cartridges: the shelf at /nes/shelf and the menu it feeds.
 *
 * Two halves, because the shelf is private to a GitHub account and no suite
 * can hold one.
 *
 * SIGNED OUT runs against any origin, production included: the page says what
 * it is, no cartridge menu appears for a reader who has no shelf, and the API
 * answers 401.
 *
 * SIGNED IN needs e2e/shelf-rig.py running: this tree's real API on a spare
 * port with a throwaway database and three sessions opened the way a sign-in
 * opens one. The page's /api requests are passed through to it untouched, so
 * the web and the API are both the real ones and only GitHub is missing.
 * Without the rig that half is SKIPPED, by name, and the summary says so: a
 * skipped test is reported, which a test quietly passing on nothing is not.
 *
 * The cartridges are our own (the colour bars and the calibration cartridge
 * the site already serves), so nothing anybody else holds the rights to is a
 * fixture here.
 */

const RIG_FILE = path.join(OUT, "shelf-rig.json");
interface Rig { api: string; cookie: string; sessions: Record<string, string>; shelves: Record<string, number> }
const rig: Rig | null = fs.existsSync(RIG_FILE) ? JSON.parse(fs.readFileSync(RIG_FILE, "utf8")) : null;

const ROMS = path.join(__dirname, "..", "public", "nes");
const BARS = path.join(ROMS, "bars.nes");
const CAL = path.join(ROMS, "cal.nes");

/** Send the page's API calls to the rig, untouched. What nginx does in production. */
async function through(page: Page) {
  if (!rig) throw new Error("no rig");
  await page.route(/\/api\/v1\//, async (route) => {
    const u = new URL(route.request().url());
    const answer = await route.fetch({ url: rig.api + u.pathname.replace(/^\/api/, "") + u.search });
    await route.fulfill({ response: answer });
  });
}

/** Sign the page in as one of the rig's people. */
async function as(page: Page, who: string) {
  if (!rig) throw new Error("no rig");
  await page.context().addCookies([{ name: rig.cookie, value: rig.sessions[who], url: BASE, httpOnly: true, sameSite: "Lax" }]);
  await through(page);
}

/** Ask the rig directly, as somebody, for what the page should be showing. */
async function shelfOf(page: Page, who: string) {
  if (!rig) throw new Error("no rig");
  const r = await page.request.get(`${rig.api}/v1/me/carts`, { headers: { cookie: `${rig.cookie}=${rig.sessions[who]}` } });
  expect(r.status()).toBe(200);
  return (await r.json()) as { carts: { id: string; name: string; note: string; mapper: number; crc32: string; rom: string }[]; limits: { max: number; held: number } };
}

async function emptyTheShelf(page: Page, who: string) {
  if (!rig) throw new Error("no rig");
  for (const c of (await shelfOf(page, who)).carts) {
    const r = await page.request.delete(`${rig.api}/v1/me/carts/${c.id}`, { headers: { cookie: `${rig.cookie}=${rig.sessions[who]}` } });
    expect(r.status()).toBe(204);
  }
}

// ---------------------------------------------------------------------------
// Signed out: any origin
// ---------------------------------------------------------------------------

test.describe("the shelf, signed out", () => {
  // With the rig up the origin is a preview with no nginx in front of it, so
  // /api is the rig here too, reached with no session.
  const api = rig ? `${rig.api}/v1` : "/api/v1";
  test.beforeEach(async ({ page }) => {
    if (rig) await through(page);
  });

  test("the API does not answer without a session", async ({ request }) => {
    expect((await request.get(`${api}/me/carts`)).status()).toBe(401);
    expect((await request.get(`${api}/me/carts/ct_0000000000000000/rom`)).status()).toBe(401);
  });

  for (const [lang, at, says] of [["en", "/nes/shelf", "Sign in"], ["ja", "/ja/nes/shelf", "サインイン"]] as const) {
    test(`${at} says what it is and offers a sign-in (${lang})`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(at);
      const state = page.locator("[data-shelf-state]");
      await expect(state).toHaveAttribute("data-shelf-state", "signed-out");
      await expect(state).toContainText(says);
      // Whoever is signed out learns nothing about anybody's shelf.
      await expect(page.locator("[data-shelf-list], [data-shelf-add]")).toHaveCount(0);
      expect(await page.locator("meta[name=robots]").getAttribute("content")).toContain("noindex");
      const o = await overflow(page);
      expect(o.out, `${o.px}px sideways`).toEqual([]);
      expect(o.px).toBe(0);
    });
  }

  test("a reader with no shelf sees no cartridge menu on the console", async ({ page }) => {
    const asked = page.waitForResponse((r) => r.url().includes("/api/v1/me/carts"));
    await page.goto("/nes/play");
    // The page's own file button is there, so the menu's absence below is
    // about the menu and not about a page that failed to render.
    await expect(page.locator("[data-play-rom]")).toHaveCount(1);
    expect((await asked).status()).toBe(401);
    await expect(page.locator("[data-shelf-picker]")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Signed in: needs e2e/shelf-rig.py
// ---------------------------------------------------------------------------

test.describe("the shelf, signed in", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!rig, "e2e/shelf-rig.py is not running, so nothing here can sign in. Start it and run again.");

  test("add, refuse, rename and delete, with every figure the server's own", async ({ page }) => {
    await emptyTheShelf(page, "owner");
    await as(page, "owner");
    await page.goto("/nes/shelf");
    await expect(page.locator("[data-shelf-state]")).toHaveAttribute("data-shelf-state", "open");
    await expect(page.locator("[data-shelf-held]")).toContainText(`0 of ${rig!.shelves.owner}`);

    // Two real cartridges and one file that only claims to be.
    const fake = path.join(OUT, "not-a-cartridge.nes");
    fs.writeFileSync(fake, "this is a text file with a cartridge's extension\n");
    await page.locator("[data-shelf-add]").setInputFiles([BARS, fake, CAL]);

    const outcomes = page.locator("[data-shelf-outcomes] li");
    await expect(outcomes).toHaveCount(3);
    await expect(outcomes.nth(0)).toHaveAttribute("data-ok", "true");
    await expect(outcomes.nth(1)).toHaveAttribute("data-ok", "false");
    await expect(outcomes.nth(1)).toContainText("iNES signature");
    await expect(outcomes.nth(2)).toHaveAttribute("data-ok", "true");

    // The rows are what the server measured, asked of it separately.
    const truth = await shelfOf(page, "owner");
    expect(truth.carts.map((c) => c.name)).toEqual(["bars", "cal"]);
    const rows = page.locator("[data-shelf-list] > li");
    await expect(rows).toHaveCount(2);
    for (const [i, c] of truth.carts.entries()) {
      await expect(rows.nth(i).locator("[data-cart-name]")).toHaveValue(c.name);
      const facts = (await rows.nth(i).locator("[data-cart-facts]").textContent()) ?? "";
      expect(facts).toContain(`mapper ${c.mapper}`);
      expect(facts).toContain(c.crc32);
    }
    await expect(page.locator("[data-shelf-held]")).toContainText(`2 of ${rig!.shelves.owner}`);

    // The same file again is refused, naming the one that is there.
    await page.locator("[data-shelf-add]").setInputFiles([BARS]);
    await expect(outcomes).toHaveCount(1);
    await expect(outcomes.first()).toContainText("already on the shelf");
    await expect(rows).toHaveCount(2);

    // Rename, with a note, and it is still so after a reload.
    const bars = page.locator(`[data-cart="${truth.carts[0].id}"]`);
    await bars.locator("[data-cart-name]").fill("Colour bars");
    await bars.locator("[data-cart-note]").fill("our own, the twelve hues");
    await bars.locator("[data-cart-save]").click();
    await expect.poll(async () => (await shelfOf(page, "owner")).carts.map((c) => [c.name, c.note])).toContainEqual(["Colour bars", "our own, the twelve hues"]);
    await page.reload();
    await expect(page.locator(`[data-cart="${truth.carts[0].id}"] [data-cart-name]`)).toHaveValue("Colour bars");
    await page.setViewportSize(PHONE);
    const o = await overflow(page);
    expect(o.out, `${o.px}px sideways with a cartridge on the shelf`).toEqual([]);
    expect(o.px).toBe(0);

    // Delete the other one.
    page.once("dialog", (d) => void d.accept());
    await page.locator(`[data-cart="${truth.carts[1].id}"] [data-cart-delete]`).click();
    await expect(page.locator("[data-shelf-list] > li")).toHaveCount(1);
    expect((await shelfOf(page, "owner")).carts.map((c) => c.name)).toEqual(["Colour bars"]);
  });

  test("the console's menu offers the cartridge and loads it", async ({ page }) => {
    const held = await shelfOf(page, "owner");
    expect(held.carts.length, "the test before this one leaves a cartridge on the shelf").toBe(1);
    await as(page, "owner");
    await page.goto("/nes/play");
    const menu = page.locator("[data-shelf-picker=open] select");
    await expect(menu.locator("option")).toHaveCount(2); // the label, and the cartridge
    await expect(page.locator("[data-play-stats]")).not.toContainText("Colour bars");
    await menu.selectOption(held.carts[0].id);
    // The page's own readout names what it loaded: the bytes reached the console.
    await expect(page.locator("[data-play-stats]")).toContainText("Colour bars.nes");
    await expect(page.locator("[data-play-why]")).toHaveCount(0);
    // A menu, not a field: it goes back to its label.
    await expect(menu).toHaveValue("");
  });

  test("every bench in the playground that takes a file offers the shelf", async ({ page }) => {
    const held = await shelfOf(page, "owner");
    await as(page, "owner");
    await page.goto("/nes/playground");
    // One file input per bench that asks for a cartridge, and a menu beside each.
    const inputs = page.locator('.pg-file input[type=file][accept=".nes"]');
    await expect.poll(() => inputs.count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
    const menus = page.locator("[data-shelf-picker=open]");
    await expect.poll(() => menus.count()).toBe(await inputs.count());

    // The first bench: choosing from the shelf does what choosing a file does.
    await menus.first().locator("select").selectOption(held.carts[0].id);
    await expect(page.locator("#pg-cart")).toHaveValue("own");
    await expect(page.locator('#pg-cart option[value="own"]')).toHaveText("Colour bars.nes");
  });

  test("somebody else's cartridge does not exist, in the page or under it", async ({ page }) => {
    const owners = await shelfOf(page, "owner");
    expect(owners.carts.length).toBe(1);
    await as(page, "stranger");
    await page.goto("/nes/shelf");
    await expect(page.locator("[data-shelf-state]")).toHaveAttribute("data-shelf-state", "open");
    await expect(page.locator("[data-shelf-list]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Colour bars");
    // Asked for by its exact address, with a real session that is not the owner's.
    const stolen = await page.evaluate(async (rom) => (await fetch(`/api${rom}`)).status, owners.carts[0].rom);
    expect(stolen).toBe(404);
    // An empty shelf is offered as somewhere to go, not as a menu.
    await page.goto("/nes/play");
    await expect(page.locator("[data-shelf-picker=empty]")).toHaveAttribute("href", "/nes/shelf");
  });

  test("an account with no shelf is told so, and is offered no menu", async ({ page }) => {
    await as(page, "noshelf");
    await page.goto("/nes/shelf");
    await expect(page.locator("[data-shelf-state]")).toHaveAttribute("data-shelf-state", "no-shelf");
    await expect(page.locator("[data-shelf-add]")).toHaveCount(0);
    const asked = page.waitForResponse((r) => r.url().includes("/api/v1/me/carts"));
    await page.goto("/nes/play");
    expect((await asked).status()).toBe(200);
    await expect(page.locator("[data-play-rom]")).toHaveCount(1);
    await expect(page.locator("[data-shelf-picker]")).toHaveCount(0);
  });
});
