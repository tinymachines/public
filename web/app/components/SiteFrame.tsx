import Link from "next/link";
import { labels, menuGroups, type MenuGroup } from "@/lib/nav";
import { localize, t, type Lang } from "@/lib/i18n";
import { Crumbs } from "./Crumbs";
import { JsonLd, breadcrumbs } from "./JsonLd";
import { abs, ORIGIN } from "@/lib/seo";
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
export function SiteFooter({ lang, floor = false }: {
  lang: Lang;
  /**
   * On a workbench: locked to the floor under the strip, the way the app
   * shell's footer is locked under a reading page (owner's call, 2026-08-27,
   * on the Lab: "the footer goes below everything, like the homepage"). The
   * console leaves it off: its footer sits on the status page.
   */
  floor?: boolean;
}) {
  // No navigation down here any more (owner's call, 2026-08-25): the menu is
  // the one place the site's map lives, and a second copy in the footer was
  // both a repeat and a temptation to drift. What remains is the name and
  // what is running, which is the only fact a footer has to offer.
  return (
    <footer className={floor ? "crumb site-foot wb-foot" : "crumb site-foot"}>
      <Link href={localize(lang, "/")}>tinymachines.ai</Link>
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

function accountWords(lang: Lang) {
  return {
    signIn: t(lang, "Sign in with GitHub"),
    signedIn: t(lang, "Signed in as"),
    tokens: t(lang, "your tokens"),
    signOut: t(lang, "sign out"),
  };
}

function localizedLabels(lang: Lang): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, name] of Object.entries(labels())) out[path] = t(lang, name);
  return out;
}

/**
 * THE BAR. One row, the same on every page (owner's call, 2026-08-25: the
 * headers had become a mish-mash, and the explorer's menu sat a step off the
 * home page's). Three slots:
 *
 *   left    the die tile and the wordmark, the way home. The tile wears the
 *           section's accent and names it, so which section you are in is a
 *           colour and a word before anything else. An instrument page adds
 *           its own name beside the mark.
 *   right   ONE flag, the other language's, larger: the destination, not
 *           the state. Then the menu.
 *
 * Nothing else. Full screen used to have a slot here and now lives at the
 * right end of the floor strip (Fullscreen.tsx), because the bar leaves in
 * full screen and a control should not vanish the moment it is pressed.
 */
function Topbar({
  lang,
  die,
  page,
  pageIsHeading = false,
  hard = false,
}: {
  lang: Lang;
  die: string;
  /** The instrument's name, beside the mark. Absent on reading pages, whose
      name opens the page under the bar. */
  page?: string;
  pageIsHeading?: boolean;
  hard?: boolean;
}) {
  const home = localize(lang, "/");
  const mark = (
    <>
      <span className="die">{die}</span>
      <b>tinymachines</b>
    </>
  );
  return (
    <div className="band topbar">
      {hard ? (
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a href={home} className="wordmark" aria-label="tinymachines.ai">{mark}</a>
      ) : (
        <Link href={home} className="wordmark" aria-label="tinymachines.ai">{mark}</Link>
      )}
      {page ? (pageIsHeading ? <h1 className="tb-page">{page}</h1> : <p className="tb-page">{page}</p>) : null}
      <LangSwitch lang={lang} hard={hard} />
      <Menu groups={localizedGroups(lang)} label={t(lang, "Menu")} close={t(lang, "Close")} account={accountWords(lang)} hard={hard} />
    </div>
  );
}

/**
 * The bar on an instrument page: the same Topbar, with the page's name in
 * it, since a workbench has no page head under the bar to carry one. The
 * name is the h1 unless the instrument's own markup carries one, which is
 * the rule the page head follows and for the same reason: a document has one
 * name. The trail is no longer drawn (the tile is the way home and the menu
 * is the map) but a crawler is still told it.
 */
export function WorkbenchBar({
  lang,
  title,
  trail,
  titleIsHeading = true,
  hard = false,
}: {
  lang: Lang;
  title: string;
  trail: { href: string; label: string }[];
  titleIsHeading?: boolean;
  /**
   * Every way off this page is a full navigation. The explorer's modules keep
   * state at module scope with no teardown, so leaving one client-side leaves
   * a loop running against a page that is gone. See MenuItem.hard.
   */
  hard?: boolean;
}) {
  // The trail the reader sees is the trail a crawler is told about.
  const full = [...trail, { href: "", label: title }];
  const die = trail.length > 1 ? trail[trail.length - 1].label : "6502";
  return (
    <div className="app-head wb-bar">
      <AppMetrics />
      <JsonLd data={breadcrumbs(full.map((c) => ({ ...c, href: localize(lang, c.href) })), abs)} />
      <Topbar lang={lang} die={die} page={title} pageIsHeading={titleIsHeading} hard={hard} />
    </div>
  );
}

export function Shell({
  lang,
  die,
  title,
  navExtra,
  titleIsHeading,
  pageHead = true,
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
  /**
   * False where the page opens with its own display heading and a page head
   * would only repeat the wordmark above it. The front page: its hero is its
   * h1, and "tinymachines" twice in 80px of paper was the first thing the
   * slim bar exposed.
   */
  pageHead?: boolean;
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
      {/* The bar is ONE row and never wraps; Topbar says what is in it. The
          page's title used to live up here too, and at 390px three things
          fought for one line and the title lost every time. On a reading
          page the title opens the page, where a title belongs. */}
      <header className="app-head">
        <Topbar lang={lang} die={die} />
      </header>

      {/* No site-wide "translation in progress" banner here any more. It was
          honest when most bodies were English; once they were translated it
          inverted into a false claim on every translated page, and the pages
          actually serving English bodies (workbenches, pulled docs) never
          rendered this Shell at all. A notice about an untranslated body now
          sits ON that body: docs/[[...slug]]/page.tsx renders one per
          untranslated document, which is the copy of the fact that cannot
          drift from it. */}
      <main className="app-main">
        <div className="page">
          {/* The page head: the trail, the name, and whatever a page hangs
              beside its name. This is the masthead's content, moved into the
              page from the bar. The h1 rule is unchanged: the content owns
              the heading where it carries one, and a build check counts. */}
          {pageHead ? (
            <div className="page-head">
              <Crumbs labels={localizedLabels(lang)} lang={lang} origin={ORIGIN} />
              {/* No label where the content owns the heading: the trail's last
                  segment already names the page, and "DOCUMENTATION" twice in
                  two lines was what the label amounted to. `title` still
                  feeds the crumb labels and the document title. */}
              {titleIsHeading === false ? null : <h1>{title}</h1>}
              {navExtra ? <div className="mh-meta">{navExtra}</div> : null}
            </div>
          ) : null}
          {children}
        </div>
      </main>

      <footer className="app-foot">
        <div className="band">
          <SiteFooter lang={lang} />
        </div>
      </footer>
    </div>
  );
}
