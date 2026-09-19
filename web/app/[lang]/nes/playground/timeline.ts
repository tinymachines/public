import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "@/lib/docs";
import { allShelves, type ShelfDoc } from "@/lib/nes-shelves";

/**
 * The arc as a timeline: every document the notebook shelves, in the
 * engineers' own groups (docs/nes/shelves.json, which the pull writes),
 * each at the first date its own text mentions.
 *
 * That rule is stated on the page, because it is a rule and not a
 * record: a document's first date is usually the day its work was done
 * ("MEASURED 2026-09-12"), and where it is not, the page is showing the
 * first date the document itself carries and says so. A document whose
 * text carries no date at all is listed apart rather than placed at a
 * guessed spot.
 */

export interface Stop extends ShelfDoc {
  /** The first date in the document's text, or null. */
  date: string | null;
}
export interface Lane {
  key: string;
  heading: string;
  intro: string;
  stops: Stop[];
}
export type Timeline =
  | { ok: true; lanes: Lane[]; undated: Stop[]; first: string; last: string; days: number }
  | { ok: false; reason: string };

const DATE = /\b20\d\d-[01]\d-[0-3]\d\b/;

function firstDate(route: string): string | null {
  const file = path.join(DOCS_DIR, `${route.replace(/^\/docs\//, "")}.md`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8").match(DATE)?.[0] ?? null;
}

const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

export function timeline(): Timeline {
  let shelves;
  try {
    shelves = allShelves();
  } catch (e) {
    return { ok: false, reason: String((e as Error).message ?? e) };
  }
  const lanes: Lane[] = [];
  const undated: Stop[] = [];
  for (const s of shelves) {
    const stops = s.docs.map((d) => ({ ...d, date: firstDate(d.route) }));
    for (const st of stops) if (!st.date) undated.push(st);
    lanes.push({ key: s.key, heading: s.heading, intro: s.intro, stops: stops.filter((st) => st.date) });
  }
  const all = lanes.flatMap((l) => l.stops.map((s) => s.date!)).sort();
  if (all.length < 5) return { ok: false, reason: `only ${all.length} of the notebook's documents carry a date` };
  const first = all[0];
  const last = all[all.length - 1];
  return { ok: true, lanes: lanes.filter((l) => l.stops.length), undated, first, last, days: day(last) - day(first) + 1 };
}
