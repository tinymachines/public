import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { InterludeMeasures } from "@/lib/lessons";

/**
 * The interlude lesson's own part of its page: a level's end, read the
 * same way on both (interlude_measures) from memory, the pad and the
 * writes to the picture. Every figure is the record's.
 */

export const INTERLUDE = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        A level with a pole at its right end and a door past it. Play it, jump onto the pole, and let go of the pad:
        the square slides down, walks to the door by itself, the time left is counted into the score, a card names
        the next level, and it begins. The program is <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and
        checked the same way.
      </>
    ),
    howH: "For a while the game plays itself",
    how: (
      <>
        When Mario reaches the flagpole in Super Mario Bros., the pad stops mattering. He slides down the pole,
        walks into the castle by himself, and stands there while the time left is counted down and turned into
        points. Then the picture is cleared for the card that names the next world, and that level begins. Nothing
        in it is decided by the player, and nothing can go wrong in it; it is a scene the game plays between two
        levels. This cartridge plays the same scene with its own speeds, its own rate of counting, its own card
        and its own words. The script that measures it holds Left all the way through, to show that the pad is
        ignored.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      slide: "frames sliding down the pole",
      walk: "frames walking by itself afterwards",
      ignored: "Left held meanwhile, and ignored",
      count_frames: "frames the time is counted down over",
      units: "units of time taken off on a frame",
      per_unit: "points for each unit",
      card_after: "frames from the count's end to the picture being cleared",
      card: "frames the card shows before the next level is played",
      levels: "the level's number, before and after",
    },
    yes: "yes",
    no: "no",
    pair: (a: string, b: string) => `${a}, ${b}`,
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        右端にポールがあり、その先に扉があるレベル。遊んでポールに跳びつき、パッドから手を離してみてほしい: 四角は滑り降り、ひとりでに扉まで歩き、残り時間がスコアに数え込まれ、カードが次のレベルを告げ、それが始まる。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "しばらくのあいだ、ゲームは自分で遊ぶ",
    how: (
      <>
        スーパーマリオブラザーズでマリオが旗のポールに届くと、パッドは効かなくなる。ポールを滑り降り、ひとりで城へ歩いて入り、残り時間が数え下ろされて点に変わるあいだそこに立っている。それから絵は次のワールドを告げるカードのために消され、そのレベルが始まる。そのあいだプレイヤーが決めることは何も無く、何かがうまくいかないこともない。二つのレベルのあいだにゲームが演じる一場面だ。このカートリッジも、自前の速さと、自前の数え方の速さと、自前のカードと言葉で同じ場面を演じる。これを測る台本は、パッドが無視されることを見せるために、ずっと左を押したままにしている。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      slide: "ポールを滑り降りるフレーム数",
      walk: "そのあとひとりで歩くフレーム数",
      ignored: "そのあいだ左を押していて、無視された",
      count_frames: "時間を数え下ろすのにかかるフレーム数",
      units: "一フレームに減る時間の単位",
      per_unit: "一単位あたりの点",
      card_after: "数え終わってから絵が消されるまでのフレーム数",
      card: "次のレベルが遊べるまでカードが出ているフレーム数",
      levels: "レベルの番号、前と後",
    },
    yes: "はい",
    no: "いいえ",
    pair: (a: string, b: string) => `${a}、${b}`,
  },
} as const;

export function InterludePart({ lang, m, a }: { lang: Lang; m: InterludeMeasures; a?: (InterludeMeasures & { game: string }) | null }) {
  const S = INTERLUDE[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: InterludeMeasures) => string][] = [
    ["slide", (x) => n(x.slide)],
    ["walk", (x) => n(x.walk)],
    ["ignored", (x) => (x.ignored ? S.yes : S.no)],
    ["count_frames", (x) => n(x.count_frames)],
    ["units", (x) => n(x.units)],
    ["per_unit", (x) => n(x.per_unit)],
    ["card_after", (x) => n(x.card_after)],
    ["card", (x) => n(x.card)],
    ["levels", (x) => S.pair(n(x.levels[0]), n(x.levels[1]))],
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
