import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { PlatformsMeasures } from "@/lib/lessons";

/**
 * The platforms lesson's own part of its page: a lift that carries the
 * player, read the same way on both (platforms_measures) from memory.
 * Every figure is the record's.
 */

export const PLATFORMS = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        A hole in the ground with a lift going back and forth over it. Play it, step onto the lift and let go of the
        pad: the square rides it across and back, and walks off its far end onto the other side. The program is{" "}
        <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "Standing on something that moves means moving with it",
    how: (
      <>
        In Super Mario Bros. a lift is an object like an enemy, kept in the same slots and moved a step at a time.
        When Mario stands on one, the game moves him by the lift&rsquo;s own step on the same frame, so he keeps
        his place on it without anything being pressed. We watched a lift in 1-2 carry him and checked every step.
        This cartridge does it the same way, in the order that makes it work: the lift moves first, then the
        square on it by the same, and only then whatever the pad asks for.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      axis: "which way the lift moves",
      step: "pixels a step, and frames between steps",
      travel: "pixels it travels end to end",
      standing: "frames the player stood on it",
      carried: "steps that moved the player by the same, of those taken while standing with nothing pressed its way for a second",
      steady: "the player's height above the lift held steady",
    },
    across: "across",
    down: "vertically",
    noends: "none: it leaves the bottom of the screen and comes back in at the top",
    pace: (a: string, b: string) => `${a}, every ${b}`,
    of: (a: string, b: string) => `${a} of ${b}`,
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        地面の穴の上を、リフトが行き来している。遊んでリフトに乗り、パッドから手を離してみてほしい: 四角はリフトに乗って向こうへ行って戻り、その先の端から向こう側へ歩いて降りる。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "動くものの上に立てば、一緒に動く",
    how: (
      <>
        スーパーマリオブラザーズのリフトは敵と同じようなもので、同じ枠に置かれ、一歩ずつ動かされる。マリオがその上に立っていると、ゲームは同じフレームにリフト自身の一歩だけマリオを動かすので、何も押さなくてもマリオはリフトの上の同じ場所に留まる。1-2 のリフトがマリオを運ぶのを見て、その一歩一歩を確かめた。このカートリッジも同じやり方で、うまくいく順序でそれをする: まずリフトが動き、次にその上の四角が同じだけ動き、パッドが求めることはそのあとだ。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      axis: "リフトが動く向き",
      step: "一歩のピクセル数と、歩と歩のあいだのフレーム数",
      travel: "端から端まで動くピクセル数",
      standing: "プレイヤーが乗っていたフレーム数",
      carried: "その向きに一秒何も押さずに乗っているあいだの歩のうち、プレイヤーを同じだけ動かしたもの",
      steady: "リフトの上面からのプレイヤーの高さは変わらなかった",
    },
    across: "横",
    down: "縦",
    noends: "無い: 画面の下へ出て、上から戻ってくる",
    pace: (a: string, b: string) => `${a}、${b} フレームごと`,
    of: (a: string, b: string) => `${b} のうち ${a}`,
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function PlatformsPart({ lang, m, a }: { lang: Lang; m: PlatformsMeasures; a?: (PlatformsMeasures & { game: string }) | null }) {
  const S = PLATFORMS[lang];
  const n = (v: number | null) => (v === null ? "" : v.toLocaleString(lang));
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: PlatformsMeasures) => string][] = [
    ["axis", (x) => (x.axis === "across" ? S.across : S.down)],
    ["step", (x) => S.pace(n(x.step), n(x.every))],
    ["travel", (x) => (x.travel === null ? S.noends : n(x.travel))],
    ["standing", (x) => n(x.standing)],
    ["carried", (x) => S.of(n(x.same), n(x.stepped))],
    ["steady", (x) => (x.steady ? S.yes : S.no)],
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
