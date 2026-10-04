import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { SplashMeasures } from "@/lib/lessons";

/**
 * The splash lesson's own part of its page: a splash screen that moves
 * without writing a tile, read the same way on both (splash_measures)
 * from a run that touches nothing. Every figure is the record's.
 */

export const SPLASH = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        A splash screen for our square: the word SQUARE changing colour and a column of drops falling beside it,
        then a fade to black, and round again. Play it and just watch. The program is <b>{n}</b> instructions
        in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "Nothing is drawn while it moves",
    how: (
      <>
        The title screen of The Legend of Zelda is busy, with a waterfall pouring and colours shifting, yet
        once the picture is up the game does not write a single tile to it. The waterfall is a column of
        sprites that step down a couple of pixels each frame and jump back up after a short loop, so the
        water seems to fall forever. The colours change because the game rewrites one palette every few
        frames. When the screen has been up long enough it fades to black, again only by rewriting the
        palette, a little darker each time. This cartridge does the same with a word, drops and colours of its
        own.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      shown: "frames it shows before the fade",
      tiles: "tiles written meanwhile",
      turns: "times the colours change, and frames apart",
      fall: "pixels the falling sprites move each frame",
      loop: "frames before they jump back up",
      fade: "steps in the fade, and frames it takes",
    },
    turns: (n: string, every: string) => `${n}, every ${every}`,
    fade: (n: string, frames: string) => `${n}, over ${frames}`,
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        私たちの四角のためのスプラッシュ画面: 色の変わる SQUARE の文字と、その横を落ちる水滴の列。そして黒へ暗転し、また初めから。遊んで、ただ眺めてみてほしい。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "動いている間、何も描かない",
    how: (
      <>
        ゼルダの伝説のタイトル画面はにぎやかで、滝が流れ色が移ろう。それでも絵ができあがってからは、ゲームはタイルを一つも書かない。滝はスプライトの列で、毎フレーム数ピクセルずつ下がり、短い輪を終えると上へ戻るので、水が永遠に落ち続けるように見える。色が変わるのは、数フレームごとにパレットを一つ書き直しているからだ。十分に見せたら黒へ暗転するが、これもパレットを書き直すだけで、そのたびに少しずつ暗くする。このカートリッジも、自前の言葉と水滴と色で同じようにする。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      shown: "暗転までに見せるフレーム数",
      tiles: "その間に書いたタイルの数",
      turns: "色が変わった回数と、その間のフレーム数",
      fall: "落ちるスプライトが毎フレーム動くピクセル数",
      loop: "上へ戻るまでのフレーム数",
      fade: "暗転の段数と、かかるフレーム数",
    },
    turns: (n: string, every: string) => `${n} 回、${every} フレームおき`,
    fade: (n: string, frames: string) => `${n} 段、${frames} フレームで`,
  },
} as const;

export function SplashPart({ lang, m, a }: { lang: Lang; m: SplashMeasures; a?: (SplashMeasures & { game: string }) | null }) {
  const S = SPLASH[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const opt = (v: number | null) => (v === null ? "" : n(v));
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: SplashMeasures) => string][] = [
    ["shown", (x) => n(x.shown)],
    ["tiles", (x) => n(x.tiles)],
    ["turns", (x) => S.turns(n(x.turns), opt(x.turn_every))],
    ["fall", (x) => opt(x.fall)],
    ["loop", (x) => opt(x.loop)],
    ["fade", (x) => S.fade(n(x.fade_steps), n(x.fade_frames))],
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
