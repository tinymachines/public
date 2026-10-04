import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { SolidMeasures } from "@/lib/lessons";

/**
 * The solid lesson's own part of its page: ground, a block bumped from
 * below and a wall, read the same way on both (solid_measures) from a
 * run that jumps under a block and walks on into a wall. Every figure is
 * the record's.
 */

export const SOLID = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The jump lesson&rsquo;s square in a small level of its own: ground, a block overhead and a wall. Play
        it: jump under the block, then walk into the wall and keep pushing. The program is <b>{n}</b>{" "}
        instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "A jump ends where a block begins",
    how: (
      <>
        When Mario jumps up into a block in Super Mario Bros., the jump simply stops: on the frame his head
        touches the block his upward speed is gone, and he falls back from right there. The block&rsquo;s tiles
        go blank as it is bumped (the bump itself is drawn as a sprite) and come back, used, a few frames
        later. At a wall, his position holds while Right is still held: the game keeps taking his speed away,
        and it builds up again only to be taken away again a few frames later. This cartridge keeps its level
        as a grid of 16-pixel blocks in memory and looks it up at the square&rsquo;s own edges, ahead of it as it
        walks, above it as it rises and below it as it falls, to do the same.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      rising: "pixels a frame it was still rising when it touched the block",
      fall: "frames from the touch to standing on the ground again",
      block: "frames from the touch until the block's tiles go blank",
      back: "frames until they are drawn again, bumped",
      zeroed: "times the speed across was taken away at the wall, and frames apart",
      pushed: "pushed back a pixel out of the wall",
    },
    zeroed: (n: string, every: string) => `${n}, every ${every}`,
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        ジャンプのレッスンの四角を、自前の小さなレベルに置いた: 地面、頭上のブロック、そして壁。遊んで、ブロックの下で跳び、それから壁へ歩いて押し続けてみてほしい。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "ブロックのあるところでジャンプは終わる",
    how: (
      <>
        スーパーマリオブラザーズで、マリオが跳んでブロックにぶつかると、ジャンプはそこで止まる: 頭がブロックに触れたフレームで上向きの速さが消え、その場から落ちていく。突き上げられたブロックのタイルは消え（跳ね上がる姿はスプライトで描く）、数フレーム後に使用済みのブロックとして戻る。壁では、右を押し続けても位置は動かない: ゲームが速さを取り上げ続け、速さはまた溜まっては数フレーム後にまた取り上げられる。このカートリッジは、16 ピクセル角のブロックの格子としてレベルをメモリに持ち、四角自身の縁で調べる。歩くときは前を、上るときは上を、落ちるときは下を見て、同じことをする。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      rising: "ブロックに触れたとき、まだ上っていた速さ（ピクセル毎フレーム）",
      fall: "触れてから地面に立つまでのフレーム数",
      block: "触れてからブロックのタイルが消えるまでのフレーム数",
      back: "使用済みとして描き直すまでのフレーム数",
      zeroed: "壁で横の速さが取り上げられた回数と、その間のフレーム数",
      pushed: "壁から一ピクセル押し戻される",
    },
    zeroed: (n: string, every: string) => `${n} 回、${every} フレームおき`,
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function SolidPart({ lang, m, a }: { lang: Lang; m: SolidMeasures; a?: (SolidMeasures & { game: string }) | null }) {
  const S = SOLID[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: SolidMeasures) => string][] = [
    ["rising", (x) => n(x.rising)],
    ["fall", (x) => n(x.fall_frames)],
    ["block", (x) => n(x.block_after)],
    ["back", (x) => n(x.block_back)],
    ["zeroed", (x) => S.zeroed(n(x.zeroed), x.zeroed_every.map(n).join(", "))],
    ["pushed", (x) => (x.pushed_back ? S.yes : S.no)],
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
