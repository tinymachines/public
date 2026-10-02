import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { RoomsMeasures } from "@/lib/lessons";

/**
 * The rooms lesson's own part of its page: the first walk out of a room,
 * measured on this cartridge and on the game from memory (the room's
 * number, the scroll) and from the log of every write to the picture
 * chip's memory. Every figure is the record's.
 */

/** "32 across": 23 as words; the record keeps runs of eight or more. */
function runs(lang: Lang, w: Record<string, number>): string {
  const n = (v: number) => v.toLocaleString(lang);
  // The most first; one row is a row.
  const parts = Object.entries(w).sort((x, y) => y[1] - x[1]).map(([k, count]) => {
    const [tiles, way] = k.split(" ");
    if (lang === "ja") return `${n(Number(tiles))} タイルの${way === "down" ? "列" : "行"}を ${n(count)} 本`;
    const noun = way === "down" ? (count === 1 ? "column" : "columns") : count === 1 ? "row" : "rows";
    return `${n(count)} ${noun} of ${n(Number(tiles))} tiles ${way}`;
  });
  if (!parts.length) return lang === "ja" ? "なし" : "none";
  return parts.join(lang === "ja" ? "、" : ", ");
}

export const ROOMS = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The square in a grid of rooms, seen from above. The picture stands
        still while it walks; out of the left or right side, the next room
        slides in and carries it along. The program is <b>{n}</b>{" "}
        instructions in <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "A room at a time",
    how: (left: string, up: string) => (
      <>
        Watching The Legend of Zelda&rsquo;s memory showed one byte that changes
        each time Link leaves a screen: it went down by {left} for a step left
        and by {up} for a step up, so the land is a grid {up} rooms wide,
        numbered along its rows. At the edge, the picture slides a whole
        screen at a steady rate and Link is carried with it. This cartridge
        keeps a room number the same way and slides the same way. How each
        draws the room that is coming in is where they differ, and the table
        says how, from the log of every write each made to the picture chip.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      room: "the room's number, before and after a step left",
      wait: "frames from the number changing to the picture moving",
      slide: "frames the slide takes",
      step: "pixels moved, and pixels a frame",
      before: "written before the picture moves",
      during: "written while it slides",
      from: "frame of the slide the first column is written in",
      every: "frames between columns",
    },
    room: (a: string, b: string) => `${a} to ${b}`,
    step: (travel: string, step: string) => `${travel}, ${step} a frame`,
    diffH: "Where the two part ways",
    diff: (game: string, before: string, wait: string, from: string) => (
      <>
        {game} writes {before} before the picture moves, which takes it {wait} frames, and writes nothing
        for the first half of the slide; its columns come from frame {from} of the slide on, one a frame.
        This cartridge writes nothing beforehand and draws the incoming room through the whole slide, a
        column every second frame, each just ahead of the edge coming into sight. What {game}&rsquo;s rows
        are for has not been read yet.
      </>
    ),
    upH: "Not yet",
    up: "Up and down stop at the edge here: the slide is across only. In the game a step up slides the screen down; that is the next cut.",
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        上から見た部屋の格子の中の四角。四角が歩く間、絵は止まっている。左か右の端から出ると、次の部屋が滑り込んできて四角を運ぶ。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "一度に一部屋",
    how: (left: string, up: string) => (
      <>
        ゼルダの伝説のメモリを見ると、リンクが画面を出るたびに変わるバイトが一つあった: 左へ一歩で {left} 減り、上へ一歩で {up} 減った。だから土地は幅 {up} 部屋の格子で、行に沿って番号が振られている。端に着くと、絵は一画面ぶんを一定の速さで滑らせ、リンクも一緒に運ばれる。このカートリッジも同じように部屋の番号を持ち、同じように滑らせる。違うのは、入ってくる部屋をどう描くかで、表は絵のチップへの書き込みをすべて記録したものからそれを示す。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      room: "左へ一歩出る前と後の部屋の番号",
      wait: "番号が変わってから絵が動き出すまでのフレーム数",
      slide: "滑るのにかかるフレーム数",
      step: "動いたピクセル、1 フレームあたりのピクセル",
      before: "絵が動く前に書いたもの",
      during: "滑っている間に書いたもの",
      from: "最初の列を書いた、滑り始めから何フレーム目か",
      every: "列と列の間のフレーム数",
    },
    room: (a: string, b: string) => `${a} から ${b}`,
    step: (travel: string, step: string) => `${travel}、1 フレームあたり ${step}`,
    diffH: "二つが分かれるところ",
    diff: (game: string, before: string, wait: string, from: string) => (
      <>
        {game} は、絵が動く前に {before} を書き、それに {wait} フレームかかる。滑りの前半には何も書かず、列は滑り始めから {from} フレーム目以降、1 フレームに一本ずつ来る。このカートリッジは前もっては何も書かず、滑っている間ずっと入ってくる部屋を描く。2 フレームに一列ずつ、見えてくる端のすぐ先に。{game} の行が何のためのものかは、まだ読んでいない。
      </>
    ),
    upH: "まだのこと",
    up: "ここでは上下は端で止まる: 滑るのは横だけだ。ゲームで上へ一歩出ると、画面が縦に滑る。それが次の版だ。",
  },
} as const;

export function RoomsPart({ lang, m, a }: { lang: Lang; m: RoomsMeasures; a?: (RoomsMeasures & { game: string; up?: { before: number; after: number } }) | null }) {
  const S = ROOMS[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: RoomsMeasures) => string][] = [
    ["room", (x) => S.room(n(x.before), n(x.after))],
    ["wait", (x) => n(x.wait)],
    ["slide", (x) => n(x.slide)],
    ["step", (x) => S.step(n(x.travel), n(x.step))],
    ["before", (x) => runs(lang, x.written_before)],
    ["during", (x) => runs(lang, x.written_during)],
    ["from", (x) => (x.columns_from === null ? "" : n(x.columns_from))],
    ["every", (x) => x.column_every.map(n).join(" / ")],
  ];
  return (
    <>
      <h2>{S.howH}</h2>
      {a?.up ? <p>{S.how(n(a.before - a.after), n(a.up.before - a.up.after))}</p> : null}
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
      {a ? (
        <>
          <h3>{S.diffH}</h3>
          <p>{S.diff(game, runs(lang, a.written_before), n(a.wait), a.columns_from === null ? "" : n(a.columns_from))}</p>
        </>
      ) : null}
      <h3>{S.upH}</h3>
      <p>{S.up}</p>
    </>
  );
}
