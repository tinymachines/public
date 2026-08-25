import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { localize, t } from "@/lib/i18n";
import { explorerMenu } from "@/lib/explorer-menu";
import { arrivedSurfaces, project } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
import { TrackLede } from "../Tracks";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502/tools")
}

const P = {
  en: { instruments: "The instruments", lede: "Every view is the same chip, lit by what it is doing. Grouped the way the explorer groups them; every one opens with the transport on the floor.", lab: "The Halfwave Lab" },
  ja: { instruments: "計器", lede: "どのビューも同じチップが、いま何をしているかで光る。エクスプローラ自身の分け方で並べ、どれも床にトランスポートを置いて開く。", lab: "Halfwave Lab" },
} as const;

/** The Lab and tools track: the explorer's clusters and the Halfwave Lab. */
export default async function ToolsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = P[lang];
  const clusters = explorerMenu().filter((g) => !/^(Developers|About)$/.test(g.title));
  const lab = arrivedSurfaces(project("6502")).find((s) => s.lands_at === "/6502/lab");
  return (
    <Shell lang={lang} die="6502" title={lang === "ja" ? "ラボと道具" : "Lab and tools"}>
      <TrackLede lang={lang} k="tools" />
      <h2 className="eyebrow">{S.instruments}</h2>
      <p className="prose">{S.lede}</p>
      <div className="piece-grid">
        {clusters.map((g) => (
          <article key={g.title} className="rail">
            <h3>{t(lang, g.title)}</h3>
            <ul className="rail-list">
              {g.items.map((it) => (
                <li key={it.href}>
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a href={localize(lang, it.href)}>{t(lang, it.label)}</a>
                  {it.hint ? <span>{t(lang, it.hint)}</span> : null}
                </li>
              ))}
            </ul>
          </article>
        ))}
        {lab ? (
          <article className="rail">
            <h3>{S.lab}</h3>
            <p>{t(lang, lab.what)}</p>
            <p className="piece-links"><Link className="tag live" href={localize(lang, lab.lands_at)}>{t(lang, lab.nav_label ?? lab.name)}</Link></p>
          </article>
        ) : null}
      </div>
    </Shell>
  );
}
