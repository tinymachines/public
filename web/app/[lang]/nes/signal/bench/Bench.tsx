"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import {
  attach,
  detach,
  choose,
  step,
  toggleRun,
  subscribe,
  snapshot,
  serverSnapshot,
  type DriftStats,
} from "./benchEngine";

/**
 * The whole signal path, running in this page: a follower of benchEngine's
 * announcements and nothing more. The frame loop, the worker and the canvas
 * writes live in the engine module; this renders the controls, the notice
 * and the readouts from its state.
 *
 * It is a laboratory instrument, not a game, and the pacing shows it: Step
 * encodes exactly one frame; Run is a real free-run in which the source
 * advances at its own exact 60.09881 Hz against the wall clock while the
 * browser encodes what it can, so the dropped counter climbing is the
 * measurement, printed rather than hidden.
 */

const S = {
  en: {
    rung: "Filter",
    notch: "notch filter",
    comb3: "3-line comb",
    pattern: "Pattern",
    hueBands: "hue bands",
    stripes: "stripes",
    solid: "solid",
    step: "Step one frame",
    run: "Run",
    pause: "Pause",
    frames: (n: number) => (
      <>frames encoded: <b>{n}</b></>
    ),
    ms: (v: number) => (
      <>last frame: <b>{v.toFixed(0)} ms</b></>
    ),
    fps: (v: number) => (
      <>measured here: <b>{v.toFixed(2)} frames/s</b></>
    ),
    drift: (s: DriftStats) => (
      <>
        display callbacks: <b>{s.presented}</b>, duplicated:{" "}
        <b>{s.duplicated}</b>, dropped: <b>{s.dropped}</b>
      </>
    ),
    idle: "No frame yet. Step once, or run.",
    canvasLabel: "The decoded frame: 2048 samples by 240 lines of the active picture",
  },
  ja: {
    rung: "フィルタ",
    notch: "ノッチフィルタ",
    comb3: "3 ラインコム",
    pattern: "パターン",
    hueBands: "色相帯",
    stripes: "ストライプ",
    solid: "単色",
    step: "1 フレーム進める",
    run: "走らせる",
    pause: "停止",
    frames: (n: number) => (
      <>エンコードしたフレーム: <b>{n}</b></>
    ),
    ms: (v: number) => (
      <>直近フレーム: <b>{v.toFixed(0)} ms</b></>
    ),
    fps: (v: number) => (
      <>この環境での実測: <b>{v.toFixed(2)} フレーム/秒</b></>
    ),
    drift: (s: DriftStats) => (
      <>
        表示コールバック: <b>{s.presented}</b>、重複: <b>{s.duplicated}</b>、
        欠落: <b>{s.dropped}</b>
      </>
    ),
    idle: "まだフレームが無い。1 フレーム進めるか、走らせる。",
    canvasLabel: "デコード済みフレーム: 有効画面 2048 サンプル x 240 ライン",
  },
} as const;

export function Bench({ lang }: { lang: Lang }) {
  const T = S[lang];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    if (canvasRef.current) attach(canvasRef.current);
    return () => detach();
  }, []);

  const chip = (pressed: boolean, label: string, act: () => void) => (
    <button type="button" className="chip" aria-pressed={pressed} onClick={act} key={label}>
      {label}
    </button>
  );

  const fps = s.ms !== null && s.ms > 0 ? 1000 / s.ms : null;

  return (
    <section className="bench" data-bench>
      <div className="panel">
        <div className="panel-face">
          <canvas
            ref={canvasRef}
            width={2048}
            height={240}
            className="bench-screen"
            role="img"
            aria-label={T.canvasLabel}
          />
        </div>
      </div>

      {s.why ? (
        <p className="notice fail" data-bench-why>
          {s.why}
        </p>
      ) : null}

      <div className="bench-controls">
        <div className="chips" role="group" aria-label={T.rung}>
          {chip(s.rung === "notch", T.notch, () => choose({ rung: "notch" }))}
          {chip(s.rung === "comb3", T.comb3, () => choose({ rung: "comb3" }))}
        </div>
        <div className="chips" role="group" aria-label={T.pattern}>
          {chip(s.pattern === "hue-bands", T.hueBands, () => choose({ pattern: "hue-bands" }))}
          {chip(s.pattern === "stripes", T.stripes, () => choose({ pattern: "stripes" }))}
          {chip(s.pattern === "solid", T.solid, () => choose({ pattern: "solid" }))}
        </div>
        <div className="chips">
          <button
            type="button"
            className="btn"
            onClick={() => void step()}
            disabled={s.busy || s.running}
          >
            {T.step}
          </button>
          <button type="button" className="btn btn-primary" onClick={toggleRun}>
            {s.running ? T.pause : T.run}
          </button>
        </div>
      </div>

      <p className="bench-readout" data-bench-stats>
        {s.frames === 0 && !s.stats ? (
          <span className="quiet">{T.idle}</span>
        ) : (
          <>
            <span className="measured">{T.frames(s.frames)}</span>
            {s.ms !== null ? <span className="measured">{T.ms(s.ms)}</span> : null}
            {fps !== null ? <span className="measured">{T.fps(fps)}</span> : null}
            {s.stats ? <span className="measured">{T.drift(s.stats)}</span> : null}
          </>
        )}
      </p>
    </section>
  );
}
