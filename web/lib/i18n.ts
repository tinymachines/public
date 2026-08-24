import fs from "node:fs";
import path from "node:path";
import type { Lang } from "./lang";

/**
 * The server half: the overlay itself. lib/lang.ts carries everything a
 * client component may import (types and href helpers); this file reads
 * the dictionary with fs and therefore must never be imported from
 * anything marked "use client". Client components receive translated
 * strings as props instead, so the dictionary never ships to a browser.
 */

export { LANGS, isLang, localize, delocalize } from "./lang";
export type { Lang } from "./lang";

const OVERLAY_PATH = path.join(process.cwd(), "..", "data", "ja.json");

let overlay: Record<string, string> | null = null;

function ja(): Record<string, string> {
  if (!overlay) {
    overlay = JSON.parse(fs.readFileSync(OVERLAY_PATH, "utf8")) as Record<string, string>;
  }
  return overlay;
}

/** The text in the given language: the overlay's answer, or the English. */
export function t(lang: Lang, text: string): string {
  if (lang === "en") return text;
  return ja()[text] ?? text;
}
