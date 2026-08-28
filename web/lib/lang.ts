/**
 * The two languages, and how a string moves between them.
 *
 * ## One overlay, keyed by the English string
 *
 * data/ja.json maps English text to Japanese text, and t() looks a string up
 * there. No invented message ids, because the site already has a rule that
 * fits: the English string IS the key, the way the manifest's `what` is the
 * single copy of each description. What follows from that is the failure
 * mode, and it is the honest one: when English copy is edited, its Japanese
 * entry stops matching and the page shows the new English text rather than
 * stale Japanese. Visible, not silent, and check-i18n.py counts what is
 * untranslated rather than letting it hide.
 *
 * ## Server-side only
 *
 * The overlay is read with fs, like every list in lib/. Client components
 * never translate: they receive already-translated strings as props, so the
 * whole dictionary is not shipped to every browser for the sake of the menu.
 *
 * ## Page names stay page names
 *
 * Deliberately: the explorer's pages are English documents, and a menu entry
 * calling one 「入門」 while the page opens in English promises something the
 * click does not deliver. Labels that are names (Primer, Die Runner,
 * Halfwave Lab) keep their names; what gets translated is the chrome around
 * them and, page by page as translations land, the content itself.
 */

export const LANGS = ["en", "ja"] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(x: string): x is Lang {
  return (LANGS as readonly string[]).includes(x);
}

/**
 * A local href in the given language. English lives unprefixed; Japanese
 * under /ja. External and protocol-carrying hrefs pass through untouched:
 * there is no Japanese edition of another origin.
 */
export function localize(lang: Lang, href: string): string {
  if (lang === "en") return href;
  if (!href.startsWith("/")) return href;
  return href === "/" ? "/ja" : `/ja${href}`;
}

/**
 * The path with any language prefix removed: what the labels are keyed by.
 *
 * `/en/...` counts as one of those prefixes, and that is not a nicety. It is
 * the INTERNAL spelling of an English path: English is served unprefixed and
 * rewritten onto `app/[lang]` (next.config.ts, afterFiles), so a client
 * component reading `usePathname()` inside a prerendered English page sees
 * `/en/6502/lab` where the browser's address bar says `/6502/lab`. Measured
 * 2026-08-28: every statically rendered English page shipped a language
 * switch pointing at `/ja/en/6502/lab`, which is a path this site does not
 * have. Public `/en/*` redirects away, so there is nothing ambiguous about
 * reading it as English here.
 */
export function delocalize(pathname: string): { lang: Lang; path: string } {
  for (const l of LANGS) {
    if (pathname === `/${l}`) return { lang: l, path: "/" };
    if (pathname.startsWith(`/${l}/`)) return { lang: l, path: pathname.slice(l.length + 1) };
  }
  return { lang: "en", path: pathname };
}
