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

export function SiteFooter() {
  return (
    <footer className="crumb site-foot">
      <span>tinymachines.ai</span> · <Link href="/docs">docs</Link> ·{" "}
      <Link href="/style">style</Link> · <a href="/api/">api</a>
      {/* What is running, asked of the running process rather than baked in.
          Renders nothing at all when the API cannot answer. */}
      <VersionFooter />
    </footer>
  );
}
