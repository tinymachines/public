import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { LivesMeasures } from "@/lib/lessons";

/**
 * The lives lesson's own part of its page: losing a life and starting
 * again, read the same way on both (lives_measures) from memory and the
 * writes to the picture. Every figure is the record's.
 */

export const LIVES = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The walkers&rsquo; level with three lives. Play it and walk into a walker: the round stops, the square hops
        and falls, a screen says how many lives are left, and the level begins again. Lose all three to see
        the end. The program is <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "A life lost is a short scene of its own",
    how: (
      <>
        When Mario touches a Goomba in Super Mario Bros., the game does not go straight to the next try. Everything
        stops, and Mario stays frozen where he was touched for a moment. Then he hops up and falls straight
        down off the screen, through the ground as if it were not there. Only when the fall is over is the life
        taken. The picture is then cleared for a plain screen showing the lives left, and after a while the
        level starts again from its beginning. This cartridge plays the same scene with its own timings, a
        smaller hop and its own words.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      hang: "frames everything holds still at the touch",
      rise: "pixels the hop rises",
      to_life: "frames from the touch until the life is taken",
      clear: "frames from that until the picture is cleared",
      screen: "frames until play starts again",
      start: "the level begins again from its start",
    },
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        命が三つある、歩き手たちのレベル。遊んで歩き手に歩いてぶつかってみてほしい: 一回が止まり、四角が跳ねて落ち、残りの命を知らせる画面が出て、レベルがまた始まる。三つとも失うと終わりが見える。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "命を失うのは、それだけで短い一場面だ",
    how: (
      <>
        スーパーマリオブラザーズでマリオがクリボーに触れても、ゲームはすぐに次の挑戦へは行かない。すべてが止まり、マリオは触れられた場所でしばらく固まったままになる。それから跳ね上がり、地面など無いかのように、まっすぐ画面の下へ落ちていく。命が取られるのは、落ち切ってからだ。そのあと絵が消され、残りの命を見せる素朴な画面になり、しばらくしてレベルが初めから始まる。このカートリッジも、自前の間合いと、もっと低い跳ねと、自前の言葉で同じ場面を演じる。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      hang: "触れたとき、すべてが止まっているフレーム数",
      rise: "跳ねが上るピクセル数",
      to_life: "触れてから命が取られるまでのフレーム数",
      clear: "そこから絵が消されるまでのフレーム数",
      screen: "また遊べるようになるまでのフレーム数",
      start: "レベルは初めからやり直す",
    },
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function LivesPart({ lang, m, a }: { lang: Lang; m: LivesMeasures; a?: (LivesMeasures & { game: string }) | null }) {
  const S = LIVES[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: LivesMeasures) => string][] = [
    ["hang", (x) => n(x.hang)],
    ["rise", (x) => n(x.rise)],
    ["to_life", (x) => n(x.to_life)],
    ["clear", (x) => n(x.clear_after)],
    ["screen", (x) => n(x.screen)],
    ["start", (x) => (x.from_start ? S.yes : S.no)],
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
