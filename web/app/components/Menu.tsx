"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { MenuGroup } from "@/lib/nav";

/**
 * The menu: one control on every page, opening the section you are in.
 *
 * The groups arrive from the server already derived, and this picks the ones
 * whose `when` prefix matches the current path. That is what makes each
 * subsection's menu its own without any page passing anything: /docs sees the
 * documentation, /6502/lab sees the 6502 surfaces, and the site's own sections
 * are in both because that group matches everywhere.
 *
 * ## What a menu owes a keyboard
 *
 * Escape closes it and returns focus to the button, because a reader who opens
 * something must be able to close it without hunting for where focus went.
 * A click outside closes it. Following a link closes it, since the panel would
 * otherwise persist across a client-side navigation and cover the page it just
 * took you to.
 *
 * `aria-expanded` on the button and `aria-controls` pointing at the panel, so
 * a screen reader announces a collapsed control rather than an unexplained
 * one. The id comes from useId because two menus on one page would otherwise
 * both claim the same one, and a duplicate id resolves to the first.
 *
 * Deliberately NOT a focus trap. A trap is for a modal dialog that must be
 * answered; this is a disclosure, and trapping a reader inside a navigation
 * panel they opened by accident is worse than letting them tab past it.
 */
export function Menu({ groups }: { groups: MenuGroup[] }) {
  const here = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Closing on navigation is the one that is easy to miss: the route changes
  // under a panel that is still open, and it covers the page it just reached.
  //
  // Adjusted during render rather than in an effect. React's own guidance, and
  // eslint enforces it here: setState inside an effect runs a second render
  // pass after the first has already painted, so the panel would be visible
  // over the new page for a frame. Comparing against the last path we rendered
  // resolves it before anything is shown, and it catches a Back as well as a
  // click, which an onClick on each link would not.
  const [lastPath, setLastPath] = useState(here);
  if (lastPath !== here) {
    setLastPath(here);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const shown = groups.filter((g) => g.when === null || here === g.when || here.startsWith(g.when + "/"));

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="menu-btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        Menu
      </button>

      {/* Rendered only when open. A hidden panel that is still in the tree is
          one a screen reader can still reach and a Tab can still land in. */}
      {open ? (
        <div className="menu-panel" id={panelId}>
          {shown.map((group) => (
            <nav className="menu-group" key={group.title} aria-label={group.title}>
              <h2>{group.title}</h2>
              {group.items.map((item) => {
                const current = here === item.href;
                const props = {
                  className: "menu-item",
                  "aria-current": current ? ("page" as const) : undefined,
                };
                const inner = (
                  <>
                    <b>{item.label}</b>
                    {item.hint ? <span>{item.hint}</span> : null}
                  </>
                );
                // The API leaves the app, so there is nothing for the client
                // router to prefetch and a plain anchor is the honest element.
                return item.href.startsWith("/api") ? (
                  <a key={item.href} href={`${item.href}/`} {...props}>
                    {inner}
                  </a>
                ) : (
                  <Link key={item.href} href={item.href} {...props}>
                    {inner}
                  </Link>
                );
              })}
            </nav>
          ))}
        </div>
      ) : null}
    </div>
  );
}
