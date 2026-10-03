import type { Lang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import type { SoundMeasures } from "@/lib/lessons";

/**
 * The sound lesson's own part of its page: how a jump sound shares the
 * channel the music plays on, read on both from the log of every write to
 * the sound chip. Shape only: which channel, when, how many settings with
 * the pitch sweep on, when the music writes again. A sound is something
 * somebody composed, so the game's values are not compared and ours are
 * our own. Every figure is the record's.
 */

export const SOUND = {
  en: {
    what: (bytes: string, n: string) => (
      <>
        The jump lesson&rsquo;s square with a tune of eight notes going round and a jump sound, both made up
        here. Play it with the sound on to hear the tune step aside. The program is <b>{n}</b> instructions in{" "}
        <b>{bytes}</b> bytes, built and checked the same way.
      </>
    ),
    howH: "Two sounds, one channel",
    how: (
      <>
        The console has two square-wave channels, a triangle, a noise channel and one for samples, and a game
        has more sounds than that. Super Mario Bros. plays part of its music on the first square channel, and
        when Mario jumps, the jump sound takes that channel over: its settings are written there with the
        pitch sweep turned on, and the music does not write to the channel again until a later note. This
        cartridge shares its channel the same way. The tune keeps counting while the jump sound has the
        channel, so it comes back in time, at its next note. Only that way of sharing is taken from the game;
        what either sound plays is not compared, because a sound is something somebody composed.
      </>
    ),
    cols: (game: string) => ["", "this cartridge", game],
    rows: {
      before: "writes to the first square channel in the 60 frames before the jump",
      starts: "frames from A to the jump sound",
      settings: "settings written with the pitch sweep on, and on which of its frames",
      back: "frames until the music writes to the channel again",
    },
    on: (n: string, at: string) => `${n} (frames ${at})`,
  },
  ja: {
    what: (bytes: string, n: string) => (
      <>
        ジャンプのレッスンの四角に、ここで作った八つの音のめぐる曲とジャンプの音を足した。音を出して遊ぶと、曲がわきへ退くのが聞こえる。プログラムは <b>{bytes}</b> バイトの命令 <b>{n}</b> 個で、作り方も確かめ方も同じだ。
      </>
    ),
    howH: "二つの音に、チャンネルは一つ",
    how: (
      <>
        コンソールには矩形波のチャンネルが二つ、三角波、ノイズ、サンプル用のチャンネルが一つずつあり、ゲームの音はそれより多い。スーパーマリオブラザーズは曲の一部を一つ目の矩形波チャンネルで鳴らし、マリオが跳ぶとジャンプの音がそのチャンネルを取る: 音の高さを滑らせる仕組みを入れた設定がそこに書かれ、曲は後の音になるまでそのチャンネルに書かない。このカートリッジも同じようにチャンネルを分け合う。ジャンプの音がチャンネルを持っている間も曲は数え続けるので、次の音で拍に合って戻ってくる。ゲームから取ったのはこの分け合い方だけで、どちらの音が何を鳴らすかは比べない。音は誰かが作ったものだからだ。
      </>
    ),
    cols: (game: string) => ["", "このカートリッジ", game],
    rows: {
      before: "ジャンプの前の 60 フレームに、一つ目の矩形波チャンネルへ書いた数",
      starts: "A からジャンプの音までのフレーム数",
      settings: "高さを滑らせる仕組みを入れて書いた設定の数と、そのフレーム",
      back: "曲がチャンネルに再び書くまでのフレーム数",
    },
    on: (n: string, at: string) => `${n} (${at} フレーム目)`,
  },
} as const;

export function SoundPart({ lang, m, a }: { lang: Lang; m: SoundMeasures; a?: (SoundMeasures & { game: string }) | null }) {
  const S = SOUND[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const game = a ? t(lang, a.game) : "";
  const rows: [keyof typeof S.rows, (x: SoundMeasures) => string][] = [
    ["before", (x) => n(x.music_before)],
    ["starts", (x) => (x.starts === undefined ? "" : n(x.starts))],
    ["settings", (x) => S.on(n(x.sweep_settings), (x.sweep_frames ?? []).map(n).join(", "))],
    ["back", (x) => (x.music_back === null || x.music_back === undefined ? "" : n(x.music_back))],
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
