import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error the plugin is plain .mjs, where the slug rule is written.
import rehypeHeadings, { headingIds, headings } from "./rehype-headings.mjs";

/**
 * A link into a document has to land on something, in both languages.
 *
 * docs/ja is a shadow of bodies: the same page, the same order, Japanese
 * prose. A Japanese heading slugs to a Japanese id, so every link written to
 * an English anchor arrived at a page with nothing by that name and quietly
 * did not move. Nothing errored, nothing looked wrong, and six links on this
 * site were doing it (caught 2026-09-20). A heading something links to now
 * says its id out loud, `## Tiles {#tiles}`, in both files.
 *
 * This reads the markdown rather than the rendered site, so it fails in the
 * tree rather than after a deploy.
 */

const ROOT = path.join(import.meta.dir, "..", "..");
const DOCS = path.join(ROOT, "docs");

/** Every file the site could link from: its own source, and the documents. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === ".git" || e.name === "out") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|mdx?|json)$/.test(e.name)) out.push(p);
    }
  };
  walk(path.join(ROOT, "web", "app"));
  walk(path.join(ROOT, "web", "lib"));
  walk(path.join(ROOT, "data"));
  walk(DOCS);
  return out;
}

interface Link {
  where: string;
  route: string;
  anchor: string;
}

describe("links into the documents", () => {
  const files = sources();
  const links: Link[] = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/\/docs\/([a-z0-9/-]*)#([A-Za-z0-9][A-Za-z0-9_-]*)/g)) {
      const route = `/docs/${m[1]}`.replace(/\/$/, "");
      links.push({ where: path.relative(ROOT, f), route, anchor: m[2] });
    }
  }

  test("there are links to check, and every one names a document that exists", () => {
    expect(links.length, "links into documents").toBeGreaterThan(5);
    for (const l of links) {
      const exists = ["md", "mdx"].some(
        (ext) =>
          fs.existsSync(path.join(DOCS, `${l.route.slice("/docs/".length)}.${ext}`)) ||
          fs.existsSync(path.join(DOCS, l.route.slice("/docs/".length), `index.${ext}`)),
      );
      expect(exists, `${l.where} links to ${l.route}`).toBe(true);
    }
  });

  test("every anchor is a heading in the English document, and in the Japanese one where that exists", () => {
    let checkedJa = 0;
    for (const l of links) {
      const stem = l.route.slice("/docs/".length);
      const rel = ["md", "mdx"]
        .flatMap((ext) => [`${stem}.${ext}`, `${stem}/index.${ext}`])
        .find((r) => fs.existsSync(path.join(DOCS, r)))!;
      const ids = headingIds(fs.readFileSync(path.join(DOCS, rel), "utf8"));
      expect(ids, `${l.where}: /docs/${stem}#${l.anchor}`).toContain(l.anchor);
      const ja = path.join(DOCS, "ja", rel);
      if (!fs.existsSync(ja)) continue;
      checkedJa++;
      const jaIds = headingIds(fs.readFileSync(ja, "utf8"));
      expect(jaIds, `${l.where}: /ja/docs/${stem}#${l.anchor}`).toContain(l.anchor);
    }
    // A translated document with a link into it is what this is here for, so
    // the check must have seen some.
    expect(checkedJa, "anchors checked against a Japanese body").toBeGreaterThan(0);
  });
});

describe("an id written on the heading", () => {
  const heading = (...kids: unknown[]) => ({
    type: "root",
    children: [{ type: "element", tagName: "h2", properties: {}, children: kids }],
  });
  const run = (tree: unknown) => {
    rehypeHeadings()(tree);
    return (tree as { children: { properties: { id?: string }; children: { value?: string }[] }[] }).children[0];
  };

  test("the id is the one written, and the reader never sees the braces", () => {
    const h = run(heading({ type: "text", value: "タイル {#tiles}" }));
    expect(h.properties.id).toBe("tiles");
    expect(h.children.map((c) => c.value).join("")).toBe("タイル");
  });

  test("markup before the token is left alone, and a heading without one still slugs", () => {
    const h = run(
      heading(
        { type: "element", tagName: "code", properties: {}, children: [{ type: "text", value: "$4016" }] },
        { type: "text", value: " と掛け金 {#the-latch}" },
      ),
    );
    expect(h.properties.id).toBe("the-latch");
    const plain = run(heading({ type: "text", value: "The gates are real" }));
    expect(plain.properties.id).toBe("the-gates-are-real");
    // Braces that are prose stay prose.
    const prose = run(heading({ type: "text", value: "A {} of nodes" }));
    expect(prose.properties.id).toBe("a-of-nodes");
  });

  test("headingIds reads the same two rules off the markdown, and skips fenced code", () => {
    const md = ["# Title", "", "```bash", "# not a heading", "```", "", "## Tiles {#tiles}", "", "## Why", "", "## Why", ""].join("\n");
    expect(headingIds(md)).toEqual(["title", "tiles", "why", "why-2"]);
  });
});

/**
 * The shadow is the same document in Japanese: same headings in the same
 * order, same code, same links. These are the ways a translation goes wrong
 * without anybody noticing: a section dropped near the end, a fence left
 * open, frontmatter copied in (the tree and the ordering come from the
 * English file, so a title here would be a second opinion nothing reads).
 */
/**
 * Some links are not written down: the playground builds one per entry of the
 * encyclopedia by slugging the English heading, so a scan for a literal path
 * sees nothing and the Japanese page could lose every one of them silently
 * (spotted while translating, 2026-09-20). Where a call site writes
 * `/docs/<page>#${...}`, the shadow has to carry every id the English page
 * has, not just the ones somebody typed out.
 */
describe("documents whose anchors are generated", () => {
  const pages = new Set<string>();
  for (const f of sources()) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/\/docs\/([a-z0-9/-]+)#\$\{/g)) pages.add(m[1]);
  }

  test("the Japanese body keeps every id the English one has", () => {
    expect(pages.size, "pages linked by a built anchor").toBeGreaterThan(0);
    for (const page of pages) {
      const rel = ["md", "mdx"]
        .flatMap((ext) => [`${page}.${ext}`, `${page}/index.${ext}`])
        .find((r) => fs.existsSync(path.join(DOCS, r)))!;
      const ja = path.join(DOCS, "ja", rel);
      if (!fs.existsSync(ja)) continue;
      // The page's own title is where the URL lands with no anchor at all,
      // so it is the sections below it that a built link can name.
      const ids = headings(fs.readFileSync(path.join(DOCS, rel), "utf8"))
        .filter((h: { level: number }) => h.level > 1)
        .map((h: { id: string }) => h.id);
      const jaIds = new Set(headingIds(fs.readFileSync(ja, "utf8")));
      expect(ids.length, `docs/${rel} sections`).toBeGreaterThan(0);
      for (const id of ids) expect(jaIds, `docs/ja/${rel} keeps #${id}`).toContain(id);
    }
  });
});

/**
 * The slugs the pull scripts declare.
 *
 * docs/nes and docs/6502 are generated and gitignored: their English side
 * exists only after a pull has run. A shadow committed in the same change as
 * the document it translates therefore has nothing beside it in a fresh
 * checkout, and the deploy runs these tests BEFORE the build that pulls. So
 * a missing English file is a failure only when nothing declares the
 * document, which is the case this was written for: a shadow of a page the
 * site does not have.
 */
function declaredByThePull(): Set<string> {
  const out = new Set<string>();
  for (const f of ["pull-nesdocs.mjs", "pull-chipdocs.mjs"]) {
    const src = fs.readFileSync(path.join(ROOT, "web", "scripts", f), "utf8");
    for (const m of src.matchAll(/slug:\s*"([^"]+)"/g)) out.add(m[1]);
  }
  if (out.size < 10) throw new Error(`the pull scripts declare ${out.size} documents; they have moved and this cannot tell a pending shadow from an orphan`);
  return out;
}

describe("docs/ja is a shadow of the English documents", () => {
  const shadows: string[] = [];
  const walk = (dir: string, base: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, path.join(base, e.name));
      else if (e.name.endsWith(".md")) shadows.push(path.join(base, e.name));
    }
  };
  walk(path.join(DOCS, "ja"), "");

  test("every shadow translates a document that exists, with its shape", () => {
    expect(shadows.length, "Japanese bodies").toBeGreaterThan(10);
    const pulled = declaredByThePull();
    let compared = 0;
    for (const rel of shadows) {
      const en = path.join(DOCS, rel);
      if (!fs.existsSync(en)) {
        // Not pulled into this checkout yet. Declared is enough; the build
        // pulls it, and a document the pull cannot find stops the build there.
        expect(pulled.has(path.basename(rel, ".md")), `docs/ja/${rel} shadows a document nothing pulls or ships`).toBe(true);
        continue;
      }
      compared += 1;
      const ja = fs.readFileSync(path.join(DOCS, "ja", rel), "utf8");
      const enText = fs.readFileSync(en, "utf8");
      expect(ja.startsWith("---"), `docs/ja/${rel} carries no frontmatter`).toBe(false);
      expect(headingIds(ja).length, `docs/ja/${rel} has every heading`).toBe(headingIds(enText).length);
      const fences = (s: string) => (s.match(/^\s*```/gm) ?? []).length;
      expect(fences(ja), `docs/ja/${rel} has every code fence, opened and closed`).toBe(fences(enText));
      expect(fences(ja) % 2, `docs/ja/${rel} closes every fence`).toBe(0);
      // Nothing shipped carries an em dash, in either language.
      expect(ja.includes("—"), `docs/ja/${rel} has no em dash`).toBe(false);
    }
    // A check that can pass on nothing is not a check: if every shadow were
    // waiting on a pull, the loop above would compare nothing and say so.
    expect(compared, "shadows compared against their English").toBeGreaterThan(10);
  });
});
