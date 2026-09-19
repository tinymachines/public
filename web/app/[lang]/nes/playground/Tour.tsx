"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { prefersStill, subscribeMotion } from "./Playground";

/**
 * The guided tour: one path through the stations, in an order that tells
 * one story, with a line at each stop saying what to look at and why it
 * is worth looking at.
 *
 * The words here are ours, not the engineers'. The tour holds nothing
 * else: each stop is a station on this page, and the bar that follows the
 * reader is fixed to the window, so starting or leaving the tour moves
 * nothing on the page itself.
 */

interface Stop {
  id: string;
  name: string;
  line: string;
}

const STOPS: Stop[] = [
  {
    id: "pg-title",
    name: "The picture, slowed down",
    line: "Start with the whole thing: a television picture being drawn, one dot at a time, by the console the engineers rebuilt. Slow it right down and watch the beam travel. Everything else on this page is a part of what you are watching here.",
  },
  {
    id: "wire",
    name: "The wire",
    line: "The console sends no picture: it sends one wire's worth of voltage, and the television rebuilds the picture from it. Click a line of the frame above, then point at the trace to magnify it down to single dots.",
  },
  {
    id: "colours",
    name: "The colours",
    line: "Every colour the machine can show is a moment in that wiggle. Pick one and watch the clock: the hue is nothing but timing against the burst, the little reference wave at the start of each line.",
  },
  {
    id: "mario",
    name: "A real game's frame",
    line: "Now a famous game, measured. The map shows what the processor was doing at each moment of one frame of Super Mario Bros. The grey is the surprise: most of the time it has finished and is waiting.",
  },
  {
    id: "pad",
    name: "The controller",
    line: "How a button press gets in: eight buttons snapshotted at once, then sent down a single wire a bit at a time. Press a few and watch a read.",
  },
  {
    id: "difference",
    name: "One button, one frame",
    line: "Two identical consoles, one tap in one of them. This is the engineers' method for finding out what a game does with a button, with no source code at all: run it twice and look for the difference.",
  },
  {
    id: "sound",
    name: "The sound",
    line: "Five voices, played by writing numbers into the chip. Turn the sound on and press a key; the pitch shown is measured from the chip's own output, not from what you asked for.",
  },
  {
    id: "slow",
    name: "The slow chip",
    line: "Now go down a level. This is the picture chip simulated transistor by transistor, drawing the same scene about two thousand times slower than the real thing, and agreeing with the fast version on every dot.",
  },
  {
    id: "die",
    name: "The die",
    line: "And this is what those transistors are: the chip's own silicon, photographed and traced, with the wires that are carrying a signal lit as it runs. Point at one to learn its name.",
  },
  {
    id: "patterns",
    name: "The tricks every game uses",
    line: "Games reuse the same handful of tricks, and the engineers are writing them down. Each picture here is one of them, moving: the same ideas you have just watched, drawn as mechanisms.",
  },
  {
    id: "real",
    name: "Real or model",
    line: "How close is all this to a real NES? Here is the same screen from both, and the one place they still disagree: the model's colours are slightly off, and the engineers know why.",
  },
  {
    id: "museum",
    name: "The bug museum",
    line: "Nothing this exact gets built without being wrong first. These are the mistakes the engineers kept: what you would have seen, why it happened, and how it was caught.",
  },
  {
    id: "bench",
    name: "The bench",
    line: "Everything you have seen is checked against a real NES on a table, with a board pressing its buttons and cameras watching. Here is the bench itself, photographed by the people who built it.",
  },
  {
    id: "arc",
    name: "How it was built",
    line: "Finally, the whole thing as days: every plan and report they wrote, from the first sketch to a real console wired to the model. That is where the detail lives, if you want it.",
  },
];

export function Tour() {
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

  const stop = at == null ? null : STOPS[at];

  return (
    <div className="pg-tour">
      <ol className="pg-tour-list">
        {STOPS.map((s, i) => (
          <li key={s.id}>
            <button className="pg-tour-jump" aria-pressed={at === i} onClick={() => go(i)}>
              <span className="pg-tour-n">{i + 1}</span>
              <span>
                <b>{s.name}</b>
                <span>{s.line}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="pg-row">
        <button className="pg-btn pg-btn-hot" onClick={() => go(0)}>
          {at == null ? "Start the tour" : "Start again"}
        </button>
        <p className="pg-note">
          About twenty minutes, in this order, from a television picture to a single transistor. You can leave it at any
          point and come back.
        </p>
      </div>

      {stop ? (
        <div className="pg-tour-bar" role="region" aria-label="The guided tour">
          <div className="pg-tour-bar-in">
            <p className="pg-tour-where">
              <span className="pg-tour-n">{at! + 1}</span>
              <b>{stop.name}</b>
              <span className="pg-tour-of">of {STOPS.length}</span>
            </p>
            <p className="pg-tour-line" aria-live="polite">
              {stop.line}
            </p>
            <div className="pg-tour-buttons">
              <button className="pg-btn" onClick={() => go(Math.max(0, at! - 1))} disabled={at === 0}>
                Back
              </button>
              <button className="pg-btn pg-btn-hot" onClick={() => go(Math.min(STOPS.length - 1, at! + 1))} disabled={at === STOPS.length - 1}>
                Next
              </button>
              <button className="pg-btn" onClick={() => setAt(null)}>
                Leave the tour
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
