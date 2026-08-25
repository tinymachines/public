import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { allPages, pageForSlug } from "@/lib/docs";
import { t } from "@/lib/i18n";
import { abs, pageMeta } from "@/lib/seo";
import { localize } from "@/lib/lang";
import { JsonLd } from "@/app/components/JsonLd";

/**
 * Every docs URL, and the content behind it.
 *
 * The route is the file's path in ../docs and nothing else. There is no map
 * from slug to file, because a map is a second copy of where a page lives.
 */

// Reading the tree validates every page in it, so a missing title anywhere
// fails the build here rather than 404ing one route at a time in production.
export function generateStaticParams() {
  return allPages().map((p) => ({ slug: p.slug.length ? p.slug : undefined }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/docs/[[...slug]]">): Promise<Metadata> {
  const { lang, slug = [] } = await params;
  const page = pageForSlug(slug);
  if (!page) return {};
  return pageMeta(lang, slug.length ? `/docs/${slug.join("/")}` : "/docs", {
    title: page.title,
    description: page.description ?? "",
    type: "article",
  });
}

/**
 * Whether a Japanese translation of this document exists.
 *
 * The tree, the ordering and the navigation stay derived from the English
 * files: docs/ja/ is a shadow of bodies, never a second structure that could
 * disagree about what pages exist. A document with no Japanese yet serves its
 * English body under the Japanese chrome, with a notice ON that page saying
 * so; a 404 would punish the reader for our backlog, and machine translation
 * would put words in the owner's mouth. The notice is rendered here, next to
 * the import that decides it, so it appears exactly when the fallback does
 * and nowhere else. The shell used to carry a site-wide version, which
 * inverted as the translation landed: it showed on translated pages and
 * missed the untranslated ones.
 */
function hasJa(file: string): boolean {
  // Shadows are .md only; the one .mdx document needs its interactive parts
  // rebuilt to be translated, not just its prose, so it stays English until
  // somebody does that deliberately.
  if (!file.endsWith(".md")) return false;
  return fs.existsSync(path.join(process.cwd(), "..", "docs", "ja", file));
}

export default async function DocsPage({
  params,
}: PageProps<"/[lang]/docs/[[...slug]]">) {
  const { lang, slug = [] } = await params;
  const page = pageForSlug(slug);
  if (!page) notFound();

  // The file is imported through the MDX loader configured in next.config.ts,
  // so .md and .mdx behave identically and an .mdx page can use components.
  //
  // Two templates rather than one, so each ends in a static extension. A
  // dynamic import is a CONTEXT: the bundler includes every file the template
  // could name, and `docs/${page.file}` could name anything in the tree, so
  // the day a zip and a folder of photographs arrived in docs/ (the style
  // guide, in flight), the build failed on files no page ever imports. With
  // the extension static, the context is exactly the pages.
  const useJa = lang === "ja" && hasJa(page.file);
  const { default: Content } = useJa
    ? await import(`../../../../../docs/ja/${page.file.slice(0, -3)}.md`)
    : page.file.endsWith(".mdx")
      ? await import(`../../../../../docs/${page.file.slice(0, -4)}.mdx`)
      : await import(`../../../../../docs/${page.file.slice(0, -3)}.md`);
  const docPath = slug.length ? `/docs/${slug.join("/")}` : "/docs";
  return (
    <>
      {/* The article as a crawler reads it. inLanguage is the language of the
          BODY, so an untranslated document under /ja says "en", which is
          the truth the notice below also tells the reader. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: t(lang as "en" | "ja", page.title),
          description: page.description ? t(lang as "en" | "ja", page.description) : undefined,
          inLanguage: useJa ? "ja" : "en",
          url: abs(localize(lang as "en" | "ja", docPath)),
          isPartOf: { "@type": "WebSite", name: "tinymachines", url: abs("/") },
        }}
      />
      {lang === "ja" && !useJa ? (
        <p className="notice" lang="ja">
          この文書はまだ翻訳されていません。本文は英語のまま表示されています。
        </p>
      ) : null}
      <Content />
    </>
  );
}
