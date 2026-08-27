"use client";

import { useEffect, useRef, useState } from "react";
import type { Run } from "@/lib/article";

/**
 * A justified paragraph, set by pretext.
 *
 * The browser's own `text-align: justify` breaks lines and pads them in one
 * pass nobody can see into. Here pretext (extern/pretext, bundled by
 * scripts/build-pretext.mjs) picks the breaks from its own measurement of
 * the paragraph's runs, each in its font, and every line becomes its own
 * block with `text-align-last: justify`, so the browser pads exactly the
 * line pretext chose and the paragraph's line count is known before paint.
 * Measured 2026-08-27 (notes/pretext.md): pretext's heights match this
 * browser's to the pixel in the house fonts, which is what makes a line it
 * chose fit the block it is given.
 *
 * Before the first measure (server render, and until the fonts are ready)
 * the paragraph is ordinary flowing text with the browser's justification,
 * so the page reads the same with no script; the lines replace it once
 * `document.fonts.ready` resolves. A container that changes width is laid
 * out again from the cached preparation, which is the cheap path.
 *
 * The last line of a paragraph is set ragged, as every book does; a
 * one-line paragraph is therefore never stretched.
 */

type PT = typeof import("@/lib/vendor/pretext");
let ptPromise: Promise<PT> | null = null;
const pretext = () => (ptPromise ??= import("@/lib/vendor/pretext"));

interface Line { frags: { run: Run; text: string; gap: boolean }[] }

/**
 * What each run kind measures as, read off the paragraph itself: a probe
 * element of that kind is appended, its computed font and horizontal chrome
 * (padding and border, which the kit gives `code`) are read, and it is
 * removed. Assumed values were the first bug: the kit's code has 5.2px of
 * padding and a 1px border each side, and 14 lines overflowed by up to
 * 22px until pretext was told (its `extraWidth` is for exactly this).
 */
function probeKinds(el: HTMLElement): Record<Run["kind"], { font: string; extra: number }> {
  const out = {} as Record<Run["kind"], { font: string; extra: number }>;
  const tag: Record<Run["kind"], string> = { text: "span", em: "em", b: "b", mono: "code", a: "a" };
  for (const kind of Object.keys(tag) as Run["kind"][]) {
    const probe = document.createElement(tag[kind]);
    probe.textContent = "x";
    if (kind === "a") (probe as HTMLAnchorElement).href = "#";
    el.appendChild(probe);
    const c = getComputedStyle(probe);
    const font = `${c.fontStyle === "italic" ? "italic " : ""}${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
    const extra = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth", "marginLeft", "marginRight"]
      .reduce((a, k) => a + (parseFloat(c[k as keyof CSSStyleDeclaration] as string) || 0), 0);
    out[kind] = { font, extra: Number.isFinite(extra) ? extra : 0 };
    probe.remove();
  }
  return out;
}

function Frag({ run, text }: { run: Run; text: string }) {
  if (run.kind === "em") return <em>{text}</em>;
  if (run.kind === "b") return <b>{text}</b>;
  if (run.kind === "mono") return <code>{text}</code>;
  if (run.kind === "a") return <a href={run.href}>{text}</a>;
  return <>{text}</>;
}

export function Justified({ runs, className = "" }: { runs: Run[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState<Line[] | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let prepared: import("@/lib/vendor/pretext").PreparedRichInline | null = null;
    let pt: PT | null = null;

    const layout = () => {
      if (!pt || !prepared || !el) return;
      const width = el.clientWidth;
      if (width <= 0) return;
      const out: Line[] = [];
      pt.walkRichInlineLineRanges(prepared, width, (range) => {
        const line = pt!.materializeRichInlineLineRange(prepared!, range);
        out.push({ frags: line.fragments.map((f) => ({ run: runs[f.itemIndex], text: f.text, gap: f.gapBefore > 0 })) });
      });
      if (!cancelled) setLines(out);
    };

    (async () => {
      await document.fonts.ready;
      pt = await pretext();
      if (cancelled) return;
      const kinds = probeKinds(el);
      prepared = pt.prepareRichInline(runs.map((r) => ({ text: r.text, font: kinds[r.kind].font, extraWidth: kinds[r.kind].extra })));
      layout();
    })();

    const ro = new ResizeObserver(() => layout());
    ro.observe(el);
    return () => { cancelled = true; ro.disconnect(); };
  }, [runs]);

  if (!lines) {
    return (
      <p ref={ref} className={`jp ${className}`.trim()}>
        {runs.map((r, i) => <Frag key={i} run={r} text={r.text} />)}
      </p>
    );
  }
  return (
    <p ref={ref} className={`jp jp-set ${className}`.trim()} data-lines={lines.length}>
      {lines.map((l, i) => (
        <span key={i} className={"jl" + (i === lines.length - 1 ? " jl-last" : "")}>
          {l.frags.map((f, k) => (
            <span key={k}>{f.gap && k > 0 ? " " : ""}<Frag run={f.run} text={f.text} /></span>
          ))}
        </span>
      ))}
    </p>
  );
}
