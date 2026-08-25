import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { localize, t } from "@/lib/i18n";
import { project, measuredOn, serviceOrigin } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
import { Pool } from "./Pool";
import "./hotbits.css";

/**
 * /hotbits: the second project gets a roof.
 *
 * Structure, not identity. CLAUDE.md is explicit that the style guide, the CSS
 * and the design language are the owner's, and PROJECTS.md says the same thing
 * about this project specifically: style/projects/hotbits.css lists every
 * lever commented out with no values, so that designing hotbits is filling in
 * values rather than working out which values a project is allowed to have.
 *
 * So this page is the house kit with nothing invented. No palette, no display
 * face, no mark. The day that file is filled in, this page changes with it and
 * nothing here is edited, which is the whole point of the silo.
 *
 * What IS here is the part a page can honestly do now: what the thing is, what
 * it has measured in the last second, and where each surface answers. The
 * figures are read from the running instrument rather than typed, for the
 * reason every figure on this site is.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/hotbits")
}

const PROSE = {
  en: {
    how: (
      <>
        Nothing here generates a number. A radioactive source decays, a Geiger
        counter reports each event, and a bit is taken from comparing one
        gap between events with the next: if the first is shorter the bit is
        one, if the second is shorter it is zero, and equal gaps are thrown
        away. The bias cancels by symmetry rather than by correction, which is
        why the raw stream is worth measuring at all.
      </>
    ),
    theSurfaces: "The parts",
    thSurface: "Part",
    thWhat: "What it is",
    thToday: "Answers today",
    thLands: "Lands at",
    thStatus: "Status",
    proposed: "proposed",
    probed: (d: string) => `each address probed ${d}`,
    redirectMap: "An address that moves becomes a redirect; published links keep working.",
    refTitle: "The reference",
    ref: (href: string) => (
      <>
        <Link href={href}>The API reference</Link> is read from the
        instrument&rsquo;s schema each time the page loads, and every
        documented route is asked whether it still answers.
      </>
    ),
    designTitle: "This page has no design yet, and that is deliberate",
    design: (
      <>
        It is the house design with nothing changed. The palette, the
        display face and the mark for this project are still the
        owner&rsquo;s to choose, and the place for them is ready and
        deliberately empty. What no project may change is the part that
        carries meaning: blue is ACTIVE, orange is ATTENTION and red means a
        failed assertion, on every page of this site.
      </>
    ),
  },
  ja: {
    how: (
      <>
        ここでは何も数を生成しない。放射性の線源が崩壊し、ガイガーカウンターが各イベントを報告し、イベント間のある間隔を次の間隔と比べてビットが取り出される: 前が短ければ 1、後が短ければ 0、等しい間隔は捨てる。偏りは補正ではなく対称性によって消える。生のストリームがそもそも測るに値するのは、そのためだ。
      </>
    ),
    theSurfaces: "部品一覧",
    thSurface: "部品",
    thWhat: "何であるか",
    thToday: "今日応答する場所",
    thLands: "着地先",
    thStatus: "状態",
    proposed: "提案",
    probed: (d: string) => `各アドレスの応答を ${d} に確認`,
    redirectMap: "動くアドレスはリダイレクトになる。公開済みのリンクは切れない。",
    refTitle: "リファレンス",
    ref: (href: string) => (
      <>
        <Link href={href}>API リファレンス</Link>は、ページを開くたびに装置のスキーマから読まれ、文書化されたルートはどれも、まだ応答するかを尋ねられる。
      </>
    ),
    designTitle: "このページにデザインはまだ無く、それは意図されたもの",
    design: (
      <>
        何も変えていない家のデザインだ。このプロジェクトのパレット、ディスプレイ書体、マークは今もオーナーが選ぶものであり、そのための場所は意図して空のまま用意されている。どのプロジェクトも変えてはならないのは意味を運ぶ部分だ: このサイトのどのページでも、青は
        ACTIVE、橙は ATTENTION、赤は表明の失敗を意味する。
      </>
    ),
  },
} as const;

export default async function HotbitsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const p = project("hotbits");
  // Read from the manifest rather than written here: three files would have
  // named the same host otherwise, and the manifest is the one that records
  // the day it moves.
  const api = serviceOrigin("hotbits", "trng");

  return (
    <Shell lang={lang} die="TRNG" title={p.name}>
      <main className="prose">
        <p>{t(lang, p.what)}</p>

        <p>{S.how}</p>

        <Pool api={api} lang={lang} />

        <h2>{S.theSurfaces}</h2>
        <div className="ledger">
          <div className="scroller" tabIndex={0} role="region" aria-label="hotbits surfaces">
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
                      <a data-address href={s.serves_today}>
                        {s.serves_today.replace("https://", "")}
                      </a>
                    </td>
                    <td>
                      {s.lands_at}{" "}
                      {s.lands_at_settled ? null : <span className="tag warn">{S.proposed}</span>}
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

        <h2>{S.refTitle}</h2>
        <p>{S.ref(localize(lang, "/hotbits/api"))}</p>
      </main>
    </Shell>
  );
}
