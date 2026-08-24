import { localize, t } from "@/lib/i18n";
import type { Lang } from "@/lib/lang";
import Link from "next/link";
import { allPages } from "@/lib/docs";
import { chip } from "@/lib/chip";
import { pieces } from "@/lib/pieces";
import { arrivedSurfaces, projects } from "@/lib/projects";
import { isHardRoute, whereToRead } from "@/lib/nav";
import { specimenCount } from "@/lib/zoo";
import { Shell } from "@/app/components/SiteFrame";
import { PieceStatus } from "@/app/components/PieceStatus";
import { Halfphi } from "@/app/components/Halfphi";

/**
 * The front page. START-HERE.md step 4.
 *
 * 6502 work front and centre, which here means the chip opens the page and
 * its six pieces close it. Between them sits the projects section, decided
 * 2026-08-24: the roof holds more than one project now, and the front page is
 * where a visitor learns that. The projects come from data/projects.json and
 * the pieces from data/pieces.json, and the two lists are different facts: a
 * project is a thing with surfaces on this site, a piece is a part of the
 * 6502 work whether or not it has an address.
 *
 * Every figure on this page is counted at build time from the thing it
 * describes: the document count from the docs tree, the specimen count from
 * zoo.html, the piece count from data/pieces.json. None of them is typed. That
 * is the rule START-HERE.md sets for prose, applied to the page most likely to
 * be written once and never checked again.
 *
 * The reachability tags are added after render by asking our own API, and the
 * page is complete without them. See components/PieceStatus.tsx.
 *
 * Composed entirely from ../../style/components.css. Nothing is drawn here.
 */

/**
 * The page's own prose, both languages side by side. The data sentences (the
 * manifest's what, the pieces' what) go through t() and the overlay instead:
 * they are data, and their translations live beside the other data
 * translations in data/ja.json. What lives here is only what this page
 * authors.
 */
const PROSE = {
  en: {
    heroTitle: (
      <>
        A chip you can
        <br />
        see inside
      </>
    ),
    ctaExplorer: "Open the explorer",
    ctaDocs: "Read the docs",
    hero: (nodes: number, transistors: number) => (
      <>
        There is no instruction decoder here, no addressing-mode table and no
        cycle-count lookup. There are {nodes} wires and {transistors} switches
        on a die photographed out of a physical chip, and the behaviour falls
        out of simulating them. A register value is read back off its own
        storage nodes; a cycle count is something that emerged rather than
        something that was written down.
      </>
    ),
    wiresSwitches: (n: number, m: number) => `${n} wires, ${m} switches`,
    measuredFrom: (d: string) => `measured from the 6502 API on ${d}`,
    projSurf: (n: number, m: number) => `${n} projects, ${m} parts`,
    fromManifest: "from the site's own project list",
    pieces: (n: number) => `${n} pieces`,
    fromPieces: "from the project's own inventory",
    documents: (n: number) => `${n} documents`,
    fromDocs: "counted from the documentation at build",
    specimens: (n: number) => `${n} specimens`,
    fromZoo: "counted from the widget zoo at build",
    theProjects: "The projects",
    projectsProse: (n: number, m: number) => (
      <>
        {n} projects live under this roof, with {m} working parts between
        them. This list and the site&rsquo;s menu are read from the same
        record, so a project cannot appear in one and be missing from the
        other.
      </>
    ),
    overview: "overview",
    startHere: "Start here if you build things",
    pieceByPiece: "The 6502 work, piece by piece",
    piecesProse: (six: number, hosted: number) => (
      <>
        Each one exists and runs. {hosted} of the {six} answer on a public
        address, and the tag beside those is measured when this page loads
        rather than asserted here. The other {six - hosted} say why they have
        no address instead of pretending to be down.
      </>
    ),
    shipsAs: "Ships as",
    code: "Code",
    dieData: "Die data",
    readHere: "read it here",
    live: "live",
    source: "source",
    whereToRead: "Where to read",
    notice: (
      <>
        NonCommercial and ShareAlike travel with everything derived from the
        visual6502 die data, which is every piece above except halfphi. Coins
        are given away and never sold, which is what keeps that question
        closed. See{" "}
        <a href="https://github.com/tinymachines/public/blob/main/NOTICE.md">
          the licence notes
        </a>{" "}
        before anything is published or priced.
      </>
    ),
  },
  ja: {
    heroTitle: (
      <>
        中まで見える
        <br />
        チップ
      </>
    ),
    ctaExplorer: "エクスプローラを開く",
    ctaDocs: "ドキュメントを読む",
    hero: (nodes: number, transistors: number) => (
      <>
        ここには命令デコーダも、アドレッシングモード表も、サイクル数の一覧も無い。あるのは、実物のチップから撮影されたダイ上の {nodes} 本の配線と{" "}
        {transistors} 個のスイッチで、動作はそれらをシミュレートした結果として現れる。レジスタの値はその記憶ノードから読み戻したもので、サイクル数は書き留められた数字ではなく、生じた数字だ。
      </>
    ),
    wiresSwitches: (n: number, m: number) => `配線 ${n} 本、スイッチ ${m} 個`,
    measuredFrom: (d: string) => `${d} に 6502 API から実測`,
    projSurf: (n: number, m: number) => `プロジェクト ${n} 件、部品 ${m} 点`,
    fromManifest: "サイト自身のプロジェクト一覧より",
    pieces: (n: number) => `ピース ${n} 個`,
    fromPieces: "プロジェクト自身の台帳より",
    documents: (n: number) => `文書 ${n} 本`,
    fromDocs: "ビルド時にドキュメントから集計",
    specimens: (n: number) => `見本 ${n} 点`,
    fromZoo: "ビルド時にウィジェット動物園から集計",
    theProjects: "プロジェクト",
    projectsProse: (n: number, m: number) => (
      <>
        この屋根の下には {n} 件のプロジェクトがあり、合わせて {m}{" "}
        の部品を持つ。この一覧もサイトのメニューも、同じ一つの記録から読まれる。だから、片方に現れてもう片方に無い、ということが起こらない。
      </>
    ),
    overview: "概要",
    startHere: "作る人はここから",
    pieceByPiece: "6502 の仕事を、ピースごとに",
    piecesProse: (six: number, hosted: number) => (
      <>
        どれも実在して動いている。{six} 個のうち {hosted}{" "}
        個は公開アドレスで応答していて、その横のタグはこのページを開いた時に実測される。ここに書かれた主張ではない。残る{" "}
        {six - hosted} 個は、落ちているふりをする代わりに、なぜアドレスを持たないかを述べる。
      </>
    ),
    shipsAs: "形態",
    code: "コード",
    dieData: "ダイデータ",
    readHere: "ここで読む",
    live: "稼働中",
    source: "ソース",
    whereToRead: "読む場所",
    notice: (
      <>
        visual6502 のダイデータに由来するすべてに NonCommercial と ShareAlike
        が引き継がれる。上のピースのうち halfphi
        を除く全部がそれに当たる。コインは配るだけで、決して売らない。それがこの問いを閉じたままにしている。公開や値付けの前に
        <a href="https://github.com/tinymachines/public/blob/main/NOTICE.md">ライセンスの注記</a>を読むこと。
      </>
    ),
  },
} as const;

export default async function Home({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const docs = allPages();
  const specimens = specimenCount();
  const six = pieces();
  const die = chip();
  const hosted = six.filter((p) => p.public_url);

  // The projects under the roof, from the same manifest the navigation and
  // the API read. The roof itself is not a project a visitor chooses between.
  const under = projects().filter((p) => p.key !== "roof" && p.landing);
  const surfacesHere = under.reduce((n, p) => n + arrivedSurfaces(p).length, 0);

  // START-HERE.md step 6. Read from the list rather than hardcoded, so a key
  // rename is a build failure here instead of a section that quietly vanishes.
  const halfphi = six.find((p) => p.key === "halfphi");
  if (!halfphi) {
    throw new Error(
      'data/pieces.json has no piece keyed "halfphi". The front page features it ' +
        "by name, so this is a build failure rather than a missing section.",
    );
  }

  return (
    <Shell lang={lang} die="6502" title="tinymachines" pageHead={false}>

      {/* The binder's H1 layout, with the masthead still the document's h1:
          this is display type on the page, not a second heading, so it is a
          styled paragraph. The lede is the same measured sentence the page
          always opened with; only the clothes changed. */}
      <section className="hero">
        {/* The document's h1. It was a styled paragraph while the masthead
            carried the name; with no page head on the front page, the
            opening claim is the heading, which is what it always read as. */}
        <h1 className="hero-title">{S.heroTitle}</h1>
        <p className="lede">{S.hero(die.nodes, die.transistors)}</p>
        <div className="hero-ctas">
          {/* A plain anchor, on purpose: the explorer's module must start
              from a fresh document (lib/nav.ts, MenuItem.hard). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn btn-primary" href={localize(lang, "/6502/explorer")}>
            {S.ctaExplorer}
          </a>
          <Link className="btn btn-ghost" href={localize(lang, "/docs")}>
            {S.ctaDocs}
          </Link>
        </div>

        {/* Inside the hero rather than after it: above 80rem the kit lays
            these into the hero's right column, which was empty viewport
            before. The chips are the page's own measured facts, which is
            what earns them the spot. Below that width they render as the
            same .chips row they always were. */}
        <div className="chips hero-chips">
        <span className="measured">
          <b>{S.wiresSwitches(die.nodes, die.transistors)}</b>{" "}
          {S.measuredFrom(die.measured_on)}
        </span>
        <span className="measured">
          <b>{S.projSurf(under.length, surfacesHere)}</b> {S.fromManifest}
        </span>
        <span className="measured">
          <b>{S.pieces(six.length)}</b> {S.fromPieces}
        </span>
        <span className="measured">
          <b>{S.documents(docs.length)}</b> {S.fromDocs}
        </span>
        <span className="measured">
          <b>{S.specimens(specimens)}</b> {S.fromZoo}
        </span>
        </div>
      </section>

      <h2 className="eyebrow">{S.theProjects}</h2>

      <p className="prose">{S.projectsProse(under.length, surfacesHere)}</p>

      <div className="piece-grid">
        {under.map((p) => {
          // The landing is a surface of its own for some projects; listing it
          // as the overview AND as a surface would be the same door twice.
          const doors = arrivedSurfaces(p).filter((s) => s.lands_at !== p.landing);
          return (
            <article key={p.key} className="rail">
              <h3>{p.name}</h3>
              <p>{t(lang, p.what)}</p>
              <p className="piece-links">
                <Link className="tag live" href={localize(lang, p.landing as string)}>
                  {S.overview}
                </Link>
                {doors.map((s) =>
                  // Anything this site does not prerender gets a plain anchor,
                  // for the reason the menu gives: the client router cannot
                  // navigate to a route the build never made.
                  s.prerendered === false ? (
                    <a key={s.key} className="tag" href={s.lands_at}>
                      {t(lang, s.nav_label ?? s.name)}
                    </a>
                  ) : isHardRoute(s.lands_at) ? (
                    // A fresh document for the explorer's pages (lib/nav.ts).
                    // eslint-disable-next-line @next/next/no-html-link-for-pages
                    <a key={s.key} className="tag" href={localize(lang, s.lands_at)}>
                      {t(lang, s.nav_label ?? s.name)}
                    </a>
                  ) : (
                    <Link key={s.key} className="tag" href={localize(lang, s.lands_at)}>
                      {t(lang, s.nav_label ?? s.name)}
                    </Link>
                  ),
                )}
              </p>
            </article>
          );
        })}
      </div>

      <h2 className="eyebrow">{S.startHere}</h2>

      <Halfphi piece={{ ...halfphi, what: t(lang, halfphi.what) }} />

      <h2 className="eyebrow">{S.pieceByPiece}</h2>

      <p className="prose">{S.piecesProse(six.length, hosted.length)}</p>

      <div className="piece-grid">
        {six.map((p) => (
          <article key={p.key} className="rail">
            <h3>
              {p.name} <PieceStatus pieceKey={p.key} />
            </h3>
            <p>{t(lang, p.what)}</p>
            <dl className="kv">
              <div>
                <dt>{S.shipsAs}</dt>
                <dd>{p.ships_as}</dd>
              </div>
              <div>
                <dt>{S.code}</dt>
                <dd>{p.code_licence}</dd>
              </div>
              <div>
                <dt>{S.dieData}</dt>
                <dd>{p.data_terms}</dd>
              </div>
            </dl>
            <p className="piece-links">
              {/* Where to READ it, which stopped being the same question as
                  where it has always answered. Two surfaces have moved onto
                  this site and this page was still sending people to their
                  subdomains. See lib/nav.ts. */}
              {(() => {
                const { href, onSite } = whereToRead(p.key, p.public_url);
                if (!href) return null;
                return onSite ? (
                  isHardRoute(href) ? (
                    // eslint-disable-next-line @next/next/no-html-link-for-pages
                    <a className="tag live" href={localize(lang, href)}>
                      {S.readHere}
                    </a>
                  ) : (
                    <Link className="tag live" href={localize(lang, href)}>
                      {S.readHere}
                    </Link>
                  )
                ) : (
                  <a className="tag" href={href}>
                    {S.live}
                  </a>
                );
              })()}
              <a className="tag" href={p.source}>
                {S.source}
              </a>
            </p>
            {p.not_hosted_because ? (
              <p className="quiet piece-note">{t(lang, p.not_hosted_because)}</p>
            ) : null}
          </article>
        ))}
      </div>

      <h2 className="eyebrow">{S.whereToRead}</h2>

      <div className="chips">
        <Link className="tag" href={localize(lang, "/docs")}>
          {t(lang, "Documentation")}
        </Link>
        <Link className="tag" href={localize(lang, "/style")}>
          {t(lang, "Style guide")}
        </Link>
        <Link className="tag" href={localize(lang, "/style/zoo")}>
          {t(lang, "Widget zoo")}
        </Link>
        {/* A plain anchor on purpose: /api is uvicorn behind nginx, not a
            page of this build, so there is nothing for the client router to
            navigate to. The lint rule started firing when the route tree
            moved under [lang], because "api" now parses as a possible lang;
            it is not one, and dynamicParams=false would 404 it anyway. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="tag" href="/api/">
          API
        </a>
      </div>

    </Shell>
  );
}
