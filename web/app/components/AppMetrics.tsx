"use client";

import { useEffect } from "react";

/**
 * Publish the two sticky bands' heights as CSS custom properties.
 *
 * `--app-head-h` and `--app-foot-h` on the document element, kept current by a
 * ResizeObserver.
 *
 * They exist because two things need a number that only the browser knows.
 * `scroll-margin-top` has to clear the stuck masthead, or every in-page anchor
 * scrolls its target to y=0, which is underneath it: the link works, the URL
 * changes, and the heading you asked for is the one thing hidden. And the
 * lab's transport bar has to sit above the site footer rather than on top of
 * it, and so does the floor strip on a workbench, above the footer there.
 *
 * Measured rather than written down, because the height is not a constant. The
 * masthead carries a title that wraps at a narrow width, the nav wraps with
 * it, and a media query already changes the band's padding twice. Every one of
 * those changes the number, and a hardcoded 160px would be right at one
 * viewport and wrong at the rest, which is the drift this repository keeps
 * finding at the bottom of its bugs.
 *
 * The CSS carries a fallback in every var() that reads these, so the page is
 * correct before this runs and correct if it never does. What is lost without
 * it is precision, not function.
 */
export function AppMetrics() {
  useEffect(() => {
    const head = document.querySelector<HTMLElement>(".app-head");
    // The workbench's floor footer (.wb-foot) is a footer band too: the
    // strip sits on it by this number.
    const foot = document.querySelector<HTMLElement>(".app-foot, .wb-foot");
    if (!head && !foot) return;

    const root = document.documentElement;
    const publish = () => {
      if (head) root.style.setProperty("--app-head-h", `${Math.ceil(head.offsetHeight)}px`);
      if (foot) root.style.setProperty("--app-foot-h", `${Math.ceil(foot.offsetHeight)}px`);
    };
    publish();

    const ro = new ResizeObserver(publish);
    if (head) ro.observe(head);
    if (foot) ro.observe(foot);
    return () => {
      ro.disconnect();
      // Left behind, a stale height is worse than none: the route this
      // unmounts into may have no bands at all, and /style/zoo is exactly
      // that route.
      root.style.removeProperty("--app-head-h");
      root.style.removeProperty("--app-foot-h");
    };
  }, []);

  return null;
}
