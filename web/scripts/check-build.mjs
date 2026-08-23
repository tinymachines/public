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

// 4. Airgap. Nothing shipped may reference a host other than this one.
//    Two separate things pointed at Google before this check existed, and
//    neither announced itself: zoo.html linked fonts.googleapis.com, and
//    next/font/google downloaded woff2 at BUILD time while emitting markup
//    that looks self-hosted. A build with no route to Google does not fail,
//    it quietly ships different fonts.
//
//    Only things the browser LOADS are inspected: link, script, img, iframe
//    and CSS url(). An <a href> to 6502.tinymachines.ai or to visual6502.org
//    is navigation a reader chooses, and the attribution link the die data's
//    licence requires is one of them. Flagging those would mean the check
//    could only pass by deleting a licence obligation, which is how a check
//    teaches people to disable it.
const LOADS = /<(?:link|script|img|iframe|source|video|audio|embed|object)\b[^>]*?(?:href|src|data)\s*=\s*"(?:https?:)?\/\/([^"\/]+)/gi;
const CSS_URL = /url\(\s*['"]?(?:https?:)?\/\/([^)'"\/]+)/gi;

const cssFiles = (await readdir(cssDir, { withFileTypes: true }))
  .filter((e) => e.isFile() && e.name.endsWith(".css"))
  .map((e) => path.join(cssDir, e.name));

for (const file of [...files, ...cssFiles]) {
  const body = await readFile(file, "utf8");
  for (const re of [LOADS, CSS_URL]) {
    for (const m of body.matchAll(re)) {
      failures.push(`${path.basename(file)}: loads a resource from an external host: ${m[1]}\n    Nothing shipped may reach the network. Vendor it into the repo instead.`);
    }
  }
}

// 5. The self-hosted faces must actually be in the build. Without this, the
//    airgap check above passes trivially on a page with no fonts at all.
const FACES = (css.match(/@font-face/g) ?? []).length;
if (FACES < 20) {
  failures.push(`stylesheet: only ${FACES} @font-face rules; the vendored families are not reaching the build.`);
}

// 6. The shipped output must agree with the deployed Content-Security-Policy.
//    This is a cross-check between two files that have no other reason to
//    know about each other, and it exists because they disagreed once and the
//    only symptom was a page that looked half-designed.
//
//    /style/zoo carries the widget zoo verbatim, and the zoo is built out of
//    inline style: 73 style attributes, its own <style> block, and a script
//    that writes element.style. Under style-src 'self' every one of those was
//    dropped, silently, while the kit's classes kept working. So if the build
//    emits inline styles, the policy has to permit them.
const NGINX = path.join(import.meta.dirname, "..", "..", "deploy", "tinymachines.ai.nginx");
let policy = null;
try { policy = await readFile(NGINX, "utf8"); } catch { /* not deployed from here */ }
if (policy) {
  let sawInline = false;
  for (const file of files) {
    const body = await readFile(file, "utf8");
    if (/<style[\s>]/i.test(body) || /\sstyle="/i.test(body)) { sawInline = true; break; }
  }
  // Parse the DIRECTIVE, not the file. The first version matched
  // /style-src ([^;"]+)/ against the whole config and hit the comment above
  // the header, which explains style-src and contains the words
  // 'unsafe-inline'. So the check read its own documentation, found what it
  // was looking for, and passed while the policy said the opposite. Caught by
  // tightening the real policy and watching the check stay green.
  const header = policy.match(/add_header\s+Content-Security-Policy\s+"([^"]+)"/);
  const styleSrc = header && header[1].match(/style-src ([^;]+)/);
  if (!header) {
    failures.push("deploy/tinymachines.ai.nginx: no add_header Content-Security-Policy found.");
  } else if (!styleSrc) {
    failures.push("deploy/tinymachines.ai.nginx: no style-src in the Content-Security-Policy.");
  } else if (sawInline && !styleSrc[1].includes("'unsafe-inline'")) {
    failures.push(
      `deploy/tinymachines.ai.nginx: style-src is "${styleSrc[1].trim()}" but the build emits inline styles.\n` +
      "    They will be dropped in the browser with no error on the page. Either remove the inline\n" +
      "    styles or allow them in the policy, and say which in a comment.");
  }
}

// 7. robots.txt must exist, and must not block a page the site serves.
//    A Disallow on a real route is the quiet kind of mistake: nothing breaks
//    locally, and the only symptom is that the page never appears in a search
//    result weeks later. It is also how a noindex gets defeated, since a
//    crawler that is not allowed to fetch a page never reads the noindex on
//    it. So the routes the build actually prerendered are checked against it.
const ROBOTS = path.join(APP, "robots.txt.body");
let robots = null;
try { robots = await readFile(ROBOTS, "utf8"); } catch { /* handled below */ }
if (!robots) {
  failures.push("robots.txt was not generated. app/robots.ts should produce it.");
} else {
  const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]);
  const routes = files
    .map((f) => "/" + path.relative(APP, f).replace(/\.html$/, "").replace(/^index$/, ""))
    .map((r) => (r === "/index" ? "/" : r))
    .filter((r) => !r.startsWith("/_"));
  if (routes.length < 5) {
    console.error(`check-build: only ${routes.length} routes derived; the robots check would pass on nothing.`);
    process.exit(2);
  }
  for (const rule of disallowed) {
    const blocked = routes.filter((r) => r === rule || r.startsWith(rule.replace(/\*$/, "")));
    if (blocked.length) {
      failures.push(
        `robots.txt disallows ${rule}, which blocks ${blocked.length} page(s) the site serves: ${blocked.slice(0, 4).join(", ")}\n` +
        "    A crawler that cannot fetch a page never reads the noindex on it either.");
    }
  }
}

if (failures.length) {
  console.error(`\ncheck-build: ${failures.length} problem(s) in the generated output:\n`);
  for (const f of failures) console.error("  " + f + "\n");
  process.exit(1);
}

console.log(`check-build: ${files.length} pages and ${css.length} bytes of CSS, all clean`);
