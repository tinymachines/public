"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { delocalize, localize } from "@/lib/lang";
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
export function Menu({
  groups,
  label = "Menu",
  close = "Close",
  account = { signIn: "Sign in with GitHub", signedIn: "Signed in as", tokens: "your tokens", signOut: "sign out" },
  hard = false,
}: {
  groups: MenuGroup[];
  label?: string;
  /** What the same button says while the panel is open: it closes it. */
  close?: string;
  /** The account row's words, translated by the caller. */
  account?: { signIn: string; signedIn: string; tokens: string; signOut: string };
  /** Every link a full navigation: set by a page whose module must not survive the leave. */
  hard?: boolean;
}) {
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
  // The account row at the foot of the panel. Asked once per opening, so a
  // sign-in on another tab shows the next time the menu opens; null until
  // answered, and absent where GitHub sign-in is not configured.
  const [who, setWho] = useState<{ enabled: boolean; login: string | null } | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    (async () => {
      try {
        const a = await fetch("/api/v1/auth", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { github: false }));
        if (!a.github) { if (live) setWho({ enabled: false, login: null }); return; }
        const m = await fetch("/api/v1/me", { cache: "no-store" });
        const login = m.ok ? ((await m.json()).user?.login ?? null) : null;
        if (live) setWho({ enabled: true, login });
      } catch { if (live) setWho({ enabled: false, login: null }); }
    })();
    return () => { live = false; };
  }, [open]);

  async function signOut() {
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    setWho({ enabled: true, login: null });
    window.location.reload();
  }

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
      const t = e.target as HTMLElement;
      // The scrim is inside the wrap and is still "outside": it is the page.
      if (!wrap.current?.contains(t) || t.classList?.contains("menu-scrim")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    // The page under the panel holds still. Without this a finger that
    // overshoots the sheet scrolls the page behind it, and the panel, which
    // is positioned against the header, drifts with it.
    document.documentElement.classList.add("menu-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.documentElement.classList.remove("menu-open");
    };
  }, [open]);

  // The `when` prefixes are unprefixed paths; under /ja the pathname is not.
  // Scoping compares the stripped path, so a Japanese docs page still gets
  // the documentation group; aria-current below compares the RAW path,
  // because the item hrefs arrive already localized.
  const { path: section, lang } = delocalize(here);
  const editor = `${localize(lang, "/6502/manage")}#account`;
  const inSection = (g: MenuGroup) =>
    g.only ? g.only.includes(section) : g.when !== null && (section === g.when || section.startsWith(g.when + "/"));
  // The section you are standing in comes FIRST, then the site. A reader who
  // opens the menu inside 6502 wants 6502 under their thumb; the way out is
  // still there, below, and it is the same on every page.
  const shown = [...groups.filter(inSection), ...groups.filter((g) => g.when === null && !g.only)];

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
        {open ? close : label}
      </button>

      {/* Rendered only when open. A hidden panel that is still in the tree is
          one a screen reader can still reach and a Tab can still land in. */}
      {open ? (
        <>
        {/* The scrim only paints on a phone (the CSS decides): a faint wash of
            paper over the page so the card reads as a card on top of it rather
            than as a new page. Closing on tap is the outside-click rule above. */}
        <div className="menu-scrim" aria-hidden="true" onClick={() => setOpen(false)} />
        <div className="menu-panel" id={panelId}>
          {/* The panel spans the header; the sheet inside it keeps the site's
              measure, so the columns line up with the masthead above and the
              content below. */}
          <div className="menu-sheet">
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
                // Anything this site does not prerender gets a plain anchor.
                // The API is uvicorn and the archive is nginx serving a
                // directory: there is nothing for the client router to
                // prefetch, and asking it to navigate to a route the build
                // never made lands the reader on the not-found page.
                const external = item.prerendered === false || item.hard === true || hard;
                return external ? (
                  <a key={item.href} href={item.href.startsWith("/api") ? `${item.href}/` : item.href} {...props}>
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
          {who?.enabled ? (
            <div className="menu-account">
              {who.login ? (
                <>
                  <span>{account.signedIn} <b>@{who.login}</b></span>
                  {hard ? (
                    // eslint-disable-next-line @next/next/no-html-link-for-pages
                    <a href={editor}>{account.tokens}</a>
                  ) : (
                    <Link href={editor}>{account.tokens}</Link>
                  )}
                  <button type="button" className="linkish" onClick={signOut}>{account.signOut}</button>
                </>
              ) : (
                <a className="menu-signin" href={`/api/v1/auth/github?next=${encodeURIComponent(here)}`}>{account.signIn}</a>
              )}
            </div>
          ) : null}
        </div>
        </>
      ) : null}
    </div>
  );
}
