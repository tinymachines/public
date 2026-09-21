import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { explorer } from "@/lib/explorer";
import { article, articlePages } from "@/lib/article";
import { explorerLabel } from "@/lib/explorer-menu";
import { Shell } from "@/app/components/SiteFrame";
import { Untranslated } from "@/app/components/Untranslated";
import "./reading.css";

/**
 * /6502/reading: the long reads, listed.
 *
 * Every tool page carries its prose, and each one also exists as an article
 * at /6502/<tool>/article. The map at /style/map measured what that cost:
 * fifteen articles, the longest prose on the site, each reachable from
 * exactly one place, the strip under its own instrument. A reader who wants
 * to READ rather than to operate an instrument had nowhere to start.
 *
 * So this is the second door, and the only one they share. Nothing here is
 * written twice: every title, lede and length is read from the tool's own
 * page through lib/explorer.ts and lib/article.ts, which is the same pair the
 * article pages are built from. A tool whose prose is removed upstream leaves
 * this list by itself.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502/reading", {
    title: "The long reads",
    description:
      "Every tool's prose as an article: what the instrument above it is doing, written to be read end to end.",
  });
}

export default async function ReadingPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;

  const reads = articlePages()
    .map((p) => {
      const x = explorer(p.file);
      const a = article(p.file);
      return {
        slug: p.slug,
        title: x.title,
        description: x.description,
        label: explorerLabel(p.slug),
        // Counted off the prose this page would render, not estimated from
        // the file: lib/article.ts hands back the sections as HTML, and the
        // words are what is left when the markup comes out.
        words: a.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length,
        chunks: a.chunks,
      };
    })
    .sort((a, b) => b.words - a.words);

  const total = reads.reduce((n, r) => n + r.words, 0);

  return (
    <Shell lang={lang} die="RDG" title={t(lang, "The long reads")}>
      <Untranslated lang={lang} />
      <div className="prose" lang="en">
        <p>
          Each of the chip&rsquo;s tools carries an instrument and the prose that explains it. The
          prose also stands on its own, set as an article and justified like a page of a book. This
          is the list of them, longest first.
        </p>
        <p className="measured">
          <b>{reads.length}</b> articles, <b>{total.toLocaleString("en")}</b> words, counted from the
          prose each one renders
        </p>
      </div>

      <ol className="reads">
        {reads.map((r) => (
          <li key={r.slug} className="read">
            <p className="read-eyebrow">{r.label}</p>
            <h2>
              <Link href={localize(lang, `/6502/${r.slug}/article`)}>{r.title}</Link>
            </h2>
            {r.description ? <p className="read-lede">{r.description}</p> : null}
            <p className="read-meta">
              <span>{r.words.toLocaleString("en")} words</span>
              {r.chunks ? <span>{r.chunks} sections</span> : null}
              <Link href={localize(lang, `/6502/${r.slug}`)}>the instrument</Link>
            </p>
          </li>
        ))}
      </ol>
    </Shell>
  );
}
