import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { autopsy, boardName, percent } from "@/lib/autopsy";
import { Shell } from "@/app/components/SiteFrame";

/**
 * /autopsy/games: every game the pipeline has been over, one line each,
 * from the boarded record. The name opens the game's own page.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/autopsy/games");
}

const PROSE = {
  en: {
    what: (
      <>
        Every cartridge on our shelf has been through the same four steps.
        Each line is one game: how much of its program the crawl ran, how
        many routines it entered, how many pattern names the rules put on
        them, and how many jump tables it wrote down. Pick a game for its
        page.
      </>
    ),
    floor: (steps: string) => (
      <>
        A crawl of <b>{steps}</b> steps from power-on does not get far into
        a big game. These numbers say how far it got, not how big the game
        is.
      </>
    ),
    cols: ["game", "board", "program run", "routines", "names", "tables"],
    ran: (executed: string, prg: string, pct: number) => `${executed} of ${prg} bytes (${pct}%)`,
  },
  ja: {
    what: (
      <>
        私たちの棚のカートリッジはどれも、同じ四つの段階を通った。一行が一本のゲームで、クロールがそのプログラムをどれだけ走らせたか、いくつのルーチンに入ったか、規則がそこにいくつのパターンの名前を付けたか、ジャンプのテーブルをいくつ書き出したかを示す。ゲームを選ぶと、そのページが開く。
      </>
    ),
    floor: (steps: string) => (
      <>
        電源投入から <b>{steps}</b> 歩のクロールでは、大きなゲームの奥までは届かない。ここの数は、ゲームの大きさではなく、どこまで届いたかを言っている。
      </>
    ),
    cols: ["ゲーム", "基板", "走ったプログラム", "ルーチン", "名前", "テーブル"],
    ran: (executed: string, prg: string, pct: number) => `${prg} バイト中 ${executed}（${pct}%）`,
  },
} as const;

export default async function AutopsyGamesPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const r = autopsy();
  const n = (v: number) => v.toLocaleString(lang);
  const steps = typeof r.steps === "number" ? n(r.steps) : r.steps.map(n).join(", ");
  return (
    <Shell lang={lang} die="NES" title={t(lang, surface("autopsy", "games").name)}>
      <div className="prose">
        <p>{S.what}</p>
        <p>{S.floor(steps)}</p>
        <div className="ledger">
          <div className="scroller">
            <table data-autopsy-games>
              <thead>
                <tr>{S.cols.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {r.games.map((g) => (
                  <tr key={g.key} data-autopsy-game={g.key}>
                    <td><Link href={localize(lang, `/autopsy/games/${g.key}`)}>{g.name}</Link></td>
                    <td>{boardName(g.mapper)}</td>
                    <td>{S.ran(n(g.executed), n(g.prg), percent(g))}</td>
                    <td>{n(Object.values(g.routines).reduce((a, b) => a + b, 0))}</td>
                    <td>{n(Object.values(g.patterns).reduce((a, b) => a + b, 0))}</td>
                    <td>{n(g.tables)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
