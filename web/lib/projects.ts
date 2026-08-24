import fs from "node:fs";
import path from "node:path";

/**
 * The projects and their surfaces, read from data/projects.json at build time.
 *
 * Read rather than restated, for the reason every list in this repo is read
 * rather than restated: a second copy drifts in one of them and both still
 * look like a list. The same file is the one PROJECTS.md points at and the one
 * api/pieces.py checks against, so "which projects exist" has one answer.
 *
 * At build time, not at request time. Every page here is prerendered, so this
 * runs on the machine doing the build and the JSON never reaches the browser.
 */

export interface Surface {
  key: string;
  name: string;
  what: string;
  /** Whether the site navigation carries it, and what it is called there. */
  nav: boolean;
  nav_label: string | null;
  /**
   * Whether this site builds the page. False for the API (uvicorn) and the
   * archive (nginx serving a directory), which matters twice: the build cannot
   * check a route it did not render, and the client router cannot navigate to
   * one, so those links have to be plain anchors.
   */
  prerendered: boolean;
  /** The key in data/pieces.json this surface is, or null when it is the roof's own. */
  piece: string | null;
  /** Probed, not remembered. Where it answers right now. */
  serves_today: string;
  /** Where it is proposed to land under the apex. */
  lands_at: string;
  /** False while lands_at is a proposal rather than a decision. */
  lands_at_settled: boolean;
  status: string;
}

export interface Project {
  key: string;
  name: string;
  what: string;
  /** The stylesheet scoping this project's identity tokens, or null for the roof. */
  silo: string | null;
  /** Where this project's page is on this site, or null when it has none yet. */
  landing: string | null;
  status: string;
  surfaces: Surface[];
}

interface Manifest {
  measured_on: string;
  note: string;
  projects: Project[];
}

const FILE = path.join(process.cwd(), "..", "data", "projects.json");

export function read(): Manifest {
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as Manifest;
}

export function projects(): Project[] {
  return read().projects;
}

export function measuredOn(): string {
  return read().measured_on;
}

/**
 * The surfaces of a project that have actually arrived on this site: landed
 * somewhere settled, and started. The menu and the front page both need this
 * exact filter, and two inline copies of it is how one of them ends up
 * listing a surface the other refuses to.
 */
export function arrivedSurfaces(p: Project): Surface[] {
  return p.surfaces.filter((s) => s.status !== "not started" && s.lands_at_settled);
}

export function project(key: string): Project {
  const found = read().projects.find((p) => p.key === key);
  if (!found) {
    // A build failure rather than a page about nothing. The same reasoning as
    // "a page with no title is a build failure, not a page called Untitled":
    // a silent omission reads as a design choice.
    throw new Error(
      `data/projects.json has no project ${JSON.stringify(key)}. ` +
        `It has: ${read().projects.map((p) => p.key).join(", ")}`,
    );
  }
  return found;
}


/** One entry in the site navigation. */
export interface NavEntry {
  href: string;
  label: string;
}

/**
 * The site navigation, derived rather than listed.
 *
 * There is no `nav.ts` and there must not be. Ten hand-copied nav lists in the
 * 6502 repo had drifted three ways before anybody noticed, because a nav
 * missing one link still looks exactly like a nav, and this one had already
 * started: `/6502` shipped passing `here="home"` to a component whose idea of
 * "home" was a hand-maintained union of four strings.
 *
 * Two sources, and both are the manifest:
 *
 *   - the roof's own surfaces marked `nav`, which is docs, style and the API
 *   - every other project's landing page, once it has one
 *
 * A project with no landing page is absent rather than dead-linked. hotbits is
 * in the manifest today and correctly not in the navigation.
 */
export function nav(): NavEntry[] {
  const roof: NavEntry[] = [];
  const rest: NavEntry[] = [];
  for (const p of read().projects) {
    if (p.key === "roof") {
      for (const s of p.surfaces) {
        if (s.nav && s.nav_label) roof.push({ href: s.lands_at, label: s.nav_label });
      }
    } else if (p.landing) {
      rest.push({ href: p.landing, label: p.name });
    }
  }
  // The API sorts last, and it is the one ordering rule here. It is a surface
  // rather than a section: a reader choosing where to go is choosing between
  // the documentation, the projects and the style guide, and the API is a
  // thing you call rather than a place you read. Listed first, as it was, it
  // pushed the 6502 work to the end of a menu the 6502 work is the point of.
  const isApi = (e: NavEntry) => e.href.startsWith("/api");
  return [...roof.filter((e) => !isApi(e)), ...rest, ...roof.filter(isApi)];
}

/**
 * One surface, by project and key. A build failure when it is not there,
 * for the same reason project() is: a page assembled around a surface that
 * has been renamed should stop the build, not render without the part it was
 * about.
 */
export function surface(projectKey: string, surfaceKey: string): Surface {
  const p = project(projectKey);
  const found = p.surfaces.find((s) => s.key === surfaceKey);
  if (!found) {
    throw new Error(
      `data/projects.json: project ${JSON.stringify(projectKey)} has no surface ` +
        `${JSON.stringify(surfaceKey)}. It has: ${p.surfaces.map((s) => s.key).join(", ")}`,
    );
  }
  return found;
}

/**
 * Where the 6502 API answers, with no trailing slash.
 *
 * Three pages need this string and it was written out in one of them. That is
 * the shape this repository keeps finding at the bottom of its bugs, and it
 * was about to become four: the console, the builders index, a builder's page
 * and every cartridge link on them all name the same host.
 *
 * It comes from the manifest's `serves_today` rather than from a constant,
 * which means the day the API lands under the apex the pages follow the file
 * that records the move instead of each being edited. `lands_at` is
 * deliberately NOT the answer yet: that path is still marked a proposal, and
 * fetching from a proposed address would be fetching from nothing.
 */
export function chipApi(): string {
  return surface("6502", "api").serves_today.replace(/\/+$/, "");
}

/**
 * The origin a surface answers on, with any path stripped.
 *
 * `serves_today` is an address a reader can follow, so it points at something
 * readable: hotbits' TRNG is recorded as its `openapi.json` because that is
 * the only document it serves. A client fetching from it wants the origin, and
 * deriving that here is one copy of the fact rather than a constant in every
 * page that talks to the same host.
 */
export function serviceOrigin(projectKey: string, surfaceKey: string): string {
  return new URL(surface(projectKey, surfaceKey).serves_today).origin;
}
