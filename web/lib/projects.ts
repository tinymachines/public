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
  status: string;
  surfaces: Surface[];
}

interface Manifest {
  measured_on: string;
  note: string;
  projects: Project[];
}

const FILE = path.join(process.cwd(), "..", "data", "projects.json");

function read(): Manifest {
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as Manifest;
}

export function projects(): Project[] {
  return read().projects;
}

export function measuredOn(): string {
  return read().measured_on;
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
