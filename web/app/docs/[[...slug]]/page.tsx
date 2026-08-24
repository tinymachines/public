import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { allPages, pageForSlug } from "@/lib/docs";

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
}: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const { slug = [] } = await params;
  const page = pageForSlug(slug);
  if (!page) return {};
  return { title: page.title, description: page.description };
}

export default async function DocsPage({
  params,
}: PageProps<"/docs/[[...slug]]">) {
  const { slug = [] } = await params;
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
  const { default: Content } = page.file.endsWith(".mdx")
    ? await import(`../../../../docs/${page.file.slice(0, -4)}.mdx`)
    : await import(`../../../../docs/${page.file.slice(0, -3)}.md`);
  return <Content />;
}
