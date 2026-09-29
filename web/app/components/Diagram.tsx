"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

/**
 * A drawn figure in a document: a ```mermaid fence, drawn here in the
 * browser, shown whole at the column's width as a thumbnail, and the same
 * drawing full screen behind a press, fitted to the screen or at its own
 * size (owner, 2026-09-29: "the diagrams should have thumbnails and a full
 * screen version"). mdx-components.tsx hands every mermaid fence here; the
 * other fences keep their Copy control.
 *
 * Drawn in the browser rather than at build time because the build must
 * run on a fresh clone with no browser on it, and mermaid draws with one.
 * What the build CAN do it does: scripts/check-diagrams.mjs parses every
 * fence in the docs tree and refuses a build with a diagram that does not
 * parse or has no caption, so a reader never meets a drawing that failed
 * to parse. What can still fail here is the drawing itself, and then the
 * figure shows the source and says so rather than showing nothing.
 *
 * The caption is the fence's first line, a `%%` comment, which mermaid
 * ignores and this prints under the figure and as the full screen's name.
 * Two renders of one source, with two ids, because a rendered SVG carries
 * ids of its own (markers, clip paths) and one copy in the figure and one
 * in the dialog would otherwise share them.
 *
 * Before the drawing lands, and where scripts do not run, the figure is
 * the source in a code block with the caption under it: the same words,
 * unstyled.
 *
 * The palette is mermaid's neutral theme for now; the seam for the owner's
 * is `theme` and `themeVariables` in the initialize call below, and the
 * figure's own frame is section 30 of style/components.css.
 */

const L = {
  en: {
    open: "Full screen",
    close: "Close",
    fit: "Fit the screen",
    actual: "Actual size",
    failed: "This drawing did not render; its source is above.",
  },
  ja: {
    open: "全画面",
    close: "閉じる",
    fit: "画面に合わせる",
    actual: "実寸",
    failed: "この図は描けなかった。上にあるのがその元。",
  },
} as const;

const noop = () => () => {};

/** The fence's first line, without its `%%`, or the source's first line as a last resort. */
export function captionOf(code: string): string {
  const first = code.split("\n").find((l) => l.trim() !== "") ?? "";
  const m = /^\s*%%\s*(.*\S)\s*$/.exec(first);
  return m ? m[1] : "";
}

type Drawn = { thumb: string; full: string; width: number } | { error: string };

export function Diagram({ code }: { code: string }) {
  // useId's colons are not valid in the ids mermaid writes into the SVG.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [actual, setActual] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const lang = useSyncExternalStore(noop, () => (document.documentElement.lang === "ja" ? "ja" : "en"), () => "en" as const);
  const S = L[lang];
  const caption = captionOf(code);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          // The kit's sans, by name. Mermaid measures each label in a
          // scratch element on the body and then draws it inside the
          // document's prose, which is serif: "inherit" measured one face
          // and drew another, and the boxes clipped their words.
          fontFamily: "var(--font-sans)",
        });
        const a = await mermaid.render(`dg${id}a`, code);
        const b = await mermaid.render(`dg${id}b`, code);
        // The drawing's own width, which mermaid writes as a max-width on
        // the SVG; "actual size" in the dialog is this many pixels.
        const width = Number(/max-width:\s*([\d.]+)px/.exec(a.svg)?.[1] ?? 0);
        if (live) setDrawn({ thumb: a.svg, full: b.svg, width });
      } catch (e) {
        if (live) setDrawn({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, [code, id]);

  const ok = drawn && !("error" in drawn) ? drawn : null;

  function open() {
    setActual(false);
    dialog.current?.showModal();
  }

  return (
    <figure className="diagram" data-diagram={ok ? "drawn" : drawn ? "failed" : "pending"}>
      {ok ? (
        <button type="button" className="diagram-thumb" onClick={open} aria-label={`${S.open}: ${caption}`} dangerouslySetInnerHTML={{ __html: ok.thumb }} />
      ) : (
        <pre className="diagram-source">
          <code>{code}</code>
        </pre>
      )}
      {drawn && "error" in drawn ? (
        <p className="diagram-failed" role="alert">
          {S.failed} {drawn.error}
        </p>
      ) : null}
      <figcaption>
        {caption}
        {ok ? <span className="diagram-hint"> ({S.open})</span> : null}
      </figcaption>
      <dialog
        ref={dialog}
        className="diagram-full"
        aria-label={caption}
        onClick={(e) => {
          // A press on the backdrop lands on the dialog itself.
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="diagram-bar">
          <span className="diagram-title">{caption}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setActual((v) => !v)}>
            {actual ? S.fit : S.actual}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>
            {S.close}
          </button>
        </div>
        <div className={"diagram-view" + (actual ? " actual" : "")}>
          {/* The sheet's width at actual size is this drawing's own, so it
              arrives as an inline style the way the swatch's colour does:
              it is data, not a token. */}
          <div className="diagram-sheet" style={actual && ok?.width ? { width: ok.width } : undefined} dangerouslySetInnerHTML={{ __html: ok?.full ?? "" }} />
        </div>
      </dialog>
    </figure>
  );
}
