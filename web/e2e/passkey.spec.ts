import { test, expect, type Page } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * A passkey onto the shelf (notes/desk-move.md, step A): the menu and the
 * shelf page offer a passkey beside GitHub, built from what GET /v1/auth says
 * and never typed, and a passkey that is signed in but linked to no account
 * here is told so rather than offered the same sign-in again.
 *
 * The API is answered by a route mock, because no suite holds a passkey. What
 * a linked passkey opens is the API's to prove, and api/test_account_links.py
 * does, against the real routes.
 */

const HOME = "https://accounts.example";

async function mock(page: Page, passkey: { handle: string | null; linked: boolean } | null) {
  await page.route(/\/api\/v1\/auth$/, (route) =>
    route.fulfill({ json: { github: true, passkey: passkey ? { home: HOME, site: "tinymachines", ...passkey } : null } }),
  );
  await page.route(/\/api\/v1\/me(\/carts)?$/, (route) => route.fulfill({ status: 401, json: { detail: "Not signed in." } }));
}

async function menu(page: Page) {
  const btn = page.locator(".menu-btn").first();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  return page.locator(".menu-account");
}

test("the menu offers a passkey beside GitHub, to the accounts site and back to this page", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mock(page, { handle: null, linked: false });
  await open(page, "/nes", 800);
  const row = await menu(page);
  const pk = row.locator("[data-menu-passkey]");
  await expect(pk).toHaveText("Sign in with a passkey");
  const href = new URL((await pk.getAttribute("href")) ?? "");
  expect(href.origin).toBe(HOME);
  expect(href.searchParams.get("site")).toBe("tinymachines");
  expect(href.searchParams.get("next")).toBe(page.url());
  await expect(row.locator('a[href^="/api/v1/auth/github"]')).toHaveCount(1);
});

test("a passkey with no account here is told so, and is not offered a passkey again", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mock(page, { handle: "carol", linked: false });
  await open(page, "/nes", 800);
  const row = await menu(page);
  await expect(row.locator("[data-menu-unlinked]")).toContainText("carol");
  await expect(row.locator("[data-menu-unlinked]")).toContainText("not linked");
  await expect(row.locator("[data-menu-passkey]")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "sign out" })).toBeVisible();

  await open(page, "/nes/shelf", 800);
  await expect(page.locator("[data-shelf-state=signed-out]")).toBeVisible();
  await expect(page.locator("[data-shelf-unlinked]")).toContainText("not linked");
  await expect(page.locator("[data-shelf-passkey]")).toHaveCount(0);
});

test("the shelf page offers the passkey too, and both ways in Japanese", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mock(page, { handle: null, linked: false });
  await open(page, "/nes/shelf", 800);
  await expect(page.locator("[data-shelf-passkey]")).toHaveText("Sign in with a passkey");
  await open(page, "/ja/nes/shelf", 800);
  await expect(page.locator("[data-shelf-passkey]")).toHaveText("パスキーでサインイン");
  const row = await menu(page);
  await expect(row.locator("[data-menu-passkey]")).toHaveText("パスキーでサインイン");
});

test("with the account service down, GitHub alone is offered", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mock(page, null);
  await open(page, "/nes", 800);
  const row = await menu(page);
  await expect(row.locator('a[href^="/api/v1/auth/github"]')).toHaveCount(1);
  await expect(row.locator("[data-menu-passkey]")).toHaveCount(0);
});
