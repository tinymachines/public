import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { FlickerMeasures, FlickerOne } from "@/lib/lessons";

/**
 * The flicker lesson's own part of its page: sprites on a line, read the
 * same way on both from the sprite memory each game hands the picture
 * chip (flicker_measures). Ours is read twice, with the order kept and
 * with it turning; the game only ever turns it. Every figure is the
 * record's.
 */

export const FLICKER = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        Ten figures standing on one line, two more than the console can draw there. Play it and press Select
        to turn the order on and off: off, the same two are missing every frame; on, they all flicker. The
        program is <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "The console draws eight sprites on a line",
    how: (
      <>
        The picture chip looks through sprite memory as it draws each line and takes the first eight sprites it
        finds there; any more on that line are simply left out. A game that writes its sprites in the same order
        every frame loses the same ones every frame, and they are never seen. Super Mario Bros. moves an
        enemy&rsquo;s sprites to a different place in sprite memory each frame, round a short cycle, so that if a
        line ever has too many, a different one goes missing each time and they all flicker instead. In the run
        we measured it never had more than eight on a line, so nothing was left out; the turning is there all
        the same. This cartridge shows the problem and the cure side by side.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      most: "most sprites on one line",
      left: "sprites left out on that line each frame",
      kept: "figures never drawn, written in the same order every frame",
      turned: "figures never drawn, with the order turning",
      cycle: "frames before a figure's sprites are back in the same place in sprite memory",
    },
    always: "it always turns",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        一行に立つ十の姿。コンソールがそこに描けるより二つ多い。遊んでセレクトを押し、順番を回すのを入れたり切ったりしてみてほしい: 切ると毎フレーム同じ二つが欠け、入れるとみんながちらつく。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "コンソールは一行にスプライトを八つ描く",
    how: (
      <>
        画像チップは一行を描くたびにスプライトのメモリを調べ、見つけた最初の八つを取る。その行にそれより多くあれば、ただ描かれない。毎フレーム同じ順番でスプライトを書くゲームは、毎フレーム同じものを失い、それは一度も見えない。スーパーマリオブラザーズは、敵のスプライトをフレームごとにスプライトのメモリの別の場所へ、短い周期で回して移す。だから一行に多すぎることがあっても、欠けるのは毎回違うものになり、どれも消えずにちらつく。測った走行では一行に八つを超えたことはなく、描かれずに残ったものは無かったが、回すことはそれでもしている。このカートリッジは、問題とその手当てを並べて見せる。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      most: "一行に並んだスプライトの最大数",
      left: "その行で毎フレーム描かれずに残ったスプライトの数",
      kept: "毎フレーム同じ順番で書いたとき、一度も描かれなかった姿の数",
      turned: "順番を回したとき、一度も描かれなかった姿の数",
      cycle: "姿のスプライトがスプライトのメモリの同じ場所に戻るまでのフレーム数",
    },
    always: "常に回している",
  },
} as const;

export function FlickerPart({ lang, m, a }: { lang: Lang; m: FlickerMeasures; a?: (FlickerOne & { game: string }) | null }) {
  const S = FLICKER[lang];
  const n = (v: number | null) => (v === null ? "" : v.toLocaleString(lang));
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, string, string][] = [
    ["most", n(m.turned.most), a ? n(a.most) : ""],
    ["left", n(m.turned.left_out), a ? n(a.left_out) : ""],
    ["kept", n(m.kept.never_drawn), a ? S.always : ""],
    ["turned", n(m.turned.never_drawn), a ? n(a.never_drawn) : ""],
    ["cycle", n(m.turned.cycle), a ? n(a.cycle) : ""],
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
              {rows.map(([k, ours, theirs]) => (
                <tr key={k} data-lesson-row={k} data-lesson-ours={ours} data-lesson-theirs={theirs}>
                  <td>{S.rows[k]}</td>
                  <td>{ours}</td>
                  <td>{theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
