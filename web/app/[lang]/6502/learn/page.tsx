import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { localize, t } from "@/lib/i18n";
import { allPages } from "@/lib/docs";
import { Shell } from "@/app/components/SiteFrame";
import { LESSON } from "../lesson";
import { TrackLede } from "../Tracks";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502/learn", {
    title: "Learn", description: "The lesson: from a token to a published cart, then one instruction followed into the silicon."
  });
}

/** The Learn track: the four-step lesson, then everything written for this project. */
export default async function LearnPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const T = LESSON[lang];
  const reading = allPages().filter((d) => d.route.startsWith("/docs/6502/"));
  return (
    <Shell lang={lang} die="6502" title={lang === "ja" ? "学ぶ" : "Learn"}>
      <TrackLede lang={lang} k="learn" />
      <h2 className="eyebrow">{T.eyebrow}</h2>
      <ol className="lesson">
        {T.steps.map((st) => (
          <li key={st.n} className="step">
            <span className="step-n" aria-hidden="true">{st.n}</span>
            <h3>{st.title}</h3>
            <p>{st.body}</p>
            <p className="step-links">
              <Link className="tag live" href={localize(lang, st.href)}>{st.link}</Link>
              {"more" in st ? st.more.map((m) => <Link key={m.href} className="tag" href={localize(lang, m.href)}>{m.label}</Link>) : null}
            </p>
          </li>
        ))}
      </ol>
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
    </Shell>
  );
}
