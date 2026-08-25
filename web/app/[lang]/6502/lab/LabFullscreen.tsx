"use client";

import { useEffect } from "react";
import type { Lang } from "@/lib/lang";

/**
 * Full screen for a workbench, with the control inside the instrument.
 *
 * The control has to live somewhere that is still on screen once the site's
 * bar is gone, so it is placed in the lab's own strip row, beside its link
 * button, by DOM insertion: that row is the lab's markup and this page does
 * not rewrite it. Toggling it takes the whole .workbench fullscreen through
 * the Fullscreen API, and the CSS (components.css, section 27) hides the
 * bar and docks the strip to the top edge while it holds.
 *
 * Where there is no element fullscreen at all, which is every iPhone, the
 * same class the API path sets is set by hand and the workbench is fixed to
 * the viewport instead. The control and Escape both leave either state.
 * `fullscreenchange` keeps the class honest when the browser leaves on its
 * own (Escape in native fullscreen never reaches a keydown handler).
 */

const L = {
  en: { enter: "Full screen", exit: "Leave full screen" },
  ja: { enter: "全画面", exit: "全画面を終了" },
} as const;

const ICON =
  '<svg class="ic" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
  '<path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg>';

export function LabFullscreen({ lang = "en" }: { lang?: Lang }) {
  useEffect(() => {
    const S = L[lang];
    const bench = document.querySelector<HTMLElement>(".workbench");
    const row = document.querySelector<HTMLElement>(".lab-shell header");
    if (!bench || !row || row.querySelector(".wb-fs")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "themebtn wb-fs";
    btn.innerHTML = ICON;
    const label = (on: boolean) => {
      btn.title = on ? S.exit : S.enter;
      btn.setAttribute("aria-label", btn.title);
      btn.setAttribute("aria-pressed", String(on));
    };
    label(false);
    row.appendChild(btn);

    const native = () => document.fullscreenElement === bench;
    const set = (on: boolean) => {
      bench.classList.toggle("is-fullscreen", on);
      document.documentElement.classList.toggle("has-fullscreen", on);
      label(on);
    };
    const enter = async () => {
      if (bench.requestFullscreen) {
        try {
          await bench.requestFullscreen();
          return; // fullscreenchange sets the class
        } catch {
          /* refused: fall through to the fallback */
        }
      }
      set(true);
    };
    const leave = async () => {
      if (native() && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
          return;
        } catch {
          /* fall through */
        }
      }
      set(false);
    };
    const onClick = () => (bench.classList.contains("is-fullscreen") ? leave() : enter());
    const onChange = () => set(native());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && bench.classList.contains("is-fullscreen") && !native()) set(false);
    };
    btn.addEventListener("click", onClick);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      btn.removeEventListener("click", onClick);
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
      btn.remove();
      set(false);
    };
  }, [lang]);
  return null;
}
