import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { localize, t } from "@/lib/i18n";
import { project, measuredOn } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";

/**
 * /6502: what the project's surfaces are, and where each one answers today.
 *
 * This is a landing page for a move that has not happened. Every surface below
 * is still served from its own subdomain, and this page says so rather than
 * implying otherwise: the `serves_today` column is a link to the thing that
 * actually answers, and the status column says nothing has started.
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
        <b>{n} parts</b>, each address probed {d}
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
        <b>部品 {n} 点</b>。各アドレスの応答を {d} に確認
      </>
    ),
    hereCount: (h: number, n: number) => (
      <>
        <b>
          {n} 点中 {h} 点がここにある。
        </b>{" "}
        どれも元のサブドメインでも今なお応答している。何も止めていないから
        だ。このページは計画と現在のアドレスであって、リダイレクトではない。
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
        一つのデザインシステムだからだ。ここにあるどのプロジェクトも、
        同じコンポーネント、同じ活字階梯、同じ余白を使う。このページの
        ために何もフォークされていない。6502 の見た目がそのまま家の見た目
        なのは、パレットがそもそもこの仕事のために採られたものだからだ。
      </>
    ),
    why2: (
      <>
        どのプロジェクトも変えてはならないのは、意味を運ぶ部分だ。青は
        ACTIVE、橙は ATTENTION、赤は表明の失敗を意味し、ドライブの傾斜は
        エンジン自身の状態の目盛りに色を与えたものだ。それらを定義し直せる
        プロジェクトは自分のアクセントを持たないだろう。持つのは、正常に
        見える失敗した表明だ。
      </>
    ),
  },
} as const;

export default async function ProjectPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const p = project("6502");
  const settled = p.surfaces.filter((s) => s.lands_at_settled).length;
  // Counted, not stated. This page carried the sentence "Nothing has moved
  // yet" for as long as it took five surfaces to move, and the table beside it
  // said "here" on every one of them. A page disagreeing with its own table is
  // the exact failure the rest of this repository is arranged to prevent, and
  // it happened because that sentence was typed.
  const here = p.surfaces.filter((s) => s.status === "here");

  return (
    <Shell lang={lang} die="6502" title={p.name}>
      <main className="prose">
        <div className="chips">
          <span className="measured">{S.surfaces(p.surfaces.length, measuredOn())}</span>
          <span className={p.status === "serving" ? "tag live" : "tag warn"}>{t(lang, p.status)}</span>
        </div>

        <p>{t(lang, p.what)}</p>

        <p className="notice">{S.hereCount(here.length, p.surfaces.length)}</p>

        <h2>{S.theSurfaces}</h2>
        <div className="ledger">
          <div className="scroller" tabIndex={0} role="region" aria-label="6502 surfaces">
            <table>
              <thead>
                <tr>
                  <th>{S.thSurface}</th>
                  <th>{S.thWhat}</th>
                  <th>{S.thToday}</th>
                  <th>{S.thLands}</th>
                  <th>{S.thStatus}</th>
                </tr>
              </thead>
              <tbody>
                {p.surfaces.map((s) => (
                  <tr key={s.key}>
                    <td className="name">{t(lang, s.nav_label ?? s.name)}</td>
                    <td style={{ whiteSpace: "normal", minWidth: "18rem" }}>{t(lang, s.what)}</td>
                    <td>
                      {/* data-address marks a link that IS the address rather
                          than a way to read the thing. This column's whole job
                          is to say where each surface answers today, including
                          the ones that have also arrived here, so check-build
                          skips it: an opt-out that names itself, rather than
                          the check quietly not covering this page. */}
                      <a data-address href={s.serves_today}>
                        {s.serves_today.replace("https://", "")}
                      </a>
                    </td>
                    <td>
                      {s.lands_at}{" "}
                      {s.lands_at_settled ? null : (
                        <span className="tag warn">{S.proposed}</span>
                      )}
                    </td>
                    <td>
                      <span className={s.status === "here" ? "tag live" : "tag"}>{t(lang, s.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tbl-foot">
            <span>{S.settled(settled, p.surfaces.length)}</span>
            <span>{S.redirectMap}</span>
          </div>
        </div>

        <h2>{S.whyTitle}</h2>
        <p>{S.why1}</p>
        <p>{S.why2}</p>
      </main>
    </Shell>
  );
}
