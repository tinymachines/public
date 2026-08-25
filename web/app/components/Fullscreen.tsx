"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "@/lib/lang";

/**
 * Full screen for a workbench, from a slot in its bar.
 *
 * The bar hides while the workbench is full screen, so the control that
 * entered cannot be the one that leaves: a small floating control appears at
 * the top corner while it holds. Native through the Fullscreen API where an
 * element can go fullscreen; the same class set by hand and the workbench
 * fixed to the viewport where it cannot (every iPhone). Escape leaves either
 * state, and `fullscreenchange` keeps the class honest when the browser
 * leaves native fullscreen on its own.
 *
 * One mechanism for every workbench: the Lab, the console, each explorer
 * instrument. The Lab used to carry its own control in its tab strip; this
 * replaced it so the instruments do not each learn a different gesture.
 */

const L = {
  en: { enter: "Full screen", exit: "Leave full screen" },
  ja: { enter: "全画面", exit: "全画面を終了" },
} as const;

function Icon({ exit }: { exit?: boolean }) {
  return exit ? (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
    </svg>
  );
}

export function WorkbenchFullscreen({ lang = "en" }: { lang?: Lang }) {
  const S = L[lang];
  const [on, setOn] = useState(false);

  const bench = () => document.querySelector<HTMLElement>(".workbench");
  const native = () => document.fullscreenElement !== null && document.fullscreenElement === bench();
  const set = (v: boolean) => {
    bench()?.classList.toggle("is-fullscreen", v);
    document.documentElement.classList.toggle("has-fullscreen", v);
    setOn(v);
  };

  useEffect(() => {
    const onChange = () => set(native());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && bench()?.classList.contains("is-fullscreen") && !native()) set(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
      set(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enter() {
    const b = bench();
    if (!b) return;
    if (b.requestFullscreen) {
      try {
        await b.requestFullscreen();
        return; // fullscreenchange sets the class
      } catch {
        /* refused: fall through */
      }
    }
    set(true);
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
  }

  return (
    <>
      <button type="button" className="wb-fs" title={S.enter} aria-label={S.enter} aria-pressed={on} onClick={() => (on ? leave() : enter())}>
        <Icon />
      </button>
      {/* Portalled into the workbench, outside the bar. Outside the bar
          because the bar is display:none while full screen and a fixed
          element inside a hidden ancestor is hidden with it; INSIDE the
          workbench because in native fullscreen the workbench is the top
          layer, and nothing outside it can be seen or clicked whatever its
          z-index. The body was the first try, and the Lab's sticky strip
          swallowed every click on it. */}
      {on && bench()
        ? createPortal(
            <button type="button" className="wb-fs-exit" title={S.exit} aria-label={S.exit} onClick={leave}>
              <Icon exit />
            </button>,
            bench() as HTMLElement,
          )
        : null}
    </>
  );
}
