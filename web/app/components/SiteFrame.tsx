import Link from "next/link";

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

/** `admin` is a valid position with no nav entry: nothing is marked current,
    which is right, because /admin is not a place a reader navigates to. */
type Where = "docs" | "style" | "home" | "admin";

export function SiteNav({ here }: { here: Where }) {
  const items: [string, string, Where][] = [
    ["/docs", "Documentation", "docs"],
    ["/style", "Style guide", "style"],
  ];
  return (
    <nav className="mh-meta" aria-label="Site">
      {items.map(([href, label, key]) => (
        <Link key={href} href={href} className="tag" aria-current={here === key ? "page" : undefined}>
          {label}
        </Link>
      ))}
      {/* The API is a real surface and worth linking, but it is JSON: a plain
          anchor, because it leaves the app and there is nothing for the
          client router to prefetch. */}
      <a className="tag" href="/api/">
        API
      </a>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="crumb site-foot">
      <span>tinymachines.ai</span> · <Link href="/docs">docs</Link> ·{" "}
      <Link href="/style">style</Link> · <a href="/api/">api</a>
    </footer>
  );
}
