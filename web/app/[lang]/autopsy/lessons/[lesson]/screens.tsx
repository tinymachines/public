import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { ScreensMeasures } from "@/lib/lessons";

/**
 * The screens lesson's own part of its page: one byte choosing the screen,
 * what our own autopsy found when it was run over this cartridge, and the
 * same read off the game's run. Every figure is the record's.
 */

export const SCREENS = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        A title that waits for Start, the jump lesson&rsquo;s square to play
        with, and a pause that freezes it, with Start moving between them.
        The program is <b>{n}</b> instructions in <b>{bytes}</b> bytes, built
        and checked the same way.
      </>
    ),
    howH: "One byte chooses what runs",
    how: (
      <>
        Super Mario Bros. keeps which screen it is on in one byte of memory and,
        every frame, calls a routine that takes an address from a table placed
        right after the call, the entry chosen by that byte. The autopsy names
        that routine a jump engine. This cartridge does the same with its own
        byte: 0 is the title, 1 playing, 2 paused. Then we ran the autopsy over
        our own cartridge, the same tools that went over the games, to see
        whether they would recognise what we wrote.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      values: "values the screen byte took, in order",
      engine: "a jump engine found by the autopsy",
      table: "the table chosen by the screen byte: entries, taken in the run",
      stretches: "stretches the run was cut into by which routines ran",
      met: "changes of the screen byte where a stretch began",
      pause: "bytes of memory changing a frame: before the pause, while paused",
    },
    yes: "yes",
    no: "no",
    of: (a: string, b: string) => `${a} of ${b}`,
    pair: (a: string, b: string) => `${a}, ${b}`,
    foundH: "What the autopsy said of it",
    found: (n: string, of: string, still: string) => (
      <>
        It found the engine and the table, and the table&rsquo;s choosing byte was ours. The stretches it cut the run
        into, knowing nothing of screens, began where the screen byte changed {n} times out of {of}. While paused,{" "}
        {still} bytes of memory changed a frame, outside the stack and the sprites&rsquo; page: the pause is nothing
        but the entry that only waits for Start.
      </>
    ),
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        スタートを待つタイトル、ジャンプのレッスンの四角で遊ぶ画面、それを止める一時停止。スタートで行き来する。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "一つのバイトが、走るものを選ぶ",
    how: (
      <>
        スーパーマリオブラザーズは、どの画面にいるかをメモリの一バイトに持ち、毎フレーム、呼び出しのすぐ後に置いたテーブルからアドレスを一つ取るルーチンを呼ぶ。項目を選ぶのはそのバイトだ。解剖はそのルーチンをジャンプエンジンと名付ける。このカートリッジも自分のバイトで同じことをする: 0 がタイトル、1 が遊んでいる間、2 が一時停止。それから、ゲームを調べたのと同じ道具で、私たち自身のカートリッジを解剖した。書いたものを道具が見分けるかどうかを見るためだ。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      values: "画面のバイトが取った値、順に",
      engine: "解剖が見つけたジャンプエンジン",
      table: "画面のバイトが選ぶテーブル: 項目の数、走行で選ばれた数",
      stretches: "どのルーチンが走ったかで走行が切られた区間の数",
      met: "画面のバイトが変わったところで区間が始まった回数",
      pause: "1 フレームに変わるメモリのバイト: 一時停止の前、一時停止の間",
    },
    yes: "ある",
    no: "ない",
    of: (a: string, b: string) => `${b} 回のうち ${a} 回`,
    pair: (a: string, b: string) => `${a}、${b}`,
    foundH: "解剖がそれについて言ったこと",
    found: (n: string, of: string, still: string) => (
      <>
        解剖はエンジンとテーブルを見つけ、テーブルを選ぶバイトは私たちのものだった。画面のことは何も知らずに切った区間は、画面のバイトが変わった {of} 回のうち {n} 回、そこで始まった。一時停止の間、スタックとスプライトのページの外で 1 フレームに変わったメモリは {still} バイト: 一時停止とは、スタートを待つだけの項目に他ならない。
      </>
    ),
  },
} as const;

export function ScreensPart({ lang, m, a }: { lang: Lang; m: ScreensMeasures; a?: (ScreensMeasures & { game: string }) | null }) {
  const S = SCREENS[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: ScreensMeasures) => string][] = [
    ["values", (x) => x.values.map(n).join(", ")],
    ["engine", (x) => (x.engine ? S.yes : S.no)],
    ["table", (x) => (x.table ? S.pair(n(x.table.entries), n(x.table.seen)) : "")],
    ["stretches", (x) => n(x.stretches)],
    ["met", (x) => S.of(n(x.met), n(x.changes))],
    ["pause", (x) => (x.pause ? S.pair(n(x.pause.before), n(x.pause.during)) : "")],
  ];
  return (
    <>
      <h2>{S.howH}</h2>
      <p>{S.how}</p>
      <div className="ledger">
        <div className="scroller">
          <table data-lesson-against>
            <thead>
              <tr>{S.cols(game).map((c, i) => <th key={i}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(([k, f]) => (
                <tr key={k} data-lesson-row={k} data-lesson-ours={f(m)} data-lesson-theirs={a ? f(a) : ""}>
                  <td>{S.rows[k]}</td>
                  <td>{f(m)}</td>
                  <td>{a ? f(a) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {m.engine && m.table && m.pause ? (
        <>
          <h3>{S.foundH}</h3>
          <p>{S.found(n(m.met), n(m.changes), n(m.pause.during))}</p>
        </>
      ) : null}
    </>
  );
}
