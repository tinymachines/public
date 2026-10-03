import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { lessons } from "@/lib/lessons";
import { ORDER, patternWords } from "../words";
import { Shell } from "@/app/components/SiteFrame";

/**
 * /autopsy/lessons: the cartridges of our own that the autopsy's findings
 * turn into, one a lesson. Each is built from lessons/ in the repository.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/autopsy/lessons");
}

const PROSE = {
  en: {
    intro: (
      <>
        Taking a game apart tells us what it does. A lesson is the other half:
        a small cartridge of our own that does the same thing, written from
        what we measured and measured again the same way, so the two can be
        set side by side. Its program is ours, so it is shown whole, and the
        cartridge is yours to play.
      </>
    ),
    found: "Our own autopsy, run over it, names:",
  },
  ja: {
    intro: (
      <>
        ゲームを分解すると、それが何をしているかが分かる。レッスンはその反対側だ: 測ったことから書いた、同じことをする私たち自身の小さなカートリッジで、同じやり方でもう一度測るので、二つを並べて比べられる。プログラムは私たちのものなので丸ごと見せられ、カートリッジは自由に遊べる。
      </>
    ),
    found: "それを私たち自身の解剖にかけると、名付けられるのは:",
  },
} as const;

export default async function LessonsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  return (
    <Shell lang={lang} die="NES" title={t(lang, surface("autopsy", "lessons").name)}>
      <div className="prose">
        <p>{S.intro}</p>
        <ul data-lessons>
          {lessons().map((l) => (
            <li key={l.key}>
              <Link href={localize(lang, `/autopsy/lessons/${l.key}`)}>{t(lang, l.title)}</Link>: {t(lang, l.description)}
              {Object.keys(l.patterns ?? {}).length ? (
                <>
                  {" "}
                  {S.found}{" "}
                  {ORDER.filter((p) => (l.patterns ?? {})[p]).map((p, i) => (
                    <span key={p}>
                      {i ? (lang === "ja" ? "、" : ", ") : ""}
                      <Link href={`${localize(lang, "/autopsy/patterns")}#${p}`}>{patternWords(lang, p).name}</Link>
                    </span>
                  ))}
                  {lang === "ja" ? "。" : "."}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
