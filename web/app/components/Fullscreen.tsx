"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "@/lib/lang";

/**
 * Full screen for an instrument page, from the right end of its floor strip.
 *
 * Full screen means the whole document (owner's call, 2026-08-25: "FULL
 * SCREEN, not just the content area"). Native through the Fullscreen API on
 * the document element where the browser has it; where it does not (every
 * iPhone), the same class is set by hand and the site's bar leaves, which is
 * as full as that screen gets. Either way `html.has-fullscreen` is the one
 * fact the CSS keys on. Escape leaves either state, and `fullscreenchange`
 * keeps the class honest when the browser leaves on its own.
 *
 * The control that enters is the control that leaves: the strip is fixed to
 * the floor and stays through full screen, so the button simply changes
 * state. The floating exit control the bar-slot version needed is gone with
 * the slot.
 *
 * One mechanism for every instrument: the explorer pages and the console put
 * the button in the chip transport (ChipTransport.tsx); the Lab, whose strip
 * is its own, gets it portalled in at the same place (LabFullscreen).
 */

const L = {
  en: { enter: "Full screen", exit: "Leave full screen", word: "full" },
  ja: { enter: "全画面", exit: "全画面を終了", word: "全画面" },
} as const;

function Icon({ exit }: { exit?: boolean }) {
  return exit ? (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
    </svg>
  ) : (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
    </svg>
  );
}

const root = () => document.documentElement;
const native = () => document.fullscreenElement !== null;

function set(v: boolean) {
  root().classList.toggle("has-fullscreen", v);
}

export function FullscreenButton({ lang = "en" }: { lang?: Lang }) {
  const S = L[lang];
  const [on, setOn] = useState(false);

  useEffect(() => {
    const onChange = () => {
      set(native());
      setOn(native());
    };
    const onKey = (e: KeyboardEvent) => {
      // The by-hand state has no browser to catch Escape for it.
      if (e.key === "Escape" && root().classList.contains("has-fullscreen") && !native()) {
        set(false);
        setOn(false);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
      set(false);
    };
  }, []);

  async function enter() {
    const r = root();
    if (r.requestFullscreen) {
      try {
        await r.requestFullscreen();
        return; // fullscreenchange sets the class
      } catch {
        /* refused: fall through to the by-hand state */
      }
    }
    set(true);
    setOn(true);
  }
  async function leave() {
    if (native() && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
        return;
      } catch {
        /* fall through */
      }
    }
    set(false);
    setOn(false);
  }

  return (
    <button
      type="button"
      className={"tbtn fs" + (on ? " on" : "")}
      title={on ? S.exit : S.enter}
      aria-label={on ? S.exit : S.enter}
      aria-pressed={on}
      onClick={() => (on ? leave() : enter())}
    >
      <Icon exit={on} />
      <span className="lb">{S.word}</span>
    </button>
  );
}

/**
 * The Lab's strip is upstream markup this repository does not edit, so the
 * button is portalled into the end of its control row once the row exists.
 * The row is static HTML and there before this runs; the observer is for the
 * client-side navigation case, where the shell is painted before the body.
 */
export function LabFullscreen({ lang = "en" }: { lang?: Lang }) {
  const [row, setRow] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => document.querySelector<HTMLElement>(".lab-shell .player .prow");
    const mo = new MutationObserver(() => {
      const r = find();
      if (r) {
        setRow(r);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // The already-present case, after the first paint rather than inside the
    // effect: a synchronous setState here renders twice.
    const frame = requestAnimationFrame(() => {
      const r = find();
      if (r) {
        setRow(r);
        mo.disconnect();
      }
    });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return row ? createPortal(<FullscreenButton lang={lang} />, row) : null;
}
