/**
 * Post-build checks on the HTML that was actually generated.
 *
 * These are output checks on purpose. Both bugs they cover rendered cleanly,
 * built cleanly, deployed cleanly and were visible on the live site, because
 * a page that is wrong still looks like a page. Nothing in a type checker or
 * a linter can see either one: the only place they exist is the HTML.
 *
 * Run as part of `bun run build`, so a fresh clone cannot ship them.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const APP = path.join(import.meta.dirname, "..", ".next", "server", "app");

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (e.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const failures = [];

function check(file, body, label, re, why) {
  const m = body.match(re);
  if (m) failures.push(`${path.relative(APP, file)}: ${label}\n    found: ${JSON.stringify(m[0].slice(0, 90))}\n    ${why}`);
}

const files = await htmlFiles(APP);

// A check that can pass on nothing is not a check. The docs tree is nine
// pages plus the front page; if the walk finds almost nothing, something
// moved and these assertions are running on an empty list.
if (files.length < 5) {
  console.error(`check-build: only ${files.length} prerendered pages found under ${APP}.`);
  console.error("That is not the site, so these checks would pass on nothing.");
  process.exit(2);
}

for (const file of files) {
  const body = await readFile(file, "utf8");

  // 1. Frontmatter must not reach the page. Markdown reads a YAML block as a
  //    setext heading plus a thematic break, so without remark-frontmatter
  //    every docs page opens with "title: ... description: ... order: N" set
  //    as an <h2>. It shipped exactly that way.
  check(file, body, "frontmatter rendered into the page",
    /<h[1-6][^>]*>\s*title:[\s\S]{0,200}?<\/h[1-6]>/i,
    "remark-frontmatter is missing from next.config.ts remarkPlugins.");

  // 2. House style: no em dashes in anything shipped.
  check(file, body, "em dash in shipped output", /—/,
    "Use a colon, a comma, brackets or a real word. See CLAUDE.md.");
}

// 3. The document surface must be in the stylesheet. The docs layout uses
//    these three class names; when they were defined nowhere the pages
//    rendered as one flat column and it read as "design not done yet".
const cssDir = path.join(import.meta.dirname, "..", ".next", "static", "chunks");
let css = "";
for (const e of await readdir(cssDir, { withFileTypes: true })) {
  if (e.isFile() && e.name.endsWith(".css")) css += await readFile(path.join(cssDir, e.name), "utf8");
}
if (css.length < 1000) {
  console.error(`check-build: only ${css.length} bytes of CSS found; that is not the stylesheet.`);
  process.exit(2);
}
// Matched as a whole class name, not as a substring. The first version of
// this used css.includes(".docs-shell"), which stayed true when the rule was
// renamed to .docs-shellXX, so the check passed while the class it was
// guarding did not exist. It was caught by deliberately breaking it.
for (const cls of ["docs-shell", "docs-nav", "docs-body", "prose", "paper"]) {
  if (!new RegExp(`\\.${cls}(?![\\w-])`).test(css)) {
    failures.push(`stylesheet: .${cls} is used in the app but defined nowhere.\n    A class that does not exist styles nothing, silently. Add it to style/components.css.`);
  }
}

if (failures.length) {
  console.error(`\ncheck-build: ${failures.length} problem(s) in the generated output:\n`);
  for (const f of failures) console.error("  " + f + "\n");
  process.exit(1);
}

console.log(`check-build: ${files.length} pages and ${css.length} bytes of CSS, all clean`);
