/**
 * The printable links on a document, rendered from one record rather than
 * typed into the page.
 *
 * scripts/pull-nesdocs.mjs builds the bench's drawing packages and writes
 * public/nes/bench/artefacts.json: each package's current file, its label
 * in both languages, and which documents show which. This plugin reads
 * that record at build time and puts the "Printable:" line under a
 * document's title, in English or Japanese, and expands the
 * `<!-- artefacts -->` marker on an index into the whole list.
 *
 * Why a plugin and not a line in the markdown: the file a package is
 * served as changes with every revision letter, and nine Japanese
 * translations were found linking a revision the pull had withdrawn (a
 * 404 on the live site, 2026-09-23). A translation had copied a fact the
 * pull owns. Now the markdown never carries the filename, so a revision
 * bump reaches every page in both languages without anybody re-reading a
 * translation, and a page cannot link a package that is not served.
 *
 * Resolved by next.config.ts the same way as lib/rehype-headings.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { visit } from "unist-util-visit";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DOCS = path.resolve(HERE, "..", "..", "docs");
const RECORD = path.resolve(HERE, "..", "public", "nes", "bench", "artefacts.json");
const MARKER = /^<!--\s*artefacts\s*-->$/;

let record = null;
function load() {
  if (record) return record;
  if (!fs.existsSync(RECORD)) {
    throw new Error(`remark-artefacts: ${RECORD} is missing; run scripts/pull-nesdocs.mjs (bun run build does) before building a document that shows the bench's packages.`);
  }
  record = JSON.parse(fs.readFileSync(RECORD, "utf8"));
  return record;
}

/** The document's path under docs/ and its language, from the file being compiled. */
function whichDoc(file) {
  if (!file.path) throw new Error("remark-artefacts: the MDX loader gave no file path, so the document cannot be matched to its record");
  const rel = path.relative(DOCS, file.path).split(path.sep).join("/");
  if (rel.startsWith("..")) return null;
  const ja = rel.startsWith("ja/");
  return { rel: ja ? rel.slice(3) : rel, lang: ja ? "ja" : "en" };
}

function link(a, lang) {
  return { type: "link", url: a.href, children: [{ type: "text", value: a.label[lang] }] };
}

/** "Printable: [a]; [b]." in English, "印刷用: [a]、[b]。" in Japanese. */
function line(keys, lang, rec) {
  const sep = lang === "ja" ? "、" : "; ";
  const stop = lang === "ja" ? "。" : ".";
  const children = [{ type: "strong", children: [{ type: "text", value: rec.lead[lang] }] }, { type: "text", value: " " }];
  keys.forEach((k, i) => {
    const a = rec.artefacts[k];
    if (!a) throw new Error(`remark-artefacts: no artefact ${k} in the record`);
    if (i) children.push({ type: "text", value: sep });
    children.push(link(a, lang));
  });
  children.push({ type: "text", value: stop });
  return { type: "paragraph", children };
}

export default function remarkArtefacts() {
  return (tree, file) => {
    const doc = whichDoc(file);
    if (!doc) return;
    // Only the bench's documents show packages; a document elsewhere
    // that carries the marker is asking for them and gets them too.
    let wantsAll = false;
    visit(tree, "html", (node) => { if (MARKER.test(node.value.trim())) wantsAll = true; });
    const keys = doc.rel.startsWith("nes/") || doc.rel.startsWith("cart/") || wantsAll ? load().docs[doc.rel] : undefined;
    if (!keys && !wantsAll) return;
    const rec = load();
    if (wantsAll) {
      visit(tree, "html", (node, index, parent) => {
        if (MARKER.test(node.value.trim())) parent.children[index] = line(Object.keys(rec.artefacts), doc.lang, rec);
      });
    }
    if (keys && keys.length) {
      // Right under the title, where a reader on a phone at the bench
      // sees it before the prose.
      const at = tree.children.findIndex((n) => n.type === "heading" && n.depth === 1);
      if (at < 0) throw new Error(`remark-artefacts: ${doc.rel} has no h1 to put its printable links under`);
      tree.children.splice(at + 1, 0, line(keys, doc.lang, rec));
    }
  };
}
