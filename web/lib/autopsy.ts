import fs from "node:fs";
import path from "node:path";

/**
 * The autopsy's record, read from data/autopsy.json at build time. Written
 * only by scripts/board-autopsy.py from the models the pipeline wrote
 * (wasm/listing/tools/autopsy.py): per game the coverage, every routine
 * the runs entered with its patterns, the tables and the shared memory.
 * Shape only, no byte of any ROM. Same contract as nes.ts and engine.ts:
 * one copy of each fact, slots, nothing typed into a page.
 */

export interface AutopsyPattern {
  pattern: string;
  evidence: Record<string, number | string>;
}

export interface AutopsyRoutine {
  name: string;
  bank: string;
  addr: number;
  kind: string;
  entered?: number;
  /** The instruction it hides inside, for an entry no line can carry. */
  inside?: number | string;
  is: AutopsyPattern[];
}

export interface AutopsyGame {
  /** The first twelve characters of the dump's SHA-256: its address here. */
  key: string;
  name: string;
  sha256: string;
  mapper: number;
  prg: number;
  chr: number;
  executed: number;
  frames: number;
  instructions: number;
  steps: number;
  paths: number;
  banks: { bank: string; executed: number; of: number; sites: number }[];
  routines: Record<string, number>;
  patterns: Record<string, number>;
  tables: number;
  table_words: number;
  arrays: number;
  variables: number;
  routine_list: AutopsyRoutine[];
  /** `on`: the bytes of memory that chose the way through it. */
  table_list: { bank: string; addr: number; kind?: string; entries: number; seen: number; on?: string[] }[];
  /** The loops a rule named that are no routine's entry: where the game waits. */
  loop_list: { name: string; bank: string; addr: number; is: AutopsyPattern[] }[];
  /** `x` and `y`: how many of its bytes are positions a rule saw compared. */
  array_list: { base: string; slots: number; sites: number; x?: number; y?: number }[];
  /** Arrays the runs saw indexed together with an array of positions. */
  object_list: { slots: number; arrays: number; routines: number; x: string[]; y: string[]; with: string[]; adds?: string[]; chooses?: string[]; down?: string[] }[];
  variable_list: { addr: string; total: number; writers: number; readers: number }[];
}

export interface AutopsyRecord {
  boarded_on: string;
  repo: string;
  listing_tree: string;
  flow_tree: string;
  console_commit: string;
  steps: number | number[];
  variables_kept: number;
  patterns: string[];
  totals: { games: number; prg: number; executed: number; routines: number; marks: number; tables: number; table_words: number };
  games: AutopsyGame[];
}

const FILE = path.join(process.cwd(), "..", "data", "autopsy.json");
let cached: AutopsyRecord | null = null;

export function autopsy(): AutopsyRecord {
  if (!cached) {
    const r = JSON.parse(fs.readFileSync(FILE, "utf8")) as AutopsyRecord;
    // A page about no games would read as a design choice. It is a build failure.
    if (!r.games?.length) throw new Error("data/autopsy.json holds no games; scripts/board-autopsy.py writes it");
    cached = r;
  }
  return cached;
}

export function game(key: string): AutopsyGame | undefined {
  return autopsy().games.find((g) => g.key === key);
}

/** The boards the console takes, by iNES mapper number (the boards report names them). */
const BOARDS: Record<number, string> = { 0: "NROM", 1: "MMC1", 2: "UxROM", 3: "CNROM", 4: "MMC3", 9: "MMC2", 66: "GxROM" };

export function boardName(mapper: number): string {
  return BOARDS[mapper] ?? `mapper ${mapper}`;
}

/** The share of the program the runs executed, as a whole percent. */
export function percent(g: { executed: number; prg: number }): number {
  return g.prg ? Math.round((100 * g.executed) / g.prg) : 0;
}

/** For one pattern: the games it was found in, and how many marks it has across them. */
export function found(pattern: string): { games: AutopsyGame[]; marks: number } {
  const games = autopsy().games.filter((g) => g.patterns[pattern]);
  return { games, marks: games.reduce((n, g) => n + g.patterns[pattern], 0) };
}
