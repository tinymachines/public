"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";
import { FullscreenButton } from "@/app/components/Fullscreen";

/**
 * One transport for every page that runs the chip.
 *
 * The explorer's `chip-controls.js` is already the single store: running or
 * not, the simulated clock in Hz, and whichever page's machine is currently
 * registered as the driver. Every control on their pages is a view of it, and
 * this bar is one more, so pressing pause here pauses the chip the page is
 * showing, and because the site navigates client-side the module instance
 * survives a page change: the rate and the running state you set on the
 * explorer are the rate and state the tracer opens with.
 *
 * The bar imports the SAME URL their modules import, resolved from their
 * asset manifest at runtime exactly as ChipModules does, which is what makes
 * it the same instance rather than a second store with the same shape.
 *
 * The strip is the same set of controls on every page (owner's call,
 * 2026-08-25): the Lab's set, power, start, half-steps, play, cycle, opcode,
 * rate, seek and position, with full screen at the right end. A control the
 * page's chip cannot honour is DISABLED, not hidden: a strip that loses a
 * button per page reads as a different strip on each. So the console, which
 * runs whole frames, shows the half-step buttons greyed; and power, opcode
 * step and seek are greyed everywhere until the one engine that can honour
 * them arrives (notes/one-engine.md). A page without a chip (the primer's
 * text, the programs list) registers no driver and the whole strip is grey.
 */

interface Controls {
  CLOCKS: { hz: number; label: string }[];
  clockHz(): number;
  isRunning(): boolean;
  hasDriver(): boolean;
  chipHalfCycle(): number | null;
  clockLabel(hz?: number): string;
  setRunning(on: boolean): void;
  toggleRunning(): void;
  setClock(hz: number): void;
  step(): void;
  stepBack(): void;
  reset(): void;
  subscribe(fn: () => void): () => void;
}

const KEY = "tm.chip.running";

const L = {
  en: {
    start: "Back to the first half-cycle: the state the chip powered on into",
    back: "Back one half-cycle",
    play: "Play",
    pause: "Pause",
    step: "Forward one half-cycle",
    cycle: "Next full cycle",
    rate: "Simulated clock rate. A cycle is two half-cycles, so 1 Hz is two steps a second.",
    loading: "finding the chip",
    power: "Power. The chip on this page is always powered; a power switch needs the one engine (not yet).",
    op: "Next opcode fetch. Needs the one engine (not yet).",
    seek: "Position in the run. Seeking needs the one engine (not yet).",
    wPower: "power", wStart: "start", wPlay: "play", wPause: "pause", wHalf: "½", wCyc: "cyc", wOp: "op",
  },
  ja: {
    start: "最初の半サイクルへ: チップが電源投入で入った状態",
    back: "半サイクル戻る",
    play: "実行",
    pause: "一時停止",
    step: "半サイクル進む",
    cycle: "次の 1 サイクルへ",
    rate: "シミュレートするクロック。1 サイクルは半サイクル 2 つなので、1 Hz は毎秒 2 ステップ。",
    loading: "チップを探している",
    power: "電源。このページのチップは常に通電。電源スイッチには単一エンジンが要る (まだ)。",
    op: "次のオペコード取得へ。単一エンジンが要る (まだ)。",
    seek: "実行中の位置。シークには単一エンジンが要る (まだ)。",
    wPower: "power", wStart: "start", wPlay: "play", wPause: "pause", wHalf: "½", wCyc: "cyc", wOp: "op",
  },
} as const;

/* The Lab's icons, the same shapes: a 24-unit outline stroked in the
   control's own colour, so they hover and disable with the control. */
const IC = {
  start: "M6 5v14M18 6l-9 6 9 6z",
  prev: "M15 6l-6 6 6 6",
  play: "M8 5l11 7-11 7z",
  pause: "M8 5v14M16 5v14",
  next: "M9 6l6 6-6 6",
  cycle: "M6 6l6 6-6 6M13 6l6 6-6 6",
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

/**
 * What the page's chip can honour. A control the driver cannot act on is
 * shown disabled: a half-step button on a console that runs whole frames
 * would press at nothing, and says so in its title. Default is everything
 * the explorer's store offers. The driver stating this itself is in the
 * upstream proposal (notes/upstream-transport.md); until then the page that
 * registers the driver says. Power, opcode step and seek are not in the
 * store at all, so no page can grant them yet.
 */
export interface Caps {
  back?: boolean;
  step?: boolean;
  cycle?: boolean;
  rate?: boolean;
}

export function ChipTransport({ lang = "en", caps = {} }: { lang?: Lang; caps?: Caps }) {
  const S = L[lang];
  const can = { back: true, step: true, cycle: true, rate: true, ...caps };
  const [ctl, setCtl] = useState<Controls | null>(null);
  const [failed, setFailed] = useState(false);
  // A tick so the view repaints when the store announces. The store's own
  // subscribe calls back immediately, which paints the first frame.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const res = await fetch("/6502/chip/asset-manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(String(res.status));
      const manifest = (await res.json()) as Record<string, string>;
      const hashed = manifest["chip-controls.js"];
      if (!hashed) throw new Error("no chip-controls.js in the manifest");
      const mod = (await import(/* webpackIgnore: true */ `/6502/chip/${hashed}`)) as Controls;
      if (cancelled) return;
      setCtl(mod);
      // The running state crosses pages by being written down, because each
      // explorer page is a fresh document (see MenuItem.hard) and the store
      // starts stopped. Their clock already persists the same way, in their
      // own localStorage key. Applied once the page has a chip to run.
      let restored = false;
      unsub = mod.subscribe(() => {
        setTick((n) => n + 1);
        if (!restored && mod.hasDriver()) {
          restored = true;
          let want = false;
          try { want = sessionStorage.getItem(KEY) === "1"; } catch { /* private mode */ }
          if (want && !mod.isRunning()) mod.setRunning(true);
        }
      });
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  const live = ctl?.hasDriver() ?? false;
  const running = ctl?.isRunning() ?? false;

  // The readout while running. A page's chip advances by announcing to ITS
  // listeners, not to the store, so between store actions nothing here would
  // repaint and the half-cycle count would stand still while the chip ran.
  // Found on the primer: pause showed h 27, play showed h 28 a second later.
  // Four reads a second is enough to see it move and cheap enough to keep.
  useEffect(() => {
    if (!ctl) return;
    if (!running) {
      // One late read after a stop. The console finishes the frame that was
      // in flight when it was paused, and the count it lands on is the one
      // the strip should show: without this it showed the count from the
      // last tick before the pause, 8,704 half-cycles short on the console.
      const id = window.setTimeout(() => setTick((n) => n + 1), 600);
      return () => window.clearTimeout(id);
    }
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [ctl, running]);

  // A page that never offers a chip gets no bar. Halfshot plays recordings
  // with controls of its own and registers no driver; a floor bar reading
  // "no chip on this page" under those controls was a false claim. The grace
  // is for pages that do register, which takes a wasm boot to get to.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!ctl || ctl.hasDriver()) return;
    const id = window.setTimeout(() => setGaveUp(!ctl.hasDriver()), 8000);
    return () => window.clearTimeout(id);
  }, [ctl, tick]);

  if (failed) return null;
  if (gaveUp && !(ctl?.hasDriver() ?? false)) return null;
  const hc = ctl?.chipHalfCycle() ?? null;

  const clocks = ctl?.CLOCKS ?? [{ hz: 1, label: "1 Hz" }];
  const hz = ctl?.clockHz() ?? 1;
  const rateIndex = Math.max(0, clocks.findIndex((c) => c.hz === hz));
  const cyc = hc === null ? null : Math.floor(hc / 2);

  return (
    <div className="chip-transport" role="toolbar" aria-label="Chip transport">
      <div className="ct-row">
        <button type="button" className="tbtn pw" title={S.power} aria-label={S.power} aria-pressed={live} disabled>
          <Ic d={IC.power} /><span className="lb">{S.wPower}</span>
        </button>
        <button type="button" className="tbtn" title={S.start} aria-label={S.start} disabled={!live} onClick={() => { ctl?.reset(); try { sessionStorage.setItem(KEY, "0"); } catch { /* private mode */ } }}>
          <Ic d={IC.start} /><span className="lb">{S.wStart}</span>
        </button>
        <button type="button" className="tbtn" title={S.back} aria-label={S.back} disabled={!live || !can.back} onClick={() => ctl?.stepBack()}>
          <Ic d={IC.prev} /><span className="lb">{S.wHalf}</span>
        </button>
        <button
          type="button"
          className={"tbtn play" + (running ? " on" : "")}
          title={running ? S.pause : S.play}
          aria-label={running ? S.pause : S.play}
          aria-pressed={running}
          disabled={!live}
          onClick={() => {
            if (!ctl) return;
            ctl.toggleRunning();
            try { sessionStorage.setItem(KEY, ctl.isRunning() ? "1" : "0"); } catch { /* private mode */ }
          }}
        >
          <Ic d={running ? IC.pause : IC.play} /><span className="lb">{running ? S.wPause : S.wPlay}</span>
        </button>
        <button type="button" className="tbtn" title={S.step} aria-label={S.step} disabled={!live || !can.step} onClick={() => ctl?.step()}>
          <Ic d={IC.next} /><span className="lb">{S.wHalf}</span>
        </button>
        <button type="button" className="tbtn" title={S.cycle} aria-label={S.cycle} disabled={!live || !can.cycle} onClick={() => { ctl?.step(); ctl?.step(); }}>
          <Ic d={IC.cycle} /><span className="lb">{S.wCyc}</span>
        </button>
        <button type="button" className="tbtn" title={S.op} aria-label={S.op} disabled>
          <Ic d={IC.op} /><span className="lb">{S.wOp}</span>
        </button>
        <label className="ct-rate" title={S.rate}>
          <input
            type="range"
            min={0}
            max={clocks.length - 1}
            step={1}
            value={rateIndex}
            disabled={!ctl || !can.rate}
            aria-label={S.rate}
            onChange={(e) => ctl?.setClock(clocks[Number(e.target.value)].hz)}
          />
          <span className="tlab">{ctl ? ctl.clockLabel() : clocks[0].label}</span>
        </label>
        {/* The seek slider: the Lab's scrub, here until the one engine gives
            it a run to seek in. Disabled, so it is a real control in the
            same place rather than a gap where one will go. */}
        <input type="range" className="ct-seek" min={0} max={0} value={0} readOnly disabled aria-label={S.seek} title={S.seek} />
        <span className="ct-pos" aria-live="off">
          {!live ? S.loading : hc === null ? "" : <>h <b>{hc}</b> · cyc <b>{cyc}</b></>}
        </span>
        {/* Full screen, at the right end of the strip on every instrument
            page. Fullscreen.tsx says why it lives here and not in the bar. */}
        <FullscreenButton lang={lang} />
      </div>
    </div>
  );
}
