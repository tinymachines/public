import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { RunMeasures, OneJump } from "@/lib/lessons";

/**
 * The run lesson's own part of its page: walking and running tops, the
 * two jumps, and the speed at which the jump changes, found on both by
 * jumping after more and more frames of running. Every figure is the
 * record's.
 */

export const RUN = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The jump lesson&rsquo;s square with B to run. Running is faster, and a
        jump taken while running starts faster and pulls harder, so it goes
        higher and still comes down in good time. The program is <b>{n}</b>{" "}
        instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "Two jumps, chosen by the speed",
    how: (
      <>
        Holding B in Super Mario Bros. raises the top speed and the speed-up toward it. Jumping at different
        speeds showed that there are two jumps, not one that grows with speed: up to walking speed, one; any
        faster, the other, which starts faster and pulls harder on the way up and down. So a running jump
        is not a walking jump pushed further; it is a different set of numbers, picked at the moment of the
        jump. This cartridge picks the same way.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      walk: "top walking speed, pixels a frame",
      run: "top running speed, and frames of B to reach it",
      walkJump: "walking jump: first speed up, pull with A held, pull after",
      runJump: "running jump: the same",
      rose: "rise with A held 20 frames: walking, running",
      line: "speed before the jump (sixteenths): the fastest light jump, the slowest strong one",
    },
    jump: (j: OneJump, n: (v: number) => string) => `${n(-j.first)}, ${j.held === null ? "" : n(j.held)}/256, ${j.released === null ? "" : n(j.released)}/256`,
    pair: (a: string, b: string) => `${a}, ${b}`,
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        ジャンプのレッスンの四角に、B で走ることを足した。走ると速く、走りながらのジャンプは速く始まって強く引かれるので、高く上がり、それでもほどよく降りてくる。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "速さで選ぶ、二つのジャンプ",
    how: (
      <>
        スーパーマリオブラザーズで B を押していると、最高速とそこへの速まり方が上がる。いろいろな速さで跳んでみると、速さにつれて伸びる一つのジャンプではなく、二つのジャンプがあった: 歩く速さまでは一方、それより速ければもう一方で、そちらは速く始まり、上りも下りも強く引かれる。走りながらのジャンプは歩くジャンプを伸ばしたものではなく、跳ぶ瞬間に選ばれる別の数の組だ。このカートリッジも同じように選ぶ。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      walk: "歩く最高速、1 フレームあたりのピクセル",
      run: "走る最高速と、B を押してそこに達するまでのフレーム数",
      walkJump: "歩いてのジャンプ: 最初の上向きの速さ、A を押している間の引き、その後の引き",
      runJump: "走ってのジャンプ: 同じもの",
      rose: "A を 20 フレーム押したときの上がり: 歩いて、走って",
      line: "跳ぶ前の速さ (16 分の 1 単位): 弱いジャンプの最も速いもの、強いジャンプの最も遅いもの",
    },
    jump: (j: OneJump, n: (v: number) => string) => `${n(-j.first)}、${j.held === null ? "" : n(j.held)}/256、${j.released === null ? "" : n(j.released)}/256`,
    pair: (a: string, b: string) => `${a}、${b}`,
  },
} as const;

export function RunPart({ lang, m, a }: { lang: Lang; m: RunMeasures; a?: (RunMeasures & { game: string }) | null }) {
  const S = RUN[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: RunMeasures) => string][] = [
    ["walk", (x) => n(x.walk_top)],
    ["run", (x) => S.pair(n(x.run_top), n(x.run_after))],
    ["walkJump", (x) => S.jump(x.walk_jump, n)],
    ["runJump", (x) => S.jump(x.run_jump, n)],
    ["rose", (x) => S.pair(n(x.walk_jump.rose), n(x.run_jump.rose))],
    ["line", (x) => S.pair(n(x.light_max), n(x.strong_min))],
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
