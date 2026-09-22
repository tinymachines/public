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
 * it is, no cartridge menu appears for a reader who is signed out, and the API
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

  test("a signed-out reader sees no cartridge menu on the console", async ({ page }) => {
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
    // The menu shows what the page is running, learned from the page.
    await expect(menu).toHaveValue(held.carts[0].id);
    await expect(page.locator("[data-play-run]")).toBeEnabled();
    // And nothing about it pushes a phone's page sideways.
    await page.setViewportSize(PHONE);
    const o = await overflow(page);
    expect(o.out, `${o.px}px sideways with the picker showing a cartridge`).toEqual([]);
    expect(o.px).toBe(0);
    // A file from the disk clears it: the menu never claims a cartridge the console is not running.
    await page.locator("[data-play-rom]").setInputFiles(CAL);
    await expect(page.locator("[data-play-stats]")).toContainText("cal.nes");
    await expect(menu).toHaveValue("");
  });

  test("every bench in the playground that takes a file offers the shelf", async ({ page }) => {
    // Under the longest name on the owner's real shelf, forty characters,
    // which is what pushed the playground's row past a phone.
    const long = "Mike Tyson's Punch-Out!! (Japan, USA) (En)";
    const one = (await shelfOf(page, "owner")).carts[0];
    const r = await page.request.patch(`${rig!.api}/v1/me/carts/${one.id}`, { headers: { cookie: `${rig!.cookie}=${rig!.sessions.owner}` }, data: { name: long } });
    expect(r.status()).toBe(200);
    const held = await shelfOf(page, "owner");
    expect(held.carts[0].name).toBe(long);
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
    await expect(page.locator('#pg-cart option[value="own"]')).toHaveText(`${long}.nes`);
    await expect(menus.first().locator("select")).toHaveValue(held.carts[0].id);
    // With a cartridge showing, the bench's row still fits a phone.
    await page.setViewportSize(PHONE);
    const o = await overflow(page);
    expect(o.out.filter((x) => /pg-carts|shelf-picker|pg-cart/.test(x)), `${o.px}px sideways`).toEqual([]);
  });

  test("a cartridge with a battery keeps its RAM on the shelf, and gets it back", async ({ page }) => {
    // A cartridge of our own: NROM, battery bit set, and a program that adds
    // one to $6000 at every power-on and then stops. So the RAM says how many
    // times the game has started with its save intact: 1 the first time, 2
    // after a restore, and 1 again if the restore did not happen.
    const prg = new Uint8Array(0x8000);
    prg.set([0xad, 0x00, 0x60, 0x18, 0x69, 0x01, 0x8d, 0x00, 0x60, 0x4c, 0x09, 0xc1], 0x4100); // at $C100
    prg.set([0x00, 0xc1], 0x7ffc); // reset vector
    const rom = new Uint8Array([0x4e, 0x45, 0x53, 0x1a, 2, 1, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...prg, ...new Uint8Array(0x2000)]);
    const H = { cookie: `${rig!.cookie}=${rig!.sessions.owner}` };
    const made = await page.request.post(`${rig!.api}/v1/me/carts?name=Counter`, { headers: { ...H, "content-type": "application/octet-stream" }, data: Buffer.from(rom) });
    expect(made.status(), await made.text()).toBe(201);
    const cart = await made.json();
    expect(cart.save).toBeNull();
    const saveOf = async () => {
      const r = await page.request.get(`${rig!.api}/v1/me/carts/${cart.id}/save`, { headers: H });
      return r.status() === 404 ? null : new Uint8Array(await r.body());
    };

    await as(page, "owner");
    await page.goto("/nes/play");
    await page.locator("[data-shelf-select]").selectOption(cart.id);
    await expect(page.locator("[data-play-stats]")).toContainText("Counter.nes");
    await expect(page.locator("[data-play-battery]")).toHaveAttribute("data-play-battery", "none");
    expect(await saveOf(), "nothing is written before the game runs").toBeNull();

    // Run, then pause: the pause writes the RAM, which the program changed.
    await page.locator("[data-play-run]").click();
    await expect.poll(async () => (await page.locator("[data-play-stats]").textContent()) ?? "").toMatch(/frames shown: [1-9]/);
    await page.locator("[data-play-run]").click();
    await expect(page.locator("[data-play-battery]")).toHaveAttribute("data-play-battery", "kept");
    const first = await saveOf();
    expect(first?.length).toBe(8192);
    expect(first![0], "one power-on so far").toBe(1);

    // A new page: the save comes back before the game starts, and the
    // program counts a second start on top of it.
    await page.reload();
    await page.locator("[data-shelf-select]").selectOption(cart.id);
    await expect(page.locator("[data-play-battery]")).toContainText("restored on load");
    await page.locator("[data-play-run]").click();
    await expect.poll(async () => (await page.locator("[data-play-stats]").textContent()) ?? "").toMatch(/frames shown: [1-9]/);
    await page.locator("[data-play-run]").click();
    await expect.poll(async () => (await saveOf())?.[0]).toBe(2);

    // The shelf shows it, and can forget it.
    await page.goto("/nes/shelf");
    const row = page.locator(`[data-cart="${cart.id}"]`);
    await expect(row.locator("[data-cart-kept]")).toHaveAttribute("data-cart-kept", "kept");
    page.once("dialog", (d) => void d.accept());
    await row.locator("[data-cart-forget]").click();
    await expect(page.locator(`[data-cart="${cart.id}"] [data-cart-kept]`)).toHaveAttribute("data-cart-kept", "none");
    expect(await saveOf()).toBeNull();
    // A file off the disk has no shelf entry, so nothing is kept for it.
    await page.goto("/nes/play");
    await page.locator("[data-play-rom]").setInputFiles({ name: "counter-from-disk.nes", mimeType: "application/octet-stream", buffer: Buffer.from(rom) });
    await expect(page.locator("[data-play-stats]")).toContainText("counter-from-disk.nes");
    await expect(page.locator("[data-play-battery]")).toHaveCount(0);
    expect((await page.request.delete(`${rig!.api}/v1/me/carts/${cart.id}`, { headers: H })).status()).toBe(204);
  });

  test("somebody else's cartridge does not exist, in the page or under it", async ({ page }) => {
    const owners = await shelfOf(page, "owner");
    expect(owners.carts.length).toBe(1);
    await as(page, "stranger");
    await page.goto("/nes/shelf");
    await expect(page.locator("[data-shelf-state]")).toHaveAttribute("data-shelf-state", "open");
    await expect(page.locator("[data-shelf-list]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(owners.carts[0].name);
    // Asked for by its exact address, with a real session that is not the owner's.
    const stolen = await page.evaluate(async (rom) => (await fetch(`/api${rom}`)).status, owners.carts[0].rom);
    expect(stolen).toBe(404);
    // An empty shelf is offered as somewhere to go, not as a menu.
    await page.goto("/nes/play");
    await expect(page.locator("[data-shelf-picker=empty]")).toHaveAttribute("href", "/nes/shelf");
  });

  test("an account whose shelf was closed is told so, and is offered no menu", async ({ page }) => {
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
