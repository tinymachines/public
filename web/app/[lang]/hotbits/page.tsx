import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "hotbits",
  description:
    "True random bytes from radioactive decay: a Geiger counter on a Pi, with bits taken from the timing between events.",
};

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
    theSurfaces: "The surfaces",
    thSurface: "Surface",
    thWhat: "What it is",
    thToday: "Answers today",
    thLands: "Lands at",
    thStatus: "Status",
    proposed: "proposed",
    probed: (d: string) => `read from data/projects.json, probed ${d}`,
    redirectMap: "A public path that moves is a redirect map. See PROJECTS.md.",
    refTitle: "The reference",
    ref: (href: string) => (
      <>
        <Link href={href}>The API reference</Link> is generated from
        the instrument&rsquo;s own <code>openapi.json</code> in your browser,
        so it is what the service says about itself right now rather than what
        it said at the last deploy. It also asks what it describes whether it
        is still there, which is how it can report which documented
        endpoints have been retired behind a key, and reads the
        gateway&rsquo;s own schema beside the instrument&rsquo;s.
      </>
    ),
    designTitle: "This page has no design yet, and that is deliberate",
    design: (
      <>
        It is the house kit with nothing overridden. The palette, the display
        face and the mark for this project are the owner&rsquo;s to make, and{" "}
        <code>style/projects/hotbits.css</code> is waiting with every lever it
        is allowed to pull listed and empty. What a project may not touch is
        the part that carries meaning: blue is ACTIVE, orange is ATTENTION and
        red is ASSERTION FAILED on every project here, and a build check fails
        if a silo reaches past its own tokens.
      </>
    ),
  },
  ja: {
    how: (
      <>
        ここでは何も数を生成しない。放射性の線源が崩壊し、ガイガーカウンター
        が各イベントを報告し、イベント間のある間隔を次の間隔と比べてビットが
        取り出される: 前が短ければ 1、後が短ければ 0、等しい間隔は捨てる。
        偏りは補正ではなく対称性によって消える。生のストリームがそもそも
        測るに値するのは、そのためだ。
      </>
    ),
    theSurfaces: "ページ一覧",
    thSurface: "ページ",
    thWhat: "何であるか",
    thToday: "今日応答する場所",
    thLands: "着地先",
    thStatus: "状態",
    proposed: "提案",
    probed: (d: string) => `data/projects.json から読み、${d} に検分`,
    redirectMap: "動く公開パスはリダイレクト表になる。PROJECTS.md を参照。",
    refTitle: "リファレンス",
    ref: (href: string) => (
      <>
        <Link href={href}>API リファレンス</Link>は装置自身の{" "}
        <code>openapi.json</code> からブラウザ内で生成される。だからそれは、
        前回のデプロイ時点の言い分ではなく、サービスがいま自分について言って
        いることだ。記述したものがまだそこに居るかも実際に尋ねるので、
        文書化されたエンドポイントのどれが鍵の向こうに引退したかを報告
        できるし、装置のスキーマの横でゲートウェイ自身のスキーマも読む。
      </>
    ),
    designTitle: "このページにデザインはまだ無く、それは意図されたもの",
    design: (
      <>
        何も上書きしていない家のキットだ。このプロジェクトのパレット、
        ディスプレイ書体、マークはオーナーが作るものであり、
        <code>style/projects/hotbits.css</code> は引いてよいレバーをすべて
        列挙して、空のまま待っている。プロジェクトが触れてはならないのは
        意味を運ぶ部分だ: このサイトのどのプロジェクトでも青は ACTIVE、橙は
        ATTENTION、赤は ASSERTION FAILED であり、サイロが自分のトークンの
        外に手を伸ばせばビルドチェックが落ちる。
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
          <div className="tbl-foot">
            <span>{S.probed(measuredOn())}</span>
            <span>{S.redirectMap}</span>
          </div>
        </div>

        <h2>{S.refTitle}</h2>
        <p>{S.ref(localize(lang, "/hotbits/api"))}</p>

        <h2>{S.designTitle}</h2>
        <p>{S.design}</p>
      </main>
    </Shell>
  );
}
