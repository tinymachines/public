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
  check(file, body, "em dash in shipped output", /\u2014/,
    "Use a colon, a comma, brackets or a real word. See CLAUDE.md.");

  // 2b. Exactly one <h1>, because a page has one name.
  //     Six routes shipped with two: the masthead's title and the document's
  //     own, and on /docs/6502/verification they disagreed about what the page
  //     was called. The masthead said "Documentation" and the document said
  //     "Verification", and a screen reader announcing two top-level headings
  //     has no way to say which one names the thing you asked for. Nothing
  //     about it is visible, which is why it needs a check rather than an eye.
  //
  //     Whether the masthead's title is the h1 is a PROP now, and a prop can
  //     be forgotten on the next page somebody adds. This is what remembers.
  const h1s = (body.match(/<h1[\s>]/gi) ?? []).length;
  if (h1s !== 1) {
    failures.push(
      `${path.relative(APP, file)}: ${h1s} <h1> elements, expected exactly 1.\n` +
      "    If the content carries its own heading, the masthead's title should not be one:\n" +
      "    pass titleIsHeading={false} to Shell. It looks identical either way.");
  }
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
//
// The form control names were added when /admin became the first page that
// takes something in. They matter for the same reason: an <input> with no
// .input rule is not a broken page, it is browser chrome sitting inside a
// designed one, which is precisely how the "no style" reports read.
for (const cls of [
  "docs-shell", "docs-nav", "docs-body", "prose", "paper",
  "field", "input", "form-grid", "toolbar", "avatar", "sr-only",
]) {
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

// public/ is scanned too, and it was a hole. Everything under it is served
// verbatim without passing through the build, so a vendored page or module
// that reaches a CDN was invisible to this check: it inspects what the build
// produced, and public/ is what the build did not touch. Die Runner's modules
// went in there before anybody noticed, and the halfwave lab arrived carrying
// a <link> to fonts.googleapis.com.
async function underPublic(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await underPublic(full)));
    else if (/\.(html|js|mjs|css)$/.test(e.name)) out.push(full);
  }
  return out;
}
const PUBLIC = path.join(import.meta.dirname, "..", "public");
let publicFiles = [];
try { publicFiles = await underPublic(PUBLIC); } catch { /* no public/ */ }

for (const file of [...files, ...cssFiles, ...publicFiles]) {
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

// 8. Figures on a page come from data/, not from the page.
//    START-HERE.md's rule: no number is typed into a page, every figure is a
//    slot filled from a published file. Checked both ways, because either
//    half alone is easy to satisfy while breaking the other: the built HTML
//    must SHOW the recorded figures, and the source must not CONTAIN them.
const CHIP = path.join(import.meta.dirname, "..", "..", "data", "chip.json");
let chip = null;
try { chip = JSON.parse(await readFile(CHIP, "utf8")); } catch { /* reported below */ }
if (!chip) {
  failures.push("data/chip.json is missing or unparseable. The front page reads its figures from it.");
} else {
  const home = files.find((f) => path.relative(APP, f) === "index.html");
  if (!home) {
    console.error("check-build: no prerendered index.html; the figure check would pass on nothing.");
    process.exit(2);
  }
  const html = await readFile(home, "utf8");
  for (const field of ["nodes", "transistors"]) {
    if (!html.includes(String(chip[field]))) {
      failures.push(`the front page does not show data/chip.json's ${field} (${chip[field]}).`);
    }
  }
  const src = await readFile(path.join(import.meta.dirname, "..", "app", "page.tsx"), "utf8");
  for (const field of ["nodes", "transistors"]) {
    if (src.includes(String(chip[field]))) {
      failures.push(
        `app/page.tsx contains the literal ${chip[field]}. Figures are read from data/chip.json,\n` +
        "    so a typed one is a second copy that nothing re-derives.");
    }
  }
}

// 9. The admin route must tell crawlers to stay out, in the page rather than
//    in robots.txt. Check 7 above explains why the two are not interchangeable:
//    a Disallow stops the fetch, so the noindex is never read, and the URL can
//    still be listed from an inbound link with no description. So the noindex
//    is the mechanism and this is the assertion that it survived.
//
//    Asserted on the built HTML rather than on the source, because a metadata
//    export that Next drops (the usual cause: the file becoming a client
//    component) still type-checks and still builds.
// Next emits a route as <route>.html here, not <route>/index.html. Matched
// against both so this does not become a check that quietly stops running
// if that changes: a missing page is reported, never skipped.
const admin = files.find((f) => ["admin.html", path.join("admin", "index.html")]
  .includes(path.relative(APP, f)));
if (!admin) {
  failures.push("no prerendered /admin page; the noindex check would pass on nothing.");
} else {
  const body = await readFile(admin, "utf8");
  if (!/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(body)) {
    failures.push(
      "/admin does not carry <meta name=\"robots\" content=\"noindex\">.\n" +
      "    It is the one route on this site that must, and robots.txt is not a substitute:\n" +
      "    a Disallow means a crawler never fetches the page and never reads the noindex.");
  }
}

// 10. The project silo has to reach the page, or it is inert.
//     web/app/6502/layout.tsx stamps data-project on everything beneath it,
//     and style/projects/6502.css scopes that project's tokens to the
//     attribute. If the stamp stops being emitted, nothing breaks and nothing
//     looks wrong: the page renders in the house palette, which is exactly
//     what it renders in today, so the mechanism would be dead and correct
//     looking at the same time. This asserts the attribute survived the build.
//
//     The CSS half is checked only for silos that actually declare something.
//     Both silos are empty on purpose right now, and an empty rule is dropped
//     by the minifier, so asserting the selector is in the stylesheet would
//     fail on a correct build. When a silo gains its first declaration, this
//     starts checking it and says so in the message.
const PROJECTS = path.join(import.meta.dirname, "..", "..", "data", "projects.json");
let manifest = null;
try { manifest = JSON.parse(await readFile(PROJECTS, "utf8")); } catch { /* reported below */ }
if (!manifest) {
  failures.push("data/projects.json is missing or unparseable. /6502 and the silos read it.");
} else {
  const siloed = manifest.projects.filter((p) => p.silo);
  if (!siloed.length) {
    console.error("check-build: no project declares a silo; the silo check would pass on nothing.");
    process.exit(2);
  }
  for (const p of siloed) {
    const page = files.find((f) => [`${p.key}.html`, path.join(p.key, "index.html")]
      .includes(path.relative(APP, f)));
    if (page) {
      const body = await readFile(page, "utf8");
      if (!body.includes(`data-project="${p.key}"`)) {
        failures.push(
          `/${p.key} does not carry data-project="${p.key}".\n` +
          `    app/${p.key}/layout.tsx should stamp it. Without it the silo in ${p.silo}\n` +
          "    matches nothing and the page renders in the house palette, which looks correct.");
      }
    }
    const silo = await readFile(path.join(import.meta.dirname, "..", "..", p.silo), "utf8");
    const declares = /--[A-Za-z0-9-]+\s*:/.test(silo.replace(/\/\*[\s\S]*?\*\//g, ""));
    if (declares && !css.includes(`[data-project="${p.key}"]`)) {
      failures.push(
        `${p.silo} declares tokens but [data-project="${p.key}"] is not in the built stylesheet.\n` +
        "    Check the @import chain in app/globals.css. A silo that does not reach the build\n" +
        "    is a project that silently renders as every other project.");
    }
  }
}

// 11. Every navigation entry must point at something this site serves.
//     The nav is derived from data/projects.json rather than listed, which
//     stops it drifting from itself. It does not stop it drifting from the
//     ROUTES: a surface whose lands_at is wrong, or a project given a landing
//     page before the page exists, produces a nav link to a 404. A nav with a
//     dead link in it still looks exactly like a nav, which is the whole
//     reason the derivation exists in the first place.
//
//     /api is excluded and named rather than skipped by a wildcard: it is not
//     a prerendered page, it is nginx proxying uvicorn, so there is no HTML
//     here to find and its absence is correct.
if (manifest) {
  const routes = new Set(
    files
      .map((f) => "/" + path.relative(APP, f).replace(/\.html$/, ""))
      .map((r) => (r === "/index" ? "/" : r.replace(/\/index$/, ""))),
  );
  const entries = [];
  for (const p of manifest.projects) {
    if (p.key === "roof") {
      for (const s of p.surfaces) if (s.nav && s.nav_label) entries.push(s.lands_at);
    } else if (p.landing) {
      entries.push(p.landing);
    }
  }
  if (entries.length < 2) {
    console.error(`check-build: only ${entries.length} nav entries derived; this would pass on nothing.`);
    process.exit(2);
  }
  // Both places the list is rendered must carry all of it. The footer held its
  // own hand-written copy until it was noticed that /6502 had reached the nav
  // and not the footer, which is a footer missing one link and therefore a
  // footer that looks entirely normal.
  for (const file of files) {
    const body = await readFile(file, "utf8");
    const foot = body.match(/<footer[^>]*class="[^"]*site-foot[^"]*"[\s\S]*?<\/footer>/);
    if (!foot) continue;
    for (const href of entries) {
      const target = href === "/api" ? "/api/" : href;
      if (!foot[0].includes(`href="${target}"`)) {
        failures.push(
          `${path.relative(APP, file)}: the footer does not carry ${target}, which the navigation does.\n` +
          "    Both render lib/projects.ts nav(). A footer missing one link looks exactly like a footer.");
      }
    }
    break;   // the frame is one component; one page proves it
  }

  for (const href of entries) {
    if (href === "/api") continue;   // proxied to uvicorn, not prerendered here
    if (!routes.has(href)) {
      failures.push(
        `the navigation carries ${href}, which this build does not serve.\n` +
        `    Prerendered routes: ${[...routes].filter((r) => !r.startsWith("/_")).sort().join(", ")}\n` +
        "    A nav with a dead link in it still looks exactly like a nav.");
    }
  }
}

// 12. The console page must satisfy game.js's DOM contract.
//     A cross-check between two files with no other reason to know about each
//     other, the same shape as the CSP check above, and it exists because the
//     first deploy of /6502/games failed exactly this way. game.js queries
//     $('.screen') to size the canvas; the page called that container
//     .con-screen and nothing else. Nothing 404d, no console error was logged,
//     and the page rendered completely: it just said "could not boot" in its
//     own error slot, which reads as a broken cartridge rather than as a
//     renamed div.
//
//     The selectors are read out of game.js rather than listed here, so a
//     module that starts querying something new is covered by doing so.
const GAME = path.join(import.meta.dirname, "..", "public", "6502", "games", "game.js");
let game = null;
try { game = await readFile(GAME, "utf8"); } catch { /* the surface may not exist */ }
if (game) {
  const consolePage = files.find((f) =>
    ["6502/games.html", "6502/games/index.html"].includes(
      path.relative(APP, f).split(path.sep).join("/")));
  if (!consolePage) {
    failures.push("game.js is present but /6502/games was not prerendered; this check would pass on nothing.");
  } else {
    const html = await readFile(consolePage, "utf8");
    const wanted = new Set();
    for (const m of game.matchAll(/\$\(\s*'([#.][A-Za-z0-9_-]+)'\s*\)/g)) wanted.add(m[1]);
    for (const m of game.matchAll(/querySelector(?:All)?\(\s*'([^']+)'\s*\)/g)) wanted.add(m[1]);
    if (wanted.size < 10) {
      console.error(`check-build: only ${wanted.size} selectors found in game.js; this would pass on nothing.`);
      process.exit(2);
    }
    // Class names are collected as WHOLE TOKENS rather than matched as a
    // substring. The first version of this used /class="[^"]*\bscreen\b/, and
    // \b matches at a hyphen, so `class="panel-face con-screen"` satisfied a
    // check for `.screen`. It passed on the exact page that was broken, which
    // it was written for. Caught by deliberately reintroducing the bug and
    // watching the build stay green: the same way the .docs-shell check was
    // caught doing the same thing with includes().
    const classes = new Set();
    for (const m of html.matchAll(/class="([^"]*)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
    }

    for (const sel of wanted) {
      // Only the simple forms are checked. A descendant or attribute selector
      // needs a parser, and a check that half-parses CSS is one that fires on
      // things that are fine.
      let present = null;
      if (/^#[A-Za-z0-9_-]+$/.test(sel)) present = new RegExp(`id="${sel.slice(1)}"`).test(html);
      else if (/^\.[A-Za-z0-9_-]+$/.test(sel)) present = classes.has(sel.slice(1));
      else if (/^\[data-[a-z-]+\]$/.test(sel)) present = new RegExp(sel.slice(1, -1) + "=").test(html);
      if (present === false) {
        failures.push(
          `/6502/games does not carry ${sel}, which game.js queries.\n` +
          "    The page renders and the console reports a boot failure in its own error slot,\n" +
          "    which reads as a broken cartridge rather than as a renamed element.");
      }
    }
  }
}

// 13. The three things that make this a PWA, checked as one set.
//     Each fails silently on its own, which is why they are checked together:
//     a manifest naming an icon that is not there does not error, the install
//     prompt simply never appears; a worker with no version stamp installs
//     once and is never replaced; and a manifest with no maskable icon gets
//     the mark cropped by whatever shape a launcher likes. None of the three
//     shows up on the page or in the console.
const MANIFEST = path.join(APP, "manifest.webmanifest.body");
let mf = null;
try { mf = JSON.parse(await readFile(MANIFEST, "utf8")); } catch { /* reported below */ }
if (!mf) {
  failures.push("manifest.webmanifest was not generated. app/manifest.ts should produce it.");
} else {
  if (!mf.icons?.length) failures.push("the manifest declares no icons, so the site cannot be installed.");
  for (const icon of mf.icons ?? []) {
    const onDisk = path.join(import.meta.dirname, "..", "public", icon.src.replace(/^\//, ""));
    try {
      await readFile(onDisk);
    } catch {
      failures.push(
        `the manifest names ${icon.src}, which is not in public/.\n` +
        "    style/build-icon.py draws it from the palette. A manifest naming an icon that is\n" +
        "    not there does not error: the install prompt simply never appears.");
    }
  }
  if (!(mf.icons ?? []).some((i) => i.purpose === "maskable")) {
    failures.push("the manifest has no maskable icon; a launcher will crop the mark to its own shape.");
  }
  // The colours come from tokens.css and must still be the ones in it.
  const tokens = await readFile(path.join(import.meta.dirname, "..", "..", "style", "tokens.css"), "utf8");
  for (const [field, name] of [["theme_color", "color-ink"], ["background_color", "color-paper"]]) {
    const want = tokens.match(new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{3,8})`));
    if (want && mf[field]?.toLowerCase() !== want[1].toLowerCase()) {
      failures.push(
        `the manifest's ${field} is ${mf[field]}, but --${name} is ${want[1]}.\n` +
        "    It is read from tokens.css at build time so it cannot drift; if it has, the read broke.");
    }
  }
}

const SW = path.join(import.meta.dirname, "..", "public", "sw.js");
let sw = null;
try { sw = await readFile(SW, "utf8"); } catch { /* reported below */ }
if (!sw) {
  failures.push("public/sw.js was not generated. scripts/build-sw.mjs should produce it before next build.");
} else {
  if (/const VERSION = "unversioned"/.test(sw)) {
    failures.push(
      "sw.js is stamped 'unversioned', so a deploy will not replace the installed worker.\n" +
      "    A browser installs a new worker only when the file's bytes change, and nothing at\n" +
      "    the origin can evict one that never changes.");
  }
  // The two rules the worker exists to keep. Both are one edit away from
  // becoming the /_next/static 404-cached-for-a-year bug with a longer memory.
  for (const [re, why] of [
    [/\/api\\\//, "/api must never be cached: a cached measurement is a lie with a timestamp on it"],
    [/\/admin/, "/admin must never be cached: it carries credentials and people's addresses"],
  ]) {
    if (!re.test(sw)) failures.push(`sw.js no longer excludes a path it must: ${why}.`);
  }
}

// 14. One version, in one file.
//     It was a literal in the API's decorator and a different literal in
//     package.json, neither ever incremented, and both wrong in different
//     directions. scripts/deploy.sh writes both from VERSION; this fails if
//     anything else edits one of them, which is the only way they can part.
const VERSION_FILE = path.join(import.meta.dirname, "..", "..", "VERSION");
let declared = null;
try { declared = (await readFile(VERSION_FILE, "utf8")).trim(); } catch { /* reported below */ }
if (!declared) {
  failures.push("VERSION is missing. scripts/deploy.sh increments it and the API reports it.");
} else if (!/^\d+\.\d+\.\d+$/.test(declared)) {
  failures.push(`VERSION is ${JSON.stringify(declared)}, which is not a semver; deploy.sh parses it back.`);
} else {
  const pkg = JSON.parse(await readFile(path.join(import.meta.dirname, "..", "package.json"), "utf8"));
  if (pkg.version !== declared) {
    failures.push(
      `web/package.json says ${pkg.version} and VERSION says ${declared}.\n` +
      "    scripts/deploy.sh writes both; if they differ, something else edited one.");
  }
}

// 15. Nothing links to a subdomain for a surface that has arrived here.
//     The front page sent readers to games.tinymachines.ai and
//     halfwave.tinymachines.ai after both had moved onto this site. It was
//     reading public_url from data/pieces.json, which was still true and no
//     longer the answer, and nothing looked wrong: the links worked, they just
//     took you off the site to the older copy.
//
//     This is the check that stops it recurring, and it will fire again on the
//     day the explorer or the 6502 API moves, which is exactly when it should.
if (manifest) {
  const moved = [];
  for (const p of manifest.projects) {
    for (const s of p.surfaces) {
      if (s.status !== "not started" && s.lands_at_settled && /^https?:\/\//.test(s.serves_today)) {
        moved.push({ from: s.serves_today.replace(/\/+$/, ""), to: s.lands_at, name: s.name });
      }
    }
  }
  if (!moved.length) {
    console.error("check-build: no surface is marked as arrived; this check would pass on nothing.");
    process.exit(2);
  }
  for (const file of files) {
    const body = await readFile(file, "utf8");
    for (const m of moved) {
      // An <a href> only. The console and the lab legitimately FETCH their
      // chip from the other origin, and prose may name a subdomain as a fact.
      // What is wrong is sending a reader there to read a thing that is here.
      // data-address opts a link out: the /6502 table's job is to say where
      // each surface answers today, which for an arrived surface is both
      // places. An opt-out that names itself, rather than the check quietly
      // skipping a page.
      const host = m.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`<a\\b(?![^>]*\\bdata-address\\b)[^>]*href="${host}/?"`, "i");
      if (re.test(body)) {
        failures.push(
          `${path.relative(APP, file)}: links to ${m.from}, but ${m.name} is served here at ${m.to}.\n` +
          "    Use lib/nav.ts whereToRead(): a piece's public_url is where it has always answered,\n" +
          "    and where to read it is a different question once it has moved.");
      }
    }
  }
}

if (failures.length) {
  console.error(`\ncheck-build: ${failures.length} problem(s) in the generated output:\n`);
  for (const f of failures) console.error("  " + f + "\n");
  process.exit(1);
}

console.log(`check-build: ${files.length} pages and ${css.length} bytes of CSS, all clean`);
