import Link from "next/link";
import { nav } from "@/lib/projects";
import { labels, menuGroups, type MenuGroup } from "@/lib/nav";
import { localize, t, type Lang } from "@/lib/i18n";
import { Crumbs } from "./Crumbs";
import { LangSwitch } from "./LangSwitch";
import { Menu } from "./Menu";
import { VersionFooter } from "./VersionFooter";
import { AppMetrics } from "./AppMetrics";

/**
 * The page frame: masthead, and footer.
 *
 * Every component here is from ../../style/components.css. Nothing new is
 * drawn and no colour is chosen: .masthead, .die, .mh-meta, .tag and .crumb
 * were all in the kit already, and none of them were being used. That was the
 * whole reason the site read as black and white while the widget zoo, which
 * carries its own chrome, did not. The kit was reaching the pages; the pages
 * were not asking for anything from it.
 *
 * The zoo route deliberately does NOT use this. It brings its own masthead,
 * and two mastheads on one page is worse than either.
 */

export function Masthead({
  die,
  title,
  crumb,
  meta,
  titleIsHeading = true,
}: {
  die: string;
  title: string;
  crumb?: React.ReactNode;
  meta?: React.ReactNode;
  /**
   * Whether the masthead's title is the document's <h1>.
   *
   * False where the CONTENT owns the heading, which is every documentation
   * page and the style guide: those carry their own title in the markdown, so
   * the masthead was giving the page a second h1 and the two disagreed about
   * which one it was. On /docs/6502/verification the masthead said
   * "Documentation" and the document said "Verification", and the second is
   * the page. A screen reader announcing two top-level headings has no way to
   * tell which one names the thing you asked for.
   *
   * It looks identical either way: .mh-title carries the same rules as
   * .masthead h1, so this changes the semantics and nothing else. A build
   * check counts h1s per page, because this is a prop and a prop can be
   * forgotten.
   */
  titleIsHeading?: boolean;
}) {
  return (
    <header className="masthead">
      {/* .die is the kit's ink block with mustard mono on it. It carries the
          chip designation rather than a monogram, because the designation is
          a fact about the subject and a monogram would be a mark, which is
          the owner's to make. */}
      <div className="die">{die}</div>
      <div>
        {crumb ? <div className="crumb">{crumb}</div> : null}
        {titleIsHeading ? <h1>{title}</h1> : <p className="mh-title">{title}</p>}
        {meta ? <div className="mh-meta">{meta}</div> : null}
      </div>
    </header>
  );
}

/**
 * The footer, from the same list as the navigation.
 *
 * It used to hold its own copy: docs, style, api, written out here. That copy
 * had already drifted by the time this was noticed, because /6502 was added to
 * the manifest and appeared in the nav and not down here. Nobody would have
 * seen it: a footer missing one link looks exactly like a footer.
 *
 * So it renders nav() too. The two read differently on the page because .crumb
 * sets the voice, not because they are different lists.
 */
export function SiteFooter({ lang }: { lang: Lang }) {
  const entries = nav();
  return (
    <footer className="crumb site-foot">
      <Link href={localize(lang, "/")}>tinymachines.ai</Link>
      {entries.map(({ href, label }) => (
        <span key={href}>
          {" · "}
          {href.startsWith("/api") ? (
            // The API is uvicorn, not a page of this build, and it has no
            // Japanese edition: the anchor stays unprefixed in every language.
            <a href={`${href}/`}>{t(lang, label)}</a>
          ) : (
            <Link href={localize(lang, href)}>{t(lang, label)}</Link>
          )}
        </span>
      ))}
      {/* What is running, asked of the running process rather than baked in.
          Renders nothing at all when the API cannot answer. */}
      <VersionFooter />
    </footer>
  );
}


/**
 * The app shell: locked masthead, locked footer, one scrolling region.
 *
 * Every framed route renders this instead of assembling the three pieces
 * itself. That was the previous shape and it was a seven-way copy of the same
 * five lines, which is the arrangement this repository keeps finding at the
 * bottom of its bugs: /6502 had already drifted, passing `here="home"` to a
 * nav prop that no longer exists. One component means the structure is stated
 * once and a route cannot get it slightly wrong.
 *
 * The two bands are sticky and the DOCUMENT still scrolls. The first version
 * made the middle a real scrolling element, which locked the chrome and took
 * the keyboard, the wheel over the header, find-in-page and scroll restoration
 * with it. components.css section 21 has the full account.
 *
 * The zoo does not use this and must not. It brings its own full-page chrome
 * and its sticky header expects the document to be the scroller, so it stays
 * outside the shell exactly as it stayed outside the frame before.
 *
 * There is no `crumb` prop any more. Seven pages each wrote their own literal,
 * none of them checked against anything; Crumbs derives the trail from the
 * path and its labels from the same place the menu takes them, so a crumb
 * cannot call a page something the menu does not.
 */
/**
 * Every menu string translated and every menu href localized, at the one
 * edge where the tree passes from server to client. The Menu itself never
 * translates: it receives finished strings, so the dictionary stays out of
 * the browser bundle. Items that are not pages of this build (prerendered
 * false: the API, the archive's deep paths) keep unprefixed hrefs, because
 * there is no Japanese edition of another process.
 */
function localizedGroups(lang: Lang): MenuGroup[] {
  return menuGroups().map((g) => ({
    ...g,
    title: t(lang, g.title),
    items: g.items.map((it) => ({
      ...it,
      label: t(lang, it.label),
      hint: it.hint ? t(lang, it.hint) : it.hint,
      href: it.prerendered === false ? it.href : localize(lang, it.href),
    })),
  }));
}

function localizedLabels(lang: Lang): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, name] of Object.entries(labels())) out[path] = t(lang, name);
  return out;
}

export function Shell({
  lang,
  die,
  title,
  navExtra,
  titleIsHeading,
  children,
  ...rest
}: {
  /**
   * Required, not defaulted. A page that forgets it fails to type-check,
   * which is the loud version of the check; a default of "en" would be the
   * quiet version, a Japanese page wearing English chrome and looking merely
   * unfinished rather than broken.
   */
  lang: Lang;
  die: string;
  title: string;
  /** False where the content carries its own h1. See Masthead. */
  titleIsHeading?: boolean;
  /** An extra node beside the nav, inside <header>. One page needs it: the
      Die Runner console's game.js writes into `header .sub`, and that
      selector is its contract rather than a choice. */
  navExtra?: React.ReactNode;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="app-shell" {...rest}>
      {/* Publishes the bands' heights so anchors can clear the masthead.
          Renders nothing; the CSS has a fallback for every value it sets. */}
      <AppMetrics />
      <header className="app-head">
        {/* The menu sits beside the masthead rather than inside it: it is a
            control, and the masthead is a heading. Aligned to the top so it
            stays put whether the title is one line or two. */}
        <div className="band app-head-row">
          <Masthead
            die={die}
            title={title}
            crumb={<Crumbs labels={localizedLabels(lang)} lang={lang} />}
            titleIsHeading={titleIsHeading}
            meta={navExtra}
          />
          <LangSwitch lang={lang} />
          <Menu groups={localizedGroups(lang)} label={t(lang, "Menu")} />
        </div>
      </header>

      <main className="app-main">
        {lang === "ja" ? (
          // Honest while the translation lands page by page: without this, an
          // untranslated body under Japanese chrome reads as a bug rather
          // than as work in progress. Removed when the content is done.
          <div className="page">
            <p className="notice" lang="ja">
              日本語版は準備中です。未訳の本文は英語のまま表示されます。
            </p>
          </div>
        ) : null}
        <div className="page">{children}</div>
      </main>

      <footer className="app-foot">
        <div className="band">
          <SiteFooter lang={lang} />
        </div>
      </footer>
    </div>
  );
}
