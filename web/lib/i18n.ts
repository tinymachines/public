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

// Kana and CJK, and the Latin letters competing with them. The same pair
// data/check-i18n.py counts the served page with: a body of identifiers and
// code reads as untranslated by a raw kana count, so the share is against the
// letters actually beside it.
//
// Written as escapes rather than as the characters themselves, because the
// card's font check reads this directory looking for Japanese it has to draw,
// and a range's endpoints are not copy: U+3040 and U+9FFF are unassigned or
// unused, they are in no sentence, and the subset has no glyph for them. As
// literals they failed that check (2026-09-20) and would have had somebody
// widen a font subset to satisfy a regex.
const KANA_CJK = /[\u3040-\u30FF\u3400-\u9FFF]/g;
const LATIN = /[A-Za-z]/g;

/**
 * The language a page's copy came out in, measured rather than assumed.
 *
 * `t()` hands back the English when the overlay has no answer, which is the
 * right behaviour and the quiet one: a page whose every sentence goes through
 * the overlay can render entirely in English under /ja and look merely
 * unfinished. /hotbits/space did that from the day it arrived, and no check
 * saw it, because it is not in the sitemap and the counter only walks the
 * sitemap (measured 2026-09-20: 0% Japanese, no notice).
 *
 * So a page that builds its copy through `t()` asks this what it ended up
 * with, and decides the notice and its `lang` from the answer rather than
 * from the route. The day the overlay learns those sentences, the same
 * measurement withdraws the notice: nothing has to be remembered.
 *
 * The floor is 0.2, which is the floor data/check-i18n.py measures the served
 * page against. Below it the page opens in English however much of its chrome
 * flipped. Copy with no letters at all makes no claim either way, so the
 * route's language stands.
 */
export function bodyLang(lang: Lang, copy: string[]): Lang {
  if (lang === "en") return "en";
  const text = copy.join(" ");
  const kana = (text.match(KANA_CJK) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;
  if (kana + latin === 0) return lang;
  return kana / (kana + latin) >= 0.2 ? "ja" : "en";
}
