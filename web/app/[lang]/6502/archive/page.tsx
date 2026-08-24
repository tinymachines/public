/* eslint-disable @next/next/no-html-link-for-pages -- every archive link on
   this page points into a directory nginx serves from disk, not at a route
   this app builds. next/link would ask the client router to navigate to a page
   it does not have and land the reader on the not-found page. The manifest
   records the same fact as `prerendered: false`. */
import type { Lang } from "@/lib/lang";
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

const PROSE = {
  en: {
    counted: (
      <>
        <b>174 MB</b> counted on disk, 2026-08-23
      </>
    ),
    served: "served here",
    intro: (
      <>
        visual6502.org is where the die data underneath all of this came from.
        Its wiki has been answering HTTP 500 since some point after 2021: the
        MediaWiki behind it is failing, so every article is unreachable even
        though the front page still serves. This is what was recovered from the
        Internet Archive before that stopped being possible.
      </>
    ),
    notOurs: (
      <>
        <b>None of it is ours.</b> The pages below are preserved as they were
        captured and keep their own design, which is the point of a
        preservation. Our words are on this page; theirs are on those. The
        material is <b>CC BY-NC-SA 3.0</b>, Greg James and visual6502.org, and{" "}
        <a href="https://github.com/tinymachines/public/blob/main/NOTICE.md">
          NOTICE.md
        </a>{" "}
        says what those terms reach.
      </>
    ),
    whatsIn: "What is in it",
    thPart: "Part",
    thWhat: "What it is",
    thCounted: "Counted",
    wiki: "The wiki",
    wikiWhat: (
      <>
        Rebuilt from the wikitext rather than from a rendering. That is the
        difference between preserving a copy of the pages and preserving the
        pages: wikitext can be re-imported into a fresh MediaWiki, and a
        screenshot of HTML cannot.
      </>
    ),
    wikiCount: "129 documents",
    gallery: "Die photography",
    galleryWhat: (
      <>
        The photographs the netlist was traced from, made browsable again. The
        archive&rsquo;s own index says 40 chips and 516 photographs; the file
        count is higher because each one has a thumbnail.
      </>
    ),
    galleryCount: "1,028 files",
    mirror: "The original site",
    mirrorWhat: (
      <>
        The mirror exactly as captured, for when the question is what the page
        actually said rather than what it meant.
      </>
    ),
    mirrorCount: "as captured",
    footLeft: "174 MB, counted on disk",
    footRight: "Preserved, not restyled.",
    whereTitle: "Where it is served from",
    where1: (
      <>
        The same directory the 6502 site serves it from, aliased here rather
        than copied. One publisher, one set of bytes, a second address it also
        owns. Copying a preservation of NonCommercial material into this
        repository would be redistributing it, which{" "}
        <a href="https://github.com/tinymachines/public/blob/main/NOTICE.md">
          NOTICE.md
        </a>{" "}
        is explicit about not doing by accident.
      </>
    ),
    where2: (
      <>
        Its internal links were absolute and rooted at the old site, so under
        this prefix they pointed at pages that do not exist here. They are
        rewritten as the bytes go out, because the files themselves are not
        ours to edit.
      </>
    ),
  },
  ja: {
    counted: (
      <>
        <b>174 MB</b> をディスク上で集計、2026-08-23
      </>
    ),
    served: "ここから配信",
    intro: (
      <>
        visual6502.org は、ここにあるすべての土台のダイデータが生まれた場所だ。そこの wiki は 2021 年以降のある時点から HTTP 500 を返し続けている:
        背後の MediaWiki が壊れていて、フロントページは今も表示されるのに、記事はどれも読めない。これは、それが不可能になる前に Internet Archive
        から復元したものだ。
      </>
    ),
    notOurs: (
      <>
        <b>どれも私たちのものではない。</b>
        以下のページは捕捉された当時のまま保存され、独自のデザインを保っている。それこそが保存というものの要点だ。私たちの言葉はこのページに、彼らの言葉はあちらのページにある。素材は <b>CC BY-NC-SA 3.0</b>、Greg James
        と visual6502.org のもので、その条件が及ぶ範囲は{" "}
        <a href="https://github.com/tinymachines/public/blob/main/NOTICE.md">
          NOTICE.md
        </a>{" "}
        が述べている。
      </>
    ),
    whatsIn: "何が入っているか",
    thPart: "部分",
    thWhat: "何であるか",
    thCounted: "集計",
    wiki: "wiki",
    wikiWhat: (
      <>
        レンダリングからではなく、wikitext から再構築した。ページの写しを保存することと、ページそのものを保存することの違いがそこにある:
        wikitext は新しい MediaWiki に再インポートできるが、HTML のスクリーンショットにはそれができない。
      </>
    ),
    wikiCount: "文書 129 本",
    gallery: "ダイ写真",
    galleryWhat: (
      <>
        ネットリストのトレース元になった写真を、再び閲覧可能にしたもの。アーカイブ自身の索引はチップ 40 個、写真 516 枚と言っている。ファイル数がそれより多いのは、各写真にサムネイルが付いているからだ。
      </>
    ),
    galleryCount: "ファイル 1,028 個",
    mirror: "元のサイト",
    mirrorWhat: (
      <>
        捕捉されたままのミラー。ページが何を意味していたかではなく、実際に何と書いてあったかが問いになった時のために。
      </>
    ),
    mirrorCount: "捕捉時のまま",
    footLeft: "174 MB、ディスク上で集計",
    footRight: "保存であって、再装丁ではない。",
    whereTitle: "どこから配信されているか",
    where1: (
      <>
        6502 サイトが配信しているのと同じディレクトリを、コピーせずにここへエイリアスしている。一つの発行者、一組のバイト列、発行者自身が持つ二つ目のアドレス。NonCommercial な素材の保存物をこのリポジトリにコピーすれば再配布にあたる。それをうっかりやらないことについて{" "}
        <a href="https://github.com/tinymachines/public/blob/main/NOTICE.md">
          NOTICE.md
        </a>{" "}
        は明示的だ。
      </>
    ),
    where2: (
      <>
        内部リンクは旧サイトを根とする絶対パスだったので、この接頭辞の下では存在しないページを指していた。ファイル自体は編集してよいものではないから、バイト列が出て行く途中で書き換えている。
      </>
    ),
  },
} as const;

export default async function ArchivePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  return (
    <Shell lang={lang} die="ARC" title="The visual6502 archive">
      {/* .prose is what sets the reading measure and the heading scale. Without
          it the copy ran the full 1056px column and the h2s rendered at body
          size, which reads as a page that forgot its own type scale. */}
      <main className="prose">
      <div className="chips">
        <span className="measured">{S.counted}</span>
        <span className="tag live">{S.served}</span>
      </div>

      <p>{S.intro}</p>

      <p className="notice">{S.notOurs}</p>

      <h2>{S.whatsIn}</h2>
      <div className="ledger">
        <div className="scroller" tabIndex={0} role="region" aria-label="The archive">
          <table>
            <thead>
              <tr>
                <th>{S.thPart}</th>
                <th>{S.thWhat}</th>
                <th className="num">{S.thCounted}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="name">
                  <a href="/6502/archive/wiki/index.html">{S.wiki}</a>
                </td>
                <td style={{ whiteSpace: "normal", minWidth: "20rem" }}>{S.wikiWhat}</td>
                <td className="num">{S.wikiCount}</td>
              </tr>
              <tr>
                <td className="name">
                  <a href="/6502/archive/gallery/index.html">{S.gallery}</a>
                </td>
                <td style={{ whiteSpace: "normal" }}>{S.galleryWhat}</td>
                <td className="num">{S.galleryCount}</td>
              </tr>
              <tr>
                <td className="name">
                  <a href="/6502/archive/mirror.html">{S.mirror}</a>
                </td>
                <td style={{ whiteSpace: "normal" }}>{S.mirrorWhat}</td>
                <td className="num">{S.mirrorCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2>{S.whereTitle}</h2>
      <p>{S.where1}</p>
      <p>{S.where2}</p>
      </main>
    </Shell>
  );
}
