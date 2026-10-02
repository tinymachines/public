import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { excerpt, lesson, lessons, romName } from "@/lib/lessons";
import { Shell } from "@/app/components/SiteFrame";

/**
 * /autopsy/lessons/<key>: one lesson. Every figure is read from
 * data/lessons.json (scripts/board-lessons.py measured them on our
 * console); the program shown is lessons/<key>/prg.s, the file the
 * cartridge offered here was built from. Today there is one lesson, the
 * jump, and the page is written for it; a second lesson will say what is
 * common.
 */

export function generateStaticParams() {
  return lessons().map((l) => ({ lesson: l.key }));
}

const DESCRIPTION = "A cartridge of our own whose square walks and jumps with the numbers read off Super Mario Bros., measured beside it, with its program.";

export async function generateMetadata({ params }: { params: Promise<{ lang: string; lesson: string }> }): Promise<Metadata> {
  const { lang, lesson: key } = await params;
  const l = lesson(key);
  if (!l) return {};
  return pageMeta(lang, `/autopsy/lessons/${l.key}`, { title: l.title, description: DESCRIPTION });
}

const PROSE = {
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
    codeH: "The jump, as written",
    code: "The routine that runs once a frame for the jump. The whole program is a plain text file:",
    files: "The cartridge, to play anywhere that plays NES cartridges:",
    picsH: "On the screen",
    pic: (f: string) => `frame ${f}`,
    back: "All the lessons",
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
    codeH: "書いたとおりのジャンプ",
    code: "ジャンプのために毎フレーム一度走るルーチン。プログラム全体は、ただのテキストファイルだ:",
    files: "カートリッジ。NES のカートリッジを遊べるところならどこでも遊べる:",
    picsH: "画面の上では",
    pic: (f: string) => `フレーム ${f}`,
    back: "すべてのレッスン",
  },
} as const;

export default async function LessonPage({ params }: { params: Promise<{ lang: Lang; lesson: string }> }) {
  const { lang, lesson: key } = await params;
  const l = lesson(key);
  if (!l) notFound();
  const S = PROSE[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const m = l.measures;
  const a = l.against;
  const game = a ? t(lang, a.game) : "";
  const fmt = (j: { frames: number; risen: number }) => (lang === "ja" ? `${n(j.frames)} フレーム、${n(j.risen)} ピクセル` : `${n(j.frames)} frames, ${n(j.risen)} pixels`);
  const differ = a
    ? m.jumps
        .map((j, i) => ({ j, o: a.jumps[i] }))
        .filter(({ j, o }) => o && (j.frames !== o.frames || j.risen !== o.risen))
        .map(({ j, o }) => ({ held: j.held === o.held ? n(j.held) : `${n(j.held)} (${n(o.held)})`, ours: fmt(j), theirs: fmt(o) }))
    : [];
  return (
    <Shell lang={lang} die="NES" title={t(lang, l.title)}>
      <div className="prose">
        <p>{S.what(n(l.code_bytes), n(l.instructions))}</p>
        <p data-lesson-files>
          {S.files} <a href={`/autopsy/lessons/${romName(l.key)}`} download>{romName(l.key)}</a>
        </p>

        <h2>{S.picsH}</h2>
        <div className="lesson-pictures" data-lesson-pictures={l.pictures.length} style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {l.pictures.map((p) => (
            <figure key={p.frame} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- our own cartridge's frame, inline from the record */}
              <img src={`data:image/png;base64,${p.png}`} width={256} height={240} alt={S.pic(String(p.frame))} style={{ imageRendering: "pixelated", maxWidth: "100%", height: "auto" }} />
              <figcaption>{S.pic(n(p.frame))}</figcaption>
            </figure>
          ))}
        </div>

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
                    <tr data-lesson-row="walk"><td>{S.walkRow}</td><td>{n(m.full_speed_after)}</td><td>{n(a.full_speed_after)}</td></tr>
                    <tr data-lesson-row="top"><td>{S.topRow}</td><td>{n(m.full_speed)}</td><td>{n(a.full_speed)}</td></tr>
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

        <h2>{S.codeH}</h2>
        <p>
          {S.code} <a href={`/autopsy/lessons/${l.key}.s`}>{l.key}.s</a>
        </p>
        <pre data-lesson-code>{excerpt(l.key, "jump", "draw")}</pre>

        <p>
          <Link href={localize(lang, "/autopsy/lessons")}>{S.back}</Link>
        </p>
      </div>
    </Shell>
  );
}
