/* eslint-disable @next/next/no-html-link-for-pages -- every archive link on
   this page points into a directory nginx serves from disk, not at a route
   this app builds. next/link would ask the client router to navigate to a page
   it does not have and land the reader on the not-found page. The manifest
   records the same fact as `prerendered: false`. */
import type { Metadata } from "next";
import { Shell } from "@/app/components/SiteFrame";

/**
 * The archive's overview, written here rather than ported.
 *
 * Everything else under /6502/archive/ is a preservation of visual6502.org and
 * is served exactly as it was recovered. This page is not that. It is a page
 * ABOUT the archive: what is in it, how much, and what it costs to say so.
 * Editorial about somebody else's site is ours, so it is written in the kit
 * rather than framed from theirs.
 *
 * The preserved pages keep their own look on purpose. Dressing a preservation
 * in this site's design would misrepresent what it is, the way retyping a
 * quotation in your own hand does. The line is drawn here: our words in our
 * voice, their site in theirs.
 *
 * Every figure below was counted on disk rather than copied from the archive's
 * own copy, and where the two differ the page says so instead of picking one.
 */

export const metadata: Metadata = {
  title: "The visual6502 archive",
  description:
    "visual6502.org, recovered from the Internet Archive: the wiki rebuilt from its wikitext, and the die photography made browsable again.",
};

export default function ArchivePage() {
  return (
    <Shell die="ARC" title="The visual6502 archive">
      {/* .prose is what sets the reading measure and the heading scale. Without
          it the copy ran the full 1056px column and the h2s rendered at body
          size, which reads as a page that forgot its own type scale. */}
      <main className="prose">
      <div className="chips">
        <span className="measured">
          <b>174 MB</b> counted on disk, 2026-08-23
        </span>
        <span className="tag live">served here</span>
      </div>

      <p>
        visual6502.org is where the die data underneath all of this came from.
        Its wiki has been answering HTTP 500 since some point after 2021: the
        MediaWiki behind it is failing, so every article is unreachable even
        though the front page still serves. This is what was recovered from the
        Internet Archive before that stopped being possible.
      </p>

      <p className="notice">
        <b>None of it is ours.</b> The pages below are preserved as they were
        captured and keep their own design, which is the point of a
        preservation. Our words are on this page; theirs are on those. The
        material is <b>CC BY-NC-SA 3.0</b>, Greg James and visual6502.org, and{" "}
        <a href="https://github.com/tinymachines/public/blob/main/NOTICE.md">
          NOTICE.md
        </a>{" "}
        says what those terms reach.
      </p>

      <h2>What is in it</h2>
      <div className="ledger">
        <div className="scroller" tabIndex={0} role="region" aria-label="The archive">
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>What it is</th>
                <th className="num">Counted</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="name">
                  <a href="/6502/archive/wiki/index.html">The wiki</a>
                </td>
                <td style={{ whiteSpace: "normal", minWidth: "20rem" }}>
                  Rebuilt from the wikitext rather than from a rendering. That is
                  the difference between preserving a copy of the pages and
                  preserving the pages: wikitext can be re-imported into a fresh
                  MediaWiki, and a screenshot of HTML cannot.
                </td>
                <td className="num">129 documents</td>
              </tr>
              <tr>
                <td className="name">
                  <a href="/6502/archive/gallery/index.html">Die photography</a>
                </td>
                <td style={{ whiteSpace: "normal" }}>
                  The photographs the netlist was traced from, made browsable
                  again. The archive&rsquo;s own index says 40 chips and 516
                  photographs; the file count is higher because each one has a
                  thumbnail.
                </td>
                <td className="num">1,028 files</td>
              </tr>
              <tr>
                <td className="name">
                  <a href="/6502/archive/mirror.html">The original site</a>
                </td>
                <td style={{ whiteSpace: "normal" }}>
                  The mirror exactly as captured, for when the question is what
                  the page actually said rather than what it meant.
                </td>
                <td className="num">as captured</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="tbl-foot">
          <span>174 MB, counted on disk</span>
          <span>Preserved, not restyled.</span>
        </div>
      </div>

      <h2>Where it is served from</h2>
      <p>
        The same directory the 6502 site serves it from, aliased here rather
        than copied. One publisher, one set of bytes, a second address it also
        owns. Copying a preservation of NonCommercial material into this
        repository would be redistributing it, which{" "}
        <a href="https://github.com/tinymachines/public/blob/main/NOTICE.md">
          NOTICE.md
        </a>{" "}
        is explicit about not doing by accident.
      </p>
      <p>
        Its internal links were absolute and rooted at the old site, so under
        this prefix they pointed at pages that do not exist here. They are
        rewritten as the bytes go out, because the files themselves are not
        ours to edit.
      </p>
      </main>
    </Shell>
  );
}
