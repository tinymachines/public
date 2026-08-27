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
 * Split a long paragraph at sentence ends into paragraphs near TARGET
 * characters, cutting runs where a sentence ends inside one. The join of
 * the parts' plain text is the original's plain text.
 */
export function splitRuns(runs: Run[], target = TARGET, long = LONG): Run[][] {
  const text = plain(runs);
  const monoRanges: [number, number][] = [];
  let pos = 0;
  for (const r of runs) { if (r.kind === "mono") monoRanges.push([pos, pos + r.text.length]); pos += r.text.length; }
  const cuts = cutsOf(text, (i) => monoRanges.some(([a, b]) => i > a && i < b), target, long);
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

/**
 * The long plain paragraphs of an HTML fragment, split. A paragraph with an
 * id is a paragraph something asks for by name and is left alone. Returns
 * the fragment, how many breaks were added, and how much text it holds.
 */
export function splitParagraphs(html: string): { html: string; splits: number; chars: number } {
  let splits = 0;
  let chars = 0;
  const out = html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/g, (whole, attrs: string, inner: string) => {
    const text = unescape(inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).trim();
    chars += text.length;
    if (text.length <= LONG || !isPlainInline(inner) || /\bid=/.test(attrs)) return whole;
    const parts = splitRuns(runsOf(inner));
    if (parts.length === 1) return whole;
    splits += parts.length - 1;
    return parts.map((p) => `<p${attrs}>${htmlOf(p)}</p>`).join("\n");
  });
  return { html: out, splits, chars };
}

/** The prose sections of a tool page, each still `section.wrap.sec.bp-prose`. */
export const PROSE_SECTION = /<section class="wrap sec bp-prose[^"]*"[^>]*>[\s\S]*?<\/section>/g;
