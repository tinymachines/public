import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import Guide from "../../../../style/STYLE.md";
import { Shell } from "@/app/components/SiteFrame";
import { Untranslated } from "@/app/components/Untranslated";

/**
 * The style guide: ../../style/STYLE.md, rendered through the same MDX
 * pipeline as the docs tree.
 *
 * The document is imported, not copied. STYLE.md is the owner's and it is
 * edited in style/ beside the tokens and the kit it describes; this route is
 * a view of it. The two cannot drift because there is only one of them.
 *
 * The shell is built here rather than in a layout.tsx on purpose. A layout at
 * app/style/ would also wrap app/style/zoo/, and layouts compose: there is no
 * way for the zoo to opt out of an ancestor. The zoo brings its own full-page
 * chrome and wants no frame around it, so the frame lives in the one page
 * that wants it.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/style")
}

export default async function StylePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  // Counted from zoo.html rather than typed, for the same reason the docs
  // navigation is derived from the tree: a number in prose is written once
  // against what was true that afternoon and nothing checks it afterwards.

  return (
    <Shell lang={lang}
        die="STY"
        title="Style guide"
        /* STYLE.md opens with its own h1. */
        titleIsHeading={false}
      >
      {/* STYLE.md is the owner's document and it is English. The zoo is
          left out of this: it is not in the sitemap and brings its own
          full-page chrome, with nothing of the house frame to hang a notice
          on. */}
      <Untranslated lang={lang} />
      <main className="prose" lang="en">
        {/* The measured chip, used the way the zoo uses it: an inline span
            carrying a figure and where the figure came from, inside a chips
            row. It is not a paragraph class. The first version of this put it
            on a <p> holding a whole sentence, which stretched an inline-flex
            component across the column and made a compact provenance stamp
            look like body copy. */}
        <p>
          This document is the why; the <Link href="/style/zoo">zoo</Link> is
          the what, and it is the normative one of the pair.
        </p>
        <Guide />
      </main>
    </Shell>
  );
}
