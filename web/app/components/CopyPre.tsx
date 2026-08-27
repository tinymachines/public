"use client";

import { useRef, useState, useSyncExternalStore } from "react";

/**
 * A code block with a Copy control (owner's call, 2026-08-28: a copyable
 * endpoint on the MCP page). Every fenced block in the docs gets it, from
 * mdx-components.tsx, because a block worth copying is not a kind of block
 * the author can be trusted to mark and the rest look the same.
 *
 * What is copied is the block's text as rendered, read off the element at
 * the moment of the press, so it cannot differ from what the reader sees.
 * The control exists only where the clipboard does: it is added after
 * mount, so a page without `navigator.clipboard` (an insecure origin, an
 * old browser) shows the block it always showed, not a button that does
 * nothing.
 */
const L = {
  en: { copy: "Copy", done: "Copied" },
  ja: { copy: "コピー", done: "コピーした" },
} as const;

const noop = () => () => {};

export function CopyPre(props: React.ComponentPropsWithoutRef<"pre">) {
  const pre = useRef<HTMLPreElement>(null);
  const [done, setDone] = useState(false);
  // Read once the page is in a browser; false on the server and in the
  // hydrating render, so the markup matches and the control appears after.
  const can = useSyncExternalStore(noop, () => !!navigator.clipboard?.writeText, () => false);
  const lang = useSyncExternalStore(noop, () => (document.documentElement.lang === "ja" ? "ja" : "en"), () => "en" as const);
  const S = L[lang];

  async function copy() {
    const text = pre.current?.textContent ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 3000);
    } catch { /* refused: the block is still there to select */ }
  }

  return (
    <div className="copy-pre">
      <pre ref={pre} {...props} />
      {can ? (
        <button type="button" className="copy-btn" onClick={copy} aria-live="polite">
          {done ? S.done : S.copy}
        </button>
      ) : null}
    </div>
  );
}
