import { test, expect } from "@playwright/test";
import { BASE, DESK, PHONE, open } from "./lib";

/**
 * /nes/playground: the hidden bench for a readable NES. It must stay
 * hidden (noindex, out of the sitemap) and its stations must be drawn
 * from the console running in the page, not from nothing: the colours
 * are measured through the signal path, so they cannot all be one
 * colour; the hue clock has a mark per hue it measured; the Mario map has
 * the dissection's rows.
 */

test("the playground is live, hidden from the index, and out of the sitemap", async ({ page }) => {
  const res = await page.request.get(`${BASE}/nes/playground`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  const sitemap = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
  // The sitemap is the real one (it lists the NES section's pages), and the playground is not in it.
  expect(sitemap).toContain("/nes/console</loc>");
  expect(sitemap).not.toContain("/nes/playground");
});

test("the playground's stations are drawn from the console in the page", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  await expect(page.locator("h1")).toHaveCount(1);

  // The colours, measured: every code a swatch, and far from all one colour.
  const swatches = page.locator(".pg-swatch");
  await expect(swatches).toHaveCount(64, { timeout: 30_000 });
  const colours = await swatches.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.background));
  expect(new Set(colours).size).toBeGreaterThan(40);

  // The hue clock: one mark per hue whose swing was found against the burst.
  expect(await page.locator(".pg-clock circle[fill]").count()).toBeGreaterThanOrEqual(10);

  // The beam's console shows a line number once the field is running.
  await expect(page.locator('.pg-hero .pg-console dd[data-k="line"]')).toHaveText(/^\d+$/, { timeout: 20_000 });

  // The wire station encoded a frame and drew its line.
  await expect(page.locator("#wire .pg-instr-h")).toContainText("Line", { timeout: 20_000 });

  // Mario's frame: the dissection's rows, and the shares counted from them.
  expect(await page.locator("#mario .pg-rows li").count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator("#mario .pg-legend")).toContainText("%");
});

test("the hero's console keeps its size while its values change", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const cons = page.locator(".pg-hero .pg-console");
  await expect(cons.locator("dd").first()).not.toHaveText("·", { timeout: 20_000 });
  const first = await cons.boundingBox();
  const next = await page.locator("#wire").boundingBox();
  const before = await cons.locator("dd").allTextContents();
  await page.waitForTimeout(1500);
  // The values moved (the beam ran), and nothing else did.
  expect(await cons.locator("dd").allTextContents()).not.toEqual(before);
  expect(await cons.boundingBox()).toEqual(first);
  expect(await page.locator("#wire").boundingBox()).toEqual(next);
});

test("the slow chip draws, and agrees with the fast chip on every dot it draws", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  await page.locator("#slow").scrollIntoViewIfNeeded();
  const cell = (k: string) => page.locator(`#slow .pg-console dd[data-k="${k}"]`);
  const num = async (k: string) => Number((await cell(k).textContent())!.replace(/[^0-9]/g, "") || "0");
  await expect.poll(() => num("agree"), { timeout: 60_000 }).toBeGreaterThan(2000);
  expect(await num("differ")).toBe(0);
  await expect(page.locator("#slow .pg-size")).toContainText("transistors");
});

test("spot the difference: one tap in one console, apart and together again", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const st = page.locator("#difference");
  await st.scrollIntoViewIfNeeded();
  const cell = (k: string) => st.locator(`.pg-console dd[data-k="${k}"]`);
  // The twins run: the frame count climbs before anything is tapped, and
  // with no tap they never differ.
  await expect.poll(async () => Number((await cell("frame").textContent())?.replace(/\D/g, "") || "0"), { timeout: 30_000 }).toBeGreaterThan(5);
  await expect(cell("now")).toHaveText("0");
  await st.locator(".pg-btn-hot").click();
  // Apart, then together again, each at a frame the console names.
  await expect(cell("first")).toHaveText(/^\d+$/, { timeout: 20_000 });
  await expect(cell("again")).toHaveText(/^\d+$/, { timeout: 20_000 });
  expect(Number((await cell("most").textContent())?.replace(/\D/g, ""))).toBeGreaterThan(0);
  // The engineers' x-ray, read from their encyclopedia: its path has steps.
  await expect(st.locator(".pg-xray .pg-note")).toContainText(/of \d+/);
  // The line where the tap gets in is marked on the listing, and it is the
  // line the x-ray names as the divergence.
  const diverge = (await st.locator(".pg-xray > .pg-now-record").first().textContent()) ?? "";
  const at = (await st.locator(".pg-xray .pg-now-record span").first().textContent()) ?? "";
  expect(diverge).toContain("diverge");
  expect(at).toMatch(/^h \d+/);
  await expect(st.locator('.pg-code-line[data-here="true"]')).toHaveCount(1);
  await expect(st.locator('.pg-code-line[data-here="true"]')).toContainText("$4016");
});

test("the bug museum shows every exhibit with the engineers' own words", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const m = page.locator("#museum");
  const plaques = m.locator(".pg-plaque");
  expect(await plaques.count()).toBeGreaterThanOrEqual(6);
  // Every passage was found in its report; none says it could not be shown.
  await expect(m.getByText("could not be shown")).toHaveCount(0);
  expect(await m.locator(".pg-exhibit-words .pg-now-record").count()).toBeGreaterThanOrEqual(await plaques.count());
  // Choosing another exhibit shows it, and the station keeps its height.
  const before = (await m.boundingBox())!.height;
  await plaques.last().click();
  await expect(m.locator('.pg-exhibit[data-shown="true"] h3')).toHaveText((await plaques.last().locator(".pg-plaque-title").textContent())!);
  expect((await m.boundingBox())!.height).toBe(before);
});

test("real or model: the panels are cut from the figure, and the model's cyan measures apart", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const st = page.locator("#real");
  await st.scrollIntoViewIfNeeded();
  const c = st.locator(".pg-rom-canvas");
  await expect(c).toHaveCount(1, { timeout: 20_000 });
  const box = (await c.boundingBox())!;
  // The left stroke of the D in DUCK: model on the left, the scope's
  // record on the right, as the station opens. The engineers measured
  // the model's cyan twelve to fourteen degrees off; the probe must see
  // a real gap there, and none on the black beside it.
  await page.mouse.move(box.x + box.width * 0.21, box.y + box.height * 0.58);
  const hueCell = st.locator('.pg-console dd[data-k="hue"]');
  await expect(hueCell).toHaveText(/^\d+ degrees$/);
  const deg = Number((await hueCell.textContent())!.split(" ")[0]);
  expect(deg).toBeGreaterThan(4);
  expect(deg).toBeLessThan(40);
  await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.95);
  await expect(hueCell).toHaveText("too grey to say");
  // Changing how the two are compared moves nothing.
  const h = (await st.boundingBox())!.height;
  for (const m of ["Blink", "Difference", "Wipe"]) {
    await st.locator(".pg-segbtn", { hasText: m }).click();
    expect((await st.boundingBox())!.height).toBe(h);
  }
});

test("the sound: a key pressed plays at its pitch, measured off the chip's own trace", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const st = page.locator("#sound");
  await st.scrollIntoViewIfNeeded();
  await st.getByRole("button", { name: "Turn the sound on" }).click({ timeout: 30_000 });
  const pitch = (k: string) => st.locator(`dd[data-k="pitch-${k}"]`);
  await expect(pitch("sq0")).toHaveText("silent", { timeout: 20_000 });
  // A above middle C on the first square, and on the triangle: equal
  // temperament's 440, played through the chip's dividers on the clock
  // the console reports. Measured from the traces, within one percent.
  for (const k of ["sq0", "tri"]) {
    const name = k === "sq0" ? "Square one: A" : "Triangle: A";
    await st.getByRole("button", { name, exact: true }).click();
    await expect(pitch(k)).toHaveText(/^\d+\.\d Hz$/, { timeout: 20_000 });
    const hz = Number((await pitch(k).textContent())!.split(" ")[0]);
    expect(Math.abs(hz - 440) / 440).toBeLessThan(0.01);
  }
  // Muting at the DAC does not stop the voice: its trace still runs.
  await st.locator(".pg-voice-mute").first().click();
  await page.waitForTimeout(500);
  await expect(pitch("sq0")).toHaveText(/Hz$/);
});

test("the encyclopedia's pictures: one per entry, with the entry's own words", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const st = page.locator("#patterns");
  const cards = st.locator(".enc-card");
  // The pictures run only while they are on screen, so put one there.
  await cards.first().scrollIntoViewIfNeeded();
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(5);
  // A picture for every entry shown, the entry's words under it, and a
  // link to that entry's own heading.
  await expect(st.locator(".enc-picture svg")).toHaveCount(n);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const entry = await card.getAttribute("data-entry");
    expect(((await card.locator(".enc-does").textContent()) ?? "").length).toBeGreaterThan(80);
    await expect(card.locator("a")).toHaveAttribute("href", new RegExp(`^/docs/nes/encyclopedia#${entry}-`));
  }
  // The pictures move, and stop when asked, and the station keeps its height.
  const label = () => cards.first().locator(".enc-step").textContent();
  const before = await label();
  await expect.poll(label, { timeout: 15_000 }).not.toBe(before);
  const h = (await st.boundingBox())!.height;
  await cards.first().getByRole("button", { name: "Pause" }).click();
  const still = await label();
  await page.waitForTimeout(1200);
  expect(await label()).toBe(still);
  expect((await st.boundingBox())!.height).toBe(h);
});

test("how it was built: every dated document on the rail, and its day opens it", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const st = page.locator("#arc");
  await st.scrollIntoViewIfNeeded();
  // A lane per group the notebook shelves, and days that hold something.
  expect(await st.locator(".pg-time-lane").count()).toBeGreaterThanOrEqual(5);
  const days = st.locator(".pg-time-day:not([disabled])");
  expect(await days.count()).toBeGreaterThan(10);
  // Every day that holds something opens it: a heading, a link into the
  // notebook, and the station keeps its height.
  const h = (await st.boundingBox())!.height;
  for (const i of [0, Math.floor((await days.count()) / 2), (await days.count()) - 1]) {
    await days.nth(i).click();
    await expect(st.locator(".pg-time-list li").first()).toBeVisible();
    await expect(st.locator(".pg-time-list a").first()).toHaveAttribute("href", /^\/docs\/(nes|cart)\//);
    expect((await st.boundingBox())!.height).toBe(h);
  }
  // The documents with no date in their text are named, not hidden.
  await expect(st.locator(".pg-note").last()).toContainText("no date in their");
});

test("the die: the chip's own shapes, lit from its levels", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const st = page.locator("#die");
  await st.scrollIntoViewIfNeeded();
  const cell = (k: string) => st.locator(`dd[data-k="${k}"]`);
  // The die is drawn and lit: some wires are high, and not all of them.
  await expect.poll(async () => Number((await cell("lit").textContent())?.replace(/\D/g, "") || "0"), { timeout: 60_000 }).toBeGreaterThan(100);
  const lit = Number((await cell("lit").textContent())!.replace(/\D/g, ""));
  expect(lit).toBeLessThan(10_000);
  // The chip is running behind it.
  await expect.poll(async () => Number((await cell("steps").textContent())?.replace(/\D/g, "") || "0"), { timeout: 30_000 }).toBeGreaterThan(714_000);
  // The pointer names the wire under it, from the die data's own names.
  // A point can land between wires, so a few are tried.
  // The box is read again before every move: the stations above this one
  // settle as their pictures arrive, and a box read once goes stale.
  // The readout is written by the station's next painting, which is a pass
  // over every pixel, so each point is waited on rather than slept past.
  const die = st.locator(".pg-die-canvas");
  let named = false;
  for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.5, 0.6], [0.6, 0.5]]) {
    const box = (await die.boundingBox())!;
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.mouse.move(box.x + box.width * fx + 1, box.y + box.height * fy + 1);
    try {
      await expect.poll(async () => (await cell("wire").textContent()) !== "·", { timeout: 6_000 }).toBe(true);
      named = true;
      break;
    } catch {
      // that point was between wires, or the painting was slow: try another
    }
  }
  expect(named, "no wire was named at any of the points tried").toBe(true);
  await expect(cell("level")).toHaveText(/^(high|low)$/);
});

test("the guided tour walks the stations in order and can be left", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const tour = page.locator("#tour");
  await tour.scrollIntoViewIfNeeded();
  const stops = tour.locator(".pg-tour-jump");
  const n = await stops.count();
  expect(n).toBeGreaterThanOrEqual(10);
  await tour.getByRole("button", { name: "Start the tour" }).click();
  const bar = page.locator(".pg-tour-bar");
  await expect(bar).toBeVisible();
  // Every stop is a station on this page, and the tour only goes forward.
  let last = -1;
  for (let i = 0; i < n; i++) {
    await expect(bar.locator(".pg-tour-where")).toContainText(`of ${n}`);
    const here = await page.evaluate(() => Math.round(window.scrollY));
    expect(here).toBeGreaterThanOrEqual(last);
    last = here;
    const next = bar.getByRole("button", { name: "Next", exact: true });
    if (!(await next.isEnabled())) break;
    await next.click();
    await page.waitForTimeout(400);
  }
  // It ends at the last stop, and leaving takes the bar away.
  await expect(bar.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await bar.getByRole("button", { name: "Leave the tour" }).click();
  await expect(bar).toHaveCount(0);
});

test("the bench: the engineers' photographs, one fetched at a time", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(DESK);
  const lab: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/nes/lab/")) lab.push(u.split("/").pop()!);
  });
  await open(page, "/nes/playground", 500);
  const st = page.locator("#bench");
  await st.scrollIntoViewIfNeeded();
  const picks = st.locator(".pg-bench-pick");
  expect(await picks.count()).toBeGreaterThanOrEqual(8);
  // Their caption labels the picture, and its parts are listed under it.
  const shown = st.locator(".pg-bench-stage img");
  expect(((await shown.getAttribute("alt")) ?? "").length).toBeGreaterThan(20);
  expect(await st.locator(".pg-bench-parts li").count()).toBeGreaterThan(1);
  // A wall of the lab's pictures would be megabytes: only the chosen one
  // is fetched, and choosing another keeps the station's height.
  const before = (await st.boundingBox())!.height;
  const first = await shown.getAttribute("src");
  await picks.nth(3).click();
  await expect(shown).not.toHaveAttribute("src", first!);
  expect((await st.boundingBox())!.height).toBe(before);
  expect(lab.length, `fetched ${lab.join(", ")}`).toBeLessThan(await picks.count());
  // The cameras, from the rig's own table.
  expect(await st.locator(".pg-bench-eyes li").count()).toBeGreaterThanOrEqual(3);
});

test("write a program: the chip assembles it, runs it and answers", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const st = page.locator("#program");
  await st.scrollIntoViewIfNeeded();
  const cell = (k: string) => st.locator(`dd[data-k="${k}"]`);
  // The first example: a number into A, then into memory.
  await st.getByRole("button", { name: "Put it on the chip" }).click();
  await expect(st.locator(".pg-prog-listing li").first()).toBeVisible({ timeout: 20_000 });
  expect(await st.locator(".pg-prog-listing li").count()).toBeGreaterThanOrEqual(3);
  await st.getByRole("button", { name: "One instruction" }).click();
  await expect(cell("a")).toHaveText("42 ($2A)", { timeout: 20_000 });
  await st.getByRole("button", { name: "Run it" }).click();
  // It stops itself, and exactly the byte it stored is marked.
  await expect.poll(async () => Number((await cell("ran").textContent()) || "0"), { timeout: 30_000 }).toBeGreaterThan(1);
  await expect(st.locator('.pg-prog-cell[data-touched="true"]')).toHaveCount(1, { timeout: 20_000 });
  // A loop, run to its end: X counts to ten.
  await st.getByRole("button", { name: "Count to ten" }).click();
  await st.getByRole("button", { name: "Put it on the chip" }).click();
  await st.getByRole("button", { name: "Run it" }).click();
  await expect(cell("x")).toHaveText("10 ($0A)", { timeout: 60_000 });
  // A program the chip refuses is refused in the chip's own words.
  await st.locator("#pg-prog-src").fill("  LDA #$ZZ\n");
  await st.getByRole("button", { name: "Put it on the chip" }).click();
  await expect(st.locator(".pg-prog-why")).toContainText("bad hex value", { timeout: 20_000 });
});

test("x-ray your own game: a recording replayed twice, differing by one tap", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(DESK);
  await open(page, "/nes/playground", 500);
  const st = page.locator("#xray");
  await st.scrollIntoViewIfNeeded();
  // A cartridge from "disk": the repository's own calibration cart, which
  // prints the pad's byte in its strip.
  await st.locator('input[type="file"]').setInputFiles("public/nes/cal.nes");
  const cell = (k: string) => st.locator(`dd[data-k="${k}"]`);
  await expect.poll(async () => Number(((await st.locator(".pg-xray-play .pg-note").first().textContent()) ?? "").replace(/\D+/g, "") || "0"), { timeout: 60_000 }).toBeGreaterThan(20);
  await st.getByRole("button", { name: "Pause" }).click();
  await st.getByRole("button", { name: "X-ray it here" }).click();
  // The report: the pictures part after the tap, by something, and come
  // back together (this cartridge prints the byte for one frame).
  await expect(cell("first")).not.toHaveText("·", { timeout: 120_000 });
  const num = async (k: string) => Number(((await cell(k).textContent()) ?? "").replace(/\D+/g, "") || "0");
  const gap = await num("gap");
  expect(gap).toBeGreaterThan(0);
  expect(gap).toBeLessThan(8);
  expect(await num("dots")).toBeGreaterThan(0);
  await expect(cell("rejoin")).toContainText("frame");
  await expect(cell("tap")).toContainText("A at frame");
});

test("the playground fits a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, "/nes/playground", 500);
  await expect(page.locator(".pg-swatch")).toHaveCount(64, { timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

/**
 * Both languages. The stations' own controls and readouts are ours, so
 * they are translated; anything read from the engineers' documents stays
 * in their words, which is why this test looks at our chrome by name
 * rather than scanning the page for Latin letters.
 */
test("the playground speaks Japanese, and still speaks English", async ({ page }) => {
  const OURS = [
    ".pg-hero .pg-console dt",
    ".pg-seg .pg-segbtn",
    ".pg-tour-jump b",
    "#pad .pg-shift-h",
    "#museum .pg-museum-causes .pg-label",
    "#arc .pg-time-panel .pg-eyebrow",
  ];
  const res = await page.request.get(`${BASE}/ja/nes/playground`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toMatch(/<meta name="robots" content="noindex, nofollow"/);

  await page.setViewportSize(DESK);
  await open(page, "/ja/nes/playground", 500);
  await expect(page.locator(".pg-swatch")).toHaveCount(64, { timeout: 30_000 });
  for (const sel of OURS) {
    const found = await page.locator(sel).allTextContents();
    expect(found.length, sel).toBeGreaterThan(0);
    for (const text of found) expect(text, sel).toMatch(/[ぁ-んァ-ヶ一-龠]/);
  }
  // The page before the pass said so at the top; it must not any more.
  expect(await page.locator(".pg").innerText()).not.toContain("まだ英語だけ");
  // Every pad on the page names its keys the same way, the reader's way.
  for (const pad of ["#pad .pg-pad-buttons", ".pg-stage .pg-minipad", "#difference .pg-minipad", "#xray .pg-minipad"]) {
    const keys = await page.locator(`${pad} button`).allTextContents();
    expect(keys.length, pad).toBe(8);
    expect(keys, pad).toContain("セレクト");
  }

  // The same chrome in English, so a translation cannot be wired the one way only.
  await open(page, "/nes/playground", 500);
  await expect(page.locator(".pg-swatch")).toHaveCount(64, { timeout: 30_000 });
  for (const sel of OURS) {
    const found = await page.locator(sel).allTextContents();
    expect(found.length, sel).toBeGreaterThan(0);
    for (const text of found) {
      expect(text, sel).toMatch(/[A-Za-z]/);
      expect(text, sel).not.toMatch(/[ぁ-んァ-ヶ一-龠]/);
    }
  }
  for (const pad of ["#pad .pg-pad-buttons", ".pg-stage .pg-minipad", "#difference .pg-minipad", "#xray .pg-minipad"]) {
    const keys = await page.locator(`${pad} button`).allTextContents();
    expect(keys.length, pad).toBe(8);
    expect(keys, pad).toContain("Select");
  }
});
