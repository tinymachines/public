/* Every drawing in the docs tree parses, and carries a caption.
 *
 * A ```mermaid fence is drawn in the reader's browser (app/components/
 * Diagram.tsx), because the build runs on a fresh clone with no browser on
 * it and mermaid draws with one. What the build can do without a browser
 * is parse: mermaid's parser runs here under bun, so a fence that would
 * fail in front of a reader fails here first, naming the file and the line.
 * The first line of every fence must be a `%%` comment, because that line
 * is the figure's caption and the full screen's name, and a drawing with
 * nothing to say what it shows is not a figure.
 *
 * Runs after the pulls, so pulled documents are held to it too, and it
 * refuses to pass on nothing: a docs tree with no drawings fails, because
 * that is not what this tree looks like, and a check that finds nothing has
 * usually been pointed at the wrong directory.
 *
 *   bun scripts/check-diagrams.mjs
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DOCS = path.join(ROOT, "docs");

function* pages(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* pages(p);
    else if (/\.mdx?$/.test(e.name)) yield p;
  }
}

/** The mermaid fences of one file: { line, code } each, line being the fence's own. */
function fences(text) {
  const out = [];
  let open = null;
  text.split("\n").forEach((l, i) => {
    if (open === null) {
      if (/^```mermaid\s*$/.test(l)) open = { line: i + 1, lines: [] };
    } else if (/^```\s*$/.test(l)) {
      out.push({ line: open.line, code: open.lines.join("\n") });
      open = null;
    } else {
      open.lines.push(l);
    }
  });
  if (open) out.push({ line: open.line, code: open.lines.join("\n"), unclosed: true });
  return out;
}

// Mermaid's parser sanitizes every label through DOMPurify, and DOMPurify
// binds to a window when it loads: with none it is a stub, and a label with
// a <br/> in it fails for want of a browser rather than for a fault of its
// own. happy-dom is a document with no screen, enough for the sanitizer, so
// what is parsed here is exactly what the browser parses, sanitizer and all.
// Set up before mermaid is imported, because the binding happens at import.
const { Window } = await import("happy-dom");
const win = new Window();
for (const k of ["window", "document", "Node", "Element", "HTMLElement", "DocumentFragment", "HTMLTemplateElement", "NodeFilter", "NamedNodeMap", "HTMLFormElement", "DOMParser", "Text"]) {
  if (!(k in globalThis)) globalThis[k] = k === "window" ? win : win[k];
}
const mermaid = (await import("mermaid")).default;
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
const failures = [];
let found = 0;
let files = 0;
for (const file of pages(DOCS)) {
  const rel = path.relative(ROOT, file);
  const fs_ = fences(fs.readFileSync(file, "utf8"));
  if (!fs_.length) continue;
  files++;
  for (const f of fs_) {
    found++;
    const at = `${rel}:${f.line}`;
    if (f.unclosed) {
      failures.push(`${at}: the fence is never closed`);
      continue;
    }
    const first = f.code.split("\n").find((l) => l.trim() !== "") ?? "";
    if (!/^\s*%%\s*\S/.test(first)) {
      failures.push(`${at}: no caption. The fence's first line must be a %% comment saying what the drawing shows.`);
    }
    try {
      await mermaid.parse(f.code);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).split("\n").slice(0, 3).join(" ");
      failures.push(`${at}: does not parse: ${msg}`);
    }
  }
}

if (found === 0) failures.push(`no mermaid fences under ${path.relative(ROOT, DOCS)}: this check would pass on nothing`);
for (const f of failures) console.error(`check-diagrams: ${f}`);
const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
console.log(`check-diagrams: ${n(found, "drawing", "drawings")} in ${n(files, "document", "documents")}, ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
