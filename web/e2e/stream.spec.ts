import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { DESK, PHONE, open, overflow } from "./lib";
import record from "../../data/stream-monitor.json";

/**
 * The stream desk, /nes/stream, and its control plane, /api/v1/stream.
 *
 * What is checked here is the served shape, not a run: a run needs the GPU
 * and the chain, and api/test_stream.py holds the control plane with a fake
 * tool. Here: the page serves as the signed-out desk, with no data in it;
 * the routes are in the generated document; and a read without a key is a
 * 401, which is the gate the page is behind. The second way in, a passkey
 * session on the kit's account service, is played by a mocked /v1/stream/me:
 * the real service's ceremony needs a device.
 */

test("the desk serves signed out, offers both ways in and ships no run", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/stream", 500);
  await expect(page.getByTestId("stream-desk")).toBeVisible();
  await expect(page.locator("#stream-key")).toBeVisible();
  await expect(page.getByTestId("stream-passkey")).toBeVisible();
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
  // The cost per frame, six fields the history page draws, each described.
  const props = doc.components.schemas.StreamRun.properties;
  for (const f of ["ms_console", "ms_encode", "ms_gpu", "ms_readback", "ms_convert", "ms_handoff"]) {
    expect(props[f]?.description ?? "", f).toContain("per frame");
  }
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

/** GET /v1/stream/me for nobody: the two ways in, the hand-off page's address from the service. */
const NOBODY = { via: null, handle: null, account_id: null, operator: false, can_read: false, can_administer: false, sign_in: { home: "https://accounts.example", site: "tinymachines" }, why: "Nobody is signed in." };
/** The same for a passkey session: an operator, or a member who is not one yet. */
const passkey = (operator: boolean) => ({ via: "passkey", handle: "isenbek", account_id: "u_test", operator, can_read: operator, can_administer: operator, sign_in: NOBODY.sign_in, why: operator ? null : "Signed in as isenbek, who is not an operator of the stream desk yet." });

async function mockApi(page: Page, admin: boolean, run: object = FIXTURE, extraMarkers: object[] = [], cookieMe: object = NOBODY) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  // The page asks who it is first: a key presented is judged as a key, a bare call is the cookie.
  await page.route("**/api/v1/stream/me", (route) => {
    const key = route.request().headers()["authorization"];
    route.fulfill(json(key ? { via: "key", handle: "test", account_id: null, operator: false, can_read: true, can_administer: admin, sign_in: null, why: null } : cookieMe));
  });
  await page.route(`**/api/v1/stream/runs/${RUN_ID}`, (route) => route.fulfill(json(run)));
  await page.route(`**/api/v1/stream/runs/${RUN_ID}/markers`, (route) => route.fulfill(json({ run: RUN_ID, markers: [...MARKERS, ...extraMarkers] })));
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

test("nobody is offered the passkey, to the hand-off page and back to this page", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockApi(page, false);
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  const button = page.getByTestId("stream-passkey");
  await expect(button).toHaveAttribute("href", /^https:\/\/accounts\.example\/\?site=tinymachines&next=/);
  const href = (await button.getAttribute("href")) ?? "";
  expect(new URL(href).searchParams.get("next")).toBe(page.url());
  await expect(page.locator("#stream-key")).toBeVisible();
});

test("a passkey operator opens the monitor with no key at all", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockApi(page, false, FIXTURE, [], passkey(true));
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await expect(page.getByTestId("monitor-strip")).toBeVisible();
  await expect(page.locator("#stream-key")).toHaveCount(0);
  await expect(page.getByTestId("monitor-bar").getByRole("button", { name: "Stop" })).toBeEnabled();
});

test("a signed-in person who is not an operator is told so and offered the one-time field", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockApi(page, false, FIXTURE, [], passkey(false));
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await expect(page.getByTestId("stream-signed-in")).toContainText("isenbek");
  await expect(page.getByTestId("stream-signed-in")).toContainText("not yet an operator");
  await expect(page.getByRole("button", { name: "Make me an operator" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByTestId("stream-passkey")).toHaveCount(0);
  await expect(page.getByTestId("monitor-strip")).toHaveCount(0);
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

// ---------------------------------------------------------------------------
// M2, the picture. The player attaches through MediaSource, whose URL on the
// <video> is a blob:, so the live CSP must carry media-src blob:; the
// sabotage (the token stripped from the policy) is run as its own test so
// the check is seen to bite every time. The playlist itself needs the GPU
// and a run, so here it is answered 404 by the route mock: the attach is what
// is checked, and the picture region's words for a run that has no picture.
// ---------------------------------------------------------------------------

const HLS_RUN = { ...FIXTURE, output: "hls", picture: `/nes/live/${RUN_ID}/index.m3u8` };

async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspv: string[] };
    w.__cspv = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__cspv.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __cspv: string[] }).__cspv);

test("a file run has no player and says so", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockApi(page, true);
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await signIn(page);
  await expect(page.getByTestId("monitor-picture")).toContainText("No live picture: a file run");
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByTestId("monitor-picture-frame")).toHaveText("no live picture");
});

test("an hls run attaches the player under the live policy with no violation", async ({ page }) => {
  await page.setViewportSize(DESK);
  await recordViolations(page);
  await mockApi(page, true, HLS_RUN);
  await page.route(`**/nes/live/${RUN_ID}/**`, (route) => route.fulfill({ status: 404, body: "not yet" }));
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await signIn(page);
  const video = page.locator("video");
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.src), { timeout: 10_000 }).toMatch(/^blob:/);
  expect(await violations(page)).toEqual([]);
});

test("without media-src blob: the attach is refused (the check bites)", async ({ page }) => {
  await page.setViewportSize(DESK);
  await recordViolations(page);
  await mockApi(page, true, HLS_RUN);
  await page.route(`**/nes/live/${RUN_ID}/**`, (route) => route.fulfill({ status: 404, body: "not yet" }));
  // The document as served, with the token cut out of its policy. A page
  // served without a policy at all (a dev server) gets a tightened one.
  await page.route(`**/nes/stream/${RUN_ID}`, async (route) => {
    const r = await route.fetch();
    const headers = { ...r.headers() };
    const policy = headers["content-security-policy"] ?? "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self'";
    headers["content-security-policy"] = policy.replace(/\s*blob:/g, "");
    await route.fulfill({ response: r, headers });
  });
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await signIn(page);
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(() => violations(page), { timeout: 10_000 }).toContainEqual(expect.stringMatching(/^media-src/));
});

test("the live directory has no key and an unknown run is a 404", async ({ request }) => {
  const r = await request.get("/nes/live/00000000/index.m3u8");
  expect(r.status()).toBe(404);
  expect(r.headers()["www-authenticate"] ?? "").toBe("");
});

// ---------------------------------------------------------------------------
// M3, the controls. A press is a post whose answer carries a frame, drawn on
// the strip; one post in flight, and the newest byte wins a wait. The
// sabotage is the rule inverted (the first waiting byte kept): three changes
// in one tick must become two posts, the first and the last.
// ---------------------------------------------------------------------------

test("a press answers with a frame and the strip draws it; reset places its marker", async ({ page }) => {
  await page.setViewportSize(DESK);
  const sent: { kind: string; bits?: number }[] = [];
  const placed: { frame: number; at: string; text: string }[] = [];
  await mockApi(page, true, HLS_RUN, placed);
  await page.route(`**/api/v1/stream/runs/${RUN_ID}/control`, async (route) => {
    const body = route.request().postDataJSON() as { kind: string; bits?: number };
    sent.push(body);
    const frame = body.kind === "reset" ? 1300 : 1500 + sent.length;
    if (body.kind === "reset") placed.push({ frame, at: "2026-10-21T15:00:30Z", text: "reset" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kind: body.kind, frame, landed: true }) });
  });
  await page.route(`**/nes/live/${RUN_ID}/**`, (route) => route.fulfill({ status: 404, body: "not yet" }));
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await signIn(page);
  await expect(page.getByTestId("monitor-pad")).toHaveAttribute("data-live", "1");
  await page.keyboard.down("KeyX");
  await expect(page.locator("[data-press]")).toHaveCount(1);
  await page.keyboard.up("KeyX");
  await expect(page.locator("[data-press]")).toHaveCount(2);
  expect(sent.map((s) => s.bits)).toEqual([1, 0]);
  await page.getByTestId("monitor-reset").click();
  await expect(page.locator('[data-press="1300"]')).toHaveCount(1);
  await expect(page.locator('[data-marker="1300"]')).toHaveCount(1);
  expect(sent[2]).toEqual({ kind: "reset" });
});

test("one post in flight, and the newest byte wins the wait", async ({ page }) => {
  await page.setViewportSize(DESK);
  const sent: number[] = [];
  await mockApi(page, true, HLS_RUN);
  await page.route(`**/api/v1/stream/runs/${RUN_ID}/control`, async (route) => {
    const body = route.request().postDataJSON() as { bits: number };
    sent.push(body.bits);
    await new Promise((r) => setTimeout(r, 400));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kind: "pad", frame: 1500 + sent.length, landed: true }) });
  });
  await page.route(`**/nes/live/${RUN_ID}/**`, (route) => route.fulfill({ status: 404, body: "not yet" }));
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await signIn(page);
  await expect(page.getByTestId("monitor-pad")).toHaveAttribute("data-live", "1");
  // Three changes inside the first post's flight: A down (1), B down (3), A up (2).
  await page.evaluate(() => {
    for (const [type, code] of [
      ["keydown", "KeyX"],
      ["keydown", "KeyZ"],
      ["keyup", "KeyX"],
    ] as const)
      window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  });
  await expect(page.locator("[data-press]")).toHaveCount(2);
  await page.waitForTimeout(600);
  expect(sent).toEqual([1, 2]);
});

// The note's figures are the record's, data/stream-monitor.json, not typed.

test("the note states what the record measured", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockApi(page, true);
  await open(page, `/nes/stream/${RUN_ID}`, 500);
  await signIn(page);
  const note = page.getByTestId("monitor-measured");
  await expect(note).toContainText(record.measured);
  for (const n of [record.clock.ahead_frames_max, record.start_press.landed_frame, record.start_press.seen_frame, record.reset.landed_frame, record.reset.seen_frame, record.reset.hold_frames]) {
    await expect(note, String(n)).toContainText(String(n));
  }
  expect(record.start_press.seen_frame - record.start_press.landed_frame).toBe(record.start_press.frames);
  expect(record.reset.seen_frame - record.reset.landed_frame).toBe(record.reset.frames);
});

// ---------------------------------------------------------------------------
// The run history, /nes/stream/history: every run as GET /v1/stream/runs
// tells it. A run needs the GPU and the chain, so the list is answered here
// by a route mock with three runs whose numbers are known: a done hls run
// with a cost line, a done paced file run without one, and a lost run. What
// is checked is that each lands where the page says it does: the last run in
// full, every row in the ledger with the lost one marked, one cost row, and
// a point per paced run in each trend drawing.
// ---------------------------------------------------------------------------

const NO_COST = { ms_console: null, ms_encode: null, ms_gpu: null, ms_readback: null, ms_convert: null, ms_handoff: null };
const HISTORY = [
  {
    ...FIXTURE, ...NO_COST, id: "deadbeef", output: "hls", state: "done", started_at: "2026-10-21T15:30:00Z", ended_at: "2026-10-21T15:31:01Z", exit_code: 0,
    frames_sent: 3606, frames_wanted: 3606, elapsed_s: 60.9, worst_lag_ms: 37, frames_late: 14, ffmpeg_ok: true, markers: 2,
    ms_console: 9.25, ms_encode: 4.5, ms_gpu: 6.75, ms_readback: 3.25, ms_convert: 3.4, ms_handoff: 0.1,
  },
  {
    ...FIXTURE, ...NO_COST, id: "cafe0001", game: "cal", state: "done", started_at: "2026-10-21T15:10:00Z", ended_at: "2026-10-21T15:11:00Z", exit_code: 0,
    frames_sent: 3600, frames_wanted: 3600, elapsed_s: 60.2, worst_lag_ms: 9, frames_late: 1, ffmpeg_ok: true, markers: 0,
  },
  {
    ...FIXTURE, ...NO_COST, id: "0badf00d", pace: false, state: "lost", started_at: "2026-10-21T15:00:00Z", ended_at: "2026-10-21T15:05:00Z",
    frames_sent: 600, elapsed_s: 10, worst_lag_ms: null, frames_late: null, markers: 0,
  },
];

async function mockHistory(page: Page) {
  await mockApi(page, false, FIXTURE, [], passkey(true));
  await page.route("**/api/v1/stream/runs", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ runs: HISTORY }) }));
}

test("the history serves signed out in both languages, noindex, and ships no run", async ({ page }) => {
  await page.setViewportSize(DESK);
  for (const p of ["/nes/stream/history", "/ja/nes/stream/history"]) {
    await open(page, p, 500);
    await expect(page.getByTestId("stream-history"), p).toBeVisible();
    await expect(page.locator("#stream-key"), p).toBeVisible();
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots ?? "", p).toContain("noindex");
    const html = await page.content();
    expect(html, p).not.toContain("data-run=");
    expect(html, p).not.toContain("data-cost=");
    expect(html, `${p}: an em dash`).not.toContain("—");
  }
});

test("a passkey operator reads the ledger, the cost row and the trend with no key", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockHistory(page);
  await open(page, "/nes/stream/history", 500);
  await expect(page.getByTestId("history-ledger")).toBeVisible();
  await expect(page.locator("#stream-key")).toHaveCount(0);
  // The last run, in full.
  const last = page.getByTestId("history-last");
  for (const s of ["deadbeef", "bars", "hls", "3606 of 3606", "60 s asked", "60.9 s", "37 ms", "14", "ok", "done", "2026-10-21 15:30:00Z"]) {
    await expect(last, s).toContainText(s);
  }
  // The ledger: every run, newest first, the lost one marked and not hidden.
  const rows = page.locator("[data-testid=history-ledger] tr[data-run]");
  await expect(rows).toHaveCount(HISTORY.length);
  expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-run")))).toEqual(HISTORY.map((r) => r.id));
  const lost = page.locator('tr[data-run="0badf00d"]');
  await expect(lost).toHaveAttribute("data-state", "lost");
  await expect(lost).toContainText("lost");
  await expect(lost).toHaveClass(/history-off/);
  await expect(page.locator('tr[data-run="deadbeef"] a[href$="/nes/stream/deadbeef"]')).toHaveCount(1);
  // One cost row, with the six figures; the two runs without a line are named.
  const cost = page.locator("[data-cost]");
  await expect(cost).toHaveCount(1);
  for (const s of ["deadbeef", "9.25", "4.5", "6.75", "3.25", "3.4", "0.1"]) await expect(cost, s).toContainText(s);
  await expect(page.getByTestId("history-no-cost")).toContainText("cafe0001");
  await expect(page.getByTestId("history-no-cost")).toContainText("0badf00d");
  // The trend: two drawings, a point per paced run in each, a series per game.
  const trend = page.getByTestId("history-trend");
  await expect(trend.locator("svg")).toHaveCount(2);
  await expect(trend.locator("[data-point]")).toHaveCount(4);
  await expect(trend.locator('[data-point="0badf00d"]')).toHaveCount(0);
  await expect(trend.locator('[data-series="bars"]')).toHaveCount(2);
  await expect(trend.locator('[data-series="cal"]')).toHaveCount(2);
  expect(await trend.locator('svg >> nth=0 >> [data-point="deadbeef"]').getAttribute("data-value")).toBe("37");
  expect(await trend.locator('svg >> nth=1 >> [data-point="deadbeef"]').getAttribute("data-value")).toBe("14");
  await expect(trend.locator(".trend-key")).toContainText("bars");
  await expect(trend.locator(".trend-key")).toContainText("cal");
  // The source line names the route and the count.
  await expect(page.getByTestId("history-source")).toContainText("/api/v1/stream/runs");
  await expect(page.getByTestId("history-source")).toContainText("3 runs");
});

test("the history fits a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockHistory(page);
  await open(page, "/nes/stream/history", 500);
  await expect(page.getByTestId("history-ledger")).toBeVisible();
  const o = await overflow(page);
  expect(o.px, o.out.join("\n")).toBe(0);
});
