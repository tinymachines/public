import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { explorer, explorerPages } from "@/lib/explorer";
import { Shell } from "@/app/components/SiteFrame";
import { ChipModules } from "../explorer/ChipModules";
import "../explorer/explorer.css";

/**
 * The rest of the explorer: seventeen pages, one route.
 *
 * The front page has its own file because it is the surface people arrive at
 * and carries a launch control the others do not. Everything else is the same
 * three steps applied to a different document, so it is one dynamic route
 * rather than seventeen near-identical ones, and a page added over there
 * appears here by being added rather than by being registered.
 *
 * They keep the slugs they already had. /primer was /primer on the old site
 * and is /6502/primer here, which makes rewriting their own internal links a
 * prefix rather than a lookup table, and makes every inbound link somebody
 * has bookmarked a one-line redirect when the time comes.
 *
 * The static segments beside this one win over it: /6502/games, /6502/lab and
 * /6502/explorer are real directories and Next resolves those first. None of
 * the explorer's own slugs collides with them, and the build would say so if
 * one ever did, because generateStaticParams would try to render a route that
 * already exists.
 */

// The set above is the complete set. Without this, a request for any other
// path under /6502/ runs this component with a slug it will not find, and the
// throw below turns a stray URL into a 500. Measured: the explorer's own
// app.js registers 'sw.js' document-relative, so every explorer page asks
// this site for /6502/sw.js on load, and it was answering 500 where the
// explorer page's notes promised a harmless 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return explorerPages()
    .filter((p) => p.slug !== "explorer")
    .map((p) => ({ page: p.slug }));
}

function fileFor(slug: string): string | undefined {
  return explorerPages().find((p) => p.slug === slug)?.file;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  const file = fileFor(page);
  if (!file) return {};
  // Their own <title>, minus the site name it already carried. The page said
  // what it is once; saying it differently here would be a second name.
  return { title: explorer(file).title };
}

export default async function ExplorerSubPage({ params }: { params: Promise<{ lang: Lang; page: string }> }) {
  const { lang, page } = await params;
  const file = fileFor(page);
  if (!file) {
    // A build failure rather than a page about nothing. generateStaticParams
    // only offers slugs that exist, so reaching this means the two disagreed.
    throw new Error(`No explorer page for slug ${JSON.stringify(page)}.`);
  }

  const { style, body, script, title } = explorer(file);

  return (
    <Shell lang={lang} die="DIE" title={title} titleIsHeading={false}>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div className="explorer-shell" dangerouslySetInnerHTML={{ __html: body }} />
      <ChipModules entry={script} />
    </Shell>
  );
}
