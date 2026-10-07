import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, DESK, JA_FLOOR, jaShare, open, PHONE, overflow, servedBody } from "./lib";
import type { Lesson } from "../lib/lessons";

/**
 * The lessons: our own cartridges, built from lessons/ and measured on our
 * console. Each page is held to data/lessons.json, the cartridge it offers
 * to the record's bytes, and the program it shows to the file in lessons/.
 */

const ROOT = path.join(__dirname, "..", "..");
function record(): Lesson[] {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
  if (!r.lessons.length) throw new Error("data/lessons.json holds no lessons; the spec would pass on nothing");
  return r.lessons;
}

test("the lessons page lists every lesson, and the autopsy's front door lists the lessons", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/autopsy/lessons", 200);
  const hrefs = await page.locator("[data-lessons] > li > a:first-child").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(record().map((l) => `/autopsy/lessons/${l.key}`));
  // Each group under its heading, in the record's order, every lesson once.
  const groups = (JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { topics: { key: string; lessons: string[] }[] }).topics;
  expect(groups.length, "the record holds groups").toBeGreaterThan(1);
  for (const g of groups) {
    const inside = await page.locator(`[data-lessons][data-topic="${g.key}"] > li > a:first-child`).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(inside).toEqual(g.lessons.map((k) => `/autopsy/lessons/${k}`));
    // A heading straight inside the prose, where the stylesheet styles it.
    await expect(page.locator(`.prose > h2[data-topic-head="${g.key}"]`)).toHaveCount(1);
  }
  await open(page, "/autopsy", 200);
  await expect(page.locator('[data-parts] a[href="/autopsy/lessons"]')).toHaveCount(1);
});

for (const l of record()) {
  test(`${l.key}: the page's figures are the record's, beside the game's`, async ({ page }) => {
    await page.setViewportSize(DESK);
    await open(page, `/autopsy/lessons/${l.key}`, 200);
    expect(l.against, "every lesson so far carries its comparison").toBeTruthy();
    const rows = await page.locator("tr[data-lesson-row]").evaluateAll((rs) => rs.map((r) => [(r as HTMLElement).dataset.lessonRow, (r as HTMLElement).dataset.lessonOurs, (r as HTMLElement).dataset.lessonTheirs]));
    expect(rows.length, "a table of measures").toBeGreaterThan(2);
    for (const [k, ours, theirs] of rows) expect(ours && theirs, `${k}: both sides filled`).toBeTruthy();
    if (l.kind === "jump") {
      const a = l.against as typeof l.measures;
      expect(rows.filter((r) => r[0] === "jump").map((r) => [r[1], r[2]])).toEqual(l.measures.jumps.map((j, i) => [`${j.frames},${j.risen}`, `${a.jumps[i].frames},${a.jumps[i].risen}`]));
      expect(rows.find((r) => r[0] === "walk")?.[1]).toBe(String(l.measures.full_speed_after));
    } else if (l.kind === "sound") {
      const a = l.against as typeof l.measures;
      expect(l.measures.music_before, "our tune plays on the channel before the jump").toBeGreaterThan(0);
      expect(a.music_before, "and the game's does").toBeGreaterThan(0);
      expect(l.measures.sweep_settings).toBeGreaterThan(0);
      expect(l.measures.music_back, "our tune comes back").toBeGreaterThan(0);
    } else if (l.kind === "pause") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // A press too soon was tried and ignored, A was pressed, and still nothing moved or was drawn.
        expect(x.ignored_after.length, `${x === a ? "the game" : "ours"}: a second Start was tried`).toBe(1);
        expect(x.ignored_after[0]).toBeLessThan(x.wait);
        expect([x.a_pressed, x.held, x.drawn, x.same_picture, x.cut]).toEqual([true, true, 0, true, true]);
        expect(x.chime_notes).toBeGreaterThan(1);
      }
      expect(rows.find((r) => r[0] === "wait")?.slice(1)).toEqual([String(l.measures.wait), String(a.wait)]);
    } else if (l.kind === "coins") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // The score with the coin, the bar written, a coin that turns through four pictures, then the points.
        expect(x.score_too).toBe(true);
        expect(x.bar_tiles).toBeGreaterThanOrEqual(8);
        expect([x.coin_pictures, x.picture_frames]).toEqual([4, 2]);
        expect(x.coin_rise).toBeGreaterThan(10);
        expect(x.points_frames).toBeGreaterThan(10);
      }
    } else if (l.kind === "lives") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // A hang, a hop, a life taken (one fewer), a screen up for a while, and the level from its start.
        expect(x.hang).toBeGreaterThan(5);
        expect(x.rise).toBeGreaterThan(5);
        expect(x.lives[0] - x.lives[1]).toBe(1);
        expect(x.screen).toBeGreaterThan(30);
        expect(x.from_start).toBe(true);
      }
      expect(rows.find((r) => r[0] === "hang")?.slice(1)).toEqual([String(l.measures.hang), String(a.hang)]);
    } else if (l.kind === "flicker") {
      const a = l.against as unknown as { most: number; left_out: number; never_drawn: number; cycle: number | null };
      const m = l.measures as unknown as { kept: typeof a; turned: typeof a };
      // Ten on a line, two left out each frame; kept, two never drawn; turning, none; Mario's turn in a cycle.
      expect([m.kept.most, m.kept.left_out, m.kept.never_drawn, m.kept.cycle]).toEqual([10, 2, 2, 1]);
      expect([m.turned.never_drawn, m.turned.cycle]).toEqual([0, 10]);
      expect(a.cycle).toBeGreaterThan(1);
      expect(a.never_drawn).toBe(0);
    } else if (l.kind === "walkers") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // Turns at walls and at least one meeting were seen, and the pace was read.
        expect(x.wall_turns).toBeGreaterThan(1);
        expect(x.meetings).toBeGreaterThan(0);
        expect(x.pixels && x.every).toBeTruthy();
      }
      expect(rows.find((r) => r[0] === "pace")?.slice(1)).toEqual([`${l.measures.pixels}, every ${l.measures.every}`, `${a.pixels}, every ${a.every}`]);
    } else if (l.kind === "solid") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // A real bump (still rising fast at the touch), a fall back down, the block's tiles blanked
        // and drawn again, and a long push at the wall with the speed taken away again and again.
        expect(x.rising).toBeGreaterThanOrEqual(3);
        expect(x.fall_frames).toBeGreaterThan(5);
        expect(x.block_back).toBeGreaterThan(5);
        expect(x.pushing_frames).toBeGreaterThan(60);
        expect(x.zeroed).toBeGreaterThan(5);
      }
      expect(rows.find((r) => r[0] === "fall")?.slice(1)).toEqual([String(l.measures.fall_frames), String(a.fall_frames)]);
    } else if (l.kind === "about") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // It crawled a long way, one row written per 8 pixels, no split, no other tile.
        expect(x.crawled).toBeGreaterThan(240);
        expect(x.rows).toBeGreaterThan(30);
        expect([x.row_pixels, x.split, x.other]).toEqual([8, false, 0]);
      }
      expect(rows.find((r) => r[0] === "row_pixels")?.slice(1)).toEqual(["8", "8"]);
    } else if (l.kind === "splash") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // It showed, its colours turned many times and sprites fell in a loop, and still no tile was written.
        expect(x.shown).toBeGreaterThan(100);
        expect(x.turns).toBeGreaterThan(10);
        expect(x.fall && x.loop).toBeTruthy();
        expect(x.fade_steps).toBeGreaterThanOrEqual(3);
        expect(x.tiles).toBe(0);
      }
      expect(rows.find((r) => r[0] === "tiles")?.slice(1)).toEqual(["0", "0"]);
    } else if (l.kind === "menu") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // Three letters typed, one tile each; the held direction repeated and went round the grid;
        // the cursor is behind the letters, blinks, and every move clicked.
        expect(x.typed.map((t) => t[1])).toEqual([1, 1, 1]);
        expect(x.wait && x.every && x.wait > x.every).toBe(true);
        expect(x.wraps_to).toBeGreaterThan(x.width);
        expect(x.behind).toBe(true);
        expect(x.blink.every((k) => k > 0)).toBe(true);
        expect(x.clicks).toBe(x.moves);
      }
      expect(rows.find((r) => r[0] === "width")?.slice(1)).toEqual([String(l.measures.width), String(a.width)]);
    } else if (l.kind === "items") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // Rows were drawn bottom up while it opened and none on the way back; the mid-slide Start
        // was pressed (the measure refuses a run without it) and changed nothing; no split.
        expect(x.rows, "rows were drawn while it opened").toBeGreaterThan(10);
        expect([x.bottom_up, x.ignored, x.split, x.rows_closing]).toEqual([true, true, false, 0]);
        expect(x.travel).toBeGreaterThan(160);
      }
      expect(a.mirroring).toEqual({ fixed: false, changes: 0 });
      expect(rows.find((r) => r[0] === "step")?.slice(1)).toEqual([String(l.measures.step), String(a.step)]);
    } else if (l.kind === "title") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // Every part was found in the runs: a cursor written into the background as a column,
        // a countdown, a demo that ran out by itself and scrolled, and Start both ways.
        expect(x.title.cleared, "the tables are cleared before the title is drawn").toBeGreaterThan(0);
        expect(x.cursor).toEqual({ tiles: 3, step: 32 });
        expect(x.countdown).toBeGreaterThan(0);
        expect(x.demo?.scrolled).toBe(true);
        expect([x.start_demo, x.start_title].every((v) => typeof v === "number")).toBe(true);
      }
      expect(rows.find((r) => r[0] === "tiles")?.slice(1)).toEqual([l.measures.title.tiles.toLocaleString("en"), a.title.tiles.toLocaleString("en")]);
    } else if (l.kind === "status") {
      const a = l.against as typeof l.measures;
      expect(l.measures.split_line).toBe(a.split_line);
      expect(l.measures.other_bar_writes).toBe(0);
      expect(l.patterns?.["sprite-0-split"], "our own autopsy names our split").toBeTruthy();
    } else if (l.kind === "run") {
      const a = l.against as typeof l.measures;
      expect(l.measures.light_max).toBeLessThan(25);
      expect(l.measures.strong_min).toBeGreaterThanOrEqual(25);
      expect([a.light_max, a.strong_min]).toEqual([24, 25]);
      expect(rows.find((r) => r[0] === "walk")?.[1]).toBe(String(l.measures.walk_top));
    } else if (l.kind === "stomp") {
      expect(l.measures.compare?.some((c) => c.is_touch), "our own autopsy names our own touch test").toBe(true);
      await expect(page.locator("[data-lesson-found]")).toHaveCount(1);
      expect(rows.find((r) => r[0] === "flat")?.[1]).toBe(String(l.measures.stomp.flat));
    } else if (l.kind === "screens") {
      expect(rows.find((r) => r[0] === "values")?.[1]).toBe(l.measures.values.join(", "));
      expect(l.measures.engine, "our own autopsy finds our own jump engine").toBe(true);
    } else if (l.kind === "rooms") {
      const a = l.against as typeof l.measures;
      expect(rows.find((r) => r[0] === "slide")?.slice(1)).toEqual([String(l.measures.slide), String(a.slide)]);
      expect(rows.find((r) => r[0] === "wait")?.slice(1)).toEqual([String(l.measures.wait), String(a.wait)]);
      // Ours is soldered; the game switches its mirroring around the slide, and the page says what for.
      expect(l.measures.mirroring?.fixed).toBe(true);
      expect(a.mirroring?.slide).toBe("vertical");
      await expect(page.locator("[data-lesson-why]")).toHaveCount(1);
    } else if (l.kind === "pit") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // A fall with no hop, steering on the way down, the world going on, a life taken only later, the screen, the level from its start.
        expect(x.rise).toBe(0);
        expect(x.moved).toBeGreaterThan(5);
        expect(x.to_bottom).toBeGreaterThan(5);
        expect(x.to_life).toBeGreaterThan(30);
        expect(x.walker_moved).toBe(true);
        expect(x.lives[0] - x.lives[1]).toBe(1);
        expect(x.screen).toBeGreaterThan(30);
        expect(x.from_start).toBe(true);
      }
      expect(rows.find((r) => r[0] === "to_life")?.slice(1)).toEqual([String(l.measures.to_life), String(a.to_life)]);
    } else if (l.kind === "hitbox") {
      const a = l.against as typeof l.measures;
      for (const x of [l.measures, a]) {
        // Both boxes sit inside their pictures, the pictures overlapped before the boxes did, and the hit came with the boxes.
        expect(x.player.length === 4 && x.walker.length === 4).toBe(true);
        expect(Math.min(...x.player, ...x.walker)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...x.player, ...x.walker)).toBeGreaterThan(0);
        expect(x.before).toBeGreaterThan(0);
        expect(x.pictures[0]).toBeGreaterThan(0);
      }
      expect(rows.find((r) => r[0] === "player")?.slice(1)).toEqual([l.measures.player.join(", "), a.player.join(", ")]);
      // The game decides the frame after the boxes meet; ours as they meet.
      expect([l.measures.after, a.after]).toEqual([false, true]);
    } else {
      const a = l.against as typeof l.measures;
      expect(rows.find((r) => r[0] === "strips")?.slice(1)).toEqual([String(l.measures.strips), String(a.strips)]);
      expect(rows.find((r) => r[0] === "tiles")?.slice(1)).toEqual([l.measures.tiles.join(" / "), a.tiles.join(" / ")]);
    }
    await expect(page.locator("[data-lesson-pictures] img")).toHaveCount(l.pictures.length);
    // The lessons either side of this one in its group, and none past its ends.
    const group = (JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { topics: { lessons: string[] }[] }).topics.find((g) => g.lessons.includes(l.key))!.lessons;
    const at = group.indexOf(l.key);
    for (const [which, k] of [["before", group[at - 1]], ["after", group[at + 1]]] as const) {
      const link = page.locator(`[data-lesson-side="${which}"] a`);
      if (k) await expect(link).toHaveAttribute("href", `/autopsy/lessons/${k}`);
      else await expect(link).toHaveCount(0);
    }
  });

  test(`${l.key}: the cartridge and the program served are the record's and the repository's`, async ({ page, request }) => {
    await page.setViewportSize(DESK);
    await open(page, `/autopsy/lessons/${l.key}`, 200);
    const rom = await request.get(`${BASE}/autopsy/lessons/${l.key}.nes`);
    expect(rom.status()).toBe(200);
    const bytes = Buffer.from(await rom.body());
    expect(bytes.equals(Buffer.from(l.rom, "base64")), "the served cartridge is the recorded one").toBe(true);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("NES\x1a");
    const src = await request.get(`${BASE}/autopsy/lessons/${l.key}.s`);
    const text = await src.text();
    expect(text).toBe(fs.readFileSync(path.join(ROOT, "lessons", l.key, "prg.s"), "utf8"));
    const shown = (await page.locator("[data-lesson-code]").textContent()) ?? "";
    expect(shown.length, "an excerpt is shown").toBeGreaterThan(200);
    expect(text.includes(shown), "the excerpt is the program's own text").toBe(true);
  });

  test(`${l.key}: in Japanese it is Japanese, and it fits a phone`, async ({ page, request }) => {
    const html = await (await request.get(`${BASE}/ja/autopsy/lessons/${l.key}`)).text();
    expect(jaShare(servedBody(html))).toBeGreaterThanOrEqual(JA_FLOOR);
    await page.setViewportSize(PHONE);
    await open(page, `/ja/autopsy/lessons/${l.key}`, 200);
    const o = await overflow(page);
    expect(o.out, `${o.px}px sideways`).toEqual([]);
  });
}

test("a lesson's play button opens the play page with its cartridge in", async ({ page }) => {
  await page.setViewportSize(DESK);
  const l = record()[0];
  await open(page, `/autopsy/lessons/${l.key}`, 200);
  const href = await page.locator("[data-lesson-play]").getAttribute("href");
  expect(href).toBe(`/nes/play?lesson=${l.key}`);
  await open(page, href!, 500);
  await expect(page.locator("[data-play-status]")).toContainText(`${l.key}.nes`, { timeout: 20_000 });
  // A name that is not a lesson's loads nothing and says nothing went wrong.
  await open(page, "/nes/play?lesson=no-such-lesson", 1500);
  await expect(page.locator("[data-play-status]")).not.toContainText("no-such-lesson");
  await expect(page.locator("[data-play-why]")).toHaveCount(0);
});

test("each pattern our own autopsy found in a lesson points at that lesson", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/autopsy/patterns", 200);
  const told = await page.locator("[data-autopsy-pattern]").evaluateAll((ss) =>
    ss.map((s) => [(s as HTMLElement).dataset.autopsyPattern, [...s.querySelectorAll("[data-autopsy-pattern-lessons] a")].map((a) => a.getAttribute("href"))] as const));
  const want = new Map<string, string[]>();
  for (const l of record()) for (const p of Object.keys(l.patterns ?? {})) want.set(p, [...(want.get(p) ?? []), `/autopsy/lessons/${l.key}`]);
  expect(want.size, "the lessons hold patterns").toBeGreaterThan(2);
  for (const [p, hrefs] of told) expect(hrefs, String(p)).toEqual(want.get(String(p)) ?? []);
  // The two a lesson was written for are among them.
  expect(want.get("jump-engine")).toContain("/autopsy/lessons/screens");
  expect(want.get("position-compare")).toContain("/autopsy/lessons/stomp");
});
