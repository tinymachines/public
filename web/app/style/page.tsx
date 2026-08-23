import type { Metadata } from "next";
import Link from "next/link";
import Guide from "../../../style/STYLE.md";
import { specimenCount } from "@/lib/zoo";
import { Shell } from "../components/SiteFrame";

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

export const metadata: Metadata = {
  title: "Style guide",
  description: "Two grounds, a measured palette, and the kit that follows from them.",
};

export default function StylePage() {
  // Counted from zoo.html rather than typed, for the same reason the docs
  // navigation is derived from the tree: a number in prose is written once
  // against what was true that afternoon and nothing checks it afterwards.
  const specimens = specimenCount();

  return (
    <Shell
        die="STY"
        title="Style guide"
        crumb={<><b>tinymachines</b> / style</>}
        /* STYLE.md opens with its own h1. */
        titleIsHeading={false}
      >
      <main className="prose">
        {/* The measured chip, used the way the zoo uses it: an inline span
            carrying a figure and where the figure came from, inside a chips
            row. It is not a paragraph class. The first version of this put it
            on a <p> holding a whole sentence, which stretched an inline-flex
            component across the column and made a compact provenance stamp
            look like body copy. */}
        <div className="chips">
          <span className="measured">
            <b>{specimens} specimens</b> counted from style/zoo.html at build
          </span>
        </div>
        <p>
          This document is the why; the <Link href="/style/zoo">zoo</Link> is
          the what, and it is the normative one of the pair.
        </p>
        <Guide />
      </main>
    </Shell>
  );
}
