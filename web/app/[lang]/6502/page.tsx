import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { project } from "@/lib/projects";
import { LESSON } from "./lesson";
import { TrackGrid } from "./Tracks";
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

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502")
}

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

export default async function ProjectPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const T = LESSON[lang];
  const p = project("6502");

  return (
    <Shell lang={lang} die="6502" title={p.name}>
      <section className="hero">
        <p className="lede">{T.lede}</p>
        <div className="hero-ctas">
          <Link className="btn btn-primary" href={localize(lang, "/6502/manage#mint")}>{T.ctaToken}</Link>
          <Link className="btn btn-ghost" href={localize(lang, "/docs/6502/build-your-first-cart")}>{T.ctaBuild}</Link>
          <Link className="btn btn-ghost" href={localize(lang, "/docs/6502/walk-snake")}>{T.ctaWalk}</Link>
        </div>
      </section>

      {/* The four tracks. Each is a door with its own floor behind it. */}
      <TrackGrid lang={lang} />

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
