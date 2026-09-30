import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { autopsy, found } from "@/lib/autopsy";
import { Shell } from "@/app/components/SiteFrame";
import { ORDER, patternWords } from "../words";

/**
 * /autopsy/patterns: the things games keep doing, each with the rule that
 * finds it said plainly and how many of the games it was found in, from
 * the boarded record. A pattern the record holds that the words do not
 * name fails the build (words.tsx).
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/autopsy/patterns");
}

const PROSE = {
  en: {
    what: (
      <>
        A pattern is something games keep doing. Each one here is found by a
        rule over what the code did while it ran, never by what its bytes
        look like, and when the evidence is not there nothing is named.
      </>
    ),
    every: (games: string, marks: string) => `Found in all ${games} games, ${marks} routines.`,
    some: (count: string, games: string, marks: string) => `Found in ${count} of the ${games} games, ${marks} routines:`,
    none: "Not found in this survey. The rule was written for one run of one game, and a crawl folds many runs together; it needs rewriting for that.",
    caution: (
      <>
        Read the counts with care. The sound driver and the picture writer
        are found in every game because their rules pick the routine that
        did the most of it, and there is always one. The others are found
        only where the evidence was.
      </>
    ),
  },
  ja: {
    what: (
      <>
        パターンとは、ゲームが繰り返しやることだ。ここにあるものはどれも、コードが走っている間にしたことについての規則で見つけたもので、バイトがどう見えるかでは決して見つけない。証拠が無いときは、何も名付けない。
      </>
    ),
    every: (games: string, marks: string) => `${games} 本すべてのゲームで見つかった。ルーチンは ${marks} 個。`,
    some: (count: string, games: string, marks: string) => `${games} 本のうち ${count} 本で見つかった。ルーチンは ${marks} 個:`,
    none: "この調査では見つからなかった。規則は一本のゲームの一回の走行に向けて書かれたもので、クロールは多くの走行を重ね合わせる。そのための書き直しが要る。",
    caution: (
      <>
        数は注意して読むこと。サウンドドライバと画面メモリへの書き手がすべてのゲームで見つかるのは、その規則が「一番多くやったルーチン」を選ぶからで、そういうルーチンは必ず一つある。ほかのものは、証拠があった所でだけ見つかる。
      </>
    ),
  },
} as const;

export default async function AutopsyPatternsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const r = autopsy();
  const n = (v: number) => v.toLocaleString(lang);
  // Every pattern the record holds must be one this page tells.
  for (const p of r.patterns) {
    if (!(ORDER as readonly string[]).includes(p)) throw new Error(`data/autopsy.json holds the pattern ${JSON.stringify(p)}, which /autopsy/patterns does not tell; add it to words.tsx`);
  }
  return (
    <Shell lang={lang} die="NES" title={t(lang, surface("autopsy", "patterns").name)}>
      <div className="prose">
        <p>{S.what}</p>
        <p>{S.caution}</p>
        {ORDER.map((p) => {
          const w = patternWords(lang, p);
          const f = found(p);
          return (
            <section key={p} data-autopsy-pattern={p} data-autopsy-pattern-games={f.games.length}>
              <h2 id={p}>{w.name}</h2>
              <p>{w.what}</p>
              {f.games.length === 0 ? (
                <p>{S.none}</p>
              ) : f.games.length === r.games.length ? (
                <p>{S.every(n(r.games.length), n(f.marks))}</p>
              ) : (
                <>
                  <p>{S.some(n(f.games.length), n(r.games.length), n(f.marks))}</p>
                  <ul>
                    {f.games.map((g) => (
                      <li key={g.key}>
                        <Link href={localize(lang, `/autopsy/games/${g.key}`)}>{g.name}</Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
