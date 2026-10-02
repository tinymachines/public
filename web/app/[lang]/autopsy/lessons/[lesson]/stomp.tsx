import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { StompMeasures, Touch } from "@/lib/lessons";

/**
 * The stomp lesson's own part of its page: a walker, the first stomp and
 * the first hit, measured on this cartridge and on the game the same way
 * (where the two were the frame before they touched, the player's speed
 * down then and after), and the routine our own autopsy named. Every
 * figure is the record's.
 */

export const STOMP = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The jump lesson&rsquo;s square, and something walking toward it. Come
        down on it and it is flattened; walk into it and the square is sent
        back to the start. The program is <b>{n}</b> instructions in{" "}
        <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "Above and falling is a stomp; anything else is a hit",
    how: (
      <>
        In Super Mario Bros. we watched the slots that hold the enemies and the
        byte that holds Mario&rsquo;s state, and read where Mario and the enemy were
        the frame before either changed. Landing on a Goomba happened with Mario
        falling and above it; walking into one, with Mario on the ground beside
        it. This cartridge decides the same way: when the two squares overlap,
        it asks whether the square is falling and is the higher of the two.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      walk: "the walker's speed, pixels a frame",
      stomp: "a stomp: across, down, the frame before",
      bounce: "a stomp: the player's speed down, before and after",
      flat: "frames the walker stays flattened",
      hit: "a hit: across, down, the frame before",
      after: "a hit: what changed",
    },
    pair: (a: string, b: string) => `${a}, ${b}`,
    reset: "the square is back at the start",
    state: (a: string, b: string) => `the player's state ${a} to ${b}`,
    foundH: "What the autopsy said of it",
    found: (name: string, x: string, y: string) => (
      <>
        Run over this cartridge, the autopsy marked one routine as comparing two positions, <code>{name}</code>,
        with <code>{x}</code> across and <code>{y}</code> down: the square&rsquo;s and the walker&rsquo;s. It is the
        routine written below as <code>touch</code>.
      </>
    ),
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        ジャンプのレッスンの四角と、それに向かって歩いてくるもの。上から降りればそれは潰れ、歩いてぶつかれば四角は最初の場所へ戻される。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "上から落ちてくれば踏みつけ、それ以外はぶつかり",
    how: (
      <>
        スーパーマリオブラザーズで、敵を持つ枠とマリオの状態を持つバイトを見て、どちらかが変わる前のフレームでマリオと敵がどこにいたかを読んだ。クリボーに乗ったのは、マリオが落ちていて敵より上にいたとき。歩いてぶつかったのは、マリオが地面の上で敵の隣にいたとき。このカートリッジも同じように決める: 二つの四角が重なったら、四角が落ちていて、二つのうち高いほうかを問う。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      walk: "歩くものの速さ、1 フレームあたりのピクセル",
      stomp: "踏みつけ: 前のフレームの横と縦のずれ",
      bounce: "踏みつけ: プレイヤーの下向きの速さ、前と後",
      flat: "歩くものが潰れている間のフレーム数",
      hit: "ぶつかり: 前のフレームの横と縦のずれ",
      after: "ぶつかり: 何が変わったか",
    },
    pair: (a: string, b: string) => `${a}、${b}`,
    reset: "四角が最初の場所に戻る",
    state: (a: string, b: string) => `プレイヤーの状態が ${a} から ${b} に`,
    foundH: "解剖がそれについて言ったこと",
    found: (name: string, x: string, y: string) => (
      <>
        このカートリッジを解剖すると、二つの位置を比べるルーチンとして <code>{name}</code> が一つ印された。横は <code>{x}</code>、縦は <code>{y}</code>: 四角と歩くものの位置だ。下に <code>touch</code> と書いたルーチンがそれだ。
      </>
    ),
  },
} as const;

export function StompPart({ lang, m, a }: { lang: Lang; m: StompMeasures; a?: (StompMeasures & { game: string }) | null }) {
  const S = STOMP[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const at = (x: Touch) => S.pair(n(x.dx), n(x.dy));
  const ours = m.hit.state[0] === m.hit.state[1];
  const rows: [keyof typeof S.rows, (x: StompMeasures, mine: boolean) => string][] = [
    ["walk", (x) => n(x.walk)],
    ["stomp", (x) => at(x.stomp)],
    ["bounce", (x) => S.pair(n(x.stomp.fall), n(x.stomp.after))],
    ["flat", (x) => n(x.stomp.flat)],
    ["hit", (x) => at(x.hit)],
    ["after", (x, mine) => (mine && ours ? S.reset : S.state(n(x.hit.state[0]), n(x.hit.state[1])))],
  ];
  const c = m.compare?.find((x) => x.is_touch);
  return (
    <>
      <h2>{S.howH}</h2>
      <p>{S.how}</p>
      <div className="ledger">
        <div className="scroller">
          <table data-lesson-against>
            <thead>
              <tr>{S.cols(game).map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(([k, f]) => (
                <tr key={k} data-lesson-row={k} data-lesson-ours={f(m, true)} data-lesson-theirs={a ? f(a, false) : ""}>
                  <td>{S.rows[k]}</td>
                  <td>{f(m, true)}</td>
                  <td>{a ? f(a, false) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {c ? (
        <>
          <h3>{S.foundH}</h3>
          <p data-lesson-found={c.name}>{S.found(c.name, c.x, c.y)}</p>
        </>
      ) : null}
    </>
  );
}
