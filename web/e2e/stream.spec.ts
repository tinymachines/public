import { test, expect } from "@playwright/test";
import { DESK, open } from "./lib";

/**
 * The stream desk, /nes/stream, and its control plane, /api/v1/stream.
 *
 * What is checked here is the served shape, not a run: a run needs the GPU
 * and the chain, and api/test_stream.py holds the control plane with a fake
 * tool. Here: the page serves as the signed-out desk, with no data in it;
 * the routes are in the generated document; and a read without a key is a
 * 401, which is the gate the page is behind.
 */

test("the desk serves signed out, asks for a key and ships no run", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/stream", 500);
  await expect(page.getByTestId("stream-desk")).toBeVisible();
  await expect(page.locator("#stream-key")).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain("data-run=");
  expect(html, "an em dash").not.toContain("—");
});

test("the control plane is documented and gated", async ({ request }) => {
  const doc = await (await request.get("/api/openapi.json")).json();
  const paths = Object.keys(doc.paths);
  for (const p of ["/v1/stream/games", "/v1/stream/outputs", "/v1/stream/runs", "/v1/stream/runs/{run_id}/stop", "/v1/stream/runs/{run_id}/markers"]) {
    expect(paths.some((x) => x === p || x === `/api${p}`), p).toBe(true);
  }
  for (const p of ["/api/v1/stream/games", "/api/v1/stream/runs", "/api/v1/stream/outputs"]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(401);
    expect(r.headers()["www-authenticate"] ?? "", p).toContain("Bearer");
  }
  const r = await request.post("/api/v1/stream/runs", { data: { game: "bars", output: "file", seconds: 1 } });
  expect(r.status()).toBe(401);
});
