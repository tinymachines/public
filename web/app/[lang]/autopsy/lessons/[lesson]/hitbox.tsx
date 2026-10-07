import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { HitboxMeasures } from "@/lib/lessons";

/**
 * The hitbox lesson's own part of its page: a box inside each picture,
 * read the same way on both (hitbox_measures) from the boxes the game
 * keeps in memory and the pictures it draws. Every figure is the record's.
 */

export const HITBOX = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The stomp lesson&rsquo;s square and walker, with the thing that decides a touch made visible. Press Select to
        see each one&rsquo;s box, then walk into the walker: the pictures overlap first, and nothing happens until
        the boxes do. The program is <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "What touches is smaller than what you see",
    how: (
      <>
        Super Mario Bros. keeps a box for Mario and one for every enemy, four edges each, written into memory every
        frame from where the thing is. We read them off the running game: Mario&rsquo;s box is three pixels in from
        either side of his picture and four down from its top, to its bottom; a Goomba&rsquo;s is a band across the
        middle of its picture, six down from the top and four up from the bottom. When Mario walked into a Goomba,
        the two pictures were already overlapping a frame before the boxes were, and the hit came only with the
        boxes. This cartridge keeps its boxes the same way, with those numbers.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      player: "the player's box, in from its picture: left, top, right, bottom",
      walker: "the walker's box, in from its picture",
      pictures: "the first touch: the pictures overlapped by, across and down, the frame before it was known",
      boxes: "and the boxes by",
      before: "frames the pictures had overlapped while the boxes did not",
      known: "the touch is known",
    },
    list: (v: number[]) => v.join(", "),
    gap: (v: string) => `not yet, ${v} apart`,
    same: "as the boxes meet",
    after: "the frame after the boxes meet",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        踏みつけのレッスンの四角と歩き手に、触れたかを決めるものを見えるようにした。Select を押すとそれぞれの箱が見える。そのまま歩き手に歩いてぶつかってみてほしい: 先に絵が重なり、箱が重なるまでは何も起きない。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "触れるものは、見えるものより小さい",
    how: (
      <>
        スーパーマリオブラザーズは、マリオにひとつ、敵のそれぞれにひとつ、四つの辺からなる箱を持ち、毎フレーム、そのものの位置からメモリに書き込む。動いているゲームからそれを読み取った。マリオの箱は絵の両脇から 3 ピクセル内側、上から 4 ピクセル下、下端は絵の下端まで。クリボーの箱は絵の真ん中を横切る帯で、上から 6 ピクセル下、下から 4 ピクセル上。マリオがクリボーに歩いてぶつかったとき、二つの絵は箱が重なる一フレーム前にすでに重なっていて、ぶつかりは箱が重なってはじめて起きた。このカートリッジも同じやり方で、その数で箱を持つ。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      player: "プレイヤーの箱、絵からの内側: 左、上、右、下",
      walker: "歩き手の箱、絵からの内側",
      pictures: "最初の触れ: 分かる一フレーム前に、絵が重なっていた幅、横と縦",
      boxes: "そして箱が重なっていた幅",
      before: "箱は重ならずに絵だけが重なっていたフレーム数",
      known: "触れたと分かるのは",
    },
    list: (v: number[]) => v.join("、"),
    gap: (v: string) => `まだで、${v} 離れている`,
    same: "箱が重なったそのフレーム",
    after: "箱が重なった次のフレーム",
  },
} as const;

export function HitboxPart({ lang, m, a }: { lang: Lang; m: HitboxMeasures; a?: (HitboxMeasures & { game: string }) | null }) {
  const S = HITBOX[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: HitboxMeasures) => string][] = [
    ["player", (x) => S.list(x.player)],
    ["walker", (x) => S.list(x.walker)],
    ["pictures", (x) => S.list(x.pictures)],
    ["boxes", (x) => (Math.min(...x.boxes) <= 0 ? S.gap(n(-Math.min(...x.boxes))) : S.list(x.boxes))],
    ["before", (x) => n(x.before)],
    ["known", (x) => (x.after ? S.after : S.same)],
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
