/**
 * Long paragraphs, split at sentence ends. One rule, used three times:
 *
 * - lib/article.ts, for the companion articles;
 * - lib/explorer.ts, for the tool pages themselves (owner's call,
 *   2026-08-27: the tracer's 23,341-character paragraph was 48,000 pixels
 *   of a phone's scroll, and nobody reads that);
 * - components/Justify.tsx, in the browser, for a paragraph a tool's script
 *   writes as one string (the tracer's caption is 6,600 characters of
 *   measured counts, set by textContent every step).
 *
 * The sentences are the author's; only the paragraph breaks are new, and
 * lib/article.test.ts checks that the parts' text joined back is the
 * original text. No node import here: the browser bundle takes it whole.
 */

export const LONG = 1200;
export const TARGET = 620;

export type RunKind = "text" | "em" | "mono" | "a" | "b";
export interface Run { kind: RunKind; text: string; href?: string }

export function unescape(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
export function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Where a text longer than `long` is cut into parts of about `target`
 * characters: offsets into `text`, each just after a sentence end, none
 * inside a span `keep` says to keep whole (a mono run). Empty when the text
 * is short enough or has no usable sentence end.
 */
export function cutsOf(text: string, keep: (i: number) => boolean = () => false, target = TARGET, long = LONG): number[] {
  if (text.length <= long) return [];
  const ends: number[] = [];
  const re = /[.!?]["')\]]?\s+(?=[A-Z0-9"'(])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { const cut = m.index + m[0].length; if (!keep(cut)) ends.push(cut); }
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
  return cuts;
}

/** A plain string cut at cutsOf, trailing space trimmed from each part. */
export function splitText(text: string, target = TARGET, long = LONG): string[] {
  const cuts = cutsOf(text, undefined, target, long);
  if (!cuts.length) return [text];
  const parts: string[] = [];
  let at = 0;
  for (const c of [...cuts, text.length]) { parts.push(text.slice(at, c).trim()); at = c; }
  return parts.filter((p) => p.length);
}

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
 * Split a paragraph into paragraphs: first at `forced` offsets (chunk
 * anchors, which are sentence starts), then, where a part is longer than
 * `long`, at sentence ends into parts near `target` characters, never
 * inside a mono run. The join of the parts' plain text is the original's
 * plain text.
 */
export function splitRuns(runs: Run[], target = TARGET, long = LONG, forced: number[] = []): Run[][] {
  const text = plain(runs);
  const monoRanges: [number, number][] = [];
  let pos = 0;
  for (const r of runs) { if (r.kind === "mono") monoRanges.push([pos, pos + r.text.length]); pos += r.text.length; }
  const keep = (i: number) => monoRanges.some(([a, b]) => i > a && i < b);
  const bounds = [0, ...forced.filter((f) => f > 0 && f < text.length).sort((x, y) => x - y), text.length];
  const cuts: number[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    if (i > 0) cuts.push(bounds[i]);
    const seg = text.slice(bounds[i], bounds[i + 1]);
    for (const c of cutsOf(seg, (k) => keep(bounds[i] + k), target, long)) cuts.push(bounds[i] + c);
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

/** A chunk of a page's prose: its heading and the words it starts on (data/articles.json). */
export interface ChunkSpec { heading: string; at: string }

/**
 * The long plain paragraphs of an HTML fragment, split; and, where a
 * chunk's opening words fall inside a paragraph, that paragraph split
 * there too, so every chunk starts a paragraph. A paragraph with an id is
 * a paragraph something asks for by name and is left alone. Returns the
 * fragment, how many breaks were added, how much text it holds, and which
 * anchors were found.
 */
export function splitParagraphs(html: string, chunks: ChunkSpec[] = []): { html: string; splits: number; chars: number; found: Set<string> } {
  let splits = 0;
  let chars = 0;
  const found = new Set<string>();
  const out = html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/g, (whole, attrs: string, inner: string) => {
    const text = unescape(inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).trim();
    chars += text.length;
    const forced: number[] = [];
    for (const c of chunks) {
      const i = text.indexOf(c.at);
      if (i < 0) continue;
      found.add(c.at);
      if (i > 0) forced.push(i);
    }
    if ((text.length <= LONG && !forced.length) || !isPlainInline(inner) || /\bid=/.test(attrs)) return whole;
    const parts = splitRuns(runsOf(inner), TARGET, LONG, forced);
    if (parts.length === 1) return whole;
    splits += parts.length - 1;
    return parts.map((p) => `<p${attrs}>${htmlOf(p)}</p>`).join("\n");
  });
  return { html: out, splits, chars, found };
}

/** The prose sections of a tool page, each still `section.wrap.sec.bp-prose`. */
export const PROSE_SECTION = /<section class="wrap sec bp-prose[^"]*"[^>]*>[\s\S]*?<\/section>/g;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const WIDGET = /<(div|table|button|select|svg|figure|input|form|canvas)\b|data-fact=/;

/**
 * A section's paragraphs as chunks: an `h3` before the paragraph each
 * chunk starts on, and, when `fold` is given, the chunk's paragraphs
 * under a native `<details>` behind its heading, with a faded peek of its
 * first paragraph and a summary reading `fold` (owner's call,
 * 2026-08-27). The paragraphs before the first chunk are the opening and
 * stay as they are. The article passes no `fold`: it is the rest.
 *
 * The peek is a copy of the first paragraph, marked aria-hidden, shown
 * only while the details is closed (explorer.css). A chunk whose markup
 * carries a widget is never folded, headings or not: the block page's
 * instrument lives in its prose.
 */
export function chunkSection(sec: string, chunks: ChunkSpec[], fold?: string): { html: string; chunks: number; folds: number } {
  const closeAt = sec.lastIndexOf("</section>");
  if (closeAt < 0 || !chunks.length) return { html: sec, chunks: 0, folds: 0 };
  const body = sec.slice(0, closeAt);
  // Where each chunk starts: the paragraph whose text opens with its
  // words. A section's own heading block (the tracer's one section
  // carries three) ends the chunk before it and is not a chunk.
  const starts: { at: number; heading: string | null }[] = [];
  for (const m of body.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const text = unescape(m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).trim();
    const c = chunks.find((c) => text.startsWith(c.at));
    if (c) starts.push({ at: m.index, heading: c.heading });
  }
  if (!starts.length) return { html: sec, chunks: 0, folds: 0 };
  for (const m of body.matchAll(/<div class="sec-head">/g)) if (m.index > starts[0].at) starts.push({ at: m.index, heading: null });
  starts.sort((a, b) => a.at - b.at);
  let out = body.slice(0, starts[0].at);
  let folds = 0;
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].at : body.length;
    const inner = body.slice(s.at, end);
    if (s.heading === null) { out += inner; return; }
    const h = `<h3 class="chunk" id="${slug(s.heading)}">${escape(s.heading)}</h3>\n`;
    if (!fold || WIDGET.test(inner)) { out += h + inner; return; }
    const first = inner.match(/<p\b[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
    const peek = first.replace(/\sid="[^"]*"/g, "");
    out += `${h}<div class="read-on"><div class="peek" aria-hidden="true">${peek}</div><details><summary>${escape(fold)}</summary>${inner}</details></div>\n`;
    folds += 1;
  });
  return { html: out + sec.slice(closeAt), chunks: starts.filter((s) => s.heading !== null).length, folds };
}

/**
 * Without chunks, a section folded after its opening: the heading and
 * the first `keep` paragraphs stay, the rest goes under one `<details>`
 * whose summary reads `label`, with a faded peek of the next paragraph. A
 * section whose remainder carries a widget is left whole, and so is one
 * whose remainder is shorter than LONG: a fold that hides two sentences
 * is a click for nothing.
 */
export function foldSection(sec: string, label: string, keep = 3): { html: string; folded: boolean } {
  const closeAt = sec.lastIndexOf("</section>");
  if (closeAt < 0) return { html: sec, folded: false };
  const body = sec.slice(0, closeAt);
  // The opening paragraphs, not counting the heading's eyebrow, which is
  // a <p> too.
  let n = 0;
  let at = -1;
  const re = /<p\b([^>]*)>[\s\S]*?<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (/\beyebrow\b/.test(m[1])) continue;
    n += 1;
    if (n === keep) { at = m.index + m[0].length; break; }
  }
  if (at < 0) return { html: sec, folded: false };
  const rest = body.slice(at);
  // The section's own heading blocks are prose; anything else that is
  // not a paragraph or a list is a widget, and the section stays whole.
  const bare = rest.replace(/<div class="sec-head">[\s\S]*?<\/div>/g, "");
  if (WIDGET.test(bare)) return { html: sec, folded: false };
  const text = unescape(rest.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).trim();
  if (text.length < LONG) return { html: sec, folded: false };
  const first = rest.match(/<p\b[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
  const peek = first.replace(/\sid="[^"]*"/g, "");
  return {
    html: `${body.slice(0, at)}\n<div class="read-on"><div class="peek" aria-hidden="true">${peek}</div><details><summary>${escape(label)}</summary>${rest}</details></div>\n${sec.slice(closeAt)}`,
    folded: true,
  };
}
