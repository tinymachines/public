import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { PauseMeasures } from "@/lib/lessons";

/**
 * The pause lesson's own part of its page: what Start stops and what it
 * leaves alone, read the same way on both from a run that holds Right
 * throughout and presses Start, Start again too soon, A, then Start. The
 * sound is compared by shape only (cut, how many notes, how far apart,
 * when the music is back); what the notes are is not. Every figure is the
 * record's.
 */

export const PAUSE = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The sound lesson&rsquo;s square and tune, with a pause on Start. Play it, walk right, and press Start;
        try pressing it again straight away. The program is <b>{n}</b> instructions in <b>{bytes}</b> bytes,
        built and checked the same way.
      </>
    ),
    howH: "A pause draws nothing",
    how: (
      <>
        Pausing Super Mario Bros. puts nothing on the screen: no word, no box. The game simply stops running
        its world, and the console keeps showing the last picture it was given. The music is cut on the same
        frame and a short sound plays instead. For a while after a press, Start is ignored, so a button that
        bounces or a second press that comes too soon cannot undo it. Unpausing plays the sound again, Mario
        moves at once, and the music comes back only when that wait is over. This cartridge pauses the same
        way, with a wait, a chime and a tune of its own. Only that shape is taken from the game; what either
        sound plays is not compared.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      stops: "frames from Start to everything holding still",
      held: "nothing moved while paused, with Right held and A pressed",
      wait: "frames Start is ignored after a press",
      ignored: "frames in when a second Start was tried, and did nothing",
      drawn: "writes to the picture while paused",
      same: "two pictures taken while paused are identical",
      cut: "every sound cut on the press",
      chime: "notes in the pause sound, and frames between them",
      starts: "frames from Start to moving again",
      back: "frames from unpausing until the music plays again",
    },
    yes: "yes",
    no: "no",
    notes: (n: string, every: string) => `${n}, ${every} apart`,
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        音のレッスンの四角と曲に、スタートでのポーズを足した。遊んで右へ歩き、スタートを押してみてほしい。すぐにもう一度押してもみてほしい。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "ポーズは何も描かない",
    how: (
      <>
        スーパーマリオブラザーズをポーズしても、画面には何も出ない: 文字も枠もない。ゲームは世界を動かすのをやめるだけで、コンソールは最後に渡された絵を映し続ける。曲は同じフレームで切れ、代わりに短い音が鳴る。押してからしばらくはスタートを受け付けないので、ボタンが跳ねても、早すぎる二度目の押しがあっても、元に戻らない。ポーズを解くとその音がもう一度鳴り、マリオはすぐに動き出し、曲はその待ちが終わってから戻ってくる。このカートリッジも、自前の待ちとチャイムと曲で同じように止まる。ゲームから取ったのはこの形だけで、どちらの音が何を鳴らすかは比べない。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      stops: "スタートからすべてが止まるまでのフレーム数",
      held: "右を押したまま A を押しても、ポーズ中は何も動かなかった",
      wait: "押したあとスタートを受け付けないフレーム数",
      ignored: "二度目のスタートを試したフレームと、それが何もしなかったこと",
      drawn: "ポーズ中に絵へ書いた数",
      same: "ポーズ中に撮った二枚の絵が同じ",
      cut: "押したときにすべての音を切る",
      chime: "ポーズの音の数と、その間のフレーム数",
      starts: "スタートから再び動くまでのフレーム数",
      back: "ポーズを解いてから曲が再び鳴るまでのフレーム数",
    },
    yes: "はい",
    no: "いいえ",
    notes: (n: string, every: string) => `${n} 個、${every} フレームおき`,
  },
} as const;

export function PausePart({ lang, m, a }: { lang: Lang; m: PauseMeasures; a?: (PauseMeasures & { game: string }) | null }) {
  const S = PAUSE[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const yn = (v: boolean) => (v ? S.yes : S.no);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: PauseMeasures) => string][] = [
    ["stops", (x) => n(x.stops)],
    ["held", (x) => yn(x.held && x.a_pressed)],
    ["wait", (x) => n(x.wait)],
    ["ignored", (x) => x.ignored_after.map(n).join(", ")],
    ["drawn", (x) => n(x.drawn)],
    ["same", (x) => yn(x.same_picture)],
    ["cut", (x) => yn(x.cut)],
    ["chime", (x) => S.notes(n(x.chime_notes), x.chime_every.map(n).join(", "))],
    ["starts", (x) => n(x.starts)],
    ["back", (x) => (x.music_back === null ? "" : n(x.music_back))],
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
