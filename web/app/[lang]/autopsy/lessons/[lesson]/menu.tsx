import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { MenuMeasures } from "@/lib/lessons";

/**
 * The menu lesson's own part of its page: typing a name from a grid, read
 * the same way on both (menu_measures) from a run that moves, types three
 * letters and then holds Left. Every figure is the record's.
 */

export const MENU = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        A screen for typing a name, with a grid of letters we drew ourselves. Play it: the arrows move the
        cursor, A types the letter under it, and holding an arrow keeps it moving. The program is <b>{n}</b>{" "}
        instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "The cursor sits behind the letters",
    how: (
      <>
        On the screen where you register your name, The Legend of Zelda&rsquo;s cursor is a sprite drawn behind
        the background, so the letter under it shows through, and it blinks. It moves the frame after you press,
        and if you hold the button it waits a moment and then keeps going, faster. At the edge of the grid it
        does not stop: it carries on in reading order, so going left from the first letter takes you to the
        last cell. Every step makes a click, and A writes one tile, the letter, into your name the frame after.
        This cartridge does the same with a grid, a wait, a beat and a click of its own.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      after: "frames from a press to the cursor moving",
      wait: "frames held before it moves again",
      every: "then frames between moves",
      width: "letters across the grid",
      wraps: "left from the first cell goes to cell",
      typed: "tiles written for each letter typed, and frames after A",
      behind: "the cursor is drawn behind the letters",
      blink: "frames the cursor is shown, then hidden",
      clicks: "moves that made a click",
    },
    typed: (tiles: string, after: string) => `${tiles}, ${after} after`,
    of: (a: string, b: string) => `${a} of ${b}`,
    on: (a: string, b: string) => `${a}, then ${b}`,
    yes: "yes",
    no: "no",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        名前を打ち込む画面。文字の表は私たちが描いた。遊んでみてほしい: 十字でカーソルを動かし、A でその下の文字を打ち、十字を押し続けると動き続ける。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "カーソルは文字の後ろにいる",
    how: (
      <>
        名前を登録する画面で、ゼルダの伝説のカーソルは背景の後ろに描くスプライトなので、下の文字が透けて見え、点滅する。押した次のフレームで動き、押し続けると少し待ってから、もっと速く動き続ける。表の端でも止まらず、読む順にそのまま進むので、最初の文字から左へ行くと最後のマスに出る。一歩ごとにクリック音が鳴り、A を押すと次のフレームで名前にタイル一つ、その文字を書く。このカートリッジも、自前の表と待ちと拍とクリック音で同じようにする。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      after: "押してからカーソルが動くまでのフレーム数",
      wait: "押し続けて次に動くまでのフレーム数",
      every: "そのあと動く間隔のフレーム数",
      width: "表の横の文字数",
      wraps: "最初のマスから左へ行くと着くマス",
      typed: "一文字打つごとに書くタイル数と、A からのフレーム数",
      behind: "カーソルは文字の後ろに描く",
      blink: "カーソルを見せるフレーム数と、隠すフレーム数",
      clicks: "クリック音が鳴った移動の数",
    },
    typed: (tiles: string, after: string) => `${tiles} 個、${after} フレーム後`,
    of: (a: string, b: string) => `${b} 回中 ${a} 回`,
    on: (a: string, b: string) => `${a}、${b}`,
    yes: "はい",
    no: "いいえ",
  },
} as const;

export function MenuPart({ lang, m, a }: { lang: Lang; m: MenuMeasures; a?: (MenuMeasures & { game: string }) | null }) {
  const S = MENU[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const opt = (v: number | null) => (v === null ? "" : n(v));
  const game = a ? t(lang, a.game) : "";
  // Every letter typed wrote the same: shown once, as the record holds it.
  const typed = (x: MenuMeasures) => [...new Set(x.typed.map(([after, tiles]) => S.typed(n(tiles), n(after))))].join("; ");
  const rows: [keyof typeof S.rows, (x: MenuMeasures) => string][] = [
    ["after", (x) => x.after_press.map(n).join(", ")],
    ["wait", (x) => opt(x.wait)],
    ["every", (x) => opt(x.every)],
    ["width", (x) => n(x.width)],
    ["wraps", (x) => opt(x.wraps_to)],
    ["typed", typed],
    ["behind", (x) => (x.behind ? S.yes : S.no)],
    ["blink", (x) => S.on(n(x.blink[0]), n(x.blink[1]))],
    ["clicks", (x) => S.of(n(x.clicks), n(x.moves))],
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
