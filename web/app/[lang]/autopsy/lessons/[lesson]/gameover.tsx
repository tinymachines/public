import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { GameoverMeasures } from "@/lib/lessons";

/**
 * The game over lesson's own part of its page: the last life and what
 * comes after, read the same way on both (gameover_measures) from
 * memory, the pad and the writes to the picture. Every figure is the
 * record's.
 */

export const GAMEOVER = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The lives lesson&rsquo;s level, played to the end. Lose all three lives and watch what the game does with the
        last one: no lives screen this time, a GAME OVER screen that holds by itself, then a title that waits for
        Start. The program is <b>{n}</b> instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "The last death skips a screen and adds two",
    how: (
      <>
        In Super Mario Bros. the last life goes the way every life goes, the freeze, the hop and the fall, but what
        follows is different: the picture is cleared for GAME OVER instead of the lives screen, that screen holds for
        about seven seconds with nothing to press, and then the title is drawn again, with the lives back to what
        a new game starts with. Start on the title goes through the usual card into the level. This cartridge does
        the same with its own screens, its own timings and its own words.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      to_screen: "frames from the last touch to the GAME OVER screen",
      screen_tiles: "tiles that screen is written with, besides its clear",
      held: "frames it holds before the title",
      title_tiles: "tiles the title is written with",
      start_to_play: "frames from Start on the title to play",
      lives_back: "the lives are what a new game starts with",
    },
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        命のレッスンのレベルを、終わりまで遊ぶ。三つの命をすべて失って、最後の命でゲームが何をするかを見てほしい: 今度は残りの命の画面は出ず、ひとりでに留まる GAME OVER の画面、それから Start を待つタイトルが来る。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "最後の死は画面をひとつ飛ばし、ふたつ足す",
    how: (
      <>
        スーパーマリオブラザーズでは、最後の命もほかの命と同じに失われる。固まり、跳ね、落ちる。だがそのあとが違う。絵は残りの命の画面ではなく GAME OVER のために消され、その画面は押すものもないまま七秒ほど留まり、それからタイトルがまた描かれ、命は新しいゲームの始まりの数に戻る。タイトルで Start を押せば、いつものカードを通ってレベルへ入る。このカートリッジも、自前の画面と間合いと言葉で同じことをする。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      to_screen: "最後の触れから GAME OVER の画面までのフレーム数",
      screen_tiles: "その画面に書かれるタイル数、消去を除いて",
      held: "タイトルまで留まるフレーム数",
      title_tiles: "タイトルに書かれるタイル数",
      start_to_play: "タイトルで Start を押してから遊べるまでのフレーム数",
      lives_back: "命は新しいゲームの始まりの数に戻る",
    },
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function GameoverPart({ lang, m, a }: { lang: Lang; m: GameoverMeasures; a?: (GameoverMeasures & { game: string }) | null }) {
  const S = GAMEOVER[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: GameoverMeasures) => string][] = [
    ["to_screen", (x) => n(x.to_screen)],
    ["screen_tiles", (x) => n(x.screen_tiles)],
    ["held", (x) => n(x.held)],
    ["title_tiles", (x) => n(x.title_tiles)],
    ["start_to_play", (x) => n(x.start_to_play)],
    ["lives_back", (x) => (x.lives_back ? S.yes : S.no)],
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
