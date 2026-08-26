/**
 * Write the console's modules to public/6502/games/ from the 6502 checkout.
 *
 * The same reading lib/console-modules.ts does, written out where the pages
 * load the files from and where check-build.mjs reads game.js's DOM contract.
 * Run from `bun run build`, before next build, so the files are in public/
 * when Next copies them; also before `bun test lib`, whose card and art
 * components import chr.js from here.
 *
 * Generated rather than committed for two reasons with different weights:
 * the copies had no recorded base, and two of the files are CC BY-NC-SA ROMs
 * this public repository must not redistribute. `upstream.json` beside the
 * files records the commit and every file's digest, so "which console is
 * this" has an answer that can be checked against the 6502 tree.
 *
 * Wiped and rewritten, except NOTICE.md, which is this site's own text about
 * the terms and is committed.
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { consoleModules, PATCHES, SRC, upstreamCommit } from "../lib/console-modules.ts";

const OUT = path.join(import.meta.dirname, "..", "public", "6502", "games");
const KEEP = new Set(["NOTICE.md"]);

const files = consoleModules();
const commit = upstreamCommit();
if (!commit) {
  console.error(`pull-console: cannot read the commit of the checkout at ${SRC}; a console with no base is what this replaces.`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
for (const e of await readdir(OUT)) {
  if (!KEEP.has(e)) await rm(path.join(OUT, e), { recursive: true, force: true });
}
const manifest = { source: "https://github.com/tinymachines/6502", path: "games/", commit, files: {} };
for (const f of files) {
  const dest = path.join(OUT, f.rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, f.bytes);
  manifest.files[f.rel] = {
    sha256: createHash("sha256").update(f.bytes).digest("hex"),
    patched: f.patched ? PATCHES.filter((p) => p.file === f.rel).map((p) => p.why) : false,
  };
}
await writeFile(path.join(OUT, "upstream.json"), JSON.stringify(manifest, null, 2) + "\n");

const patched = files.filter((f) => f.patched).map((f) => f.rel);
console.log(`pull-console: ${files.length} files from 6502@${commit.slice(0, 12)}, ${patched.length} patched (${patched.join(", ")}), manifest upstream.json`);
