/* The chip's own analysis documents, pulled into the docs tree at build time.
 *
 * `tinymachines/6502/docs/` carries generated documents (the atlas rubric,
 * the circuit idioms, the Snake walk) that neither site serves: their README
 * says "nothing here is served by deploy.sh" and means it. They are pages
 * worth reading, so this pulls them into docs/6502/ the way lib/explorer.ts
 * pulls the explorer's pages: read from the 6502 tree, never retyped.
 *
 * Everything this writes is gitignored, for two reasons with different
 * weights. "Nothing generated is committed" is the house rule; and the walk's
 * schematics are drawn from the die trace, so committing them here would have
 * this public repository redistribute CC BY-NC-SA data, which NOTICE.md
 * exists to prevent. The SITE serves them, from build output that is not in
 * git, which is the same one-publisher arrangement the explorer uses.
 *
 * The transforms below are narrow on purpose, and the script THROWS when a
 * document stops matching them: a generator change upstream should stop this
 * build, not quietly ship a page with raw HTML the markdown pipeline refuses.
 */

import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WEB = path.join(HERE, "..");
const ROOT = path.join(WEB, "..");
// The served worktree where it exists, else the checkout: lib/chip-src.ts is
// the same rule for the app, and the two must agree or half the pages come
// from one tree and half from another.
const CHIP_SRC = process.env.TM_CHIP_SRC || (fs.existsSync(path.join(ROOT, "..", "6502-served", "web", "index.html")) ? path.join(ROOT, "..", "6502-served") : path.join(ROOT, "..", "6502"));
const CHIP = path.join(CHIP_SRC, "docs");
const OUT_DOCS = path.join(ROOT, "docs", "6502");
const OUT_ASSETS = path.join(WEB, "public", "6502", "chipdocs");

/** Slug per explorer page, so a link to the live site becomes a local link. */
const explorerSlugs = fs
  .readdirSync(path.join(CHIP_SRC, "web"))
  .filter((f) => f.endsWith(".html") && !f.startsWith("_"))
  .map((f) => f.replace(/\.html$/, ""));

const DOCS = [
  {
    file: "atlas.md",
    order: 11,
    description: "An address for every part: the rubric, and an entry per container. Generated from the die data.",
  },
  {
    file: "idioms.md",
    order: 12,
    description: "How the chip is built: the recurring circuit patterns, counted from the switch network.",
  },
  {
    file: "walk-snake.md",
    order: 13,
    description: "One Snake instruction followed through the silicon, five cycles deep, with the schematics pulled live.",
  },
  {
    file: "findings-answers.md",
    order: 14,
    description: "The engine side of the Halfwave Lab review: what each finding turned out to be, with the tests that hold the answers.",
    // Authored upstream, not generated. Still read at build rather than
    // copied, so there is one copy; what changes is that check-figures SCANS
    // it (authored prose is exactly what that scan exists for), where the
    // generated documents are exempt by their marker.
    authored: true,
  },
];

function transform(name, md) {
  let s = md;

  // Their generator writes images as centred HTML blocks; the markdown
  // pipeline here takes markdown. The caption block follows the same shape.
  s = s.replace(
    /<p align="center"><img src="([^"]+)" alt="([^"]*)"[^>]*><\/p>/g,
    (_, src, alt) => `![${alt}](/6502/chipdocs/${src})`,
  );
  s = s.replace(/<p align="center"><sub>([\s\S]*?)<\/sub><\/p>/g, (_, inner) => {
    const text = inner.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, "[$2]($1)").trim();
    return `*${text.replace(/\s+/g, " ")}*`;
  });

  // A link to a page of the live site is a link to a page of this one.
  s = s.replace(
    /https:\/\/6502\.tinymachines\.ai\/([a-z-]+)(\?[^)\s"]*)?/g,
    (m, slug, q) => (explorerSlugs.includes(slug) ? `/6502/${slug}${q ?? ""}` : m),
  );

  // Cross-references between the three documents.
  for (const d of DOCS) {
    s = s.replaceAll(`](${d.file})`, `](/docs/6502/${d.file.replace(/\.md$/, "")})`);
  }

  // Anything HTML-shaped left outside a code fence means their generator
  // changed and the transforms above no longer cover it.
  let fenced = false;
  for (const [i, line] of s.split("\n").entries()) {
    if (/^```/.test(line)) fenced = !fenced;
    if (!fenced && /<(p|img|sub|a)\b/i.test(line)) {
      throw new Error(
        `${name}:${i + 1}: raw HTML survived the transforms ("${line.slice(0, 60)}"). ` +
          "The 6502 generator changed shape; teach pull-chipdocs.mjs the new one.",
      );
    }
  }
  return s;
}

fs.mkdirSync(OUT_ASSETS, { recursive: true });
fs.mkdirSync(path.join(OUT_ASSETS, "walk"), { recursive: true });

let assets = 0;
for (const f of fs.readdirSync(path.join(CHIP, "walk"))) {
  if (!f.endsWith(".svg")) continue;
  fs.copyFileSync(path.join(CHIP, "walk", f), path.join(OUT_ASSETS, "walk", f));
  assets += 1;
}
if (assets < 5) {
  throw new Error(`only ${assets} walk schematics found; the walk carries five`);
}

for (const d of DOCS) {
  const raw = fs.readFileSync(path.join(CHIP, d.file), "utf8");
  if (!d.authored && !/Generated by `tools\//.test(raw.slice(0, 600))) {
    throw new Error(
      `${d.file} does not say it is generated, and is not marked authored ` +
        "here. The distinction is load-bearing: generated documents are " +
        "exempt from the figures scan on the strength of that marker, so a " +
        "file slipping between the categories slips out of a check.",
    );
  }
  const h1 = raw.match(/^# (.+)$/m);
  if (!h1) throw new Error(`${d.file}: no h1 to take the title from`);
  const body = transform(d.file, raw);
  const front = `---\ntitle: "${h1[1].replace(/"/g, '\\"')}"\ndescription: "${d.description}"\norder: ${d.order}\n---\n\n`;
  fs.writeFileSync(path.join(OUT_DOCS, d.file), front + body);
}

console.log(`pull-chipdocs: ${DOCS.length} documents and ${assets} schematics, from the 6502 tree`);
