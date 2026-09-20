/* Whether each Japanese document still translates the English one.
 *
 * docs/ja is a shadow of bodies, and most of the English it shadows is not
 * in this repository at all: docs/nes, docs/cart and four of the chip's
 * pages are pulled from the sibling checkouts on every build, because the
 * repositories are the one copy. So the English under a translation can
 * change without anything here changing, and a confident Japanese page goes
 * on serving a document that has moved. Nothing would say so.
 *
 * This stamps each shadow with the digest of the English BODY it was
 * translated from (data/ja-docs.json) and reports the ones that have drifted
 * since. It runs right after the pull, when the English is fresh.
 *
 *   bun scripts/check-ja-docs.mjs           report, and never fail a build
 *   bun scripts/check-ja-docs.mjs --strict  exit 1 if anything has drifted
 *   bun scripts/check-ja-docs.mjs --stamp   record the tree as it is now
 *
 * A drift is not an error: the English moving is the normal way of things
 * here, and blocking a deploy over a sentence in a report is how the engine
 * gate wasted a day. It is a list of pages somebody should reread.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DOCS = path.join(ROOT, "docs");
const STAMPS = path.join(ROOT, "data", "ja-docs.json");

/** The body under the frontmatter, which is what a translation covers. */
function body(text) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  return end < 0 ? text : text.slice(end + 5);
}

function digest(file) {
  return createHash("sha256").update(body(fs.readFileSync(file, "utf8")).trim()).digest("hex");
}

function shadows() {
  const out = [];
  const walk = (dir, base) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, path.join(base, e.name));
      else if (e.name.endsWith(".md")) out.push(path.join(base, e.name));
    }
  };
  walk(path.join(DOCS, "ja"), "");
  return out.sort();
}

const stamp = process.argv.includes("--stamp");
const strict = process.argv.includes("--strict");
const stamps = fs.existsSync(STAMPS) ? JSON.parse(fs.readFileSync(STAMPS, "utf8")) : {};

const missing = [];
const drifted = [];
const gone = [];
const next = {};

for (const rel of shadows()) {
  const en = path.join(DOCS, rel);
  if (!fs.existsSync(en)) {
    // Either the English page was withdrawn, or its sibling checkout is not
    // here and the build has not pulled it. Both are worth saying out loud.
    gone.push(rel);
    if (stamps[rel]) next[rel] = stamps[rel];
    continue;
  }
  const sha = digest(en);
  next[rel] = sha;
  if (!stamps[rel]) missing.push(rel);
  else if (stamps[rel] !== sha) drifted.push(rel);
}

if (stamp) {
  fs.writeFileSync(STAMPS, `${JSON.stringify(next, null, 1)}\n`);
  console.log(`check-ja-docs: stamped ${Object.keys(next).length} Japanese documents`);
  process.exit(0);
}

const say = (label, list) => {
  if (!list.length) return;
  console.log(`check-ja-docs: ${list.length} ${label}`);
  for (const rel of list) console.log(`  ${label.toUpperCase().split(" ")[0]}: docs/ja/${rel}`);
};

console.log(
  `check-ja-docs: ${shadows().length} Japanese documents, ${drifted.length} translating an English page that has since changed`,
);
say("never stamped", missing);
say("drifted", drifted);
say("without an English page in this tree", gone);
if (drifted.length || missing.length) {
  console.log("  Reread those, then: bun scripts/check-ja-docs.mjs --stamp");
}
if (strict && (drifted.length || missing.length)) process.exit(1);
