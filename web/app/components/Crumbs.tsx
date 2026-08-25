"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { delocalize, localize, type Lang } from "@/lib/lang";
import { JsonLd, breadcrumbs } from "./JsonLd";

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
export function Crumbs({ labels, lang, origin }: { labels: Record<string, string>; lang: Lang; origin: string }) {
  const raw = usePathname();
  // The trail is built from the path WITHOUT its language prefix: the labels
  // are keyed by the unprefixed path, and a crumb reading "ja" would be
  // plumbing shown to a reader. The links put the prefix back, so the trail
  // stays inside the language it is in.
  const { path: here } = delocalize(raw ?? "/");
  if (!here || here === "/") return null;

  const parts = here.split("/").filter(Boolean);
  const trail = parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"));

  // The same trail, declared for crawlers. `origin` arrives from the server
  // so lib/seo, which reads the manifest off disk, stays out of the bundle.
  const declared = [{ href: localize(lang, "/"), label: labels["/"] ?? "tinymachines" }, ...trail.map((path, i) => ({ href: localize(lang, path), label: labels[path] ?? parts[i] }))];
  return (
    <nav className="crumb" aria-label="Breadcrumb">
      <JsonLd data={breadcrumbs(declared, (p) => new URL(p, origin).toString())} />
      <Link href={localize(lang, "/")}>{labels["/"] ?? "tinymachines"}</Link>
      {trail.map((path, i) => {
        const label = labels[path] ?? parts[i];
        const last = i === trail.length - 1;
        return (
          <span key={path}>
            {" / "}
            {last ? (
              <span aria-current="page">{label}</span>
            ) : (
              <Link href={localize(lang, path)}>{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
