import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { localize } from "@/lib/i18n";
import { autopsy, boardName, game, percent, type AutopsyRoutine } from "@/lib/autopsy";
import { Shell } from "@/app/components/SiteFrame";
import { evidenceText, hex4, kindWords, ORDER, patternWords } from "../../words";

/**
 * /autopsy/games/<key>: one game, as the record has it. The key is the
 * first twelve characters of the dump's digest. Everything on the page is
 * shape (addresses, counts, pattern names with their evidence); the
 * listing it was read from stays with the dump.
 */

export function generateStaticParams() {
  return autopsy().games.map((g) => ({ game: g.key }));
}

const PROSE = {
  en: {
    description: (name: string) => `${name}, taken apart by running it: the routines the crawl entered, the patterns found in them, its jump tables and the memory its routines share.`,
    intro: (name: string, board: string, prg: string, executed: string, pct: number, frames: string, paths: string, steps: string) => (
      <>
        <b>{name}</b> is on a {board} board with <b>{prg}</b> bytes of
        program. A crawl of <b>{steps}</b> steps from power-on kept{" "}
        <b>{paths}</b> paths that found new code. Played back over{" "}
        <b>{frames}</b> frames, they executed <b>{executed}</b> bytes of it,{" "}
        <b>{pct}</b> percent.
      </>
    ),
    foundH: "What the rules named",
    found: (name: string, count: string) => `${name}: ${count}`,
    none: "No rule named anything in this game.",
    routinesH: (count: string) => `The ${count} routines the runs entered`,
    routinesWhat: "Every place the game's code was entered, by a call, an interrupt or a jump through a table. The ones a rule named come first, with what the rule saw.",
    rcols: ["at", "entered by", "times", "what it is, and the evidence"],
    bank: (b: string) => `bank ${b}`,
    inside: "inside another instruction",
    loopsH: "Where it waits",
    loopsWhat: "Loops a rule named that sit inside a routine and are not themselves a place the code is entered.",
    lcols: ["at", "what it is, and the evidence"],
    tablesH: "The jump engine's tables",
    tablesWhat: "Each table sits right after a call to the engine. An entry is counted as far as the runs saw one taken; the true table may be longer.",
    tcols: ["at", "entries", "taken"],
    ramH: "The memory its routines share",
    ram: (variables: string, arrays: string) => (
      <>
        <b>{variables}</b> bytes of memory were written by one routine and
        read by another, and <b>{arrays}</b> places were reached through an
        index, which is what a table or a set of object slots in memory
        looks like.
      </>
    ),
    acols: ["from", "bytes reached", "instructions"],
    arraysH: "The longest reaches through an index",
    vcols: ["byte", "reads and writes", "routines writing", "routines reading"],
    varsH: (kept: string) => `The ${kept} busiest shared bytes`,
    not: "This page shows none of the game's bytes. The listing these figures were read from stays with the cartridge.",
    back: "All the games",
  },
  ja: {
    description: (name: string) => `${name} を走らせて分解したもの: クロールが入ったルーチン、そこに見つかったパターン、ジャンプのテーブル、ルーチンが共有するメモリ。`,
    intro: (name: string, board: string, prg: string, executed: string, pct: number, frames: string, paths: string, steps: string) => (
      <>
        <b>{name}</b> は {board} の基板に載り、プログラムは <b>{prg}</b> バイト。電源投入から <b>{steps}</b> 歩のクロールが、新しいコードを見つけた道筋を <b>{paths}</b> 本残した。それらを <b>{frames}</b> フレームにわたって再生すると、プログラムのうち <b>{executed}</b> バイト、<b>{pct}</b> パーセントが実行された。
      </>
    ),
    foundH: "規則が名付けたもの",
    found: (name: string, count: string) => `${name}: ${count}`,
    none: "このゲームでは、どの規則も何も名付けなかった。",
    routinesH: (count: string) => `走行が入った ${count} 個のルーチン`,
    routinesWhat: "ゲームのコードに入った場所のすべて。呼び出し、割り込み、テーブル経由のジャンプのどれかで入る。規則が名付けたものを先に、規則が見たものと一緒に並べる。",
    rcols: ["場所", "入り方", "回数", "何であるか、その証拠"],
    bank: (b: string) => `バンク ${b}`,
    inside: "別の命令の内側",
    loopsH: "待つ場所",
    loopsWhat: "規則が名付けたループのうち、ルーチンの内側にあって、それ自身はコードの入口ではないもの。",
    lcols: ["場所", "何であるか、その証拠"],
    tablesH: "ジャンプエンジンのテーブル",
    tablesWhat: "テーブルはそれぞれ、エンジンへの呼び出しの直後にある。項目は、走行が選ぶのを見た所までを数える。本当のテーブルはもっと長いかもしれない。",
    tcols: ["場所", "項目", "選ばれた数"],
    ramH: "ルーチンが共有するメモリ",
    ram: (variables: string, arrays: string) => (
      <>
        あるルーチンが書き、別のルーチンが読んだメモリは <b>{variables}</b> バイト。添字を通して届いた場所は <b>{arrays}</b> か所で、メモリの中のテーブルや、物体の枠の並びはそう見える。
      </>
    ),
    acols: ["起点", "届いたバイト", "命令"],
    arraysH: "添字で届いた、最も長い範囲",
    vcols: ["バイト", "読み書き", "書くルーチン", "読むルーチン"],
    varsH: (kept: string) => `最も忙しい共有バイト ${kept} 個`,
    not: "このページはゲームのバイトを一つも見せない。これらの数を読み取ったリスティングは、カートリッジと一緒に留まる。",
    back: "すべてのゲーム",
  },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ lang: string; game: string }> }): Promise<Metadata> {
  const { lang, game: key } = await params;
  const g = game(key);
  if (!g) return {};
  const S = PROSE[lang === "ja" ? "ja" : "en"];
  return pageMeta(lang, `/autopsy/games/${g.key}`, { title: g.name, description: S.description(g.name) });
}

/** "prg3" is bank 3. */
const bankOf = (b: string) => b.replace(/^prg/, "");

export default async function AutopsyGamePage({ params }: { params: Promise<{ lang: Lang; game: string }> }) {
  const { lang, game: key } = await params;
  const g = game(key);
  if (!g) notFound();
  const S = PROSE[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const banked = g.banks.length > 1;
  const at = (bank: string, addr: number) => (banked ? `${hex4(addr)} (${S.bank(bankOf(bank))})` : hex4(addr));
  // The named ones first, then the busiest.
  const routines: AutopsyRoutine[] = [...g.routine_list].sort(
    (a, b) => Number(b.is.length > 0) - Number(a.is.length > 0) || (b.entered ?? 0) - (a.entered ?? 0) || a.addr - b.addr,
  );
  const named = ORDER.filter((p) => g.patterns[p]);
  const arrays = [...g.array_list].sort((a, b) => b.slots - a.slots || b.sites - a.sites).slice(0, 12);
  const steps = n(g.steps);

  return (
    <Shell lang={lang} die="NES" title={g.name}>
      <div className="prose" data-autopsy-game-page={g.key}>
        <p>{S.intro(g.name, boardName(g.mapper), n(g.prg), n(g.executed), percent(g), n(g.frames), n(g.paths), steps)}</p>

        <h2>{S.foundH}</h2>
        {named.length ? (
          <ul data-autopsy-found>
            {named.map((p) => (
              <li key={p}>
                <Link href={localize(lang, `/autopsy/patterns#${p}`)}>{S.found(patternWords(lang, p).name, n(g.patterns[p]))}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>{S.none}</p>
        )}

        <h2>{S.routinesH(n(routines.length))}</h2>
        <p>{S.routinesWhat}</p>
        <div className="ledger">
          <div className="scroller">
            <table data-autopsy-routines>
              <thead>
                <tr>{S.rcols.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {routines.map((x) => (
                  <tr key={`${x.bank}:${x.addr}:${x.name}`}>
                    <td>{at(x.bank, x.addr)}{x.inside !== undefined ? ` (${S.inside})` : ""}</td>
                    <td>{kindWords(lang, x.kind)}</td>
                    <td>{x.entered !== undefined ? n(x.entered) : ""}</td>
                    <td>
                      {x.is.map((i, k) => (
                        <div key={k}>
                          <b>{patternWords(lang, i.pattern).name}</b>: {evidenceText(lang, i.evidence)}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {g.loop_list.length ? (
          <>
            <h2>{S.loopsH}</h2>
            <p>{S.loopsWhat}</p>
            <div className="ledger">
              <div className="scroller">
                <table data-autopsy-loops>
                  <thead>
                    <tr>{S.lcols.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {g.loop_list.map((x) => (
                      <tr key={`${x.bank}:${x.addr}`}>
                        <td>{at(x.bank, x.addr)}</td>
                        <td>
                          {x.is.map((i, k) => (
                            <div key={k}>
                              <b>{patternWords(lang, i.pattern).name}</b>: {evidenceText(lang, i.evidence)}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        {g.table_list.length ? (
          <>
            <h2>{S.tablesH}</h2>
            <p>{S.tablesWhat}</p>
            <div className="ledger">
              <div className="scroller">
                <table data-autopsy-tables>
                  <thead>
                    <tr>{S.tcols.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {g.table_list.map((x) => (
                      <tr key={`${x.bank}:${x.addr}`}>
                        <td>{at(x.bank, x.addr)}</td>
                        <td>{n(x.entries)}</td>
                        <td>{n(x.seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        <h2>{S.ramH}</h2>
        <p>{S.ram(n(g.variables), n(g.arrays))}</p>
        {arrays.length ? (
          <>
            <h3>{S.arraysH}</h3>
            <div className="ledger">
              <div className="scroller">
                <table data-autopsy-arrays>
                  <thead>
                    <tr>{S.acols.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {arrays.map((x) => (
                      <tr key={x.base}>
                        <td>{x.base}</td>
                        <td>{n(x.slots)}</td>
                        <td>{n(x.sites)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
        {g.variable_list.length ? (
          <>
            <h3>{S.varsH(n(g.variable_list.length))}</h3>
            <div className="ledger">
              <div className="scroller">
                <table data-autopsy-variables>
                  <thead>
                    <tr>{S.vcols.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {g.variable_list.map((x) => (
                      <tr key={x.addr}>
                        <td>{x.addr}</td>
                        <td>{n(x.total)}</td>
                        <td>{n(x.writers)}</td>
                        <td>{n(x.readers)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        <p>{S.not}</p>
        <p>
          <Link href={localize(lang, "/autopsy/games")}>{S.back}</Link>
        </p>
      </div>
    </Shell>
  );
}
