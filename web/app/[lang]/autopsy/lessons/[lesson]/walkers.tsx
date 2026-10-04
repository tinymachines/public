import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { WalkersMeasures } from "@/lib/lessons";

/**
 * The walkers lesson's own part of its page: walkers that turn at walls
 * and at each other, read the same way on both (walker_measures) from
 * memory. Every figure is the record's.
 */

export const WALKERS = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        Two walkers of our own between two walls, with the square from the solid lesson beside them. Play it
        and watch them meet, turn, walk to the walls and back. The program is <b>{n}</b> instructions in{" "}
        <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "A walker needs only two rules",
    how: (
      <>
        The Goombas in Super Mario Bros. move by two simple rules. They step half a pixel a frame, one pixel
        every second frame, and when one walks into a wall it turns round: for one frame it is a pixel inside
        the wall, then it is pushed back out and walks the other way. When two meet, both turn on the same
        frame, already overlapping a little, because the box the game checks is smaller than the picture.
        Our walkers keep the same pace, look the level up at their leading edge the way the square does, and
        turn as soon as they touch, so they are never seen inside a wall or overlapping.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      pace: "pixels a step, and frames between steps",
      walls: "turns at walls seen",
      inside: "a frame spent a pixel inside the wall",
      meetings: "meetings seen, both turning on the same frame",
      overlap: "pixels the two overlap when they turn",
    },
    pace: (px: string, every: string) => `${px}, every ${every}`,
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        二つの壁の間にいる、私たちの二つの歩き手。そばには固さのレッスンの四角もいる。遊んで、出会っては向きを変え、壁まで歩いて戻るのを見てほしい。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "歩き手に要るのは二つの決まりだけ",
    how: (
      <>
        スーパーマリオブラザーズのクリボーは、二つの簡単な決まりで動く。一フレームに半ピクセル、つまり二フレームに一ピクセルずつ進み、壁に歩き当たると向きを変える: 一フレームだけ壁の中に一ピクセル入り、押し戻されて反対へ歩き出す。二つが出会うと、同じフレームで両方が向きを変える。ゲームが調べる箱は絵より小さいので、そのときにはもう少し重なっている。私たちの歩き手は同じ速さで進み、四角と同じように前の縁でレベルを調べ、触れたとたんに向きを変えるので、壁の中にいるところも重なるところも見えない。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      pace: "一歩のピクセル数と、歩く間隔のフレーム数",
      walls: "見えた壁での方向転換の数",
      inside: "一フレーム、壁の中に一ピクセル入る",
      meetings: "見えた出会いの数（どれも同じフレームで両方が向きを変える）",
      overlap: "向きを変えるときに重なるピクセル数",
    },
    pace: (px: string, every: string) => `${px}、${every} フレームおき`,
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function WalkersPart({ lang, m, a }: { lang: Lang; m: WalkersMeasures; a?: (WalkersMeasures & { game: string }) | null }) {
  const S = WALKERS[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const opt = (v: number | null) => (v === null ? "" : n(v));
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: WalkersMeasures) => string][] = [
    ["pace", (x) => S.pace(opt(x.pixels), opt(x.every))],
    ["walls", (x) => n(x.wall_turns)],
    ["inside", (x) => x.inside.map((v) => (v ? S.yes : S.no)).join(", ")],
    ["meetings", (x) => n(x.meetings)],
    ["overlap", (x) => x.overlap.map(n).join(", ")],
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
