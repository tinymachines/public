import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { CoinsMeasures } from "@/lib/lessons";

/**
 * The coins lesson's own part of its page: a coin from a block and the
 * score, read the same way on both (coins_measures) from memory, the
 * writes to the bar and the sprites. Every figure is the record's.
 */

export const COINS = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The solid lesson&rsquo;s level with a bar along the top: a score and a coin count. Play it and jump into
        the block. The program is <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "The count changes at once, the coin takes its time",
    how: (
      <>
        In Super Mario Bros. the coin is counted, and the points added, on the very frame Mario&rsquo;s head
        bumps the block, and the bar at the top is written again on that frame: the coin count, and every digit
        of the score, even though only one of them changed. What you see afterwards is decoration. A coin
        sprite pops out of the block, turning through four pictures as it rises and falls, and when it is gone
        the points it was worth float slowly up from where it was. This cartridge keeps the same order of
        events, with a coin, a flight and digits of its own.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      score: "the score changes on the same frame as the coin count",
      bar: "tiles written to the bar around that frame",
      coin: "frames the coin is seen",
      rise: "pixels the coin rises",
      turn: "pictures the coin turns through, and frames each is shown",
      points: "frames the points are seen, and pixels they rise",
    },
    turn: (n: string, each: string) => `${n}, ${each} frames each`,
    points: (frames: string, px: string) => `${frames}, rising ${px}`,
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        固さのレッスンのレベルに、上の帯を足した: 点数とコインの数。遊んでブロックに跳び上がってみてほしい。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "数はすぐ変わり、コインはゆっくり動く",
    how: (
      <>
        スーパーマリオブラザーズでは、マリオの頭がブロックを突き上げたまさにそのフレームでコインが数えられ、点数が足され、上の帯もそのフレームで書き直される: コインの数と、変わったのは一つだけでも点数のすべての桁を。そのあとに見えるものは飾りだ。コインのスプライトがブロックから飛び出し、上がって落ちる間に四つの絵を回り、それが消えると、その値打ちの点数がいた場所からゆっくり浮かび上がる。このカートリッジも、自前のコインと飛び方と数字で、同じ順番で出来事を起こす。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      score: "点数はコインの数と同じフレームで変わる",
      bar: "そのフレームの前後に帯へ書いたタイルの数",
      coin: "コインが見えているフレーム数",
      rise: "コインが上がるピクセル数",
      turn: "コインが回る絵の数と、それぞれを見せるフレーム数",
      points: "点数が見えているフレーム数と、上がるピクセル数",
    },
    turn: (n: string, each: string) => `${n} 枚、それぞれ ${each} フレーム`,
    points: (frames: string, px: string) => `${frames}、${px} 上がる`,
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function CoinsPart({ lang, m, a }: { lang: Lang; m: CoinsMeasures; a?: (CoinsMeasures & { game: string }) | null }) {
  const S = COINS[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: CoinsMeasures) => string][] = [
    ["score", (x) => (x.score_too ? S.yes : S.no)],
    ["bar", (x) => n(x.bar_tiles)],
    ["coin", (x) => n(x.coin_frames)],
    ["rise", (x) => n(x.coin_rise)],
    ["turn", (x) => S.turn(n(x.coin_pictures), n(x.picture_frames))],
    ["points", (x) => S.points(n(x.points_frames), n(x.points_rise))],
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
