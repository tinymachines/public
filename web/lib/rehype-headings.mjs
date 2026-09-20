/**
 * Give every documentation heading an id, so a section can be linked to.
 *
 * Written here rather than pulled in as rehype-slug, which is the usual
 * answer, for two reasons that both matter to this repository. It is about
 * thirty lines and a dependency is a thing to keep, upgrade and trust. And the
 * slug rule is a decision about URLs: a heading's id is a public address the
 * moment somebody links to it, so it should be written down where the reason
 * is, not inherited from a package's defaults.
 *
 * A .mjs module with a default export because Turbopack serialises the MDX
 * plugin list across a process boundary, so a plugin has to be a path rather
 * than a function. next.config.ts resolves it the same way it resolves the
 * remark plugins.
 *
 * ## The slug rule
 *
 * Lowercase, alphanumerics and hyphens, everything else collapsed to a single
 * hyphen, trimmed. Deliberately narrow: an id that survives being pasted into
 * a chat window, a shell and a URL bar without being escaped is worth more
 * than one that preserves punctuation nobody types.
 *
 * A heading that already carries an id keeps it. An author who wrote one meant
 * it, and a generated id silently replacing a hand-written one breaks whatever
 * was linking to it.
 *
 * ## An id can be written on the heading
 *
 * `## Tiles {#tiles}` renders as "Tiles" with that id. The reason is the
 * translations: docs/ja is a shadow of bodies, and a Japanese heading slugs to
 * a Japanese id, so every link written to the English anchor arrives at a page
 * that has nothing by that name and quietly does not move. Where something
 * links to a section, both languages say the id out loud. Anything else in
 * braces is left alone, because it is prose.
 *
 * ## Duplicates get a counter rather than colliding
 *
 * Two sections called "Why" on one page is normal prose and produces one id
 * twice. Two elements with the same id is not an error anywhere: the browser
 * simply resolves the fragment to the first, so the second section becomes
 * unreachable and nothing says so. The counter is per document, which is the
 * scope an id has.
 */

const HEADING = /^h[1-6]$/;

export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** All the text under a node, which is what the heading reads as. */
function textOf(node) {
  if (node.type === "text") return node.value;
  if (!node.children) return "";
  return node.children.map(textOf).join("");
}

/** An id written on the heading itself: `## Tiles {#tiles}`. */
const WRITTEN = /\s*\{#([A-Za-z0-9][A-Za-z0-9_-]*)\}\s*$/;

/** Take the `{#id}` off the end of a heading, and answer the id it held. */
function written(node) {
  const text = textOf(node);
  const m = WRITTEN.exec(text);
  if (!m) return null;
  // The token is the tail of the heading, so it is the tail of the last
  // text under it. Trimming there leaves any markup before it alone.
  const last = (function tail(n) {
    if (n.type === "text") return n;
    const kids = n.children ?? [];
    for (let i = kids.length - 1; i >= 0; i--) {
      const t = tail(kids[i]);
      if (t) return t;
    }
    return null;
  })(node);
  if (last) last.value = last.value.replace(WRITTEN, "");
  return m[1];
}

/**
 * The ids a markdown document's headings will carry, in order, by the same
 * two rules the plugin applies: an id written on the heading, else the slug
 * of its text. Fenced code is skipped, because a `#` there is a comment.
 *
 * This is what a check reads to answer whether a link into a document lands
 * on anything, in either language, without rendering the site.
 */
export function headingIds(markdown) {
  return headings(markdown).map((h) => h.id);
}

/** The same, with each heading's level, for a check that cares about depth. */
export function headings(markdown) {
  const out = [];
  const seen = new Map();
  let fence = null;
  // Frontmatter is not prose, and a YAML comment there starts with a hash.
  let lines = markdown.split("\n");
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) lines = lines.slice(end + 1);
  }
  for (const line of lines) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }
    if (fence) continue;
    const h = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (!h) continue;
    const level = h[1].length;
    const said = WRITTEN.exec(h[2]);
    if (said) {
      out.push({ level, id: said[1] });
      continue;
    }
    // The text as it renders: emphasis and code marks are not in the slug.
    const base = slug(h[2].replace(/[`*_]/g, ""));
    if (!base) continue;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ level, id: n ? `${base}-${n + 1}` : base });
  }
  return out;
}

export default function rehypeHeadings() {
  return (tree) => {
    const seen = new Map();

    const walk = (node) => {
      if (node.type === "element" && HEADING.test(node.tagName)) {
        node.properties = node.properties ?? {};
        const said = written(node);
        if (said && !node.properties.id) node.properties.id = said;
        if (!node.properties.id) {
          const base = slug(textOf(node));
          if (base) {
            const n = seen.get(base) ?? 0;
            seen.set(base, n + 1);
            node.properties.id = n ? `${base}-${n + 1}` : base;
          }
        }
      }
      for (const child of node.children ?? []) walk(child);
    };

    walk(tree);
  };
}
