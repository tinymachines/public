import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { CameraMeasures } from "@/lib/lessons";

/**
 * The camera lesson's own part of its page: a dead zone, read the same
 * way on both (camera_measures) from the player's x and the camera's in
 * memory. Every figure is the record's.
 */

export const CAMERA = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        A level two screens wide and a square to walk across it. Play it, walk right and watch the posts: the picture
        waits, then starts to slide, then keeps pace. Turn round and the square walks back across the screen before
        the picture follows. The program is <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and checked the
        same way.
      </>
    ),
    howH: "The camera waits, then eases in, then holds",
    how: (
      <>
        Super Mario Bros. does not keep Mario in the middle of the screen. Walking right, he crosses the left part
        of it with the picture standing still. A little past 80 pixels the camera starts to move, but slower than he
        does, so he keeps gaining on it until he is at 112; from there it takes every pixel he moves. That stretch
        where he moves and the camera does not is the dead zone, and the slow start is why the scroll never jerks.
        Walking left, the game&rsquo;s camera never moves at all, which is why Mario cannot go back into a level.
        This cartridge has the game&rsquo;s right edge exactly, and a left edge of its own at 48 so the camera follows
        it back.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      starts_at: "where on the screen the player is when the camera first moves",
      holds_at: "where it holds the player once it keeps pace",
      eased: "frames it moved slower than the player, easing in",
      back: "the camera follows the player back to the left",
      back_at: "where it holds the player walking left",
      restarts_at: "where it starts again after the player turns back right",
    },
    yes: "yes",
    no: "no, never",
    none: "none",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        二画面分の幅のレベルと、そこを歩く四角。遊んで右へ歩き、柱を見ていてほしい: 絵はしばらく動かず、それから滑り出し、やがて歩みに追いつく。向きを変えると、絵が追ってくる前に四角が画面を歩いて戻る。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "カメラは待ち、ゆっくり動き出し、それから留める",
    how: (
      <>
        スーパーマリオブラザーズは、マリオを画面の真ん中に置き続けはしない。右へ歩くと、マリオは絵が止まったまま画面の左側を横切る。80 ピクセルを少し過ぎるとカメラが動き出すが、マリオより遅いので、マリオは 112 に来るまでカメラに追いつき続ける。そこからはマリオが動いたぶんをカメラがすべて受け持つ。マリオが動いてもカメラが動かないその範囲が遊びで、ゆっくりした動き出しのおかげでスクロールは決してがくんとしない。左へ歩くと、ゲームのカメラはまったく動かない。マリオがレベルを戻れないのはそのためだ。このカートリッジは右側をゲームのとおりに持ち、左側には 48 という自前の縁を持つので、カメラは戻って追う。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      starts_at: "カメラが最初に動くときのプレイヤーの画面上の位置",
      holds_at: "歩みに追いついてからプレイヤーを留める位置",
      eased: "プレイヤーより遅く動いた、動き出しのフレーム数",
      back: "左へ戻るプレイヤーをカメラが追う",
      back_at: "左へ歩くときにプレイヤーを留める位置",
      restarts_at: "プレイヤーが右へ向き直ってからカメラがまた動き出す位置",
    },
    yes: "はい",
    no: "いいえ、決して",
    none: "無い",
  },
} as const;

export function CameraPart({ lang, m, a }: { lang: Lang; m: CameraMeasures; a?: (CameraMeasures & { game: string }) | null }) {
  const S = CAMERA[lang];
  const n = (v: number | null) => (v === null ? S.none : v.toLocaleString(lang));
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: CameraMeasures) => string][] = [
    ["starts_at", (x) => n(x.starts_at)],
    ["holds_at", (x) => n(x.holds_at)],
    ["eased", (x) => n(x.eased)],
    ["back", (x) => (x.back ? S.yes : S.no)],
    ["back_at", (x) => n(x.back_at)],
    ["restarts_at", (x) => n(x.restarts_at)],
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
