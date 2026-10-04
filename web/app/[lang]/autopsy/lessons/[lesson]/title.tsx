import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { TitleMeasures } from "@/lib/lessons";

/**
 * The title lesson's own part of its page: how a title screen is drawn,
 * how its cursor moves and what happens when nobody presses anything,
 * read the same way on both from the logs of writes to the picture
 * (title_measures). The game's figures come from three runs; ours from
 * one. Every figure is the record's.
 */

export const TITLE = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        A title screen for our square: a level of two screens, a box that says SQUARE, a menu, and a demo that
        plays by itself if you leave it alone. Play it and wait, or press Select and Start. The program is{" "}
        <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "The title is part of the level",
    how: (
      <>
        Super Mario Bros. does not have a separate title picture. It clears its background, draws the first
        screen of its first level a few columns at a time, and then writes the title box and the menu into that
        same picture. Its cursor is not a sprite either: pressing Select rewrites a column of three background
        tiles, with the cursor at the top or the bottom. If nobody presses anything, a countdown runs out and a
        demo starts: the level plays by itself, and the title box scrolls away with the rest of the picture,
        because it is part of it. When the demo ends, or Start is pressed during it, the whole thing is cleared
        and drawn again. This cartridge works the same way, with a level, a box and a demo of its own.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      frames: "frames from the first write to the finished title",
      cleared: "whole background tables cleared first",
      tiles: "tiles written after that",
      cursor: "tiles a Select writes for the cursor",
      countdown: "frames from the last Select to the demo",
      demo: "frames the demo plays before the title comes back",
      scrolled: "the title scrolls away during the demo",
      start_demo: "frames from Start in the demo to the title being drawn",
      start_title: "frames from Start on the title to the next screen being drawn",
    },
    column: (n: string) => `${n}, one under another`,
    row: (n: string) => `${n}, side by side`,
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        私たちの四角のためのタイトル画面: 二画面ぶんのレベル、SQUARE と書いた枠、メニュー、そして放っておくとひとりでに遊ぶデモ。遊んで待ってみるか、セレクトとスタートを押してみてほしい。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "タイトルはレベルの一部",
    how: (
      <>
        スーパーマリオブラザーズには、タイトル専用の絵がない。背景を消し、最初のレベルの最初の画面を数列ずつ描き、そのあと同じ絵の中にタイトルの枠とメニューを書き込む。カーソルもスプライトではない: セレクトを押すと、縦に並んだ背景のタイル三つを書き直し、カーソルを上か下に置く。誰も何も押さなければ、カウントダウンが尽きてデモが始まる: レベルがひとりでに遊ばれ、タイトルの枠は絵の一部なので、ほかの部分と一緒にスクロールして流れていく。デモが終わるか、デモの途中でスタートを押すと、すべてを消して描き直す。このカートリッジも、自前のレベルと枠とデモで同じように動く。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      frames: "最初に書いてからタイトルができあがるまでのフレーム数",
      cleared: "はじめに丸ごと消した背景の表の数",
      tiles: "そのあと書いたタイルの数",
      cursor: "セレクトでカーソルのために書くタイルの数",
      countdown: "最後のセレクトからデモまでのフレーム数",
      demo: "タイトルが戻るまでデモが遊ぶフレーム数",
      scrolled: "デモの間にタイトルがスクロールで流れていく",
      start_demo: "デモ中のスタートからタイトルを描き始めるまでのフレーム数",
      start_title: "タイトルでのスタートから次の画面を描き始めるまでのフレーム数",
    },
    column: (n: string) => `${n} 個、縦に並べて`,
    row: (n: string) => `${n} 個、横に並べて`,
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function TitlePart({ lang, m, a }: { lang: Lang; m: TitleMeasures; a?: (TitleMeasures & { game: string }) | null }) {
  const S = TITLE[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const opt = (v: number | undefined) => (v === undefined ? "" : n(v));
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: TitleMeasures) => string][] = [
    ["frames", (x) => n(x.title.frames)],
    ["cleared", (x) => n(x.title.cleared)],
    ["tiles", (x) => n(x.title.tiles)],
    ["cursor", (x) => (x.cursor ? (x.cursor.step === 32 ? S.column : S.row)(n(x.cursor.tiles)) : "")],
    ["countdown", (x) => opt(x.countdown)],
    ["demo", (x) => opt(x.demo?.frames)],
    ["scrolled", (x) => (x.demo ? (x.demo.scrolled ? S.yes : S.no) : "")],
    ["start_demo", (x) => opt(x.start_demo)],
    ["start_title", (x) => opt(x.start_title)],
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
    </>
  );
}
