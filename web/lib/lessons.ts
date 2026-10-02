import fs from "node:fs";
import path from "node:path";

/**
 * The lessons: cartridges of our own, built from lessons/ by our own
 * assembler and measured on our console. data/lessons.json is written only
 * by scripts/board-lessons.py; the program text is read from the lesson's
 * own directory, so the page and the cartridge come from the same file.
 */

export interface Jump {
  held: number;
  frames: number;
  risen: number;
}

export interface Lesson {
  key: string;
  title: string;
  tree: string;
  sha256: string;
  code_bytes: number;
  instructions: number;
  /** The cartridge, base64. */
  rom: string;
  measures: { full_speed_after: number; full_speed: number; jumps: Jump[] };
  /** The same measures off a commercial game's runs: counts only. */
  against?: { game: string; full_speed_after: number; full_speed: number; jumps: Jump[] } | null;
  pictures: { frame: number; png: string }[];
}

const ROOT = path.join(process.cwd(), "..");
let cached: Lesson[] | null = null;

export function lessons(): Lesson[] {
  if (!cached) {
    const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[] };
    // A section of lessons with none in it would read as a design choice.
    if (!r.lessons?.length) throw new Error("data/lessons.json holds no lessons; scripts/board-lessons.py writes it");
    cached = r.lessons;
  }
  return cached;
}

export function lesson(key: string): Lesson | undefined {
  return lessons().find((l) => l.key === key);
}

/** The lesson's program as written, the file the cartridge was built from. */
export function program(key: string): string {
  return fs.readFileSync(path.join(ROOT, "lessons", key, "prg.s"), "utf8");
}

/** The lines from one label up to the next of the given labels. */
export function excerpt(key: string, from: string, to: string): string {
  const lines = program(key).split("\n");
  const a = lines.findIndex((l) => l === `${from}:`);
  const b = lines.findIndex((l, i) => i > a && l === `${to}:`);
  if (a < 0 || b < 0) throw new Error(`lessons/${key}/prg.s has no ${from}: ... ${to}: to show`);
  // The comment block above the label belongs to it.
  let s = a;
  while (s > 0 && lines[s - 1].startsWith(";;")) s--;
  let e = b;
  while (e > a && lines[e - 1].startsWith(";;")) e--;
  return lines.slice(s, e).join("\n").trimEnd();
}

/** The file name the cartridge is served as. */
export const romName = (key: string) => `${key}.nes`;
