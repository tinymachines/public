import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { PitMeasures } from "@/lib/lessons";

/**
 * The pit lesson's own part of its page: falling into a hole, read the
 * same way on both (pit_measures) from memory and the writes to the
 * picture. Every figure is the record's.
 */

export const PIT = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The lives lesson&rsquo;s level with a hole in its ground. Play it and walk off the edge: the square drops
        through the bottom of the screen, you can still steer it on the way down, the walkers keep walking, and
        only after a wait is the life taken and the level begun again. The program is <b>{n}</b> instructions in{" "}
        <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "A hole is the other death, and it is a different scene",
    how: (
      <>
        When Mario walks into a hole in Super Mario Bros., nothing freezes and there is no hop. He falls, still
        answering the pad, through the bottom of the screen, and the world goes on without him: the Goombas keep
        walking, and the camera settles only a few frames later. The life is taken a long while after he is out of
        sight, when the fall&rsquo;s music has played out, and then the same screen as any lost life shows the lives
        left before the level starts again from its beginning. This cartridge plays that scene with its own wait
        and its own words. Walking into a walker is still the other death, as in the lives lesson.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      to_bottom: "frames from the edge to the bottom of the screen",
      moved: "pixels moved across on the way down, with Right held",
      rise: "pixels of hop on the way",
      to_life: "frames out of sight before the life is taken",
      walker: "a walker kept walking meanwhile",
      clear: "frames from the life to the picture being cleared",
      screen: "frames until play starts again",
      start: "the level begins again from its start",
    },
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        命のレッスンのレベルに、地面の穴を開けた。遊んで縁から歩き出してみてほしい: 四角は画面の底を抜けて落ち、落ちる途中もまだ舵が効き、歩き手たちは歩き続け、待ち時間のあとにようやく命が取られてレベルがまた始まる。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "穴はもうひとつの死で、別の場面だ",
    how: (
      <>
        スーパーマリオブラザーズでマリオが穴に歩き込んでも、何も固まらず、跳ねもしない。パッドにまだ応えながら画面の底を抜けて落ち、世界はマリオ抜きで進む。クリボーは歩き続け、カメラが落ち着くのは数フレーム後だ。命が取られるのは、姿が見えなくなってからずいぶん経って、落下の音楽が鳴り終わってからで、それから命を失ったときと同じ画面が残りの命を見せ、レベルが初めから始まる。このカートリッジは自前の待ち時間と自前の言葉でその場面を演じる。歩き手にぶつかるのは、命のレッスンと同じく、もうひとつの死のままだ。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      to_bottom: "縁から画面の底までのフレーム数",
      moved: "落ちる途中に横へ動いたピクセル数、右を押したまま",
      rise: "途中で跳ね上がったピクセル数",
      to_life: "姿が消えてから命が取られるまでのフレーム数",
      walker: "そのあいだ歩き手は歩き続けた",
      clear: "命を失ってから絵が消されるまでのフレーム数",
      screen: "また遊べるようになるまでのフレーム数",
      start: "レベルは初めからやり直す",
    },
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function PitPart({ lang, m, a }: { lang: Lang; m: PitMeasures; a?: (PitMeasures & { game: string }) | null }) {
  const S = PIT[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: PitMeasures) => string][] = [
    ["to_bottom", (x) => n(x.to_bottom)],
    ["moved", (x) => n(x.moved)],
    ["rise", (x) => n(x.rise)],
    ["to_life", (x) => n(x.to_life)],
    ["walker", (x) => (x.walker_moved ? S.yes : S.no)],
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
