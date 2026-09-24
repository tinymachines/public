"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { Gamepad } from "./Gamepad";
import { attach, detach, load, subscribe, snapshot, serverSnapshot, toggleRun, type DriftStats, type PlayState } from "./playEngine";
import Link from "next/link";
import { localize } from "@/lib/lang";
import { ShelfPicker } from "@/app/components/ShelfPicker";

/**
 * The console in the page: a follower of playEngine's announcements. The
 * worker, the loop, the canvas, the keyboard and the audio cursor live in
 * the engine module; this renders the play page's two machine sections
 * (the screen with the pad, and the cartridge with a short line of what is
 * running) from its state. The tools for looking inside a game live on
 * the create desk (/nes/create), which builds its windows from the same
 * sections exported here (owner, 2026-09-24: Play is just the playing).
 * The transport on the floor (PlayTransport.tsx) drives the same engine,
 * and the page around them (page.tsx) says what this is.
 *
 * Sections, each with its heading, because the section strip is built
 * from them: the strip is the map of the page, and the map is read off
 * the page rather than written beside it. Full screen is the document's
 * (the strip's control, Fullscreen.tsx): the bar leaves, the stage takes
 * the viewport above the strip, and the way out stays on the floor. The
 * stage had a full screen of its own before this, which took the screen
 * and the pad and nothing else; the whole page is the instrument now.
 */

const S = {
  en: {
    screenH: "Screen",
    cartH: "Cartridge",
    readH: "Readouts",
    pick: "Cartridge (.nes)",
    run: "Play",
    pause: "Pause",
    none: "No cartridge. Choose a .nes file from your own disk; it never leaves this browser.",
    loaded: (name: string) => <>cartridge: <b>{name}</b></>,
    off: "power is off: the cartridge is kept, the console is gone until power on",
    patched: "running your patch, not the file as loaded",
    battery: (b: NonNullable<PlayState["battery"]>) =>
      !b.has ? <>no battery on this board: nothing to save</> :
      b.why ? <>save: <b>{b.why}</b></> :
      b.saving ? <>save: <b>writing</b></> :
      b.savedAt ? <>save: <b>kept on your shelf</b>, written {new Date(b.savedAt).toLocaleTimeString("en")}{b.restored ? ", restored on load" : ""}</> :
      <>save: <b>nothing yet</b>; the RAM goes to your shelf when it changes</>,
    frames: (n: number, u: number) => <>frames shown: <b>{n}</b>, run but not decoded: <b>{u}</b></>,
    cost: (c: number, e: number, p: number, gpu: boolean) =>
      gpu ? (
        <>per frame: console <b>{c.toFixed(1)} ms</b>, picture submitted to the GPU in <b>{p.toFixed(1)} ms</b> (encode and decode, upload included), on their own threads</>
      ) : (
        <>per frame: console <b>{c.toFixed(1)} ms</b>, encode and decode <b>{(e + p).toFixed(1)} ms</b>, on their own threads</>
      ),
    path: (path: string, why: string | null, agreement: number | null, tol: number | null, agreementV: number | null, tolV: number | null) =>
      path === "webgpu" ? (
        <>
          picture: <b>WebGPU</b>, its encoder against the wasm encoder on the first frame within <b>{agreementV} V</b> (tolerance {tolV}), its decode against the wasm decode within <b>{agreement} of 255</b> (tolerance {tol})
        </>
      ) : (
        <>picture: <b>wasm</b>{why ? <> ({why})</> : null}</>
      ),
    fps: (v: number) => <>pictures in the last second: <b>{v}</b></>,
    drift: (s: DriftStats) => (
      <>display callbacks: <b>{s.presented}</b>, duplicated: <b>{s.duplicated}</b>, dropped: <b>{s.dropped}</b></>
    ),
    underruns: (n: number, audio: boolean) => (audio ? <>audio underruns: <b>{n}</b></> : <>audio: <b>none</b> (this browser gave no output)</>),
    keys: "Keys: arrows, Z and X for B and A, Enter for Start, right Shift for Select; or the pad under the screen, a thumb on each side. Controller 2 on the left hand: W A S D, F and G for B and A, T for Start, R for Select.",
    stripAll: "The strip on the floor has power, reset, play, and the steps: a half-cycle, a cycle, an instruction, a scanline, a frame.",
    stripPlay: "The strip on the floor has power, reset, play, and full screen.",
    create: (href: string) => <>To look inside a game while it runs, its code, its memory, its palettes and its sprites, or to change its tiles, open it on <Link href={href}>the create desk</Link>.</>,
    select: "select",
    start: "start",
    canvasLabel: "The console's picture through the three-line comb: 2048 samples by 240 lines",
  },
  ja: {
    screenH: "画面",
    cartH: "カートリッジ",
    readH: "読み出し",
    pick: "カートリッジ（.nes）",
    run: "実行",
    pause: "一時停止",
    none: "カートリッジが無い。自分のディスクから .nes ファイルを選ぶ。ファイルはこのブラウザから出ない。",
    loaded: (name: string) => <>カートリッジ: <b>{name}</b></>,
    off: "電源が切れている: カートリッジは残り、コンソールは電源を入れるまで無い",
    patched: "走っているのは読み込んだままのファイルではなく、あなたのパッチ",
    battery: (b: NonNullable<PlayState["battery"]>) =>
      !b.has ? <>この基板に電池はない: 保存するものはない</> :
      b.why ? <>セーブ: <b>{b.why}</b></> :
      b.saving ? <>セーブ: <b>書き込み中</b></> :
      b.savedAt ? <>セーブ: <b>棚に保存済み</b>、{new Date(b.savedAt).toLocaleTimeString("ja")} に書き込み{b.restored ? "、読み込み時に復元" : ""}</> :
      <>セーブ: <b>まだない</b>。RAM が変わると棚へ送られる</>,
    frames: (n: number, u: number) => <>表示したフレーム: <b>{n}</b>、走ったが復号されなかったもの: <b>{u}</b></>,
    cost: (c: number, e: number, p: number, gpu: boolean) =>
      gpu ? (
        <>一フレームあたり: コンソール <b>{c.toFixed(1)} ms</b>、絵の GPU への投入 <b>{p.toFixed(1)} ms</b>（符号化と復号、転送込み）、それぞれ別スレッドで</>
      ) : (
        <>一フレームあたり: コンソール <b>{c.toFixed(1)} ms</b>、符号化と復号 <b>{(e + p).toFixed(1)} ms</b>、それぞれ別スレッドで</>
      ),
    path: (path: string, why: string | null, agreement: number | null, tol: number | null, agreementV: number | null, tolV: number | null) =>
      path === "webgpu" ? (
        <>
          絵: <b>WebGPU</b>、最初のフレームで符号化器は wasm 符号化器と <b>{agreementV} V</b> 以内（許容 {tolV}）、復号は wasm 復号と <b>255 分の {agreement}</b> 以内（許容 {tol}）
        </>
      ) : (
        <>絵: <b>wasm</b>{why ? <>（{why}）</> : null}</>
      ),
    fps: (v: number) => <>直近一秒の絵: <b>{v}</b></>,
    drift: (s: DriftStats) => (
      <>表示コールバック: <b>{s.presented}</b>、重複: <b>{s.duplicated}</b>、欠落: <b>{s.dropped}</b></>
    ),
    underruns: (n: number, audio: boolean) => (audio ? <>音声のアンダーラン: <b>{n}</b></> : <>音声: <b>なし</b>（このブラウザは出力を与えなかった）</>),
    keys: "キー: 矢印、Z と X が B と A、Enter が Start、右 Shift が Select。または画面の下のパッドを両手の親指で。コントローラ 2 は左手に: W A S D、F と G が B と A、T が Start、R が Select。",
    stripAll: "床の帯には電源、リセット、実行、そしてステップ: 半サイクル、1 サイクル、1 命令、1 走査線、1 フレーム。",
    stripPlay: "床の帯には電源、リセット、実行、そして全画面。",
    create: (href: string) => <>走っているゲームの中、つまりコード、メモリ、パレット、スプライトを覗いたり、タイルを描き替えたりするには、<Link href={href}>作る机</Link>で開く。</>,
    select: "select",
    start: "start",
    canvasLabel: "3 ラインコムを通したコンソールの絵: 2048 サンプル x 240 ライン",
  },
} as const;

export function Play({ lang }: { lang: Lang }) {
  return (
    <>
      <Screen lang={lang} />
      <Cartridge lang={lang} brief />
    </>
  );
}

/**
 * The screen, and the pad under it when `stage` is on. The element tree is
 * the same either way, only the class changes, so a desk that switches
 * between its window and its phone layout keeps the canvas the engine is
 * attached to (a new canvas would mean detach, and detach stops the console).
 */
export function Screen({ lang, stage = true }: { lang: Lang; stage?: boolean }) {
  const T = S[lang];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) attach(canvasRef.current);
    return () => detach();
  }, []);

  return (
    <section className="wb-stage play-section" id="screen" data-play>
      <h2 className="eyebrow">{T.screenH}</h2>
      <div className={stage ? "play-stage" : "desk-screen"} data-play-stage>
        <div className="panel play-panel">
          <div className="panel-face">
            <canvas ref={canvasRef} width={2048} height={240} className="bench-screen" role="img" aria-label={T.canvasLabel} />
          </div>
        </div>
        {stage ? <Gamepad labels={{ select: T.select, start: T.start }} /> : null}
      </div>
    </section>
  );
}

/**
 * The cartridge: the file, the shelf, and the play key. `brief` is the play
 * page's: the strip's sentence names only its keys, a line under the keys
 * says what is running and whether the save is kept, and the create desk
 * is pointed to for everything else.
 */
export function Cartridge({ lang, brief = false }: { lang: Lang; brief?: boolean }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <section className="wb-page play-section" id="cartridge">
      <h2 className="eyebrow">{T.cartH}</h2>
      {s.why ? (
        <p className="notice fail" data-play-why>
          {s.why}
        </p>
      ) : null}
      <div className="bench-controls">
        <div className="chips">
          <label className="btn">
            {T.pick}
            <input
              type="file"
              accept=".nes"
              data-play-rom
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
              }}
            />
          </label>
          <ShelfPicker lang={lang} onPick={(f, cart) => void load(f, cart)} loaded={s.loaded} />
          {/* The strip's play key, again, beside the cartridge (owner,
              2026-09-23): the same engine and the same state, so the two
              never disagree; the strip may be a swipe away on a phone. */}
          <button type="button" className="btn btn-primary" onClick={toggleRun} disabled={!s.loaded || !s.powered} aria-pressed={s.running} data-play-run-sister>
            {s.running ? T.pause : T.run}
          </button>
        </div>
        <p className="quiet" style={{ margin: 0 }}>
          {T.keys} {brief ? T.stripPlay : T.stripAll}
        </p>
        {brief ? (
          <>
            <p className="bench-readout" data-play-status>
              {!s.loaded ? (
                <span className="quiet">{T.none}</span>
              ) : (
                <>
                  <span className="measured">{T.loaded(s.loaded)}</span>
                  {!s.powered ? <span className="measured" data-play-off>{T.off}</span> : null}
                  {s.battery ? <span className="measured" data-play-battery={s.battery.has ? (s.battery.savedAt ? "kept" : "none") : "no-battery"}>{T.battery(s.battery)}</span> : null}
                </>
              )}
            </p>
            <p className="quiet" style={{ margin: 0 }} data-play-create>
              {T.create(localize(lang, "/nes/create"))}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function Readouts({ lang }: { lang: Lang }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <section className="wb-page play-section" id="readouts">
      <h2 className="eyebrow">{T.readH}</h2>
      <p className="bench-readout" data-play-stats>
        {!s.loaded ? (
          <span className="quiet">{T.none}</span>
        ) : (
          <>
            <span className="measured">{T.loaded(s.loaded)}</span>
            {!s.powered ? <span className="measured" data-play-off>{T.off}</span> : null}
            {s.patched ? <span className="measured" data-play-patched>{T.patched}</span> : null}
            <span className="measured">{T.frames(s.frames, s.undecoded)}</span>
            {s.consoleMs !== null && s.pipeMs !== null && s.encodeMs !== null ? <span className="measured">{T.cost(s.consoleMs, s.encodeMs, s.pipeMs, s.path === "webgpu")}</span> : null}
            {s.path ? <span className="measured" data-play-path={s.path}>{T.path(s.path, s.pathWhy, s.agreement, s.tolerance, s.agreementV, s.toleranceV)}</span> : null}
            {s.fps !== null ? <span className="measured">{T.fps(s.fps)}</span> : null}
            {s.stats ? <span className="measured">{T.drift(s.stats)}</span> : null}
            {s.frames > 0 ? <span className="measured">{T.underruns(s.underruns, s.audio)}</span> : null}
            {s.battery ? <span className="measured" data-play-battery={s.battery.has ? (s.battery.savedAt ? "kept" : "none") : "no-battery"}>{T.battery(s.battery)}</span> : null}
          </>
        )}
      </p>
    </section>
  );
}
