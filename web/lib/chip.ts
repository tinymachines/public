import fs from "node:fs";
import path from "node:path";

/**
 * The chip's own figures, from ../data/chip.json.
 *
 * These two numbers are printed on the front page and they are not ours: they
 * are what the 6502 API reports about the die. So they live in one file with
 * the endpoint and the date that produced them, and pages read them rather
 * than restating them. data/verify-chip.py re-derives them from that endpoint.
 *
 * This is START-HERE.md's rule about prose, applied to the page least likely
 * to be checked again: a figure typed into a paragraph is written once against
 * what was true that afternoon and nothing looks at it afterwards.
 */

export interface Chip {
  chip: string;
  nodes: number;
  transistors: number;
  measured_from: string;
  measured_on: string;
}

const DATA = path.join(process.cwd(), "..", "data", "chip.json");

export function chip(): Chip {
  const raw = JSON.parse(fs.readFileSync(DATA, "utf8")) as Chip;
  for (const field of ["nodes", "transistors"] as const) {
    if (!Number.isInteger(raw[field]) || raw[field] <= 0) {
      throw new Error(`data/chip.json: ${field} is not a positive integer.`);
    }
  }
  if (!raw.measured_from || !raw.measured_on) {
    throw new Error(
      "data/chip.json: a figure with no provenance is a figure somebody typed. " +
        "measured_from and measured_on are both required.",
    );
  }
  return raw;
}
