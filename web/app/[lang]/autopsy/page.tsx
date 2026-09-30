import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { arrivedSurfaces, project } from "@/lib/projects";
import { autopsy, percent } from "@/lib/autopsy";
import { Shell } from "@/app/components/SiteFrame";

/**
 * /autopsy: the section's front door. What the autopsy is, the four steps
 * it takes a game through, a door to each part, and where it stands, with
 * every figure read from the boarded record (data/autopsy.json).
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/autopsy");
}

const n = (lang: Lang, v: number) => v.toLocaleString(lang);

const PROSE = {
  en: {
    why: (
      <>
        We wanted to learn how the old games were written by starting at the
        beginning: take one apart, see what every piece of it does, and write
        that down in a form we can check. The trouble with a cartridge is
        that code and data sit in it side by side with nothing to say which
        is which. So we run the game. What the processor fetched as an
        instruction is code, and what a routine did while it ran says what
        the routine is for.
      </>
    ),
    stepsH: "Four steps, in order",
    steps: [
      { name: "Decompile", href: "/autopsy/method", what: "The cartridge becomes a listing: assembly a person can read, with marks in its comments for everything we learned. The check is simple and strict: the file assembles back to the cartridge, byte for byte." },
      { name: "Crawl", href: "/autopsy/method#crawl", what: "A program plays the game on our own console, trying the buttons from every position it has reached and keeping the ones that ran code nothing had run before." },
      { name: "Identify", href: "/autopsy/patterns", what: "Rules read what each routine did while it ran and name the ones they recognise: the one that reads the controller, the one that chooses the game's state, the ones that draw the sprites." },
      { name: "Label", href: "/nes/create", what: "The names go back into the listing, where a person can read them, correct them and add their own. The Listing window on the desk writes one for any run you record." },
    ],
    partsH: "Where to look",
    standsH: "Where it stands",
    stands: (games: string, steps: string, routines: string, marks: string, pct: string, on: string) => (
      <>
        The first survey went over <b>{games}</b> cartridges from our own
        shelf, <b>{steps}</b> steps of crawling each, starting cold at
        power-on. It entered <b>{routines}</b> routines and put{" "}
        <b>{marks}</b> pattern names on them. That much crawling reaches a
        small part of a big game, <b>{pct}</b> percent of the program bytes
        across the shelf, so every count here is a floor. It was recorded on{" "}
        {on}.
      </>
    ),
    notH: "No page here holds a byte of anybody's game",
    not: (
      <>
        The listings stay on the machine that holds the cartridges. What is
        published is shape: addresses, counts and the names of patterns. A
        routine no rule recognised is listed without a name rather than given
        a guess.
      </>
    ),
    aheadH: "The patterns are a toolkit's table of contents",
    ahead: (
      <>
        What recurs across games is what a person writing a new one needs at
        hand. The toolkit built from these patterns, and a studio in the
        browser for writing games with it, come after this groundwork and are
        not built yet.
      </>
    ),
  },
  ja: {
    why: (
      <>
        昔のゲームがどう書かれたかを、最初から学びたかった。一本を分解し、その部分の一つ一つが何をするかを見て、確かめられる形で書き残す。カートリッジの厄介なところは、コードとデータが隣り合って入っていて、どちらがどちらかを言うものが何も無いことだ。だからゲームを走らせる。プロセッサが命令として取り出したものがコードで、ルーチンが走っている間にしたことが、そのルーチンが何のためにあるかを語る。
      </>
    ),
    stepsH: "四つの段階、順番に",
    steps: [
      { name: "逆コンパイル", href: "/autopsy/method", what: "カートリッジはリスティングになる。人が読めるアセンブリで、学んだことのすべてがコメントの中の印として入っている。検査は単純で厳しい: そのファイルは、一バイトも違わずカートリッジへ組み立て直せる。" },
      { name: "クロール", href: "/autopsy/method#crawl", what: "プログラムが私たち自身のコンソールでゲームを遊ぶ。到達したすべての場面からボタンを試し、まだ誰も走らせていないコードを走らせたものを残す。" },
      { name: "同定", href: "/autopsy/patterns", what: "規則が、それぞれのルーチンが走っている間にしたことを読み、見分けられるものに名前を付ける: コントローラを読むもの、ゲームの状態を選ぶもの、スプライトを描くもの。" },
      { name: "ラベル", href: "/nes/create", what: "名前はリスティングに戻り、人がそこで読み、直し、自分の名前を足せる。机のリスティングのウィンドウは、記録したどの走行についても一つ書く。" },
    ],
    partsH: "見る場所",
    standsH: "現在地",
    stands: (games: string, steps: string, routines: string, marks: string, pct: string, on: string) => (
      <>
        最初の調査は、私たち自身の棚のカートリッジ <b>{games}</b> 本を、電源投入から何の準備もなしに、それぞれ <b>{steps}</b> 歩ずつクロールした。入ったルーチンは <b>{routines}</b> 個、そこに付いたパターンの名前は <b>{marks}</b> 個。この程度のクロールが届くのは大きなゲームのごく一部で、棚全体ではプログラムのバイトの <b>{pct}</b> パーセントなので、ここにある数はどれも下限だ。記録した日は {on}。
      </>
    ),
    notH: "ここのどのページにも、誰かのゲームのバイトは一つも無い",
    not: (
      <>
        リスティングは、カートリッジを持っている機械に留まる。公開するのは形だけ: アドレス、数、そしてパターンの名前。どの規則も見分けなかったルーチンは、推測を与えられるのではなく、名前なしで並ぶ。
      </>
    ),
    aheadH: "パターンは道具箱の目次だ",
    ahead: (
      <>
        ゲームをまたいで繰り返されるものは、新しいゲームを書く人が手元に欲しいものだ。これらのパターンから作る道具箱と、それを使ってブラウザの中でゲームを書くスタジオは、この下地の後に来るもので、まだ作られていない。
      </>
    ),
  },
} as const;

export default async function AutopsyPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const p = project("autopsy");
  const r = autopsy();
  const parts = arrivedSurfaces(p).filter((s) => s.lands_at !== p.landing);
  const steps = typeof r.steps === "number" ? n(lang, r.steps) : r.steps.map((s) => n(lang, s)).join(", ");

  return (
    <Shell lang={lang} die="NES" title={t(lang, p.name)}>
      <div className="prose">
        <p>{t(lang, p.what)}</p>
        <p>{S.why}</p>

        <h2>{S.stepsH}</h2>
        <ol data-autopsy-steps>
          {S.steps.map((s) => (
            <li key={s.href}>
              <Link href={localize(lang, s.href)}>{s.name}</Link>: {s.what}
            </li>
          ))}
        </ol>

        <h2>{S.partsH}</h2>
        <ul data-parts>
          {parts.map((s) => (
            <li key={s.key}>
              <Link href={localize(lang, s.lands_at)}>{t(lang, s.name)}</Link>: {t(lang, s.what)}
            </li>
          ))}
        </ul>

        <h2>{S.standsH}</h2>
        <p data-autopsy-stands>
          {S.stands(n(lang, r.totals.games), steps, n(lang, r.totals.routines), n(lang, r.totals.marks), String(percent(r.totals)), r.boarded_on)}
        </p>

        <h2>{S.notH}</h2>
        <p>{S.not}</p>

        <h2>{S.aheadH}</h2>
        <p>{S.ahead}</p>
      </div>
    </Shell>
  );
}
