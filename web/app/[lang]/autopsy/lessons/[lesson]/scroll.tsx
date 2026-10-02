import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { ScrollMeasures } from "@/lib/lessons";

/**
 * The scroll lesson's own part of its page: how the land ahead of the
 * camera is written, measured on this cartridge and on the game, from the
 * log of every write each made to the picture chip's memory. Every figure
 * is the record's.
 */

const one = (v: string[]) => (v.length === 1 ? v[0] : v.join(" / "));
/** A list the record keeps as text ("[2, 3, 6, 7]"), as the frames themselves. */
const frames = (v: string[]) => v.map((x) => (JSON.parse(x) as number[]).join(", ")).join(" / ");

export const SCROLL = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The square from the jump lesson in a world wider than the screen.
        Right walks, and once the square is a little way across, the picture
        follows it. The program is <b>{n}</b> instructions in <b>{bytes}</b>{" "}
        bytes, built and checked the same way.
      </>
    ),
    howH: "How the land ahead is written",
    how: (
      <>
        The picture chip holds two screens of tiles side by side, and the
        scroll says where in them the picture starts. Ahead of the camera,
        off the right edge, the program writes the land the camera is about
        to reach. Watching Super Mario Bros. do this, every write it made to
        the picture chip&rsquo;s memory logged, showed the shape: each time the
        camera moved 32 pixels, a strip 32 pixels wide was written, as four
        columns of tiles going down, spread over several frames, and then
        that strip&rsquo;s column of colour choices. This cartridge does the
        same, and the table measures both the same way.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      strips: "strips written in the run",
      every: "pixels of camera between strips",
      frames: "frames a strip's countdown runs",
      columns: "columns in a strip",
      tiles: "tiles in a column",
      colours: "colour bytes in a strip",
      ahead: "pixels past the right edge where a strip starts",
      when: "frames into the strip each column is written",
    },
    every: (lo: string, hi: string, mean: string) => `${lo} to ${hi}, ${mean} on average`,
    range: (lo: string, hi: string) => (lo === hi ? lo : `${lo} to ${hi}`),
    lagH: "One frame later",
    lag: (ours: string, theirs: string, game: string) => (
      <>
        This cartridge writes each column one frame later in its strip (frames {ours}) than {game} does (frames {theirs}). It
        works out the column in its main loop and the picture chip takes it in the next blank; {game} runs its
        whole game inside the blank&rsquo;s interrupt, which the autopsy marks as the loop inside the interrupt.
      </>
    ),
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        ジャンプのレッスンの四角を、画面より広い世界に置いた。右で歩き、四角が少し進むと絵がそれを追う。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "先の土地をどう書くか",
    how: (
      <>
        絵のチップはタイル二画面ぶんを横に並べて持ち、スクロールはその中のどこから絵を始めるかを言う。カメラの先、右端の外に、プログラムはカメラがこれから着く土地を書く。スーパーマリオブラザーズがこれをするところを、絵のチップのメモリへの書き込みをすべて記録して見ると、形が分かった: カメラが 32 ピクセル動くたびに、幅 32 ピクセルの帯を、下へ向かうタイルの列四本として何フレームかに分けて書き、それからその帯の色の選び方を一列書く。このカートリッジも同じことをし、表は両方を同じやり方で測る。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      strips: "走行の間に書いた帯の数",
      every: "帯と帯の間にカメラが動いたピクセル",
      frames: "帯のカウントダウンが続くフレーム数",
      columns: "帯一本の列の数",
      tiles: "列一本のタイルの数",
      colours: "帯一本の色のバイト数",
      ahead: "帯が始まる位置、右端から何ピクセル先か",
      when: "帯の何フレーム目に各列を書くか",
    },
    every: (lo: string, hi: string, mean: string) => `${lo} から ${hi}、平均 ${mean}`,
    range: (lo: string, hi: string) => (lo === hi ? lo : `${lo} から ${hi}`),
    lagH: "一フレーム遅れて",
    lag: (ours: string, theirs: string, game: string) => (
      <>
        このカートリッジは、各列を帯の中で {game} より一フレーム遅く書く (このカートリッジは {ours} フレーム目、{game} は {theirs} フレーム目)。列をメインループで用意し、絵のチップは次のブランクでそれを受け取るからだ。{game} はゲーム全体をブランクの割り込みの中で走らせる。解剖はそれを、割り込みの中のループと印している。
      </>
    ),
  },
} as const;

export function ScrollPart({ lang, m, a }: { lang: Lang; m: ScrollMeasures; a?: (ScrollMeasures & { game: string }) | null }) {
  const S = SCROLL[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [string, (x: ScrollMeasures) => string][] = [
    ["strips", (x) => n(x.strips)],
    ["every", (x) => S.every(n(x.every_min), n(x.every_max), n(x.every_mean))],
    ["frames", (x) => one(x.frames)],
    ["columns", (x) => one(x.columns)],
    ["tiles", (x) => x.tiles.map(n).join(" / ")],
    ["colours", (x) => one(x.colours)],
    ["ahead", (x) => S.range(n(x.ahead_min), n(x.ahead_max))],
    ["when", (x) => frames(x.column_frames)],
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
                  <td>{S.rows[k as keyof typeof S.rows]}</td>
                  <td>{f(m)}</td>
                  <td>{a ? f(a) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {a && one(m.column_frames) !== one(a.column_frames) ? (
        <>
          <h3>{S.lagH}</h3>
          <p>{S.lag(frames(m.column_frames), frames(a.column_frames), game)}</p>
        </>
      ) : null}
    </>
  );
}
