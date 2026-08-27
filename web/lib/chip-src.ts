import fs from "node:fs";
import path from "node:path";

/**
 * Where the 6502 project's sources are read from at build time.
 *
 * The served worktree where it exists (`../6502-served`, kept by
 * scripts/board-engine.py at the commit the served release was built from),
 * else the checkout beside this one (`../6502`, a fresh clone with no
 * release to serve). The worktree is the point: the pages this site builds
 * from those sources then match the assets nginx serves from the release,
 * whatever the 6502 project's working tree is doing (owner's call,
 * 2026-08-27; board-engine.py's docstring has the reasons). TM_CHIP_SRC
 * names either explicitly.
 *
 * Resolved once per process: a build that read half its pages from one tree
 * and half from another would be the drift this exists to prevent.
 */
function resolve(): string {
  const explicit = process.env.TM_CHIP_SRC;
  if (explicit) return explicit;
  const up = path.join(process.cwd(), "..", "..");
  const served = path.join(up, "6502-served");
  if (fs.existsSync(path.join(served, "web", "index.html"))) return served;
  return path.join(up, "6502");
}

export const CHIP_SRC = resolve();
