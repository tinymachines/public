// Bundle pretext (extern/pretext, MIT) from its TypeScript source into one
// ES module the site imports, at build time, with no install in the
// submodule.
//
// Why from source rather than the package's dist: dist is written by the
// submodule's own `tsc` and is not committed there; building it would mean
// `bun install` in extern/pretext on every fresh clone, a second dependency
// story for one library. Bun compiles the .ts entry points directly, and the
// submodule has no runtime dependencies (package.json: none), so this is the
// whole build. The output is gitignored (nothing generated is committed);
// lib/vendor/pretext.d.ts, hand-written, is the typed surface the site uses,
// and lib/pretext.test.ts holds the two together by importing the bundle.
//
//   bun scripts/build-pretext.mjs        # writes lib/vendor/pretext.js

import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const web = path.resolve(here, "..");
const src = path.resolve(web, "..", "extern", "pretext", "src");
const out = path.join(web, "lib", "vendor");

for (const f of ["layout.ts", "rich-inline.ts"]) {
  if (!fs.existsSync(path.join(src, f))) {
    console.error(`build-pretext: ${path.join(src, f)} is missing. The submodule is not checked out: git submodule update --init extern/pretext`);
    process.exit(1);
  }
}

fs.mkdirSync(out, { recursive: true });
const entry = path.join(out, "pretext-entry.ts");
fs.writeFileSync(entry, [
  `export * from ${JSON.stringify(path.join(src, "layout.ts"))};`,
  `export * from ${JSON.stringify(path.join(src, "rich-inline.ts"))};`,
  "",
].join("\n"));

const result = await Bun.build({ entrypoints: [entry], outdir: out, naming: "pretext.js", format: "esm", minify: true, target: "browser" });
fs.unlinkSync(entry);
if (!result.success) {
  for (const l of result.logs) console.error(String(l));
  process.exit(1);
}
const size = fs.statSync(path.join(out, "pretext.js")).size;
console.log(`build-pretext: lib/vendor/pretext.js, ${size} bytes, from extern/pretext/src`);
