"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { attach, detach, load, toggleRun, subscribe, snapshot, serverSnapshot, type DriftStats } from "./playEngine";

/**
 * The console in the page: a follower of playEngine's announcements. The
 * worker, the loop, the canvas, the keyboard and the audio cursor live in
 * the engine module; this renders the file input, the run button, the
 * screen and the readouts from its state.
 */

const S = {
  en: {
    pick: "Cartridge (.nes, NROM)",
    run: "Run",
    pause: "Pause",
    none: "No cartridge. Choose a .nes file from your own disk; it never leaves this browser.",
    loaded: (name: string) => <>cartridge: <b>{name}</b></>,
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
    keys: "Keys: arrows, Z and X for B and A, Enter for Start, right Shift for Select.",
    canvasLabel: "The console's picture through the three-line comb: 2048 samples by 240 lines",
  },
  ja: {
    pick: "カートリッジ（.nes、NROM）",
    run: "走らせる",
    pause: "停止",
    none: "カートリッジが無い。自分のディスクから .nes ファイルを選ぶ。ファイルはこのブラウザから出ない。",
    loaded: (name: string) => <>カートリッジ: <b>{name}</b></>,
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
    keys: "キー: 矢印、Z と X が B と A、Enter が Start、右 Shift が Select。",
    canvasLabel: "3 ラインコムを通したコンソールの絵: 2048 サンプル x 240 ライン",
  },
} as const;

export function Play({ lang }: { lang: Lang }) {
  const T = S[lang];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    if (canvasRef.current) attach(canvasRef.current);
    return () => detach();
  }, []);


  return (
    <section className="bench" data-play>
      <div className="panel">
        <div className="panel-face">
          <canvas ref={canvasRef} width={2048} height={240} className="bench-screen" role="img" aria-label={T.canvasLabel} />
        </div>
      </div>

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
          <button type="button" className="btn btn-primary" onClick={toggleRun} disabled={!s.loaded} data-play-run>
            {s.running ? T.pause : T.run}
          </button>
        </div>
        <p className="quiet" style={{ margin: 0 }}>
          {T.keys}
        </p>
      </div>

      <p className="bench-readout" data-play-stats>
        {!s.loaded ? (
          <span className="quiet">{T.none}</span>
        ) : (
          <>
            <span className="measured">{T.loaded(s.loaded)}</span>
            <span className="measured">{T.frames(s.frames, s.undecoded)}</span>
            {s.consoleMs !== null && s.pipeMs !== null && s.encodeMs !== null ? <span className="measured">{T.cost(s.consoleMs, s.encodeMs, s.pipeMs, s.path === "webgpu")}</span> : null}
            {s.path ? <span className="measured" data-play-path={s.path}>{T.path(s.path, s.pathWhy, s.agreement, s.tolerance, s.agreementV, s.toleranceV)}</span> : null}
            {s.fps !== null ? <span className="measured">{T.fps(s.fps)}</span> : null}
            {s.stats ? <span className="measured">{T.drift(s.stats)}</span> : null}
            {s.frames > 0 ? <span className="measured">{T.underruns(s.underruns, s.audio)}</span> : null}
          </>
        )}
      </p>
    </section>
  );
}
