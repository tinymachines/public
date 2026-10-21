import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { DESK, PHONE, open, overflow } from "./lib";

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

// ---------------------------------------------------------------------------
// The monitor, /nes/stream/{id}: M1 of nes-bench/docs/stream-monitor-spec.md.
//
// A run needs the GPU and the chain, so the API is answered here by the
// browser's own route mocks with a fixture run: the served page is the real
// one, what it draws from a run is checked against a run whose numbers are
// known. The sabotage this guards against is the strip scaled from
// frames_sent instead of frames_wanted: with the fixture's 1200 of 3600 the
// marker at frame 600 sits at a sixth of the axis, and at a half when
// sabotaged.
// ---------------------------------------------------------------------------


const RUN_ID = "abcd1234";
const FIXTURE = {
  id: RUN_ID,
  game: "bars",
  output: "file",
  seconds: 60,
  pace: true,
  state: "running",
  started_at: "2026-10-21T15:00:00Z",
  ended_at: null,
  exit_code: null,
  frames_sent: 1200,
  frames_wanted: 3600,
  elapsed_s: 20.1,
  worst_lag_ms: 3.2,
  frames_late: 0,
  ffmpeg_ok: null,
  file_ready: false,
  markers: 3,
};
const MARKERS = [
  { frame: 600, at: "2026-10-21T15:00:10Z", text: "title" },
  { frame: 900, at: "2026-10-21T15:00:15Z", text: "first pipe" },
  { frame: 1200, at: "2026-10-21T15:00:20Z", text: "now" },
];

async function mockApi(page: Page, admin: boolean) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/v1/admin/whoami", (route) => route.fulfill(json({ key: null, user: null, can_administer: admin })));
  await page.route(`**/api/v1/stream/runs/${RUN_ID}`, (route) => route.fulfill(json(FIXTURE)));
  await page.route(`**/api/v1/stream/runs/${RUN_ID}/markers`, (route) => route.fulfill(json({ run: RUN_ID, markers: MARKERS })));
}

async function signIn(page: Page) {
  await page.locator("#stream-key").fill("tm_dev_test");
  await page.getByRole("button", { name: "Open the monitor" }).click();
  await expect(page.getByTestId("monitor-strip")).toBeVisible();
}

test("the monitor serves noindex in both languages and ships no run", async ({ page }) => {
  await page.setViewportSize(DESK);
  for (const p of [`/nes/stream/${RUN_ID}`, `/ja/nes/stream/${RUN_ID}`]) {
    await open(page, p, 500);
    await expect(page.getByTestId("stream-monitor"), p).toBeVisible();
    await expect(page.locator("#stream-key"), p).toBeVisible();
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots ?? "", p).toContain("noindex");
    const html = await page.content();
    expect(html, p).not.toContain("data-run=");
    expect(html, p).not.toContain("data-marker=");
    expect(html, `${p}: an em dash`).not.toContain("—");
  }
});

test("a dev key sees the bar disabled with its reason", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockApi(page, false);
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await signIn(page);
  const bar = page.getByTestId("monitor-bar");
  await expect(bar.getByRole("button", { name: "Stop" })).toBeDisabled();
  await expect(bar.getByLabel("Marker text")).toBeDisabled();
  await expect(bar.locator("#monitor-bar-hint")).toContainText("admin key");
});

test("the strip draws every marker at its frame on the run's whole length", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockApi(page, true);
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await signIn(page);
  await expect(page.getByTestId("monitor-bar").getByRole("button", { name: "Stop" })).toBeEnabled();
  await expect(page.getByTestId("monitor-frames")).toHaveText("1200 of 3600");
  const ticks = page.locator("[data-marker]");
  await expect(ticks).toHaveCount(MARKERS.length);
  const axis = await page.locator(".strip-axis").boundingBox();
  if (!axis) throw new Error("no axis");
  for (const m of MARKERS) {
    const box = await page.locator(`[data-marker="${m.frame}"]`).boundingBox();
    if (!box) throw new Error(`marker ${m.frame} has no box`);
    const want = axis.x + (axis.width * m.frame) / FIXTURE.frames_wanted;
    expect(Math.abs(box.x + box.width / 2 - want), `marker ${m.frame} at ${box.x} for ${want}`).toBeLessThan(2);
  }
});

test("the monitor fits a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockApi(page, true);
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await signIn(page);
  const o = await overflow(page);
  expect(o.px, o.out.join("\n")).toBe(0);
});
