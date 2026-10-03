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

export interface JumpMeasures {
  full_speed_after: number;
  full_speed: number;
  jumps: Jump[];
}

/** How the picture is kept ahead of the camera (scripts/board-lessons.py scroll_measures). */
export interface ScrollMeasures {
  strips: number;
  every_min: number;
  every_max: number;
  every_mean: number;
  /** Each a list of the values seen, as text: one value means every strip agreed. */
  frames: string[];
  columns: string[];
  tiles: number[];
  colours: string[];
  ahead_min: number;
  ahead_max: number;
  column_frames: string[];
  last_write: string[];
}

/** The first walk out of a room (scripts/board-lessons.py rooms_measures). */
export interface RoomsMeasures {
  /** Which name tables sit side by side: fixed by our board; switched by the game's. */
  mirroring?: { playing: string; fixed?: boolean; slide?: string; switched?: number; back?: number } | null;
  before: number;
  after: number;
  wait: number;
  slide: number;
  travel: number;
  step: number;
  /** Runs of eight or more writes, "<tiles> across|down": how many. */
  written_before: Record<string, number>;
  written_during: Record<string, number>;
  column_every: number[];
  columns_from: number | null;
  columns: number;
  /** The first step up (rooms_up): rows written across after the number changed. */
  up?: RoomsUp;
}

export interface RoomsUp {
  before: number;
  after: number;
  rows: number;
  tiles: number[];
  first: number | null;
  every: number[];
  upward: boolean;
  from_row: number | null;
  to_row: number | null;
}

/** One byte choosing the screen (scripts/board-lessons.py screens_measures). */
export interface ScreensMeasures {
  values: number[];
  changes: number;
  stretches: number;
  met: number;
  engine: boolean;
  table: { entries: number; seen: number } | null;
  pause: { before: number; during: number; frames: number } | null;
}

/** Where the two were the frame before they touched (scripts/board-lessons.py touch_event). */
export interface Touch {
  frame: number;
  dx: number;
  dy: number;
  fall: number;
  after: number;
  state: [number, number];
}

/** A walker, a stomp and a hit (stomp_measures, mario_touches). */
export interface StompMeasures {
  walk: number;
  stomp: Touch & { flat: number };
  hit: Touch;
  /** The routines our own autopsy marked as comparing positions; only ours has it. */
  compare?: { name: string; is_touch: boolean; x: string; y: string }[];
}

/** One jump (scripts/board-lessons.py jump_of): speeds in pixels a frame, pulls in 256ths. */
export interface OneJump {
  first: number;
  held: number | null;
  released: number | null;
  rose: number;
}

/** Walking, running and the jump each takes (run_measures, mario_run). */
export interface RunMeasures {
  walk_top: number;
  run_top: number;
  run_after: number;
  walk_jump: OneJump;
  run_jump: OneJump;
  light_max: number;
  strong_min: number;
}

/** A bar that stays still (scripts/board-lessons.py status_measures). */
export interface StatusMeasures {
  split_line: number;
  split_frames: number;
  frames: number;
  bar_scroll: number[];
  timer: { row: number; column: number; tiles: number; writes: number; every: number[] };
  other_bar_writes: number;
}

/** A jump sound sharing the music's channel, shape only (sound_measures). */
export interface SoundMeasures {
  music_before: number;
  starts?: number;
  sweep_settings: number;
  sweep_frames?: number[];
  music_back?: number | null;
}

interface Base {
  key: string;
  title: string;
  description: string;
  tree: string;
  sha256: string;
  code_bytes: number;
  instructions: number;
  /** The cartridge, base64. */
  rom: string;
  pictures: { frame: number; png: string }[];
  /** What our own autopsy's rules named in the cartridge: pattern, routines. */
  patterns?: Record<string, number>;
}

/** A lesson and the same measures off a commercial game's runs: counts only. */
export type Lesson =
  | (Base & { kind: "jump"; measures: JumpMeasures; against?: (JumpMeasures & { game: string }) | null })
  | (Base & { kind: "scroll"; measures: ScrollMeasures; against?: (ScrollMeasures & { game: string }) | null })
  | (Base & { kind: "screens"; measures: ScreensMeasures; against?: (ScreensMeasures & { game: string }) | null })
  | (Base & { kind: "run"; measures: RunMeasures; against?: (RunMeasures & { game: string }) | null })
  | (Base & { kind: "status"; measures: StatusMeasures; against?: (StatusMeasures & { game: string }) | null })
  | (Base & { kind: "sound"; measures: SoundMeasures; against?: (SoundMeasures & { game: string }) | null })
  | (Base & { kind: "stomp"; measures: StompMeasures; against?: (StompMeasures & { game: string }) | null })
  | (Base & { kind: "rooms"; measures: RoomsMeasures; against?: (RoomsMeasures & { game: string }) | null });

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
