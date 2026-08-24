"use client";

import { useEffect, useState } from "react";

/**
 * A labelled control that puts the die full screen.
 *
 * It does not implement fullscreen. The explorer already has a working
 * implementation with an icon button at `#btn-fullscreen`, and their
 * `fullscreen.js` explains why it is not two lines: iOS Safari implements the
 * Fullscreen API for video elements only, so `requestFullscreen` on a div is
 * simply absent on an iPhone, and the fallback path sets classes the CSS keys
 * on because an unknown pseudo-class invalidates a whole selector list. A
 * second implementation here would be a second thing to get wrong on the one
 * platform where it is hard.
 *
 * So this clicks theirs. What it adds is a control a reader can find: the
 * existing one is an unlabelled glyph in the instrument's own toolbar, which
 * is where you look once you already know the page.
 *
 * It renders nothing until it has found that button. The explorer's modules
 * load from the runtime manifest and build the toolbar as they go, so on a
 * slow connection the button exists before its target does, and a control that
 * does nothing when pressed is worse than one that arrives a moment late.
 */
export function Launch() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const find = () => document.querySelector<HTMLElement>("#btn-fullscreen");

    // Their toolbar is built by script, so watch for it rather than polling.
    const observer = new MutationObserver(() => {
      const el = find();
      if (el) {
        setTarget(el);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // The already-present case, checked after the first paint rather than
    // during the effect. Setting state synchronously in an effect renders
    // twice, once after painting, and eslint enforces it here; a frame is also
    // the honest moment to ask, since the answer depends on what the browser
    // has finished doing.
    const frame = requestAnimationFrame(() => {
      const el = find();
      if (el) {
        setTarget(el);
        observer.disconnect();
      }
    });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  if (!target) return null;

  return (
    <button type="button" className="btn btn-primary" onClick={() => target.click()}>
      Launch full screen
    </button>
  );
}
