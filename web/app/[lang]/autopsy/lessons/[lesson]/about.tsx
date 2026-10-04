import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { AboutMeasures } from "@/lib/lessons";

/**
 * The about lesson's own part of its page: words crawling up the screen,
 * read the same way on both (about_measures) from a run that touches
 * nothing, from the first new row written. Every figure is the record's.
 */

export const ABOUT = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        An about screen for our square: a few lines of our own, crawling up the screen and starting again
        when they run out. Play it and read along. The program is <b>{n}</b> instructions in <b>{bytes}</b>{" "}
        bytes, built and checked the same way.
      </>
    ),
    howH: "One row for every row it moves",
    how: (
      <>
        Leave the title of The Legend of Zelda alone and it tells you its story, the words creeping up the
        screen. The console holds two screens of background, stacked one above the other on this board, and
        the game simply scrolls down through them and round again, one pixel every second frame. It never
        redraws the screen: each time the words have moved up by one row&rsquo;s height, 8 pixels, it writes a
        single new row of 32 tiles into the row about to come into view, plus a few colour bytes now and then
        for the words it shows in colour. That is all the drawing a whole story needs. This cartridge does the
        same with our own words, in one colour.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      step: "pixels the words move, and frames between moves",
      rows: "rows written, and frames apart",
      row_pixels: "pixels of crawl for each row written",
      colours: "colour bytes written",
      other: "other tiles written",
      split: "the picture is split",
      crawled: "pixels crawled in the frames measured",
    },
    step: (px: string, every: string) => `${px}, every ${every}`,
    rowsEvery: (n: string, every: string) => `${n}, every ${every}`,
    crawled: (px: string, frames: string) => `${px} in ${frames}`,
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        私たちの四角のための「について」の画面: 私たちの言葉が数行、画面を這い上がり、尽きるとまた初めから。遊んで、一緒に読んでみてほしい。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "一行動くごとに一行",
    how: (
      <>
        ゼルダの伝説のタイトルを放っておくと、物語を語り始め、言葉が画面をゆっくり上っていく。コンソールには背景二画面ぶんの場所があり、このボードでは上下に積まれている。ゲームはそれを下へ、二フレームに一ピクセルずつスクロールし、端まで来るとまた初めに戻るだけだ。画面を描き直すことはない: 言葉が一行の高さ、8 ピクセル上がるたびに、これから見えてくる行へ 32 タイルの新しい一行を書き、色つきで見せる言葉のために、ときどき色のバイトを少し書く。物語一つに要る描画はそれだけだ。このカートリッジも、私たちの言葉を一色で同じように見せる。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      step: "言葉が動くピクセル数と、その間のフレーム数",
      rows: "書いた行数と、その間のフレーム数",
      row_pixels: "一行書くごとの這い上がりのピクセル数",
      colours: "書いた色のバイト数",
      other: "そのほかに書いたタイルの数",
      split: "絵を分ける",
      crawled: "測ったフレームの間に這い上がったピクセル数",
    },
    step: (px: string, every: string) => `${px}、${every} フレームおき`,
    rowsEvery: (n: string, every: string) => `${n} 行、${every} フレームおき`,
    crawled: (px: string, frames: string) => `${frames} フレームで ${px}`,
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function AboutPart({ lang, m, a }: { lang: Lang; m: AboutMeasures; a?: (AboutMeasures & { game: string }) | null }) {
  const S = ABOUT[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const opt = (v: number | null) => (v === null ? "" : n(v));
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: AboutMeasures) => string][] = [
    ["step", (x) => S.step(opt(x.step), opt(x.every))],
    ["rows", (x) => S.rowsEvery(n(x.rows), opt(x.row_every))],
    ["row_pixels", (x) => opt(x.row_pixels)],
    ["colours", (x) => n(x.colours)],
    ["other", (x) => n(x.other)],
    ["split", (x) => (x.split ? S.yes : S.no)],
    ["crawled", (x) => S.crawled(n(x.crawled), n(x.frames))],
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
