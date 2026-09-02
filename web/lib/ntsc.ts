import fs from "node:fs";
import path from "node:path";

/**
 * The boarded ntsc-crt record, read from data/ntsc.json at build time.
 *
 * The /ntsc page states numbers about that project, and no number on this
 * site is typed into a page: each is a slot filled from a published file.
 * This file is written only by scripts/board-ntsc.py --board, which runs the
 * ntsc-crt repository's own scanner, full test suite and MUTATE=1 run at a
 * pinned commit and records what it measured. The page reading the record at
 * build time is the same shape as projects.ts reading the manifest: one copy
 * of each fact, and the JSON never reaches the browser.
 */

export interface NtscRecord {
  boarded_on: string;
  repo: string;
  commit: string;
  claims_verified: number;
  tests_green: number;
  mutate_red: number;
  crates: number;
  transcription_gate_values: number;
  blargg_zip_sha256: string;
  st170m_zip_sha256: string;
  wasm_fps: { notch: number; comb3: number; stamp: string };
  rates: {
    nes_full_hz: string;
    nes_short_hz: string;
    nes_pair_hz: string;
    broadcast_field_hz: string;
  };
  /** The bench's wasm bundle, present once --wasm has boarded one. */
  bundle?: {
    commit: string;
    tags: string[];
    built_on: string;
    built_with: string;
    files: Record<string, { sha256: string; bytes: number }>;
  };
}

const FILE = path.join(process.cwd(), "..", "data", "ntsc.json");

export function ntsc(): NtscRecord {
  const record = JSON.parse(fs.readFileSync(FILE, "utf8")) as NtscRecord;
  // A record missing a figure the page shows is a build failure, not a page
  // with a hole where a measurement should be.
  for (const k of [
    "boarded_on", "repo", "commit", "claims_verified", "tests_green",
    "mutate_red", "crates", "transcription_gate_values", "wasm_fps", "rates",
  ] as const) {
    if (record[k] === undefined) {
      throw new Error(`data/ntsc.json has no ${k}; re-run scripts/board-ntsc.py --board`);
    }
  }
  return record;
}
