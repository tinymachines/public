import fs from "node:fs";
import { CHIP_SRC } from "./chip-src";
import path from "node:path";
import { explorerPages } from "./explorer";

/**
 * The article: a tool page's prose sections, lifted out of the instrument.
 *
 * Every 6502 tool page carries its documentation under the instrument as
 * `section.bp-prose` blocks. On the tool page that prose sits below a
 * full-viewport instrument and, on the tracer, one of its paragraphs is
 * 20,661 characters long; measured 2026-08-27 (notes/pretext.md), nobody
 * reads it there. The companion page (/6502/<tool>/article) sets the same
 * sections in a reading column, justified through pretext in place
 * (components/Justify.tsx), with the rest of the instrument as a live
 * figure.
 *
 * The sections are kept as the markup they are, not reduced to text. The
 * first version of this reader took only the paragraphs and lost what the
 * sections also carry: across the seventeen tools, 147 divs, 26 buttons,
 * tables, figures, and 36 `[data-fact]` slots the tool's own script fills
 * with measured numbers (block's whole instrument lives inside one). Those
 * are the inline widgets the article is for. So the HTML goes through
 * whole, and this module changes exactly two things about it:
 *
 * - A paragraph longer than LONG whose markup is plain inline (links,
 *   emphasis, mono spans) is split at sentence ends into paragraphs of
 *   about TARGET characters. The sentences are the author's; only the
 *   paragraph breaks are new, and lib/article.test.ts checks that the
 *   parts' text joined back is the original text.
 * - Links are rewritten to this site's paths, as lib/explorer.ts does.
 */

const SRC = path.join(CHIP_SRC, "web");
const LONG = 1200;
const TARGET = 620;

export type RunKind = "text" | "em" | "mono" | "a" | "b";
export interface Run { kind: RunKind; text: string; href?: string }

export interface Article {
  slug: string;
  title: string;
  description: string;
  /** The prose sections, as HTML, each still `section.wrap.sec.bp-prose`. */
  html: string;
  /** How many paragraph breaks the split added. */
  splits: number;
  /** Characters of text in the sections. */
  chars: number;
  /** `[data-fact]` slots carried through, for the page and the test. */
  slots: number;
}

function unescape(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const slugs = () => new Set(explorerPages().map((p) => p.file.replace(/\.html$/, "")));

/** Whether a paragraph's markup is plain inline: the only kind this splits. */
export function isPlainInline(inner: string): boolean {
  const tags = [...inner.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/gi)];
  return tags.every(([, closing, tag, attrs]) => {
    const t = tag.toLowerCase();
    if (closing) return ["em", "i", "b", "strong", "a", "span", "code"].includes(t);
    if (t === "em" || t === "i" || t === "b" || t === "strong" || t === "a") return !/data-/.test(attrs);
    if (t === "span") return /\bmono\b/.test(attrs) && !/data-/.test(attrs);
    if (t === "code") return !/data-/.test(attrs);
    return false;
  });
}

/** Inline HTML to runs. Only for plain inline markup (isPlainInline). */
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
      kind = "a"; href = h ? unescape(h[1]) : undefined;
    }
  }
  push(inner.slice(last));
  if (out.length) { out[0].text = out[0].text.replace(/^\s+/, ""); out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, ""); }
  return out.filter((r) => r.text.length > 0);
}

export const plain = (runs: Run[]) => runs.map((r) => r.text).join("");

/** Runs back to the markup the tool page uses for them. */
export function htmlOf(runs: Run[]): string {
  return runs.map((r) => {
    const t = escape(r.text);
    if (r.kind === "em") return `<em>${t}</em>`;
    if (r.kind === "b") return `<b>${t}</b>`;
    if (r.kind === "mono") return `<span class="mono">${t}</span>`;
    if (r.kind === "a") return `<a href="${escape(r.href ?? "")}">${t}</a>`;
    return t;
  }).join("");
}

/**
 * Split a long paragraph at sentence ends into paragraphs near TARGET
 * characters, cutting runs where a sentence ends inside one. The join of
 * the parts' plain text is the original's plain text.
 */
export function splitRuns(runs: Run[], target = TARGET, long = LONG): Run[][] {
  const text = plain(runs);
  if (text.length <= long) return [runs];
  const monoRanges: [number, number][] = [];
  let pos = 0;
  for (const r of runs) { if (r.kind === "mono") monoRanges.push([pos, pos + r.text.length]); pos += r.text.length; }
  const inMono = (i: number) => monoRanges.some(([a, b]) => i > a && i < b);
  const ends: number[] = [];
  const re = /[.!?]["')\]]?\s+(?=[A-Z0-9"'(])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { const cut = m.index + m[0].length; if (!inMono(cut)) ends.push(cut); }
  if (!ends.length) return [runs];
  const cuts: number[] = [];
  let start = 0;
  for (let i = 0; i < ends.length; i++) {
    const here = ends[i] - start;
    const next = i + 1 < ends.length ? ends[i + 1] - start : text.length - start;
    if (here >= target || (next > target && here >= target * 0.6)) {
      if (text.length - ends[i] < target * 0.4) break;
      cuts.push(ends[i]); start = ends[i];
    }
  }
  if (!cuts.length) return [runs];
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

export function article(file: string): Article {
  const html = fs.readFileSync(path.join(SRC, file), "utf8");
  const s = slugs();
  const sections: string[] = [];
  let splits = 0;
  let chars = 0;
  const secRe = /<section class="wrap sec bp-prose[^"]*"[^>]*>/g;
  let sm: RegExpExecArray | null;
  while ((sm = secRe.exec(html))) {
    const end = html.indexOf("</section>", sm.index);
    let sec = html.slice(sm.index, end + "</section>".length);
    // Scripts never ride along: the tool's script is booted once, by the
    // figure, from the runtime manifest.
    sec = sec.replace(/<script\b[\s\S]*?<\/script>/g, "");
    // The long plain paragraphs, split.
    sec = sec.replace(/<p([^>]*)>([\s\S]*?)<\/p>/g, (whole, attrs: string, inner: string) => {
      const text = unescape(inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).trim();
      chars += text.length;
      if (text.length <= LONG || !isPlainInline(inner) || /\bid=/.test(attrs)) return whole;
      const parts = splitRuns(runsOf(inner));
      if (parts.length === 1) return whole;
      splits += parts.length - 1;
      return parts.map((p) => `<p${attrs}>${htmlOf(p)}</p>`).join("\n");
    });
    // Links to the tool pages, one segment deeper here (lib/explorer.ts).
    // Both forms the tool pages use: "/block?b=x" and "block?b=x". From the
    // article, one segment deeper, the relative one would resolve under
    // /6502/<tool>/, where nothing answers.
    sec = sec.replace(/href="\/?([a-z0-9-]+)((?:\?[^"#]*)?(?:#[^"]*)?)"/g, (whole, slug: string, tail: string) =>
      s.has(slug) ? `href="/6502/${slug}${tail}"` : whole);
    sec = sec.replace(/href="\/"/g, 'href="/6502/explorer"');
    sections.push(sec);
  }
  if (!sections.length) throw new Error(`6502/web/${file}: no section.bp-prose; there is no article to lift`);
  const out = sections.join("\n");
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  return {
    slug: file.replace(/\.html$/, ""),
    title: titleMatch ? unescape(titleMatch[1].split(/[·|]/)[0].trim()) : file,
    description: descMatch ? unescape(descMatch[1]) : "",
    html: out,
    splits,
    chars,
    slots: (out.match(/data-fact=/g) ?? []).length,
  };
}

/** The tool pages that have an article: every one with a prose section. */
export function articlePages(): { slug: string; file: string }[] {
  return explorerPages().filter((p) => {
    const html = fs.readFileSync(path.join(SRC, p.file), "utf8");
    return /<section class="wrap sec bp-prose/.test(html);
  });
}
