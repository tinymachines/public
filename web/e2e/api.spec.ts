import { test, expect } from "@playwright/test";

/** The API's public face. Read-only: nothing here mints, publishes or signs in. */
test("openapi.json is generated and describes the mint", async ({ request }) => {
  const r = await request.get("/api/openapi.json");
  expect(r.ok()).toBe(true);
  const doc = await r.json();
  expect(Object.keys(doc.paths).length).toBeGreaterThan(5);
  expect(doc.paths["/v1/tokens"] ?? doc.paths["/api/v1/tokens"], "the mint is documented").toBeTruthy();
});
test("the brief carries no token", async ({ request }) => {
  for (const u of ["/6502/cart/brief.md", "/6502/cart/skill.md?slug=test&handle=test"]) {
    const t = await (await request.get(u)).text();
    expect(t.length).toBeGreaterThan(5000);
    expect(t, `${u}: a real-looking token`).not.toMatch(/tm6502_[A-Za-z0-9]{20,}/);
    expect(t, `${u}: an em dash`).not.toContain("—");
  }
});
test("sign-in is configured and the account endpoints refuse a stranger", async ({ request }) => {
  const auth = await (await request.get("/api/v1/auth")).json();
  expect(auth).toHaveProperty("github");
  expect((await request.get("/api/v1/me")).status()).toBe(401);
});
