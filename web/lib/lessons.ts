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

/** A pause, measured the same on both (pause_measures): which presses
 * took, how long Start is ignored, what was drawn, the sound's shape. */
export interface PauseMeasures {
  ignored_after: number[];
  a_pressed: boolean;
  stops: number;
  starts: number;
  held: boolean;
  wait: number;
  drawn: number;
  same_picture: boolean;
  cut: boolean;
  chime_notes: number;
  chime_every: number[];
  music_back: number | null;
}

/** A title screen, measured the same on both (title_measures). */
export interface TitleMeasures {
  title: { frames: number; cleared: number; tiles: number };
  demo?: { frames: number; scrolled: boolean };
  cursor?: { tiles: number; step: number };
  countdown?: number;
  start_demo?: number;
  start_title?: number;
}

/** An item screen the picture slides away to show (items_measures). */
export interface ItemsMeasures {
  step: number;
  travel: number;
  open_frames: number;
  close_frames: number;
  close_step: number;
  ignored: boolean;
  split: boolean;
  rows: number;
  bottom_up: boolean;
  every: number | null;
  rows_closing: number;
  mirroring: { fixed: boolean; changes: number };
}

/** Typing a name from a grid (menu_measures). */
export interface MenuMeasures {
  after_press: number[];
  wait: number | null;
  every: number | null;
  width: number;
  wraps_to: number | null;
  typed: [number, number][];
  behind: boolean;
  blink: [number, number];
  moves: number;
  clicks: number;
}

/** A splash screen that moves without drawing (splash_measures). */
export interface SplashMeasures {
  shown: number;
  tiles: number;
  turn_every: number | null;
  turns: number;
  fade_steps: number;
  fade_frames: number;
  fall: number | null;
  loop: number | null;
}

/** Words that crawl up the screen (about_measures). */
export interface AboutMeasures {
  step: number | null;
  every: number | null;
  crawled: number;
  split: boolean;
  rows: number;
  row_every: number | null;
  row_pixels: number | null;
  colours: number;
  other: number;
  frames: number;
}

/** Ground, a block bumped from below and a wall (solid_measures). */
export interface SolidMeasures {
  rising: number;
  fall_frames: number;
  block_after: number;
  block_back: number;
  wall_x: number;
  pushed_back: boolean;
  zeroed: number;
  zeroed_every: number[];
  pushing_frames: number;
}

/** Walkers that turn at walls and at each other (walker_measures). */
export interface WalkersMeasures {
  pixels: number | null;
  every: number | null;
  wall_turns: number;
  inside: boolean[];
  meetings: number;
  overlap: number[];
}

/** Sprites on a line, from sprite memory (flicker_measures). */
export interface FlickerOne {
  most: number;
  left_out: number;
  never_drawn: number;
  cycle: number | null;
  frames: number;
}

/** Ours, with the order kept and with it turning. */
export interface FlickerMeasures {
  kept: FlickerOne;
  turned: FlickerOne;
}

/** Losing a life and starting again (lives_measures). */
export interface LivesMeasures {
  hang: number;
  rise: number;
  to_life: number;
  clear_after: number;
  screen: number;
  from_start: boolean;
  lives: number[];
}

/** A coin from a block and the score (coins_measures). */
export interface CoinsMeasures {
  score_too: boolean;
  bar_tiles: number;
  coin_frames: number;
  coin_rise: number;
  coin_pictures: number;
  picture_frames: number;
  points_frames: number;
  points_rise: number;
}

/** Boxes inside pictures (hitbox_measures): each inset as left, top, right, bottom. */
export interface HitboxMeasures {
  player: number[];
  walker: number[];
  pictures: number[];
  boxes: number[];
  before: number;
  /** The touch is known the frame after the boxes meet (the game's), or as they meet (ours). */
  after: boolean;
  frame: number;
}

/** Falling into a hole (pit_measures). */
export interface PitMeasures {
  to_bottom: number;
  moved: number;
  rise: number;
  to_life: number;
  walker_moved: boolean;
  clear_after: number;
  screen: number;
  from_start: boolean;
  lives: number[];
}

/** The game's end and what follows (gameover_measures). */
export interface GameoverMeasures {
  to_screen: number;
  screen_tiles: number;
  held: number;
  title_tiles: number;
  start_to_play: number;
  lives_back: boolean;
  lives: number[];
}

/** A level's end (interlude_measures). */
export interface InterludeMeasures {
  slide: number;
  walk: number;
  ignored: boolean;
  count_frames: number;
  units: number;
  per_unit: number;
  counted: number;
  card_after: number;
  card: number;
  levels: number[];
}

/** A lift that carries the player (platforms_measures). */
export interface PlatformsMeasures {
  axis: "across" | "down";
  step: number | null;
  every: number | null;
  travel: number;
  standing: number;
  stepped: number;
  same: number;
  steady: boolean;
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
  | (Base & { kind: "pause"; measures: PauseMeasures; against?: (PauseMeasures & { game: string }) | null })
  | (Base & { kind: "title"; measures: TitleMeasures; against?: (TitleMeasures & { game: string }) | null })
  | (Base & { kind: "items"; measures: ItemsMeasures; against?: (ItemsMeasures & { game: string }) | null })
  | (Base & { kind: "menu"; measures: MenuMeasures; against?: (MenuMeasures & { game: string }) | null })
  | (Base & { kind: "splash"; measures: SplashMeasures; against?: (SplashMeasures & { game: string }) | null })
  | (Base & { kind: "about"; measures: AboutMeasures; against?: (AboutMeasures & { game: string }) | null })
  | (Base & { kind: "solid"; measures: SolidMeasures; against?: (SolidMeasures & { game: string }) | null })
  | (Base & { kind: "walkers"; measures: WalkersMeasures; against?: (WalkersMeasures & { game: string }) | null })
  | (Base & { kind: "flicker"; measures: FlickerMeasures; against?: (FlickerOne & { game: string }) | null })
  | (Base & { kind: "lives"; measures: LivesMeasures; against?: (LivesMeasures & { game: string }) | null })
  | (Base & { kind: "coins"; measures: CoinsMeasures; against?: (CoinsMeasures & { game: string }) | null })
  | (Base & { kind: "hitbox"; measures: HitboxMeasures; against?: (HitboxMeasures & { game: string }) | null })
  | (Base & { kind: "pit"; measures: PitMeasures; against?: (PitMeasures & { game: string }) | null })
  | (Base & { kind: "gameover"; measures: GameoverMeasures; against?: (GameoverMeasures & { game: string }) | null })
  | (Base & { kind: "interlude"; measures: InterludeMeasures; against?: (InterludeMeasures & { game: string }) | null })
  | (Base & { kind: "platforms"; measures: PlatformsMeasures; against?: (PlatformsMeasures & { game: string }) | null })
  | (Base & { kind: "stomp"; measures: StompMeasures; against?: (StompMeasures & { game: string }) | null })
  | (Base & { kind: "rooms"; measures: RoomsMeasures; against?: (RoomsMeasures & { game: string }) | null });

/** A group of lessons, in the order to read them (lessons/topics.json). */
export interface Topic {
  key: string;
  title: string;
  lessons: string[];
}

const ROOT = path.join(process.cwd(), "..");
let cached: { lessons: Lesson[]; topics: Topic[] } | null = null;

function record() {
  if (!cached) {
    const r = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lessons.json"), "utf8")) as { lessons: Lesson[]; topics?: Topic[] };
    // A section of lessons with none in it would read as a design choice.
    if (!r.lessons?.length) throw new Error("data/lessons.json holds no lessons; scripts/board-lessons.py writes it");
    if (!r.topics?.length) throw new Error("data/lessons.json holds no groups; scripts/board-lessons.py writes them from lessons/topics.json");
    cached = { lessons: r.lessons, topics: r.topics };
  }
  return cached;
}

/** The lessons, in the groups' order. */
export function lessons(): Lesson[] {
  return record().lessons;
}

export function topics(): Topic[] {
  return record().topics;
}

export function lesson(key: string): Lesson | undefined {
  return lessons().find((l) => l.key === key);
}

/** What the desk needs to build a lesson in the page: the program and the
 * tiles as written, and the board's facts, from the lesson's own
 * directory (wasm/listing/src/lesson.rs puts them together, there and in
 * lessons/build.py). */
export function parts(key: string) {
  const d = path.join(ROOT, "lessons", key);
  const meta = JSON.parse(fs.readFileSync(path.join(d, "lesson.json"), "utf8")) as { mirroring: string; prg: number; org: string; chr: number };
  const l = lesson(key)!;
  return {
    key,
    title: l.title,
    sha256: l.sha256,
    board: { mirroring: meta.mirroring, prg: meta.prg, org: meta.org, chr: meta.chr },
    prg: fs.readFileSync(path.join(d, "prg.s"), "utf8"),
    chr: fs.readFileSync(path.join(d, "chr.s"), "utf8"),
  };
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
