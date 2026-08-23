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

export default function rehypeHeadings() {
  return (tree) => {
    const seen = new Map();

    const walk = (node) => {
      if (node.type === "element" && HEADING.test(node.tagName)) {
        node.properties = node.properties ?? {};
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
