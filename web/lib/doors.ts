import fs from "node:fs";
import path from "node:path";
import { PAGES } from "./pages";
import { allPages } from "./docs";
import { read as manifest } from "./projects";
import { explorer, explorerPages } from "./explorer";
import { article, articlePages } from "./article";

/**
 * The three doors: the site by what a visitor came to do.
 *
 * The top level names repositories (6502, nes, hotbits, docs), which is where
 * the pages came from and not what anybody came for. /style/map measured the
 * cost of that: eighty of a hundred and forty pages sitting exactly two
 * clicks out, behind two indexes, with the best teaching surface on the site
 * reachable from one link.
 *
 * data/doors.json is MEMBERSHIP ONLY. No title, no description and no length
 * is written there: each is read from wherever that page's name already
 * lives, which is lib/pages.ts for a fixed page, the manifest for a surface,
 * the tool's own page for an instrument or its article, and the docs tree for
 * a document. So a page renamed anywhere is renamed behind its door, and a
 * door cannot quietly disagree with the page it opens. The one thing written
 * in that file is a group's name and line, because a grouping of pages is a
 * fact that exists nowhere else.
 *
 * The lengths come from data/site-map.json, the crawl that measures the live
 * site, for the reason the doors were grouped in the first place: read cold,
 * every entry looked alike, and the question a reader has in front of a list
 * of pages is which of them is a read and which is another list. Words and
 * links out answer that without either of them being an opinion. A page the
 * record has not met yet simply shows no counts, and the deploy's own
 * crawl-site --check is what catches a record that has fallen behind.
 *
 * A path may sit behind two doors. The explorer is a thing to watch and a
 * thing to build on, and a door is a way in rather than a folder: the site
 * has exactly one hierarchy and it is the URL.
 */

const FILE = path.join(process.cwd(), "..", "data", "doors.json");
const MAP = path.join(process.cwd(), "..", "data", "site-map.json");

export interface DoorGroup {
  /** A run of pages under one heading, or an unheaded run where there is none. */
  name?: string;
  what?: string;
  paths: string[];
}

export interface Door {
  key: string;
  path: string;
  name: string;
  short: string;
  what: string;
  /** The page this door leads with, for the front page's link. */
  opens: string;
  groups: DoorGroup[];
}

export interface DoorEntry {
  href: string;
  title: string;
  what: string;
  /** Words the page shows, and links it offers, as last crawled. */
  words?: number;
  out?: number;
}

export interface DoorSection {
  name?: string;
  what?: string;
  rows: DoorEntry[];
}

let cached: Door[] | null = null;

export function doors(): Door[] {
  if (!cached) {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as { doors: Door[] };
    if (!parsed.doors?.length) throw new Error("data/doors.json holds no doors");
    for (const d of parsed.doors) {
      if (!d.groups?.length || d.groups.some((g) => !g.paths?.length)) {
        throw new Error(`data/doors.json: the "${d.key}" door has a group with no pages in it`);
      }
    }
    cached = parsed.doors;
  }
  return cached;
}

export function door(key: string): Door {
  const found = doors().find((d) => d.key === key || d.path === `/${key}`);
  if (!found) {
    // A build failure rather than a page about nothing, the same rule
    // lib/projects.ts uses: a silent omission reads as a design choice.
    throw new Error(`data/doors.json has no door ${JSON.stringify(key)}; it has: ${doors().map((d) => d.key).join(", ")}`);
  }
  return found;
}

type Measured = { words: number; out: number };
let measures: Map<string, Measured> | null = null;

function measured(): Map<string, Measured> {
  if (!measures) {
    measures = new Map();
    if (fs.existsSync(MAP)) {
      const record = JSON.parse(fs.readFileSync(MAP, "utf8")) as {
        pages: Record<string, { words?: number; out?: number }>;
      };
      for (const [href, p] of Object.entries(record.pages ?? {})) {
        if (typeof p.words === "number" && typeof p.out === "number") {
          measures.set(href, { words: p.words, out: p.out });
        }
      }
    }
  }
  return measures;
}

/** A door's groups, each with its pages named where that page is named. */
export function sections(d: Door): DoorSection[] {
  const surfaces = manifest().projects.flatMap((p) => p.surfaces.map((s) => ({ ...s, project: p.name })));
  const docs = allPages();
  const sizes = measured();

  const name = (href: string): { title: string; what: string } => {
    const fixed = PAGES[href];
    if (fixed) return { title: fixed.title, what: fixed.description };

    const surface = surfaces.find((s) => s.lands_at === href);
    if (surface) return { title: surface.name, what: surface.what };

    // An article is named by the prose it sets, which lib/article.ts reads
    // from the tool page that carries it: the same pair /6502/reading lists.
    const read = articlePages().find((p) => `/6502/${p.slug}/article` === href);
    if (read) {
      const a = article(read.file);
      return { title: a.title, what: a.description };
    }

    // A tool page is named by its own page: lib/explorer.ts reads the title
    // and description out of the HTML the 6502 tree publishes, which is the
    // copy of that fact. The build caught this the first time round by
    // refusing to render a door that pointed at /6502/tracer.
    const tool = explorerPages().find((p) => `/6502/${p.slug}` === href);
    if (tool) {
      const x = explorer(tool.file);
      return { title: x.title, what: x.description };
    }

    const slug = href.replace(/^\/docs\/?/, "");
    const doc = docs.find((p) => (p.slug.length ? p.slug.join("/") : "") === slug);
    if (doc) return { title: doc.title, what: doc.description ?? "" };

    // Nothing names it, so the door would be pointing at a page whose name
    // only this file knows. That is the drift this module exists to prevent.
    throw new Error(
      `data/doors.json lists ${href} behind "${d.key}", and nothing names it: ` +
        "add it to lib/pages.ts, to a project's surfaces, or to the docs tree.",
    );
  };

  return d.groups.map((g) => ({
    name: g.name,
    what: g.what,
    rows: g.paths.map((href) => ({ href, ...name(href), ...(sizes.get(href) ?? {}) })),
  }));
}
