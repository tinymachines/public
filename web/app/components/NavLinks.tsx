"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavEntry } from "@/lib/projects";

/**
 * The navigation's links, and which one is current.
 *
 * A client component for one reason: `usePathname`. The previous version took
 * a `here` prop naming the current section, and five pages passed it by hand
 * against a union of four strings. `/6502` shipped passing `here="home"`,
 * which is not a lie anybody would notice: the nav rendered, nothing was
 * marked current, and it looked exactly like a nav where nothing is current
 * because you are somewhere else.
 *
 * Reading the pathname means no page passes anything, so no page can pass it
 * wrong. The entries still come from the manifest on the server, because the
 * filesystem is not reachable from here.
 *
 * The API entry is a plain anchor rather than a Link: it leaves the app and
 * there is nothing for the client router to prefetch.
 */
export function NavLinks({ entries }: { entries: NavEntry[] }) {
  const here = usePathname();

  return (
    <>
      {entries.map(({ href, label }) => {
        // A section is current when you are on it or beneath it. "/" would be
        // a prefix of everything, so it matches exactly and nothing else does.
        const current = href === "/" ? here === "/" : here === href || here.startsWith(href + "/");
        const props = {
          className: "tag",
          "aria-current": current ? ("page" as const) : undefined,
        };
        return href.startsWith("/api") ? (
          <a key={href} href={`${href}/`} {...props}>
            {label}
          </a>
        ) : (
          <Link key={href} href={href} {...props}>
            {label}
          </Link>
        );
      })}
    </>
  );
}
