import Link from "next/link";
import { nav } from "@/lib/projects";
import { NavLinks } from "./NavLinks";
import { VersionFooter } from "./VersionFooter";

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
}: {
  die: string;
  title: string;
  crumb?: React.ReactNode;
  meta?: React.ReactNode;
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
        <h1>{title}</h1>
        {meta ? <div className="mh-meta">{meta}</div> : null}
      </div>
    </header>
  );
}

/**
 * The site navigation, read from data/projects.json.
 *
 * It takes no props. It used to take `here`, naming the current section
 * against a union of four strings, and five pages passed it by hand: `/6502`
 * shipped passing `here="home"`, which nothing caught because a nav where
 * nothing is marked current looks exactly like a nav where you are somewhere
 * else. NavLinks reads the pathname instead, so no page passes anything and no
 * page can pass it wrong.
 *
 * The entries are derived, not listed. See lib/projects.ts: there is no
 * nav.ts, and if you find yourself writing one, stop.
 */
export function SiteNav() {
  return (
    <nav className="mh-meta" aria-label="Site">
      <NavLinks entries={nav()} />
    </nav>
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
export function SiteFooter() {
  const entries = nav();
  return (
    <footer className="crumb site-foot">
      <Link href="/">tinymachines.ai</Link>
      {entries.map(({ href, label }) => (
        <span key={href}>
          {" · "}
          {href.startsWith("/api") ? (
            <a href={`${href}/`}>{label}</a>
          ) : (
            <Link href={href}>{label}</Link>
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
 * The scrolling region is a real element rather than the document, so the
 * chrome holds still. `.app-scroll` is what moves; everything in `children`
 * is inside it. A page that wants a sticky element still gets one: sticky
 * resolves against the nearest scrolling ancestor, which is now this.
 *
 * The zoo does not use this and must not. It brings its own full-page chrome
 * and its sticky header expects the document to be the scroller, so it stays
 * outside the shell exactly as it stayed outside the frame before.
 */
export function Shell({
  die,
  title,
  crumb,
  navExtra,
  children,
  ...rest
}: {
  die: string;
  title: string;
  crumb?: React.ReactNode;
  /** An extra node beside the nav, inside <header>. One page needs it: the
      Die Runner console's game.js writes into `header .sub`, and that
      selector is its contract rather than a choice. */
  navExtra?: React.ReactNode;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="app-shell" {...rest}>
      <header className="app-head">
        <div className="band">
          <Masthead die={die} title={title} crumb={crumb} meta={<><SiteNav />{navExtra}</>} />
        </div>
      </header>

      <div className="app-scroll">
        <div className="page">{children}</div>
      </div>

      <footer className="app-foot">
        <div className="band">
          <SiteFooter />
        </div>
      </footer>
    </div>
  );
}
