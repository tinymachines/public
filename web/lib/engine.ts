import fs from "node:fs";
import path from "node:path";

/**
 * The boarded engine record, read from data/engine.json at build time.
 *
 * Written only by scripts/board-engine.py --board, which refuses unless
 * the served 6502 release, the running service and the checked-out
 * worktree agree on one commit, then re-runs the halfphi and golden
 * suites in that worktree and records what it measured. Until now the
 * record was only a deploy gate (--check); this reader exists so a page
 * can SHOW the provenance too, the same shape as ntsc.ts: one copy of
 * each fact, filled into slots, never typed.
 */

export interface EngineRecord {
  boarded_at: string;
  served: { version: string; commit: string };
  halfphi: {
    version: string;
    tag: string;
    shared_files: string[];
    shared_files_sha256: string;
    standalone: { commit: string; tag: string; shared_files_identical: boolean };
  };
  tests: unknown[];
}

const FILE = path.join(process.cwd(), "..", "data", "engine.json");

export function engine(): EngineRecord {
  const record = JSON.parse(fs.readFileSync(FILE, "utf8")) as EngineRecord;
  for (const k of ["boarded_at", "served", "halfphi", "tests"] as const) {
    if (record[k] === undefined) {
      throw new Error(`data/engine.json has no ${k}; re-run scripts/board-engine.py --board`);
    }
  }
  return record;
}
