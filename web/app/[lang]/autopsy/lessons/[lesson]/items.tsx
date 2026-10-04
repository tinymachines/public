import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { ItemsMeasures } from "@/lib/lessons";

/**
 * The item screen lesson's own part of its page: an item screen shown by
 * sliding the whole picture away, read the same way on both from the
 * scroll log and the writes to the picture (items_measures), from a run
 * that opens it, presses Start again mid-slide, and closes it. Every
 * figure is the record's.
 */

export const ITEMS = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        A room with a bar, and an item screen of our own: a box, a word and three things. Play it, walk, and
        press Start to slide the picture down; press Start again to slide it back. The program is <b>{n}</b>{" "}
        instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "The item screen is above the room",
    how: (
      <>
        The Legend of Zelda does not cover the room with a box when you press Start. The whole picture, room
        and bar together, slides down a few pixels each frame, and the item screen comes into view above it.
        The console has room for two screens of background, and on this board they are stacked one above the
        other; the item screen lives in the other one. The game draws it there a row at a time, from the
        bottom up, just ahead of the slide, so it never draws a row before it is about to be seen. Nothing
        splits the picture while it moves, and a second Start in the middle of the slide is not read. Pressing
        Start when it has stopped slides everything back, and nothing is drawn on the way. This cartridge
        does the same with a room and an item screen of its own.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      step: "pixels the picture slides each frame",
      travel: "pixels it slides in all",
      open: "frames from Start until it stops",
      rows: "rows of the item screen drawn while it slides, and how many frames apart",
      order: "the rows are drawn from the bottom up",
      ignored: "a second Start in the middle of the slide changed nothing",
      split: "the picture is split while it slides",
      mirroring: "the board's arrangement of the two screens changes",
      close: "frames from Start until the room is back",
      rows_closing: "rows drawn on the way back",
    },
    every: (n: string, every: string) => `${n}, every ${every}`,
    soldered: "no, fixed by the board",
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        帯のある部屋と、私たちのアイテム画面: 枠と言葉と三つの物。遊んで歩き、スタートを押すと絵が下へ滑る。もう一度押すと滑って戻る。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "アイテム画面は部屋の上にある",
    how: (
      <>
        ゼルダの伝説は、スタートを押しても部屋を枠で覆わない。部屋と帯をあわせた絵全体が毎フレーム数ピクセルずつ下へ滑り、その上からアイテム画面が見えてくる。コンソールには背景二画面ぶんの場所があり、このボードではそれが上下に積まれている。アイテム画面はもう一方に置かれる。ゲームはそこへ、下から上へ一行ずつ、滑りのすぐ先を描くので、見える直前まで行を描かない。動いている間に絵を分けることはなく、滑りの途中で二度目のスタートを押しても読まない。止まってからスタートを押すと、すべてが滑って戻り、その間は何も描かない。このカートリッジも、自前の部屋とアイテム画面で同じようにする。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      step: "絵が毎フレーム滑るピクセル数",
      travel: "滑るピクセル数の合計",
      open: "スタートから止まるまでのフレーム数",
      rows: "滑る間に描くアイテム画面の行数と、その間のフレーム数",
      order: "行は下から上へ描く",
      ignored: "滑りの途中の二度目のスタートは何も変えなかった",
      split: "滑る間に絵を分ける",
      mirroring: "ボードの二画面の並べ方が変わる",
      close: "スタートから部屋が戻るまでのフレーム数",
      rows_closing: "戻る間に描く行数",
    },
    every: (n: string, every: string) => `${n} 行、${every} フレームおき`,
    soldered: "いいえ、ボードで決まっている",
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function ItemsPart({ lang, m, a }: { lang: Lang; m: ItemsMeasures; a?: (ItemsMeasures & { game: string }) | null }) {
  const S = ITEMS[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const yn = (v: boolean) => (v ? S.yes : S.no);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: ItemsMeasures) => string][] = [
    ["step", (x) => n(x.step)],
    ["travel", (x) => n(x.travel)],
    ["open", (x) => n(x.open_frames)],
    ["rows", (x) => S.every(n(x.rows), x.every === null ? "" : n(x.every))],
    ["order", (x) => yn(x.bottom_up)],
    ["ignored", (x) => yn(x.ignored)],
    ["split", (x) => yn(x.split)],
    ["mirroring", (x) => (x.mirroring.fixed ? S.soldered : yn(x.mirroring.changes > 0))],
    ["close", (x) => n(x.close_frames)],
    ["rows_closing", (x) => n(x.rows_closing)],
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
