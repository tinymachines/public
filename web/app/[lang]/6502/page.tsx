import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { localize, t } from "@/lib/i18n";
import { arrivedSurfaces, project, measuredOn } from "@/lib/projects";
import { explorerMenu } from "@/lib/explorer-menu";
import { allPages } from "@/lib/docs";
import Link from "next/link";
import { Shell } from "@/app/components/SiteFrame";

/**
 * /6502: the door to the project, and the lesson behind it.
 *
 * Rebuilt 2026-08-25 from a move ledger into a landing. The order is the
 * order a visitor actually takes: get a token, build a cartridge (with the
 * tools you already use, which is what the MCP server is for), publish it
 * and watch the chip measure it, then read the walk to see how one
 * instruction goes through the silicon. Below that, the instruments, grouped
 * the way the explorer's own menu groups them, and the reading.
 *
 * Nothing listed is typed here: the instrument clusters are the explorer's
 * menu, the reading is the docs tree, and the parts table at the foot is the
 * manifest. What IS written is the lesson's copy, in both languages.
 *
 * "Mint a free token" is a real verb since 2026-08-25: the roof API's public
 * mint (POST /api/v1/tokens) hands out the registry's own token, and the
 * editor carries the button.
 *
 * Nothing here is typed. The rows come from data/projects.json, which is the
 * same file PROJECTS.md points at and api/pieces.py is checked against, so
 * "which surfaces this project has" has exactly one answer. Adding a surface
 * to the manifest adds a row here; deleting one removes it. The alternative
 * was a hand-maintained list, which is how ten navs in the 6502 repo drifted
 * three ways before anybody noticed.
 *
 * The proposed landing paths are marked as proposals, because they are. Moving
 * a public path is a redirect map, and writing "/6502/games" here as though it
 * were settled would make it read as decided the next time somebody looks.
 */

export const metadata: Metadata = {
  title: "6502",
  description: "A transistor-level MOS 6502, and everything built on it.",
};

const PROSE = {
  en: {
    surfaces: (n: number, d: string) => (
      <>
        <b>{n} parts,</b> each address probed {d}
      </>
    ),
    hereCount: (h: number, n: number) => (
      <>
        <b>
          {h} of {n} parts are here.
        </b>{" "}
        Every one of them still answers at its own subdomain as well, because
        nothing has been switched off. This page is the plan and the current
        addresses, not a redirect.
      </>
    ),
    theSurfaces: "The parts",
    thSurface: "Part",
    thWhat: "What it is",
    thToday: "Answers today",
    thLands: "Lands at",
    thStatus: "Status",
    proposed: "proposed",
    settled: (a: number, b: number) => `${a} of ${b} final addresses settled`,
    redirectMap: "An address that moves becomes a redirect; published links keep working.",
    whyTitle: "Why this page looks like the rest of the site",
    why1: (
      <>
        It is one design system. Every project here shares the same
        components, the same type scale and the same spacing; nothing was
        forked to make this page. The 6502 look is the house look, because
        the palette was sampled for this work in the first place.
      </>
    ),
    why2: (
      <>
        What no project may change is the part that carries meaning. Blue is
        ACTIVE, orange is ATTENTION, red means an assertion failed, and the
        drive ramp is the engine&rsquo;s own state scale given colour. A
        project that could redefine those would not have its own accent; it
        would have a failed assertion that looks fine.
      </>
    ),
  },
  ja: {
    surfaces: (n: number, d: string) => (
      <>
        <b>部品 {n} 点。</b>各アドレスの応答を {d} に確認
      </>
    ),
    hereCount: (h: number, n: number) => (
      <>
        <b>
          {n} 点中 {h} 点がここにある。
        </b>{" "}
        どれも元のサブドメインでも今なお応答している。何も止めていないからだ。このページは計画と現在のアドレスであって、リダイレクトではない。
      </>
    ),
    theSurfaces: "部品一覧",
    thSurface: "部品",
    thWhat: "何であるか",
    thToday: "今日応答する場所",
    thLands: "着地先",
    thStatus: "状態",
    proposed: "提案",
    settled: (a: number, b: number) => `最終アドレス ${b} 件中 ${a} 件が確定`,
    redirectMap: "動くアドレスはリダイレクトになる。公開済みのリンクは切れない。",
    whyTitle: "なぜこのページはサイトの他と同じ見た目なのか",
    why1: (
      <>
        一つのデザインシステムだからだ。ここにあるどのプロジェクトも、同じコンポーネント、同じ活字階梯、同じ余白を使う。このページのために何もフォークされていない。6502 の見た目がそのまま家の見た目なのは、パレットがそもそもこの仕事のために採られたものだからだ。
      </>
    ),
    why2: (
      <>
        どのプロジェクトも変えてはならないのは、意味を運ぶ部分だ。青は
        ACTIVE、橙は ATTENTION、赤は表明の失敗を意味し、ドライブの傾斜はエンジン自身の状態の目盛りに色を与えたものだ。それらを定義し直せるプロジェクトは自分のアクセントを持たないだろう。持つのは、正常に見える失敗した表明だ。
      </>
    ),
  },
} as const;

const LESSON = {
  en: {
    eyebrow: "The lesson",
    lede: (
      <>
        Everything on this page runs on a transistor-level MOS 6502: not a
        model of one, the die itself, simulated switch by switch. The fastest
        way in is to make it run something of yours.
      </>
    ),
    ctaToken: "Mint a free token",
    ctaBuild: "Build a cart with your AI tool",
    ctaWalk: "Read the walk",
    steps: [
      {
        n: "1",
        title: "Mint a free token",
        body: "A token is your handle in the registry and your key to the chip API. Mint one in the editor: free, one click, shown once. It is yours to claim a handle with and publish under.",
        href: "/6502/manage#mint",
        link: "Mint one in the editor",
      },
      {
        n: "2",
        title: "Build a cartridge",
        body: "A cartridge is a ROM, its tiles and the contract it was written to, in one file. Write it by hand against the console contract, or hand the contract to the AI tool you already use: the MCP server gives it five tools, each a whole errand.",
        href: "/docs/6502/mcp",
        link: "MCP: five tools for a model",
        more: [
          { href: "/docs/6502/cartridges", label: "Cartridges" },
          { href: "/docs/6502/the-console-contract", label: "The console contract" },
          { href: "/docs/6502/two-ways-in", label: "Two ways in: page or HTTP" },
        ],
      },
      {
        n: "3",
        title: "Publish it, and the chip measures it",
        body: "Publishing does not upload a claim. The registry runs your cartridge on the die before it is listed, and what it shows beside your ROM is what the chip did: whether it booted, how many frames it finished, the half-cycles each one cost, the tiles it used.",
        href: "/6502/builders",
        link: "What others have published",
      },
      {
        n: "4",
        title: "Then follow one instruction into the silicon",
        body: "The walk takes one Snake instruction five cycles deep, with the schematics pulled live from the switch network. It is the lesson the whole site is set up to teach: how a line of code becomes gates opening.",
        href: "/docs/6502/walk-snake",
        link: "Snake, one instruction deep",
      },
    ],
    instruments: "The instruments",
    instrumentsLede: "Every view is the same chip, lit by what it is doing. Grouped the way the explorer groups them.",
    places: "Places",
    placesLede: "The rest of the project, each one a page here.",
    reading: "Reading",
    readingLede: "The documentation for this project, in the order it is meant to be read.",
    parts: "Where each part answers",
    thPart: "Part",
    thWhat: "What it is",
    thToday: "Answers today",
    thLands: "Lands at",
    thStatus: "Status",
    proposed: "proposed",
  },
  ja: {
    eyebrow: "レッスン",
    lede: (
      <>
        このページにあるものはすべて、トランジスタレベルの MOS 6502
        の上で動く。モデルではなく、ダイそのものをスイッチ単位でシミュレート
        したものだ。いちばん早い入り方は、自分の書いたものをそこで走らせることだ。
      </>
    ),
    ctaToken: "無料のトークンを鋳造",
    ctaBuild: "AI ツールでカートを作る",
    ctaWalk: "ウォークを読む",
    steps: [
      {
        n: "1",
        title: "無料のトークンを鋳造する",
        body: "トークンはレジストリでのあなたのハンドルであり、チップ API への鍵だ。エディタで鋳造する: 無料、ワンクリック、表示は一度きり。それでハンドルを取得し、その名で公開する。",
        href: "/6502/manage#mint",
        link: "エディタで鋳造する",
      },
      {
        n: "2",
        title: "カートリッジを作る",
        body: "カートリッジは、ROM とタイルと、それが書かれた規約を一つのファイルにしたものだ。コンソール規約に沿って手で書くか、その規約をいつも使っている AI ツールに渡す: MCP サーバはモデルに五つの道具を与え、それぞれが一仕事を丸ごと担う。",
        href: "/docs/6502/mcp",
        link: "MCP: モデルのための五つの道具",
        more: [
          { href: "/docs/6502/cartridges", label: "カートリッジ" },
          { href: "/docs/6502/the-console-contract", label: "コンソール規約" },
          { href: "/docs/6502/two-ways-in", label: "二つの入口: ページか HTTP か" },
        ],
      },
      {
        n: "3",
        title: "公開すると、チップが実測する",
        body: "公開は主張のアップロードではない。レジストリは掲載前にあなたのカートリッジをダイの上で走らせ、ROM の横に表示するのはチップがしたことだ: ブートしたか、何フレーム完了したか、各フレームに要した半サイクル数、使われたタイル。",
        href: "/6502/builders",
        link: "他の人が公開したもの",
      },
      {
        n: "4",
        title: "そして一命令をシリコンの中まで追う",
        body: "ウォークは Snake の一命令を五サイクルぶん深く追い、回路図はスイッチ網からその場で引き出される。このサイト全体が教えるために組まれたレッスンだ: 一行のコードが、開くゲートになるまで。",
        href: "/docs/6502/walk-snake",
        link: "Snake を一命令ぶん深く",
      },
    ],
    instruments: "計器",
    instrumentsLede: "どのビューも同じチップが、いま何をしているかで光る。エクスプローラ自身の分け方で並べている。",
    places: "場所",
    placesLede: "プロジェクトの残り。どれもここのページだ。",
    reading: "読みもの",
    readingLede: "このプロジェクトのドキュメント。読むべき順に。",
    parts: "各部品が応答する場所",
    thPart: "部品",
    thWhat: "何であるか",
    thToday: "今日応答する場所",
    thLands: "着地先",
    thStatus: "状態",
    proposed: "提案",
  },
} as const;

export default async function ProjectPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const T = LESSON[lang];
  const p = project("6502");

  // The explorer's own clusters, as it groups them, minus the two that are
  // not instruments: "Developers" is one link off the estate and "About" is
  // the explorer's own colophon. Both stay in the menu.
  const clusters = explorerMenu().filter((g) => !/^(Developers|About)$/.test(g.title));

  // The parts that are pages here and not instruments of the explorer: the
  // console, the editor, the registry, the lab, the archive, the API.
  const places = arrivedSurfaces(p).filter((s) => s.lands_at !== "/6502/explorer");

  // The project's documents, every one, in the tree's own order: the tree
  // already puts the written pages first and the pulled analyses after.
  const reading = allPages().filter((d) => d.route.startsWith("/docs/6502/"));

  return (
    <Shell lang={lang} die="6502" title={p.name}>
      <div className="chips">
        <span className="measured">{S.surfaces(p.surfaces.length, measuredOn())}</span>
        <span className={p.status === "serving" ? "tag live" : "tag warn"}>{t(lang, p.status)}</span>
      </div>

      <section className="hero">
        <p className="lede">{T.lede}</p>
        <div className="hero-ctas">
          <Link className="btn btn-primary" href={localize(lang, "/6502/manage#mint")}>{T.ctaToken}</Link>
          <Link className="btn btn-ghost" href={localize(lang, "/docs/6502/mcp")}>{T.ctaBuild}</Link>
          <Link className="btn btn-ghost" href={localize(lang, "/docs/6502/walk-snake")}>{T.ctaWalk}</Link>
        </div>
      </section>

      <h2 className="eyebrow">{T.eyebrow}</h2>
      <ol className="lesson">
        {T.steps.map((st) => (
          <li key={st.n} className="step">
            <span className="step-n" aria-hidden="true">{st.n}</span>
            <h3>{st.title}</h3>
            <p>{st.body}</p>
            <p className="step-links">
              <Link className="tag live" href={localize(lang, st.href)}>{st.link}</Link>
              {"more" in st
                ? st.more.map((m) => (
                    <Link key={m.href} className="tag" href={localize(lang, m.href)}>{m.label}</Link>
                  ))
                : null}
            </p>
          </li>
        ))}
      </ol>

      <h2 className="eyebrow">{T.instruments}</h2>
      <p className="prose">{T.instrumentsLede}</p>
      <div className="piece-grid">
        {clusters.map((g) => (
          <article key={g.title} className="rail">
            <h3>{t(lang, g.title)}</h3>
            <ul className="rail-list">
              {g.items.map((it) => (
                <li key={it.href}>
                  {/* Plain anchors on purpose: the explorer's pages start
                      from a fresh document (lib/nav.ts, MenuItem.hard). */}
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a href={localize(lang, it.href)}>{t(lang, it.label)}</a>
                  {it.hint ? <span>{t(lang, it.hint)}</span> : null}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <h2 className="eyebrow">{T.places}</h2>
      <p className="prose">{T.placesLede}</p>
      <div className="piece-grid">
        {places.map((s) => (
          <article key={s.key} className="rail">
            <h3>{t(lang, s.nav_label ?? s.name)}</h3>
            <p>{t(lang, s.what)}</p>
            <p className="piece-links">
              {s.prerendered === false ? (
                <a className="tag live" href={s.lands_at}>{t(lang, s.nav_label ?? s.name)}</a>
              ) : (
                <Link className="tag live" href={localize(lang, s.lands_at)}>{t(lang, s.nav_label ?? s.name)}</Link>
              )}
            </p>
          </article>
        ))}
      </div>

      <h2 className="eyebrow">{T.reading}</h2>
      <p className="prose">{T.readingLede}</p>
      <ul className="reading-list">
        {reading.map((d) => (
          <li key={d.route}>
            <Link href={localize(lang, d.route)}>{t(lang, d.title)}</Link>
            {d.description ? <span>{t(lang, d.description.replace(/\.$/, ""))}</span> : null}
          </li>
        ))}
      </ul>

      <h2 className="eyebrow">{T.parts}</h2>
      <div className="ledger">
        <div className="scroller" tabIndex={0} role="region" aria-label="6502 parts">
          <table>
            <thead>
              <tr>
                <th>{T.thPart}</th>
                <th>{T.thWhat}</th>
                <th>{T.thToday}</th>
                <th>{T.thLands}</th>
                <th>{T.thStatus}</th>
              </tr>
            </thead>
            <tbody>
              {p.surfaces.map((s) => (
                <tr key={s.key}>
                  <td className="name">{t(lang, s.nav_label ?? s.name)}</td>
                  <td style={{ whiteSpace: "normal", minWidth: "18rem" }}>{t(lang, s.what)}</td>
                  <td>
                    <a data-address href={s.serves_today}>{s.serves_today.replace("https://", "")}</a>
                  </td>
                  <td>
                    {s.lands_at}{" "}
                    {s.lands_at_settled ? null : <span className="tag warn">{T.proposed}</span>}
                  </td>
                  <td>
                    <span className={s.status === "here" ? "tag live" : "tag"}>{t(lang, s.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
