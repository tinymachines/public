import fs from "node:fs";
import path from "node:path";
import { PAGES } from "./pages";
import { allPages } from "./docs";
import { read as manifest } from "./projects";
import { explorer, explorerPages } from "./explorer";

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
 * and the docs tree for a document. So a page renamed anywhere is renamed
 * behind its door, and a door cannot quietly disagree with the page it opens.
 *
 * A path may sit behind two doors. The explorer is a thing to watch and a
 * thing to build on, and a door is a way in rather than a folder: the site
 * has exactly one hierarchy and it is the URL.
 */

const FILE = path.join(process.cwd(), "..", "data", "doors.json");

export interface Door {
  key: string;
  path: string;
  name: string;
  short: string;
  what: string;
  /** The page this door leads with, for the front page's link. */
  opens: string;
  paths: string[];
}

export interface DoorEntry {
  href: string;
  title: string;
  what: string;
}

let cached: Door[] | null = null;

export function doors(): Door[] {
  if (!cached) {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as { doors: Door[] };
    if (!parsed.doors?.length) throw new Error("data/doors.json holds no doors");
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

/** What each path behind a door is called, read from wherever it is named. */
export function entries(d: Door): DoorEntry[] {
  const surfaces = manifest().projects.flatMap((p) => p.surfaces.map((s) => ({ ...s, project: p.name })));
  const docs = allPages();

  return d.paths.map((href) => {
    const fixed = PAGES[href];
    if (fixed) return { href, title: fixed.title, what: fixed.description };

    const surface = surfaces.find((s) => s.lands_at === href);
    if (surface) return { href, title: surface.name, what: surface.what };

    // A tool page is named by its own page: lib/explorer.ts reads the title
    // and description out of the HTML the 6502 tree publishes, which is the
    // copy of that fact. The build caught this the first time round by
    // refusing to render a door that pointed at /6502/tracer.
    const tool = explorerPages().find((p) => `/6502/${p.slug}` === href);
    if (tool) {
      const x = explorer(tool.file);
      return { href, title: x.title, what: x.description };
    }

    const slug = href.replace(/^\/docs\/?/, "");
    const doc = docs.find((p) => (p.slug.length ? p.slug.join("/") : "") === slug);
    if (doc) return { href, title: doc.title, what: doc.description ?? "" };

    // Nothing names it, so the door would be pointing at a page whose name
    // only this file knows. That is the drift this module exists to prevent.
    throw new Error(
      `data/doors.json lists ${href} behind "${d.key}", and nothing names it: ` +
        "add it to lib/pages.ts, to a project's surfaces, or to the docs tree.",
    );
  });
}
