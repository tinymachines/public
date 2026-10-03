import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { StatusMeasures } from "@/lib/lessons";

/**
 * The status lesson's own part of its page: where the picture is split,
 * the bar's scroll, and what of the bar is rewritten and how often, read
 * on both from the logs of every scroll pair (with its picture line) and
 * every write to the picture chip's memory. Every figure is the record's.
 */

export const STATUS = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The scroll lesson with a bar across the top that does not move while
        the level scrolls under it, and a timer in the bar counting down. The
        program is <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and
        checked the same way.
      </>
    ),
    howH: "One picture, two scrolls",
    how: (
      <>
        The picture chip has one scroll, and it draws the picture a line at a time. To keep a bar still over
        a level that moves, the program changes the scroll partway down the picture. It has to know when, and
        the chip tells it one way: when the first sprite is drawn over a solid pixel of the background, a flag
        goes up. So a sprite sits behind the bar&rsquo;s bottom line, the program waits for the flag, and then
        sets the level&rsquo;s scroll for everything below. Super Mario Bros. was seen setting its level&rsquo;s
        scroll on the same line every frame, and rewriting nothing in its bar but the timer.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      split: "line the level's scroll is set on, frames it was, of the frames played",
      bar: "the bar's scroll, set in the blank",
      timer: "the timer: row, column, tiles",
      every: "the timer: frames between rewrites",
      other: "other writes to the bar while playing",
    },
    of: (a: string, b: string) => `line ${a}, ${b}`,
    frames: (a: string, b: string) => `${a} of ${b}`,
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        スクロールのレッスンの上に、レベルがその下でスクロールしても動かない帯を一本渡し、帯の中でタイマーが減っていく。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "一枚の絵に、二つのスクロール",
    how: (
      <>
        絵のチップのスクロールは一つで、絵は一ラインずつ描かれる。動くレベルの上に帯を止めておくには、絵の途中でスクロールを変える。いつ変えるかを知らなければならず、チップが知らせる方法は一つある: 最初のスプライトが背景の不透明な点の上に描かれると、フラグが立つ。だからスプライトを帯の下の線の裏に置き、プログラムはフラグを待って、その下のすべてにレベルのスクロールを設定する。スーパーマリオブラザーズは毎フレーム同じラインでレベルのスクロールを設定し、帯の中ではタイマーのほかは何も書き直していなかった。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      split: "レベルのスクロールを設定するライン、そうしたフレーム数、遊んだフレーム数のうち",
      bar: "帯のスクロール、ブランクで設定",
      timer: "タイマー: 行、列、タイルの数",
      every: "タイマー: 書き直しの間のフレーム数",
      other: "遊んでいる間に帯へ書いたほかのもの",
    },
    of: (a: string, b: string) => `ライン ${a}、${b}`,
    frames: (a: string, b: string) => `${b} フレームのうち ${a}`,
  },
} as const;

export function StatusPart({ lang, m, a }: { lang: Lang; m: StatusMeasures; a?: (StatusMeasures & { game: string }) | null }) {
  const S = STATUS[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: StatusMeasures) => string][] = [
    ["split", (x) => S.of(n(x.split_line), S.frames(n(x.split_frames), n(x.frames)))],
    ["bar", (x) => x.bar_scroll.map(n).join(", ")],
    ["timer", (x) => [x.timer.row, x.timer.column, x.timer.tiles].map(n).join(", ")],
    ["every", (x) => x.timer.every.map(n).join(", ")],
    ["other", (x) => n(x.other_bar_writes)],
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
