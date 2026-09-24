"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { FullscreenButton } from "@/app/components/Fullscreen";
import { reset, setPower, snapshot, serverSnapshot, step, stepFrame, subscribe, toggleRun } from "./playEngine";

/**
 * The console's transport, on the floor, in the chip transport's shape
 * (6502/explorer/ChipTransport.tsx: the owner's standard for every
 * instrument page). The same classes, so the kit's rules dress it and the
 * two strips read as one control; its own keys, because a console steps by
 * the frame and the bundle it runs offers nothing finer.
 *
 * The keys: power (the console is dropped and the cartridge kept; on loads
 * it again), start (the front panel's reset button since the fifth step:
 * the CPU restarts at its vector, RAM and the save keep what they hold),
 * play/pause, and the steps by the machine's own units: a CPU half-cycle,
 * a cycle, an instruction (to the next opcode fetch), a scanline, a
 * frame. The rate and the seek are here and grey, with the reason in
 * their title, by the strip's own rule: a key the machine cannot honour is
 * disabled, never hidden, so the row is the same on every instrument and
 * a reader learns it once. A bundle without the steps greys them too.
 *
 * The position is frames run and the CPU's half-cycles, the bundle's one
 * counter, read from every tick's answer: nothing here polls the worker.
 *
 * `brief` is the play page's strip (owner, 2026-09-24: Play is just the
 * playing): power, reset, play, the frames run and full screen. The steps,
 * the rate and the seek are the create desk's, where the tools are.
 */

const L = {
  en: {
    powerOn: "Power off. The console stops; the cartridge and the last picture stay.",
    powerOff: "Power on. Loads the cartridge again, the state it powered on into.",
    powerNone: "Power. No cartridge is loaded.",
    start: "Reset: the front panel's button. The CPU restarts at its vector; RAM and the save keep what they hold.",
    play: "Play",
    pause: "Pause",
    half: "Forward one CPU half-cycle",
    cycle: "Next full CPU cycle",
    op: "Next instruction: to the next opcode fetch",
    line: "Next scanline",
    frame: "Run one frame",
    stepNone: "This bundle cannot step below a frame.",
    rate: "Rate. The console keeps the source's rate against the wall clock; there is no other.",
    seek: "Position in the run. This console cannot seek: nothing here can be rewound yet.",
    none: "no cartridge",
    wPower: "power", wStart: "reset", wPlay: "play", wPause: "pause", wFrame: "frame", wOp: "op", wHalf: "½", wCyc: "cyc", wLine: "line",
    frames: "frame", cyc: "cyc",
  },
  ja: {
    powerOn: "電源を切る。コンソールは止まり、カートリッジと最後の絵は残る。",
    powerOff: "電源を入れる。カートリッジを読み込み直す。電源投入で入った状態だ。",
    powerNone: "電源。カートリッジが読み込まれていない。",
    start: "リセット: 前面パネルのボタン。CPU はベクタから再開し、RAM とセーブはそのまま。",
    play: "実行",
    pause: "一時停止",
    half: "CPU 半サイクル進む",
    cycle: "次の CPU 1 サイクルへ",
    op: "次の命令へ: 次のオペコード取得まで",
    line: "次の走査線へ",
    frame: "1 フレーム進める",
    stepNone: "このバンドルはフレームより細かく進めない。",
    rate: "レート。コンソールは壁時計に対してソースのレートを保つ。他のレートはない。",
    seek: "実行中の位置。このコンソールはシークできない。まだ何も巻き戻せない。",
    none: "カートリッジなし",
    wPower: "power", wStart: "reset", wPlay: "play", wPause: "pause", wFrame: "frame", wOp: "op", wHalf: "½", wCyc: "cyc", wLine: "line",
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
  cycle: "M6 6l6 6-6 6M13 6l6 6-6 6",
  op: "M6 6l6 6-6 6M17 6v12",
  line: "M4 12h16M14 8l4 4-4 4",
  power: "M12 3v8M6.4 6.4a8 8 0 1 0 11.2 0",
};
function Ic({ d }: { d: string }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function PlayTransport({ lang, brief = false }: { lang: Lang; brief?: boolean }) {
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
  // The steps below a frame need the bundle's control (the fifth step);
  // a bundle without it leaves them grey with the reason.
  const canStep = on && !s.running && s.machine !== null;
  const stepTitle = (t: string) => (s.machine === null && on ? S.stepNone : t);
  return (
    <div className="chip-transport" role="toolbar" aria-label="Console transport" data-powered={on ? "1" : "0"} data-brief={brief ? "" : undefined} data-play-transport>
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
        <button type="button" className="tbtn" title={S.start} aria-label={S.start} disabled={!on || s.machine === null} onClick={() => void reset()} data-play-start>
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
        {brief ? null : (
          <>
            <button type="button" className="tbtn" title={stepTitle(S.half)} aria-label={stepTitle(S.half)} disabled={!canStep} onClick={() => void step("half")} data-play-half>
              <Ic d={IC.next} /><span className="lb">{S.wHalf}</span>
            </button>
            <button type="button" className="tbtn" title={stepTitle(S.cycle)} aria-label={stepTitle(S.cycle)} disabled={!canStep} onClick={() => void step("cycle")} data-play-cycle>
              <Ic d={IC.cycle} /><span className="lb">{S.wCyc}</span>
            </button>
            <button type="button" className="tbtn" title={stepTitle(S.op)} aria-label={stepTitle(S.op)} disabled={!canStep} onClick={() => void step("op")} data-play-op>
              <Ic d={IC.op} /><span className="lb">{S.wOp}</span>
            </button>
            <button type="button" className="tbtn" title={stepTitle(S.line)} aria-label={stepTitle(S.line)} disabled={!canStep} onClick={() => void step("line")} data-play-line>
              <Ic d={IC.line} /><span className="lb">{S.wLine}</span>
            </button>
            <button type="button" className="tbtn" title={S.frame} aria-label={S.frame} disabled={!on || s.running} onClick={() => void stepFrame()} data-play-frame>
              <Ic d={IC.next} /><span className="lb">{S.wFrame}</span>
            </button>
            <label className="ct-rate" title={S.rate}>
              <input type="range" min={0} max={0} step={1} value={0} disabled aria-label={S.rate} readOnly />
              <span className="tlab">1x</span>
            </label>
            <input type="range" className="ct-seek" min={0} max={0} step={1} value={0} disabled aria-label={S.seek} title={S.seek} readOnly />
          </>
        )}
        <span className="ct-pos" aria-live="off" data-play-pos>
          {!loaded ? S.none : brief ? <>{S.frames} <b>{s.framesRun}</b></> : <>{S.frames} <b>{s.framesRun}</b> · {S.cyc} <b>{Math.floor(s.halfCycles / 2)}</b></>}
        </span>
        <FullscreenButton lang={lang} />
      </div>
    </div>
  );
}
