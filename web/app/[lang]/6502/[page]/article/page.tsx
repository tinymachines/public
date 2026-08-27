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
 * The companion page: a tool's prose as an article, with the tool in it.
 *
 * Owner's call, 2026-08-27: a page with a large amount of text is a page
 * nobody reads, and the tracer had two blobs of it under a full-viewport
 * instrument. So each tool gets a companion at /6502/<tool>/article: its
 * prose sections, the same markup (lib/article.ts changes no word; it
 * splits the one 20,661-character paragraph at sentence ends), set in the
 * reading column and justified in place through pretext
 * (components/Justify.tsx), with the rest of the instrument embedded as a
 * live figure, running, with its own controls. The tool page stays what it
 * is: the instrument, full width, first. This is the magazine; that is the
 * bench.
 *
 * The widgets the sections carry (slots the script fills with measured
 * numbers, tables, the block page's whole instrument) come through as
 * they are and stay live, because the tool's script is booted once here,
 * exactly as the tool page boots it, and finds them in the document where
 * it expects them. The article body wears `.explorer-shell` so the tool's
 * own rules for its prose and widgets reach them.
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
  en: {
    bench: "The bench",
    benchNote: "The instrument, running here as it runs on its own page. Its controls are its own.",
    open: "Open the tool",
    splits: (n: number) => `${n} of the paragraph breaks on this page are the article's, not the author's: one long paragraph was split at sentence ends so it could be read. Every word is the tool page's.`,
    chars: (n: string) => `${n} characters`,
  },
  ja: {
    bench: "ベンチ",
    benchNote: "この計器は、自身のページで動くのと同じようにここで動く。操作はそれ自身のもの。",
    open: "ツールを開く",
    splits: (n: number) => `このページの段落の切れ目のうち ${n} 箇所は記事側のもので、著者のものではない: 長い一段落を読めるよう文末で分けた。言葉はすべてツールページのまま。`,
    chars: (n: string) => `${n} 文字`,
  },
} as const;

// A thousands separator that is the same string on the server and in every
// browser: toLocaleString was a hydration mismatch waiting to happen.
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export default async function ArticlePage({ params }: { params: Promise<{ lang: Lang; page: string }> }) {
  const { lang, page } = await params;
  const file = fileFor(page);
  if (!file) throw new Error(`No tool page for slug ${JSON.stringify(page)}.`);
  const S = L[lang];
  const a = article(file);
  const x = explorer(file);
  // The figure: the tool's body with its prose sections cut out (they are
  // the article now) and without its hero (the page opener, which inside a
  // figure would be a second h1). A heading it still carries is demoted.
  //
  // Nothing is DELETED from the document, only moved out of sight: the
  // tool's script asks for its elements by id at boot, and the primer's
  // `#pr-main`, the wrapper its sections sat in, was gone with them and
  // the boot threw before it filled a single slot. So the hero, and the
  // remainder when there is no instrument left to show, are rendered
  // hidden, and every id the script expects is there.
  const demote = (h: string) => h.replace(/<h1\b/g, "<h2 data-was-h1").replace(/<\/h1>/g, "</h2>");
  const hero = demote((x.body.match(/<section class="hero[^"]*"[\s\S]*?<\/section>/) ?? [""])[0]);
  const body = demote(x.body
    .replace(/<section class="wrap sec bp-prose[\s\S]*?<\/section>/g, "")
    .replace(/<section class="hero[^"]*"[\s\S]*?<\/section>/g, ""));
  const name = t(lang, explorerLabel(page) ?? a.title);
  const benchIsEmpty = body.replace(/<[^>]+>/g, "").trim().length < 40;

  return (
    <Shell lang={lang} die="6502" title={name} titleIsHeading={false}>
      <article className="art" data-chip-api={chipApi()}>
        <header className="art-head">
          <h1>{name}</h1>
          <p className="art-meta quiet">
            {S.chars(grouped(a.chars))} · <Link href={localize(lang, `/6502/${page}`)}>{S.open}</Link>
          </p>
        </header>

        <style dangerouslySetInnerHTML={{ __html: x.style }} />
        <div className="explorer-shell" hidden dangerouslySetInnerHTML={{ __html: hero }} />
        {benchIsEmpty ? (
          <div className="explorer-shell" hidden dangerouslySetInnerHTML={{ __html: body }} />
        ) : (
          <figure className="art-bench">
            <figcaption><b>{S.bench}</b> · {S.benchNote}</figcaption>
            <div className="art-bench-frame">
              <div className="explorer-shell" dangerouslySetInnerHTML={{ __html: body }} />
            </div>
          </figure>
        )}
        <ChipModules entry={x.script} />

        <div className="explorer-shell art-body" dangerouslySetInnerHTML={{ __html: a.html }} />
        <Justify root=".art-body" />
        {a.splits > 0 ? <p className="quiet art-note">{S.splits(a.splits)}</p> : null}
      </article>
    </Shell>
  );
}
