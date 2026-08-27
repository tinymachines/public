import fs from "node:fs";
import path from "node:path";
import { explorerPages } from "./explorer";

/**
 * The article: a tool page's prose, lifted out of the instrument.
 *
 * Every 6502 tool page carries its documentation under the instrument as one
 * or more `section.bp-prose` blocks: an eyebrow, an h2, a lede, paragraphs.
 * On the tool page that prose sits below a full-viewport instrument and, on
 * the tracer, one of its paragraphs is 20,661 characters long; measured
 * 2026-08-27 (notes/pretext.md), nobody reads it there. The companion page
 * (/6502/<tool>/article) sets the same words in a reading column, justified
 * through pretext (components/Justified.tsx), with the instrument as a live
 * figure. This module is the reader: it turns the sections into blocks a
 * page can lay out, and it changes no word.
 *
 * What it does change, and it is two things, both layout:
 *
 * - A paragraph longer than LONG is split at sentence ends into paragraphs
 *   of about TARGET characters. The sentences are the author's; only the
 *   paragraph breaks are new, and lib/article.test.ts checks that the split
 *   text joined back is the original text.
 * - Inline marks are kept as runs (em, mono, link) so the justified setter
 *   can measure each in its own font; a paragraph is a list of runs, not a
 *   string, and links are rewritten to this site's paths as lib/explorer.ts
 *   rewrites them.
 */

const SRC = path.join(process.cwd(), "..", "..", "6502", "web");
const LONG = 1200;
const TARGET = 620;

export type RunKind = "text" | "em" | "mono" | "a" | "b";
export interface Run { kind: RunKind; text: string; href?: string }
export type Block =
  | { kind: "eyebrow"; text: string }
  | { kind: "h2"; text: string; id: string }
  | { kind: "lede"; runs: Run[] }
  | { kind: "p"; runs: Run[] };

export interface Article {
  slug: string;
  title: string;
  description: string;
  blocks: Block[];
  /** How many paragraphs the split added, for the page to say so. */
  splits: number;
  /** Characters of prose, for the reader who wants to know what they are in for. */
  chars: number;
}

function unescape(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

const slugs = () => new Set(explorerPages().map((p) => p.file.replace(/\.html$/, "")));

function rewriteHref(href: string): string {
  const s = slugs();
  const m = href.match(/^\/?([a-z0-9-]+)(\?[^#]*)?(#.*)?$/);
  if (m && s.has(m[1])) return `/6502/${m[1]}${m[2] ?? ""}${m[3] ?? ""}`;
  if (href === "/") return "/6502/explorer";
  return href;
}

/** Inline HTML to runs. Tags this does not know are dropped and their text kept. */
export function runsOf(inner: string): Run[] {
  const out: Run[] = [];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>/gi;
  let kind: RunKind = "text";
  let href: string | undefined;
  let last = 0;
  const push = (text: string) => {
    const t = unescape(text.replace(/\s+/g, " "));
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && prev.kind === kind && prev.href === href) prev.text += t;
    else out.push(kind === "a" ? { kind, text: t, href } : { kind, text: t });
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    push(inner.slice(last, m.index));
    last = re.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (closing) { kind = "text"; href = undefined; continue; }
    if (tag === "em" || tag === "i") kind = "em";
    else if (tag === "b" || tag === "strong") kind = "b";
    else if (tag === "code" || (tag === "span" && /\bmono\b/.test(m[3]))) kind = "mono";
    else if (tag === "a") {
      const h = m[3].match(/href="([^"]*)"/);
      kind = "a"; href = h ? rewriteHref(unescape(h[1])) : undefined;
    }
  }
  push(inner.slice(last));
  // Leading and trailing space on the paragraph is the markup's, not the prose's.
  if (out.length) { out[0].text = out[0].text.replace(/^\s+/, ""); out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, ""); }
  return out.filter((r) => r.text.length > 0);
}

export const plain = (runs: Run[]) => runs.map((r) => r.text).join("");

/**
 * Split a long paragraph at sentence ends into paragraphs near TARGET
 * characters, cutting runs where a sentence ends inside one. The join of the
 * parts' plain text is the original's plain text: nothing is dropped and
 * nothing is added, and the test says so.
 */
export function splitRuns(runs: Run[], target = TARGET): Run[][] {
  const text = plain(runs);
  if (text.length <= LONG) return [runs];
  // Sentence ends: . ! ? followed by a space and a capital, a quote or a
  // digit; a semicolon followed by a space counts too, since the long
  // paragraph is written in clauses. Never inside a mono run (a "$" or "."
  // in a name is not a sentence end).
  const ends: number[] = [];
  const monoRanges: [number, number][] = [];
  let pos = 0;
  for (const r of runs) { if (r.kind === "mono") monoRanges.push([pos, pos + r.text.length]); pos += r.text.length; }
  const inMono = (i: number) => monoRanges.some(([a, b]) => i > a && i < b);
  const re = /[.!?]["')\]]?\s+(?=[A-Z0-9"'(])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { const cut = m.index + m[0].length; if (!inMono(cut)) ends.push(cut); }
  if (!ends.length) return [runs];
  // Greedy: take sentences until the next end would overshoot the target by
  // more than it undershoots.
  const cuts: number[] = [];
  let start = 0;
  for (let i = 0; i < ends.length; i++) {
    const here = ends[i] - start;
    const next = i + 1 < ends.length ? ends[i + 1] - start : text.length - start;
    if (here >= target || (next > target && here >= target * 0.6)) {
      if (text.length - ends[i] < target * 0.4) break; // a short tail joins the last paragraph
      cuts.push(ends[i]); start = ends[i];
    }
  }
  if (!cuts.length) return [runs];
  // Cut the runs at the character offsets.
  const parts: Run[][] = [];
  let cur: Run[] = [];
  let at = 0;
  let ci = 0;
  for (const r of runs) {
    let rest = r;
    let rstart = at;
    while (ci < cuts.length && cuts[ci] < rstart + rest.text.length) {
      const k = cuts[ci] - rstart;
      const head = { ...rest, text: rest.text.slice(0, k) };
      if (head.text.trim()) cur.push({ ...head, text: head.text.replace(/\s+$/, "") });
      parts.push(cur); cur = [];
      rest = { ...rest, text: rest.text.slice(k) };
      rstart += k;
      ci += 1;
    }
    if (rest.text) cur.push(cur.length === 0 ? { ...rest, text: rest.text.replace(/^\s+/, "") } : rest);
    at += r.text.length;
  }
  if (cur.length) parts.push(cur);
  return parts.filter((p) => p.length);
}

function idFor(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function article(file: string): Article {
  const html = fs.readFileSync(path.join(SRC, file), "utf8");
  const blocks: Block[] = [];
  let splits = 0;
  let chars = 0;
  const secRe = /<section class="wrap sec bp-prose[^"]*"[^>]*>/g;
  let sm: RegExpExecArray | null;
  let sections = 0;
  while ((sm = secRe.exec(html))) {
    sections += 1;
    const end = html.indexOf("</section>", sm.index);
    const sec = html.slice(sm.index + sm[0].length, end);
    const blockRe = /<(h2|h3|p)([^>]*)>([\s\S]*?)<\/\1>/g;
    let bm: RegExpExecArray | null;
    while ((bm = blockRe.exec(sec))) {
      const [, tag, attrs, inner] = bm;
      if (tag === "h2" || tag === "h3") {
        const text = unescape(inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
        const id = (attrs.match(/id="([^"]+)"/) ?? [])[1] ?? idFor(text);
        blocks.push({ kind: "h2", text, id });
        continue;
      }
      if (/\beyebrow\b/.test(attrs)) { blocks.push({ kind: "eyebrow", text: unescape(inner.replace(/<[^>]+>/g, "").trim()) }); continue; }
      const runs = runsOf(inner);
      if (!runs.length) continue;
      chars += plain(runs).length;
      if (/\blede\b/.test(attrs)) { blocks.push({ kind: "lede", runs }); continue; }
      const parts = splitRuns(runs);
      splits += parts.length - 1;
      for (const p of parts) blocks.push({ kind: "p", runs: p });
    }
  }
  if (!sections) throw new Error(`6502/web/${file}: no section.bp-prose; there is no article to lift`);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  return {
    slug: file.replace(/\.html$/, ""),
    title: titleMatch ? unescape(titleMatch[1].split(/[·|]/)[0].trim()) : file,
    description: descMatch ? unescape(descMatch[1]) : "",
    blocks,
    splits,
    chars,
  };
}

/** The tool pages that have an article: every one with a prose section. */
export function articlePages(): { slug: string; file: string }[] {
  return explorerPages().filter((p) => {
    const html = fs.readFileSync(path.join(SRC, p.file), "utf8");
    return /<section class="wrap sec bp-prose/.test(html);
  });
}
