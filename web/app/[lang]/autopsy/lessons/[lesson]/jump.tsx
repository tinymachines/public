import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { JumpMeasures } from "@/lib/lessons";

/**
 * The jump lesson's own part of its page: where the numbers came from,
 * the two played side by side, and the one line whose place mattered.
 * Every figure is the record's.
 */

export const JUMP = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        A red square on a strip of ground. Right walks, A jumps. The program is{" "}
        <b>{n}</b> instructions in <b>{bytes}</b> bytes, written in the same
        text the autopsy writes its listings in and turned into the cartridge
        by the same assembler, which checks that the text gives back the
        cartridge byte for byte.
      </>
    ),
    whereH: "Where the numbers came from",
    where: (
      <>
        Every number in the program was read off Super Mario Bros. by playing it
        on our console and watching its memory after each frame: how fast the
        speed across grows while Right is held, how fast the jump starts, and
        how much is added to the speed down each frame. Two of those depend on
        A: while A is held and the jump is still rising, the pull is light;
        let go, or start to fall, and it is much stronger. That is why a tap
        is a hop and a long press goes high.
      </>
    ),
    sideH: "The two, played the same way",
    side: (game: string) => <>The same presses, played on this cartridge and on {game}, frame for frame.</>,
    cols: (game: string) => ["", "this cartridge", game],
    walkRow: "frames of Right to full speed",
    topRow: "full speed, pixels a frame",
    jumpRow: (held: string) => `A held ${held} frames: frames in the air, pixels risen`,
    orderH: "One line in the wrong place",
    order: (
      <>
        The first version pulled before it moved: each frame it added the pull
        to the speed and then moved by the new speed, and every jump came out
        lower than Mario&rsquo;s. The program below moves first and pulls
        after, and the table above is what that order gives.
      </>
    ),
    left: (rows: { held: string; ours: string; theirs: string }[], game: string) => (
      <>
        {rows.length
          ? rows.map((r) => `What is left: with A held ${r.held} frames, this cartridge gives ${r.ours} and ${game} gives ${r.theirs}. `)
          : ""}
      </>
    ),
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        地面の上の赤い四角。右で歩き、A で跳ぶ。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、解剖がリスティングを書くのと同じテキストで書き、同じアセンブラでカートリッジにした。アセンブラは、そのテキストが一バイトも違わずカートリッジを返すことを確かめる。
      </>
    ),
    whereH: "数がどこから来たか",
    where: (
      <>
        プログラムの中の数はどれも、私たちのコンソールでスーパーマリオブラザーズを遊び、フレームごとにメモリを見て読み取った: 右を押している間に横の速さがどれだけ増えるか、跳ぶときの最初の速さ、そして下向きの速さに毎フレーム足される量。そのうち二つは A で変わる: A を押していて、まだ上がっている間は引きが弱く、離すか落ち始めるとずっと強くなる。だから軽く押せば小さく跳び、長く押せば高く跳ぶ。
      </>
    ),
    sideH: "二つを同じように遊ぶ",
    side: (game: string) => <>同じボタン操作を、このカートリッジと {game} で遊んだ結果:</>,
    cols: (game: string) => ["", "このカートリッジ", game],
    walkRow: "右を押して最高速になるまでのフレーム数",
    topRow: "最高速、1 フレームあたりのピクセル",
    jumpRow: (held: string) => `A を ${held} フレーム押す: 宙にいたフレーム数、上がったピクセル数`,
    orderH: "一行の置き場所",
    order: (
      <>
        最初の版は、動かす前に引いていた: 毎フレーム、引きを速さに足してから、新しい速さで動かす。どのジャンプもマリオより低くなった。下のプログラムは先に動かして後で引く。上の表は、その順で得られたものだ。
      </>
    ),
    left: (rows: { held: string; ours: string; theirs: string }[], game: string) => (
      <>{rows.map((r) => `残る違い: A を ${r.held} フレーム押すと、このカートリッジは ${r.ours}、${game} は ${r.theirs}。`).join("")}</>
    ),
  },
} as const;

export function JumpPart({ lang, m, a }: { lang: Lang; m: JumpMeasures; a?: (JumpMeasures & { game: string }) | null }) {
  const S = JUMP[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const fmt = (j: { frames: number; risen: number }) => (lang === "ja" ? `${n(j.frames)} フレーム、${n(j.risen)} ピクセル` : `${n(j.frames)} frames, ${n(j.risen)} pixels`);
  const differ = a
    ? m.jumps
        .map((j, i) => ({ j, o: a.jumps[i] }))
        .filter(({ j, o }) => o && (j.frames !== o.frames || j.risen !== o.risen))
        .map(({ j, o }) => ({ held: j.held === o.held ? n(j.held) : `${n(j.held)} (${n(o.held)})`, ours: fmt(j), theirs: fmt(o) }))
    : [];
  return (
    <>
      <h2>{S.whereH}</h2>
      <p>{S.where}</p>
      {a ? (
        <>
          <h2>{S.sideH}</h2>
          <p>{S.side(game)}</p>
          <div className="ledger">
            <div className="scroller">
              <table data-lesson-against>
                <thead>
                  <tr>{S.cols(game).map((c, i) => <th key={i}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  <tr data-lesson-row="walk" data-lesson-ours={String(m.full_speed_after)} data-lesson-theirs={String(a.full_speed_after)}><td>{S.walkRow}</td><td>{n(m.full_speed_after)}</td><td>{n(a.full_speed_after)}</td></tr>
                  <tr data-lesson-row="top" data-lesson-ours={String(m.full_speed)} data-lesson-theirs={String(a.full_speed)}><td>{S.topRow}</td><td>{n(m.full_speed)}</td><td>{n(a.full_speed)}</td></tr>
                  {m.jumps.map((j, i) => (
                    <tr key={i} data-lesson-row="jump" data-lesson-ours={`${j.frames},${j.risen}`} data-lesson-theirs={a.jumps[i] ? `${a.jumps[i].frames},${a.jumps[i].risen}` : ""}>
                      <td>{S.jumpRow(a.jumps[i] && a.jumps[i].held !== j.held ? `${n(j.held)} (${n(a.jumps[i].held)})` : n(j.held))}</td>
                      <td>{fmt(j)}</td>
                      <td>{a.jumps[i] ? fmt(a.jumps[i]) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <h3>{S.orderH}</h3>
          <p>
            {S.order} {S.left(differ, game)}
          </p>
        </>
      ) : null}
    </>
  );
}
