"use client";

import { useEffect } from "react";
import { splitText } from "@/lib/prose";
import "./justify.css";

/**
 * Justify the paragraphs under `root`, in place, by pretext.
 *
 * The browser's own `text-align: justify` breaks lines and pads them in one
 * pass nobody can see into. Here pretext (extern/pretext, bundled by
 * scripts/build-pretext.mjs) picks the breaks from its own measurement of
 * the paragraph's inline runs, each in its computed font, and every line
 * becomes its own block with `text-align-last: justify`, so the browser
 * pads exactly the line pretext chose and the paragraph's line count is a
 * known number. Measured 2026-08-27 (notes/pretext.md): pretext's heights
 * match this browser's to the pixel in the house fonts.
 *
 * In place, on the DOM, rather than as a React component over text, and the
 * reason is what the paragraphs contain. The tool pages' prose carries
 * `[data-fact]` slots the tool's script fills with measured numbers, links,
 * mono spans; a paragraph is re-set by MOVING its inline elements into the
 * lines, so an element keeps its identity and a slot filled later still
 * shows its number. When a moved element's text changes (the slot fills),
 * the paragraph is measured and set again. A paragraph whose markup is not
 * plain inline (a button, a break, an element that would have to straddle
 * two lines) is left to the browser, which justifies it the ordinary way.
 *
 * Two things a tool's script does to a paragraph, and what happens then:
 *
 * - It REPLACES the paragraph's children (the tracer writes its caption by
 *   textContent on every step). The new children become the paragraph's
 *   originals and it is set again from them. Restoring the old ones, which
 *   the first version did, would have put a stale caption back.
 * - It writes one string longer than a paragraph should be (that caption is
 *   6,600 characters of measured counts). A paragraph whose content is
 *   text alone is cut at sentence ends by the rule the server applies to
 *   the page's markup (lib/prose.ts), each part set as its own block.
 *
 * `select` names which paragraphs: the tool page's readouts are `p` too,
 * and a mono readout re-set as justified lines would be a readout nobody
 * asked for.
 *
 * The page renders the paragraphs as ordinary flowing text first (server
 * side, and until the fonts are ready), so it reads the same with no
 * script; a resize lays them out again from the cached preparation.
 */

type PT = typeof import("@/lib/vendor/pretext");
let ptPromise: Promise<PT> | null = null;
const pretext = () => (ptPromise ??= import("@/lib/vendor/pretext"));

const INLINE = new Set(["A", "EM", "I", "B", "STRONG", "CODE", "SPAN", "ABBR", "KBD", "SUP", "SUB"]);

interface Item { node: Node | null; el: Element | null; text: string; font: string; extra: number }

function fontOf(c: CSSStyleDeclaration): string {
  return `${c.fontStyle === "italic" ? "italic " : ""}${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
}
/**
 * An inline element's chrome: what it draws beyond its text. Measured as
 * the width it actually occupies in the flowing paragraph (its client
 * rects, summed, so a wrapped element still counts once) minus pretext's
 * natural width of its text in its font. Summing padding and border was the
 * first version and missed the primer's "See it" links, which draw an arrow
 * after themselves from a pseudo-element; a measured difference catches
 * whatever the rule is.
 */
function chromeOf(pt: PT, el: Element, text: string, font: string): number {
  const drawn = [...el.getClientRects()].reduce((a, r) => a + r.width, 0);
  const natural = pt.measureNaturalWidth(pt.prepareWithSegments(text, font));
  return Math.max(0, drawn - natural);
}

/** The paragraph's inline children as pretext items, or null when it is not plain inline. */
function itemsOf(pt: PT, p: HTMLElement, originals: Node[]): Item[] | null {
  const base = fontOf(getComputedStyle(p));
  const items: Item[] = [];
  for (const n of originals) {
    if (n.nodeType === Node.TEXT_NODE) {
      items.push({ node: n, el: null, text: n.textContent ?? "", font: base, extra: 0 });
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      if (!INLINE.has(el.tagName)) return null;
      if (el.querySelector("*:not(a):not(em):not(i):not(b):not(strong):not(code):not(span)")) return null;
      const font = fontOf(getComputedStyle(el));
      const text = el.textContent ?? "";
      items.push({ node: n, el, text, font, extra: chromeOf(pt, el, text, font) });
    } else if (n.nodeType !== Node.COMMENT_NODE) {
      return null;
    }
  }
  return items;
}

/**
 * The paragraph's items as parts to set separately: one part, or, when the
 * paragraph is text alone and long, the sentence-cut parts.
 */
function partsOf(items: Item[], base: string): Item[][] {
  if (items.some((i) => i.el)) return [items];
  const text = items.map((i) => i.text).join("").replace(/\s+/g, " ");
  const parts = splitText(text);
  if (parts.length < 2) return [items];
  return parts.map((t) => [{ node: null, el: null, text: t, font: base, extra: 0 }]);
}

/** One part set as lines into `into`; false when pretext should not set it. */
function setPart(pt: PT, items: Item[], width: number, into: DocumentFragment | HTMLElement, observe: (el: Element) => void): number {
  const prepared = pt.prepareRichInline(items.map((i) => ({ text: i.text, font: i.font, extraWidth: i.extra })));
  const lines: { frags: { item: Item; text: string; gap: boolean }[] }[] = [];
  // Count how many fragments each element item was cut into: an element
  // cut across lines cannot be moved whole, and that paragraph is left alone.
  const cuts = new Map<number, number>();
  pt.walkRichInlineLineRanges(prepared, width, (range) => {
    const line = pt.materializeRichInlineLineRange(prepared, range);
    for (const f of line.fragments) cuts.set(f.itemIndex, (cuts.get(f.itemIndex) ?? 0) + 1);
    lines.push({ frags: line.fragments.map((f) => ({ item: items[f.itemIndex], text: f.text, gap: f.gapBefore > 0 })) });
  });
  for (const [i, n] of cuts) if (items[i].el && n > 1) return 0;
  if (lines.length < 2) return 0;
  // Each line a block; text items as fresh text nodes, element items moved
  // in whole.
  lines.forEach((l, li) => {
    const span = document.createElement("span");
    span.className = "jl" + (li === lines.length - 1 ? " jl-last" : "");
    l.frags.forEach((f, k) => {
      if (f.gap && k > 0) span.appendChild(document.createTextNode(" "));
      if (f.item.el) { span.appendChild(f.item.el); observe(f.item.el); }
      else span.appendChild(document.createTextNode(f.text));
    });
    into.appendChild(span);
  });
  return lines.length;
}

function setParagraph(pt: PT, p: HTMLElement, originals: Node[], observe: (el: Element) => void): boolean {
  const items = itemsOf(pt, p, originals);
  if (!items || items.every((i) => !i.text.trim())) return false;
  // The content width, which is what a block inside the paragraph gets:
  // clientWidth includes padding, and a padded note (the primer's "See it")
  // set its lines 21px too wide until this subtracted it.
  const pc = getComputedStyle(p);
  const width = p.clientWidth - (parseFloat(pc.paddingLeft) || 0) - (parseFloat(pc.paddingRight) || 0);
  if (width <= 0) return false;
  const parts = partsOf(items, fontOf(pc));
  const frag = document.createDocumentFragment();
  let lines = 0;
  if (parts.length === 1) {
    lines = setPart(pt, parts[0], width, frag, observe);
    if (!lines) return false;
  } else {
    for (const part of parts) {
      const group = document.createElement("span");
      group.className = "jg";
      const n = setPart(pt, part, width, group, observe);
      // A part too short for two lines is still its own block.
      if (!n) group.appendChild(document.createTextNode(part.map((i) => i.text).join("")));
      lines += n || 1;
      frag.appendChild(group);
    }
  }
  p.replaceChildren(frag);
  p.classList.add("jp", "jp-set");
  p.dataset.lines = String(lines);
  if (parts.length > 1) p.dataset.parts = String(parts.length);
  return true;
}

export function Justify({ root, select = "p" }: { root: string; select?: string }) {
  useEffect(() => {
    const host = document.querySelector<HTMLElement>(root);
    if (!host) return;
    let cancelled = false;
    let pt: PT | null = null;
    // Each paragraph's original children, kept so it can be set again at a
    // new width or after a slot fills, from the same nodes.
    const originals = new Map<HTMLElement, Node[]>();
    // A paragraph under a hidden ancestor is still collected: the tool
    // pages keep their whole body hidden until the instrument boots (the
    // tracer's #tc-main), and a paragraph skipped for being hidden then
    // would never be set. It has no width until then, setParagraph
    // declines, and the host growing when it appears re-sets everything.
    const paragraphs = [...host.querySelectorAll<HTMLElement>(select)].filter((p) => p.tagName === "P" && !p.closest("figure, table, button, label"));
    for (const p of paragraphs) { originals.set(p, [...p.childNodes]); p.classList.add("jp"); }

    const dirty = new Set<HTMLElement>();
    let pending = false;
    let building = false;
    const observed = new Set<Element>();
    // One observer over the root: a change inside a moved element (a slot
    // filled) re-sets its paragraph; a paragraph whose children were
    // replaced by somebody else takes the new children as its originals.
    const mo = new MutationObserver((records) => {
      if (building) return;
      for (const r of records) {
        const t = r.target as Node;
        const el = t.nodeType === Node.ELEMENT_NODE ? (t as Element) : t.parentElement;
        const p = el?.closest("p") as HTMLElement | null;
        if (!p || !originals.has(p)) continue;
        if (r.type === "childList" && r.target === p) originals.set(p, [...p.childNodes]);
        dirty.add(p);
      }
      if (dirty.size) schedule();
    });
    const observe = (el: Element) => { observed.add(el); };

    const setSome = (which: Iterable<HTMLElement>) => {
      if (!pt || cancelled) return;
      building = true;
      for (const p of which) {
        const orig = originals.get(p)!;
        // Put the originals back first, so a re-set measures the current
        // text of every node rather than the previous lines.
        p.replaceChildren(...orig);
        p.classList.remove("jp-set"); delete p.dataset.lines; delete p.dataset.parts;
        setParagraph(pt, p, orig, observe);
      }
      // Our own mutations are not somebody else's.
      mo.takeRecords();
      building = false;
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; const d = [...dirty]; dirty.clear(); setSome(d); });
    };

    (async () => {
      await document.fonts.ready;
      pt = await pretext();
      if (cancelled) return;
      setSome(paragraphs);
      mo.observe(host, { characterData: true, childList: true, subtree: true });
    })();
    const ro = new ResizeObserver(() => { for (const p of paragraphs) dirty.add(p); schedule(); });
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); mo.disconnect(); observed.clear(); };
  }, [root, select]);
  return null;
}
