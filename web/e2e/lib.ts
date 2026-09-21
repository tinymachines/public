import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const BASE = process.env.BASE ?? "https://tinymachines.ai";
export const UPSTREAM = process.env.UPSTREAM ?? "https://6502.tinymachines.ai";
export const OUT = path.join(__dirname, "out");
export const PHONE = { width: 390, height: 844 };
export const NARROW = { width: 360, height: 780 };
export const DESK = { width: 1280, height: 900 };

/** Every path in the sitemap, written by global-setup. */
export function pages(): string[] {
  const list = JSON.parse(fs.readFileSync(path.join(OUT, "pages.json"), "utf8")) as string[];
  if (list.length < 100) throw new Error(`pages.json has ${list.length} pages; the sitemap is not what it was`);
  return list;
}
export const isJa = (p: string) => p === "/ja" || p.startsWith("/ja/");
export const en = () => pages().filter((p) => !isJa(p));
export const twinOf = (p: string) => (isJa(p) ? p.slice(3) || "/" : p === "/" ? "/ja" : `/ja${p}`);

/** The untranslated notice's own sentence, read out of the component that prints it.
 *
 * Not retyped here, for the reason data/check-i18n.py gives for not retyping
 * it either: the page prints it and these checks look for it, so the two agree
 * by construction and a rewording carries to both. A miss throws, because a
 * scan that quietly matches nothing is not a scan.
 */
export function noticeSentence(): string {
  const src = fs.readFileSync(path.join(__dirname, "..", "app", "components", "Untranslated.tsx"), "utf8");
  const m = src.match(/className="notice untranslated"[^>]*>\s*([^<]+?)\s*<\/p>/);
  if (!m) throw new Error("no notice sentence in app/components/Untranslated.tsx");
  return m[1].split(/\s+/).join(" ");
}

// Kana and CJK, and the Latin letters competing with them: the same pair
// data/check-i18n.py counts, because a body of identifiers and code fences
// would read as untranslated by a raw kana count.
const KANA_CJK = /[぀-ヿ㐀-鿿]/g;
const LATIN = /[A-Za-z]/g;

/** Below this share a page opens in English however much of its chrome flipped. */
export const JA_FLOOR = 0.2;

/** The share of the letters in this text that are Japanese. */
export function jaShare(text: string): number {
  const ja = (text.match(KANA_CJK) ?? []).length;
  const la = (text.match(LATIN) ?? []).length;
  return ja + la === 0 ? 0 : ja / (ja + la);
}

/**
 * The page's own document, as text. <main> where there is one, the whole
 * document where there is not: the Lab is a full-bleed instrument and ships no
 * <main>, and a locator waiting for one there is a four minute hang, which is
 * how lang.spec.ts failed the first time it ran.
 *
 * The untranslated notice comes out before anything is counted. It is Japanese
 * text a page prints BECAUSE its body is English, so leaving it in raises the
 * share of exactly the pages it reports on: /6502/block/article has a 133
 * character body and the notice alone carried it from 0% to 24%.
 */
export function servedBody(html: string): string {
  const stripped = html.replace(/<p[^>]*class="[^"]*untranslated[^"]*"[^>]*>[\s\S]*?<\/p>/g, " ");
  const m = stripped.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
  return (m ? m[1] : stripped)
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The explorer sub-pages: everything under /6502/ that is a ported page. */
export const TOOL_PAGES = [
  "/6502/explorer", "/6502/primer", "/6502/tracer", "/6502/blueprint", "/6502/chipmap", "/6502/decode",
  "/6502/designer", "/6502/diegraph", "/6502/exploded", "/6502/halfshot", "/6502/pinout", "/6502/programs",
  "/6502/schematic", "/6502/talk", "/6502/timing", "/6502/trace", "/6502/block", "/6502/blockdiagram",
];
/** Pages that register a chip driver, so the strip is live (measured 2026-08-25). */
export const STRIP_LIVE = [
  "/6502/explorer", "/6502/primer", "/6502/tracer", "/6502/games", "/6502/blueprint",
  "/6502/chipmap", "/6502/exploded", "/6502/schematic", "/6502/programs",
  "/6502/trace", "/6502/halfshot", "/6502/lab",
];
/** Strip pages whose driver has no power switch: a recording is not booted. */
export const NO_SWITCH = ["/6502/trace", "/6502/halfshot"];
/** Strip pages whose driver has no opcode step (a recording carries no SYNC to stop on). */
export const NO_OP = ["/6502/trace", "/6502/halfshot"];

/** A page with its scripts settled. The chip pages boot wasm; the number is what they need. */
export async function open(page: Page, p: string, settle = 2500) {
  const r = await page.goto(p, { waitUntil: "load", timeout: 45_000 });
  if (!r || r.status() !== 200) throw new Error(`${p}: HTTP ${r?.status()}`);
  await page.waitForTimeout(settle);
}

/** Sideways overflow, and the elements outside any scroll container that cause it.
 *
 * Two passes, because an overflow has two shapes and only one of them is a
 * box. A box that sticks out is found by its rect. A box the right width
 * whose CONTENT is wider is not: on /ja/docs/nes/p3-report at 390px the
 * paragraph measured 350 and held 407, because a run of "$2000、$2001、"
 * offers Chrome no break, and the rect pass named only the footer, which was
 * as wide as the document had by then become. A report that names the
 * footer sends the reader to the wrong file, so the second pass names the
 * element that is actually too full, and quotes what did not fit.
 */
export async function overflow(page: Page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const px = d.scrollWidth - d.clientWidth;
    const out: string[] = [];
    const name = (el: HTMLElement) =>
      `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;
    const scrolled = (el: HTMLElement) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowX)) return true;
      }
      return false;
    };
    if (px > 0) {
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right <= d.clientWidth + 1 || r.width === 0) continue;
        if (!scrolled(el)) out.push(`${name(el)} right=${Math.round(r.right)}`);
      }
      const full = [...document.querySelectorAll<HTMLElement>("body *")].filter(
        (el) =>
          el.clientWidth > 0 &&
          el.scrollWidth - el.clientWidth >= 4 &&
          !/(auto|scroll)/.test(getComputedStyle(el).overflowX),
      );
      // Only the innermost. Every ancestor of a too-full element is too full
      // as well, and naming the shell first is how the first version of this
      // report buried the paragraph under three wrappers.
      for (const el of full.filter((el) => !full.some((o) => o !== el && el.contains(o)))) {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        out.push(`${name(el)} holds ${el.scrollWidth} in ${el.clientWidth}: "${text}"`);
      }
    }
    return { px, out: out.slice(0, 8) };
  });
}

/** Visible text of the document, for the prose scans. Code and scripts excluded. */
export async function visibleText(page: Page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let s = "";
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest("script, style, code, pre, kbd, noscript, template")) continue;
      s += n.textContent + "\n";
    }
    return s;
  });
}
