import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/**
 * The docs tree, read from ../docs.
 *
 * Everything a reader sees about structure comes from this file walking the
 * directory. There is no nav list, no ordering array, no page registry. Ten
 * hand-copied nav lists in the 6502 repo had drifted three ways before anybody
 * noticed, because a nav missing one link still looks exactly like a nav.
 *
 * If you are about to add an array of page titles here, that is the thing this
 * module exists to make impossible.
 */

// Content is a sibling of the app, not part of it, so that somebody who is not
// a developer can edit it. The scripts in package.json run from web/.
export const DOCS_DIR = path.join(process.cwd(), "..", "docs");

// docs/README.md documents the conventions for whoever edits the tree. It is
// not a page and must never become one. Excluded by name rather than by some
// rule about leading capitals, which would be a rule nobody could remember.
const NOT_A_PAGE = new Set(["README.md"]);

const PAGE_EXT = [".md", ".mdx"];

export type Frontmatter = {
  title: string;
  description?: string;
  order?: number;
};

export type Page = {
  /** URL path, always absolute, always derived from the file's location. */
  route: string;
  /** Path relative to DOCS_DIR, e.g. "6502/cartridges.md". */
  file: string;
  /** Route segments, [] for /docs itself. */
  slug: string[];
  title: string;
  description?: string;
  order?: number;
  /** True for an index.md, which owns its directory's route. */
  isIndex: boolean;
};

export type TreeNode = {
  page: Page;
  children: TreeNode[];
};

function isPageFile(name: string): boolean {
  return PAGE_EXT.some((e) => name.endsWith(e)) && !NOT_A_PAGE.has(name);
}

/**
 * Frontmatter carries only what the tree cannot say. Not the URL, which is the
 * path. Not the parent, which is the directory.
 *
 * A page with no title is a build failure, not a page called "Untitled". A
 * silent omission reads as a design choice, and by the time anybody notices,
 * the page has been wrong in public for a while.
 */
function readFrontmatter(abs: string, rel: string): Frontmatter {
  const parsed = matter(fs.readFileSync(abs, "utf8"));
  const data = parsed.data as Record<string, unknown>;

  const title = data.title;
  if (typeof title !== "string" || title.trim() === "") {
    throw new Error(
      `docs/${rel}: no title in frontmatter. Every page needs one; ` +
        `a page with no title is a build failure rather than a page called "Untitled".`,
    );
  }

  const known = new Set(["title", "description", "order"]);
  const extra = Object.keys(data).filter((k) => !known.has(k));
  if (extra.length > 0) {
    throw new Error(
      `docs/${rel}: frontmatter carries ${extra.join(", ")}. ` +
        `Only title, description and order are allowed: the URL is the path ` +
        `and the parent is the directory, so neither belongs in a file.`,
    );
  }

  const order = data.order;
  if (order !== undefined && typeof order !== "number") {
    throw new Error(`docs/${rel}: order must be a number, got ${typeof order}.`);
  }

  const description = data.description;
  if (description !== undefined && typeof description !== "string") {
    throw new Error(`docs/${rel}: description must be a string.`);
  }

  return { title, description, order };
}

/**
 * Absent order sorts last, alphabetically by title. Not first: a page that
 * forgot to declare a position should not silently claim the top of the list.
 */
function bySiblingOrder(a: TreeNode, b: TreeNode): number {
  const ao = a.page.order ?? Number.POSITIVE_INFINITY;
  const bo = b.page.order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return a.page.title.localeCompare(b.page.title);
}

function pageFrom(absFile: string, relFile: string): Page {
  const fm = readFrontmatter(absFile, relFile);
  const withoutExt = relFile.replace(/\.mdx?$/, "");
  const isIndex = path.basename(withoutExt) === "index";
  const slugPath = isIndex ? path.dirname(withoutExt) : withoutExt;
  const slug = slugPath === "." ? [] : slugPath.split(path.sep);

  return {
    route: ["/docs", ...slug].join("/"),
    file: relFile,
    slug,
    title: fm.title,
    description: fm.description,
    order: fm.order,
    isIndex,
  };
}

function walk(absDir: string, relDir: string): TreeNode[] {
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    const rel = relDir ? path.join(relDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      const indexFile = PAGE_EXT.map((e) => `index${e}`).find((f) =>
        fs.existsSync(path.join(absDir, entry.name, f)),
      );
      if (!indexFile) {
        throw new Error(
          `docs/${rel}/: a directory with no index.md. It would be a URL that ` +
            `404s while its children resolve, which reads as a broken link ` +
            `rather than a missing page. Add docs/${rel}/index.md.`,
        );
      }
      const dirIndexRel = path.join(rel, indexFile);
      nodes.push({
        page: pageFrom(path.join(DOCS_DIR, dirIndexRel), dirIndexRel),
        children: walk(path.join(absDir, entry.name), rel).sort(bySiblingOrder),
      });
      continue;
    }

    if (!entry.isFile() || !isPageFile(entry.name)) continue;
    if (entry.name.startsWith("index.")) continue; // owned by its directory

    nodes.push({ page: pageFrom(path.join(DOCS_DIR, rel), rel), children: [] });
  }

  return nodes.sort(bySiblingOrder);
}

/** The whole tree below /docs, sorted. Reading it validates every page. */
export function docsTree(): TreeNode[] {
  if (!fs.existsSync(DOCS_DIR)) {
    throw new Error(
      `No docs tree at ${DOCS_DIR}. Content lives beside the app, not inside ` +
        `it; the package.json scripts run from web/.`,
    );
  }
  return walk(DOCS_DIR, "").sort(bySiblingOrder);
}

/** The root page, /docs itself. */
export function rootPage(): Page {
  const rel = PAGE_EXT.map((e) => `index${e}`).find((f) =>
    fs.existsSync(path.join(DOCS_DIR, f)),
  );
  if (!rel) throw new Error(`docs/index.md is missing: /docs would 404.`);
  return pageFrom(path.join(DOCS_DIR, rel), rel);
}

/** Every page, flattened. Used for routing and for the page-count check. */
export function allPages(): Page[] {
  const out: Page[] = [rootPage()];
  const visit = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      out.push(n.page);
      visit(n.children);
    }
  };
  visit(docsTree());
  return out;
}

export function pageForSlug(slug: string[]): Page | undefined {
  const route = ["/docs", ...slug].join("/");
  return allPages().find((p) => p.route === route);
}
