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
import { Justified } from "@/app/components/Justified";
import { ChipModules } from "../../explorer/ChipModules";
import "../../explorer/explorer.css";
import "./article.css";

/**
 * The companion page: a tool's prose as an article, with the tool in it.
 *
 * Owner's call, 2026-08-27: a page with a large amount of text is a page
 * nobody reads, and the tracer had two blobs of it under a full-viewport
 * instrument. So each tool gets a companion at /6502/<tool>/article: the
 * same words (lib/article.ts changes none of them; it lifts them out and
 * splits the one 20,661-character paragraph at sentence ends), set in a
 * reading column and justified through pretext (components/Justified.tsx),
 * with the instrument itself embedded as a live figure, running, with its
 * own controls. The tool page stays what it is: the instrument, full width,
 * first. This is the magazine; that is the bench.
 *
 * The figure is the tool's whole body with its prose sections removed, and
 * its script is booted exactly as the tool page boots it (ChipModules), so
 * what runs in the figure is what runs on the bench. Moving the tool's own
 * pieces (the watch, the code, a block card) into the prose as inline
 * widgets is the next step and needs the tool's markup contract; the figure
 * is the first step, and it is live.
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
  en: { bench: "The bench", benchNote: "The instrument, running here as it runs on its own page. Its controls are its own.", open: "Open the tool", splits: (n: number) => `${n} paragraph breaks on this page are the article's, not the author's: one long paragraph was split at sentence ends so it could be read. Every word is the tool page's.` , chars: (n: number) => `${n.toLocaleString("en-US")} characters` },
  ja: { bench: "ベンチ", benchNote: "この計器は、自身のページで動くのと同じようにここで動く。操作はそれ自身のもの。", open: "ツールを開く", splits: (n: number) => `このページの段落の切れ目のうち ${n} 箇所は記事側のもので、著者のものではない: 長い一段落を読めるよう文末で分けた。言葉はすべてツールページのまま。`, chars: (n: number) => `${n.toLocaleString("en-US")} 文字` },
} as const;

export default async function ArticlePage({ params }: { params: Promise<{ lang: Lang; page: string }> }) {
  const { lang, page } = await params;
  const file = fileFor(page);
  if (!file) throw new Error(`No tool page for slug ${JSON.stringify(page)}.`);
  const S = L[lang];
  const a = article(file);
  const x = explorer(file);
  // The figure: the tool's body with its prose sections cut out, since the
  // prose is the article now and would otherwise be on the page twice.
  // Also without its hero: that is the page opener, and inside a figure it
  // would be a second h1 on a document that has one. What remains is the
  // instrument; a heading it still carries is demoted, not deleted.
  const body = x.body
    .replace(/<section class="wrap sec bp-prose[\s\S]*?<\/section>/g, "")
    .replace(/<section class="hero[^"]*"[\s\S]*?<\/section>/g, "")
    .replace(/<h1\b/g, "<h2 data-was-h1").replace(/<\/h1>/g, "</h2>");
  const name = t(lang, explorerLabel(page) ?? a.title);
  const lede = a.blocks.find((b) => b.kind === "lede");
  const eyebrow = a.blocks.find((b) => b.kind === "eyebrow");
  const rest = a.blocks.filter((b) => b !== lede && b !== eyebrow);

  return (
    <Shell lang={lang} die="6502" title={name} titleIsHeading={false}>
      <article className="art" data-chip-api={chipApi()}>
        <header className="art-head">
          {eyebrow ? <p className="eyebrow">{eyebrow.text}</p> : null}
          <h1>{name}</h1>
          {lede && lede.kind === "lede" ? <Justified runs={lede.runs} className="lede" /> : null}
          <p className="art-meta quiet">
            {S.chars(a.chars)} · <Link href={localize(lang, `/6502/${page}`)}>{S.open}</Link>
          </p>
        </header>

        <figure className="art-bench">
          <figcaption><b>{S.bench}</b> · {S.benchNote}</figcaption>
          <div className="art-bench-frame">
            <style dangerouslySetInnerHTML={{ __html: x.style }} />
            <div className="explorer-shell" dangerouslySetInnerHTML={{ __html: body }} />
            <ChipModules entry={x.script} />
          </div>
        </figure>

        <div className="art-body prose">
          {rest.map((b, i) => {
            if (b.kind === "h2") return <h2 key={i} id={b.id}>{b.text}</h2>;
            if (b.kind === "eyebrow") return <p key={i} className="eyebrow">{b.text}</p>;
            if (b.kind === "lede") return <Justified key={i} runs={b.runs} className="lede" />;
            return <Justified key={i} runs={b.runs} />;
          })}
          {a.splits > 0 ? <p className="quiet art-note">{S.splits(a.splits)}</p> : null}
        </div>
      </article>
    </Shell>
  );
}
