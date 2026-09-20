"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { prefersStill, subscribeMotion } from "./Playground";
import { ui } from "./ui";
import type { Lang } from "@/lib/lang";

/**
 * The guided tour: one path through the stations, in an order that tells
 * one story, with a line at each stop saying what to look at and why it
 * is worth looking at.
 *
 * The words at each stop are ours, not the engineers', and they are in
 * ui.ts, both languages; the order of the walk is here. The tour holds
 * nothing else: each stop is a station on this page, and the bar that
 * follows the reader is fixed to the window, so starting or leaving the
 * tour moves nothing on the page itself.
 */

/** The walk, in order: each stop's words in the dictionary, and where it is. */
const STOPS = [
  { key: "picture", id: "pg-title" },
  { key: "wire", id: "wire" },
  { key: "colours", id: "colours" },
  { key: "mario", id: "mario" },
  { key: "pad", id: "pad" },
  { key: "difference", id: "difference" },
  { key: "xray", id: "xray" },
  { key: "sound", id: "sound" },
  { key: "slow", id: "slow" },
  { key: "die", id: "die" },
  { key: "patterns", id: "patterns" },
  { key: "real", id: "real" },
  { key: "museum", id: "museum" },
  { key: "program", id: "program" },
  { key: "bench", id: "bench" },
  { key: "arc", id: "arc" },
] as const;

export function Tour({ lang }: { lang: Lang }) {
  const U = ui(lang).tour;
  const [at, setAt] = useState<number | null>(null);
  const still = useSyncExternalStore(subscribeMotion, prefersStill, () => false);

  const go = useCallback(
    (i: number, scroll = true) => {
      setAt(i);
      if (!scroll) return;
      const el = document.getElementById(STOPS[i].id);
      el?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    },
    [still],
  );

  // The page makes room for the bar only while the tour is running.
  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".pg");
    if (!page) return;
    if (at == null) page.removeAttribute("data-tour");
    else page.setAttribute("data-tour", "on");
    return () => page.removeAttribute("data-tour");
  }, [at]);

  const stop = at == null ? null : U.stops[STOPS[at].key];

  return (
    <div className="pg-tour">
      <ol className="pg-tour-list">
        {STOPS.map((s, i) => (
          <li key={s.id}>
            <button className="pg-tour-jump" aria-pressed={at === i} onClick={() => go(i)}>
              <span className="pg-tour-n">{i + 1}</span>
              <span>
                <b>{U.stops[s.key].name}</b>
                <span>{U.stops[s.key].line}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="pg-row">
        <button className="pg-btn pg-btn-hot" onClick={() => go(0)}>
          {at == null ? U.start : U.again}
        </button>
        <p className="pg-note">{U.about}</p>
      </div>

      {stop ? (
        <div className="pg-tour-bar" role="region" aria-label={U.region}>
          <div className="pg-tour-bar-in">
            <p className="pg-tour-where">
              <span className="pg-tour-n">{at! + 1}</span>
              <b>{stop.name}</b>
              <span className="pg-tour-of">{U.of(STOPS.length)}</span>
            </p>
            <p className="pg-tour-line" aria-live="polite">
              {stop.line}
            </p>
            <div className="pg-tour-buttons">
              <button className="pg-btn" onClick={() => go(Math.max(0, at! - 1))} disabled={at === 0}>
                {U.back}
              </button>
              <button className="pg-btn pg-btn-hot" onClick={() => go(Math.min(STOPS.length - 1, at! + 1))} disabled={at === STOPS.length - 1}>
                {U.next}
              </button>
              <button className="pg-btn" onClick={() => setAt(null)}>
                {U.leave}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
