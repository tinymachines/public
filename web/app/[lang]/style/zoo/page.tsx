import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Script from "next/script";
import { zoo } from "@/lib/zoo";

/**
 * The widget zoo, served from the file that is the zoo.
 *
 * Everything on this page comes out of ../../style/zoo.html at build time.
 * See lib/zoo.ts for why it is read rather than reimplemented.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/style/zoo", {
    title: "Widget zoo",
  description:
    "Every component in the system, rendered on the real page ground with the exact markup that produced it.",
  // The zoo is a working reference, not a document anybody should arrive at
  // from a search result. zoo.html carries the same instruction in a meta tag
  // and this is that instruction, kept.
  noindex: true,
  });
}

export default function ZooPage() {
  const { style, body, script } = zoo();

  return (
    <>
      {/* The zoo's own chrome. Scoped to this route by being rendered only
          here: STYLE.md section 6 keeps it out of the kit on purpose, because
          a zoo-only class in components.css turns up on a real page. */}
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      {/* afterInteractive rather than an inline tag, so the specimens are
          also drawn on a client-side navigation into this route. An inline
          script in the HTML runs on first load and never again. */}
      <Script id="zoo-behaviour" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}
