"use client";

import { useEffect, useState } from "react";
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
 * One mechanism for every instrument: the chip transport (ChipTransport.tsx)
 * carries the button, and since 2026-08-26 the Lab is driven by that strip
 * too, so the portal into the Lab's own player (LabFullscreen) is gone.
 *
 * ## The study view
 *
 * The schematic has a full screen of its own, the study view (its
 * `#sch-fullscreen`; upstream fullscreen.js): one signal's island on an
 * empty screen, with a palette. That is the workbench's full screen, and
 * the owner's ask (2026-08-28) is that "full screen" on that page means
 * it. So on a page with that control, this key presses it; and whichever
 * way the page gets there (its own key, or arriving from a block page with
 * `solo=1`), the site follows: upstream marks `body.no-scroll` while its
 * by-hand cover is up, or holds the console in native fullscreen, and
 * either one sets `html.has-fullscreen` here, so the bar and the footer
 * leave and the strip lands on the floor. Leaving is Escape, which
 * upstream listens for on the document, the same as the reader's key.
 */

/** The page's own full screen control, where the page has one. */
const OWN = "#sch-fullscreen";
const pageCover = () => document.body.classList.contains("no-scroll");

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
    // The page's by-hand cover, coming and going.
    const mo = new MutationObserver(() => {
      if (native()) return;
      const v = pageCover();
      if (v !== root().classList.contains("has-fullscreen")) {
        set(v);
        setOn(v);
      }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
      mo.disconnect();
      set(false);
    };
  }, []);

  async function enter() {
    const own = document.querySelector<HTMLButtonElement>(OWN);
    if (own) {
      own.click(); // the observer, or fullscreenchange, sets the class
      return;
    }
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
    if (pageCover()) {
      // Upstream's cover leaves on Escape at the document; the observer
      // then clears the class here.
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }
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
