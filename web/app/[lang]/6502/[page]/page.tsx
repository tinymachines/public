import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { chipApi } from "@/lib/projects";
import { explorer, explorerPages } from "@/lib/explorer";
import { SiteFooter, WorkbenchBar } from "@/app/components/SiteFrame";
import { SectionStrip } from "@/app/components/SectionStrip";
import { explorerLabel } from "@/lib/explorer-menu";
import { localize, t } from "@/lib/i18n";
import Link from "next/link";
import { articlePages } from "@/lib/article";
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
  params: Promise<{ lang: string; page: string }>;
}): Promise<Metadata> {
  const { lang, page } = await params;
  const file = fileFor(page);
  if (!file) return {};
  // Their own <title>, minus the site name it already carried. The page said
  // what it is once; saying it differently here would be a second name.
  const x = explorer(file);
  return pageMeta(lang, `/6502/${page}`, { title: x.title, description: x.description });
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
    /* A workbench, owner's call 2026-08-24: the instruments were designed
       full-viewport on their own site and lost it inside the content panel.
       titleIsHeading is false because each page's own hero carries the h1. */
    <div className="workbench has-transport" data-workbench data-chip-api={chipApi()}>
      <WorkbenchBar
        hard
        lang={lang}
        /* The menu's short name for the page, in the page's language; the
           long title stays the document's <title>. */
        title={t(lang, explorerLabel(file.replace(/\.html$/, "")) ?? title)}
        titleIsHeading={false}
        trail={[
          { href: "/", label: "tinymachines.ai" },
          { href: "/6502", label: "6502" },
        ]}
      />
      <SectionStrip />
      <div className="wb-main">
        <style dangerouslySetInnerHTML={{ __html: style }} />
        <div className="explorer-shell" dangerouslySetInnerHTML={{ __html: body }} />
        <ChipModules entry={script} />
        {/* The companion: the same prose as an article, with the instrument
            in it (article/page.tsx). Under the instrument, where the prose
            it replaces begins. */}
        {articlePages().some((p) => p.slug === page) ? (
          <p className="wb-article-link">
            <Link className="tag live" href={localize(lang, `/6502/${page}/article`)}>{lang === "ja" ? "記事として読む" : "Read it as an article"}</Link>
          </p>
        ) : null}
        {/* What is running, on every page: see explorer/page.tsx. */}
        <SiteFooter lang={lang} />
      </div>
    </div>
  );
}
