"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The breadcrumb trail, derived from the path.
 *
 * Every page wrote its own before this: `<b>tinymachines</b> / 6502 / lab`,
 * seven literals for seven pages, none of them checked against anything. They
 * were also not links, which made them a label shaped like navigation: the one
 * element on the page that looks most like a way back was the one thing you
 * could not click.
 *
 * Now the path is the trail. /6502/lab is three crumbs because it is three
 * segments, and each is a link except the last, because a link to the page you
 * are already on is a control that does nothing.
 *
 * The labels come from lib/nav.ts, which builds them from the manifest and the
 * docs tree, so a crumb cannot call a page something the menu does not. A
 * segment with no label falls back to itself, which is honest: it means a real
 * route exists that nothing describes, and it reads as the segment rather than
 * as a guess.
 */
export function Crumbs({ labels }: { labels: Record<string, string> }) {
  const here = usePathname();
  if (!here || here === "/") return null;

  const parts = here.split("/").filter(Boolean);
  const trail = parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"));

  return (
    <nav className="crumb" aria-label="Breadcrumb">
      <Link href="/">{labels["/"] ?? "tinymachines"}</Link>
      {trail.map((path, i) => {
        const label = labels[path] ?? parts[i];
        const last = i === trail.length - 1;
        return (
          <span key={path}>
            {" / "}
            {last ? (
              <span aria-current="page">{label}</span>
            ) : (
              <Link href={path}>{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
