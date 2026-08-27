import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { chipApi } from "@/lib/projects";
import { localize, t } from "@/lib/i18n";
import { explorer, explorerPages } from "@/lib/explorer";
import { article, articlePages } from "@/lib/article";
import { explorerLabel } from "@/lib/explorer-menu";
import { Shell } from "@/app/components/SiteFrame";
import { Justify } from "@/app/components/Justify";
import { ChipModules } from "../../explorer/ChipModules";
import "../../explorer/explorer.css";
import "./article.css";

/**
 * The companion page: a tool's prose as an article.
 *
 * Owner's call, 2026-08-27: a page with a large amount of text is a page
 * nobody reads, and the tracer had two blobs of it under a full-viewport
 * instrument. So each tool gets a companion at /6502/<tool>/article: its
 * prose sections, the same markup (lib/article.ts changes no word; it
 * splits the long paragraphs at sentence ends and at the chunk anchors
 * data/articles.json names, and heads each chunk), set in the reading
 * column and justified in place through pretext (components/Justify.tsx).
 * The tool page stays what it is: the instrument, full width, first, its
 * prose folded chunk by chunk. This is the magazine; that is the bench.
 *
 * The head is the tool's own hero: its eyebrow, its title, its lede;
 * then the prose with its subheads, nothing folded, and a Return button
 * (owner's call, later the same day: just the article, no tool button,
 * no Read on; inline images are to come). The instrument itself is not
 * on this page, but the tool's script is booted here
 * as on the tool page, because the widgets the sections carry (slots the
 * script fills with measured numbers, the block page's instrument) are
 * its; so the rest of the tool's body is rendered hidden, and every id
 * the script expects at boot is in the document.
 */

export const dynamicParams = false;
export function generateStaticParams() {
  return articlePages().map((p) => ({ page: p.slug }));
}

function fileFor(slug: string): string | undefined {
  return explorerPages().find((p) => p.slug === slug)?.file;
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; page: string }> }): Promise<Metadata> {
  const { lang, page } = await params;
  const file = fileFor(page);
  if (!file) return {};
  const a = article(file);
  return pageMeta(lang, `/6502/${page}/article`, { title: `${a.title}: the article`, description: a.description });
}

const L = {
  en: { back: "Return" },
  ja: { back: "戻る" },
} as const;

export default async function ArticlePage({ params }: { params: Promise<{ lang: Lang; page: string }> }) {
  const { lang, page } = await params;
  const file = fileFor(page);
  if (!file) throw new Error(`No tool page for slug ${JSON.stringify(page)}.`);
  const S = L[lang];
  const a = article(file);
  const x = explorer(file);
  // The head is the hero as the tool wrote it, h1 and all; the rest of
  // the tool's body (the instrument) is rendered hidden so its script
  // finds every element it asks for at boot. Nothing is deleted.
  const hero = (x.body.match(/<section class="hero[^"]*"[\s\S]*?<\/section>/) ?? [""])[0];
  const body = x.body
    .replace(/<section class="wrap sec bp-prose[\s\S]*?<\/section>/g, "")
    .replace(/<section class="hero[^"]*"[\s\S]*?<\/section>/g, "");
  const name = t(lang, explorerLabel(page) ?? a.title);

  return (
    <Shell lang={lang} die="6502" title={name} titleIsHeading={false}>
      <article className="art" data-chip-api={chipApi()}>
        <style dangerouslySetInnerHTML={{ __html: x.style }} />
        <header className="explorer-shell art-head" dangerouslySetInnerHTML={{ __html: hero }} />
        <div className="explorer-shell" hidden dangerouslySetInnerHTML={{ __html: body }} />
        <ChipModules entry={x.script} />

        <div className="explorer-shell art-body" dangerouslySetInnerHTML={{ __html: a.html }} />
        <Justify root=".art-body" />
        {/* Just the article (owner's call, 2026-08-27): the head, the
            prose with its subheads, and a way back. Inline images are to
            come. */}
        <p className="art-return">
          <Link className="art-link" href={localize(lang, `/6502/${page}`)}>{S.back}</Link>
        </p>
      </article>
    </Shell>
  );
}
