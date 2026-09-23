"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { FullscreenButton } from "@/app/components/Fullscreen";
import { powerCycle, setPower, snapshot, serverSnapshot, stepFrame, subscribe, toggleRun } from "./playEngine";

/**
 * The console's transport, on the floor, in the chip transport's shape
 * (6502/explorer/ChipTransport.tsx: the owner's standard for every
 * instrument page). The same classes, so the kit's rules dress it and the
 * two strips read as one control; its own keys, because a console steps by
 * the frame and the bundle it runs offers nothing finer.
 *
 * The keys the console honours today: power (the console is dropped and
 * the cartridge kept; on loads it again), start (a power cycle, the only
 * reset the bundle has), play/pause, and frame (one frame while paused).
 * The instruction step, the rate and the seek are here and grey, with the
 * reason in their title, by the strip's own rule: a key the machine cannot
 * honour is disabled, never hidden, so the row is the same on every
 * instrument and a reader learns it once. They light when the bundle
 * exports what they need (notes/workbench.md, the engine seam).
 *
 * The position is frames run and the CPU's half-cycles, the bundle's one
 * counter, read from every tick's answer: nothing here polls the worker.
 */

const L = {
  en: {
    powerOn: "Power off. The console stops; the cartridge and the last picture stay.",
    powerOff: "Power on. Loads the cartridge again, the state it powered on into.",
    powerNone: "Power. No cartridge is loaded.",
    start: "Back to power on: the same cartridge, loaded again",
    play: "Play",
    pause: "Pause",
    frame: "Run one frame",
    op: "Next instruction. This console's bundle steps by the frame; the instruction step waits on the engine seam.",
    rate: "Rate. The console keeps the source's rate against the wall clock; there is no other.",
    seek: "Position in the run. This console cannot seek: nothing here can be rewound yet.",
    none: "no cartridge",
    wPower: "power", wStart: "start", wPlay: "play", wPause: "pause", wFrame: "frame", wOp: "op",
    frames: "frame", cyc: "cyc",
  },
  ja: {
    powerOn: "電源を切る。コンソールは止まり、カートリッジと最後の絵は残る。",
    powerOff: "電源を入れる。カートリッジを読み込み直す。電源投入で入った状態だ。",
    powerNone: "電源。カートリッジが読み込まれていない。",
    start: "電源投入へ戻る: 同じカートリッジを読み込み直す",
    play: "実行",
    pause: "一時停止",
    frame: "1 フレーム進める",
    op: "次の命令へ。このコンソールのバンドルはフレーム単位で進む。命令ステップはエンジンの継ぎ目待ち。",
    rate: "レート。コンソールは壁時計に対してソースのレートを保つ。他のレートはない。",
    seek: "実行中の位置。このコンソールはシークできない。まだ何も巻き戻せない。",
    none: "カートリッジなし",
    wPower: "power", wStart: "start", wPlay: "play", wPause: "pause", wFrame: "frame", wOp: "op",
    frames: "frame", cyc: "cyc",
  },
} as const;

/* The chip transport's icons, the same shapes, so the two strips read as
   one control. */
const IC = {
  start: "M6 5v14M18 6l-9 6 9 6z",
  play: "M8 5l11 7-11 7z",
  pause: "M8 5v14M16 5v14",
  next: "M9 6l6 6-6 6",
  op: "M6 6l6 6-6 6M17 6v12",
  power: "M12 3v8M6.4 6.4a8 8 0 1 0 11.2 0",
};
function Ic({ d }: { d: string }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function PlayTransport({ lang }: { lang: Lang }) {
  const S = L[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  // The strip's height, published as --strip-h for what has to stop above
  // it: the stage in full screen (nes.css). Measured, because the rows wrap
  // on a phone; cleared when the strip leaves. The chip transport does the
  // same for its pages.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".chip-transport");
    const r = document.documentElement;
    if (!el) return;
    const publish = () => {
      const h = el.offsetHeight;
      if (h > 0) r.style.setProperty("--strip-h", `${Math.ceil(h)}px`);
      else r.style.removeProperty("--strip-h");
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => { ro.disconnect(); r.style.removeProperty("--strip-h"); };
  }, []);
  const loaded = s.loaded !== null;
  const on = loaded && s.powered;
  const powerTitle = !loaded ? S.powerNone : s.powered ? S.powerOn : S.powerOff;
  return (
    <div className="chip-transport" role="toolbar" aria-label="Console transport" data-powered={on ? "1" : "0"} data-play-transport>
      <div className="ct-row">
        <button
          type="button"
          className={"tbtn pw" + (on ? " on" : "")}
          title={powerTitle}
          aria-label={powerTitle}
          aria-pressed={on}
          disabled={!loaded}
          onClick={() => void setPower(!s.powered)}
          data-play-power
        >
          <Ic d={IC.power} /><span className="lb">{S.wPower}</span>
        </button>
        <button type="button" className="tbtn" title={S.start} aria-label={S.start} disabled={!on} onClick={() => void powerCycle()} data-play-start>
          <Ic d={IC.start} /><span className="lb">{S.wStart}</span>
        </button>
        <button
          type="button"
          className={"tbtn play" + (s.running ? " on" : "")}
          title={s.running ? S.pause : S.play}
          aria-label={s.running ? S.pause : S.play}
          aria-pressed={s.running}
          disabled={!on}
          onClick={toggleRun}
          data-play-run
        >
          <Ic d={s.running ? IC.pause : IC.play} /><span className="lb">{s.running ? S.wPause : S.wPlay}</span>
        </button>
        <button type="button" className="tbtn" title={S.frame} aria-label={S.frame} disabled={!on || s.running} onClick={() => void stepFrame()} data-play-frame>
          <Ic d={IC.next} /><span className="lb">{S.wFrame}</span>
        </button>
        <button type="button" className="tbtn" title={S.op} aria-label={S.op} disabled>
          <Ic d={IC.op} /><span className="lb">{S.wOp}</span>
        </button>
        <label className="ct-rate" title={S.rate}>
          <input type="range" min={0} max={0} step={1} value={0} disabled aria-label={S.rate} readOnly />
          <span className="tlab">1x</span>
        </label>
        <input type="range" className="ct-seek" min={0} max={0} step={1} value={0} disabled aria-label={S.seek} title={S.seek} readOnly />
        <span className="ct-pos" aria-live="off" data-play-pos>
          {!loaded ? S.none : <>{S.frames} <b>{s.framesRun}</b> · {S.cyc} <b>{Math.floor(s.halfCycles / 2)}</b></>}
        </span>
        <FullscreenButton lang={lang} />
      </div>
    </div>
  );
}
