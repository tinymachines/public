import Link from "next/link";
import { isHardRoute } from "@/lib/nav";
import { localize, type Lang } from "@/lib/lang";

/**
 * A link to somewhere on this site, which starts a fresh document where the
 * destination needs one.
 *
 * `lib/nav.ts` holds that rule (`isHardRoute`): a page built by a module that
 * binds this document at load and has no teardown must not be arrived at
 * through the client router, because a module already in the browser's
 * registry does not run again and what arrives is the markup with nothing
 * built in it. The Lab arrived that way with two rows of controls and no
 * instrument; the console with a blank screen and no handlers bound.
 *
 * This exists because the rule was being applied by hand: the home page asked
 * `isHardRoute` and the menu asked it, while the tools directory, the
 * cartridge page and the editor each linked straight to an instrument with
 * `<Link>` and were wrong. One component, one question, so the next page to
 * link at an instrument cannot forget to ask it.
 *
 * `prerendered === false` is the other reason for a plain anchor (a route the
 * build never made, which the client router cannot navigate to); pass `hard`
 * for that, and for an off-site href pass it too.
 */
export function SiteLink({
  lang,
  href,
  hard = false,
  className,
  children,
}: {
  lang: Lang;
  /** An on-site path, in either language's spelling. */
  href: string;
  /** Force a full navigation, whatever the rule says. */
  hard?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const to = localize(lang, href);
  return hard || isHardRoute(href) ? (
    <a className={className} href={to}>{children}</a>
  ) : (
    <Link className={className} href={to}>{children}</Link>
  );
}
