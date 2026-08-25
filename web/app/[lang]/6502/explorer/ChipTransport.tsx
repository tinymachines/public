"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";

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
 * What it does not do, and says so: a page without a chip (the primer, the
 * programs list) registers no driver, and the bar disables itself rather
 * than pressing buttons at a machine that is not there. The machine itself is
 * still per page; sharing it is an upstream change to their modules and is
 * written up in PROJECTS.md rather than faked here.
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
    wStart: "start", wPlay: "play", wPause: "pause", wHalf: "½", wCyc: "cyc",
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
    wStart: "start", wPlay: "play", wPause: "pause", wHalf: "½", wCyc: "cyc",
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
};
function Ic({ d }: { d: string }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function ChipTransport({ lang = "en" }: { lang?: Lang }) {
  const S = L[lang];
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
    if (!ctl || !running) return;
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
        <button type="button" className="tbtn" title={S.start} aria-label={S.start} disabled={!live} onClick={() => { ctl?.reset(); try { sessionStorage.setItem(KEY, "0"); } catch { /* private mode */ } }}>
          <Ic d={IC.start} /><span className="lb">{S.wStart}</span>
        </button>
        <button type="button" className="tbtn" title={S.back} aria-label={S.back} disabled={!live} onClick={() => ctl?.stepBack()}>
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
        <button type="button" className="tbtn" title={S.step} aria-label={S.step} disabled={!live} onClick={() => ctl?.step()}>
          <Ic d={IC.next} /><span className="lb">{S.wHalf}</span>
        </button>
        <button type="button" className="tbtn" title={S.cycle} aria-label={S.cycle} disabled={!live} onClick={() => { ctl?.step(); ctl?.step(); }}>
          <Ic d={IC.cycle} /><span className="lb">{S.wCyc}</span>
        </button>
        <label className="ct-rate" title={S.rate}>
          <input
            type="range"
            min={0}
            max={clocks.length - 1}
            step={1}
            value={rateIndex}
            disabled={!ctl}
            aria-label={S.rate}
            onChange={(e) => ctl?.setClock(clocks[Number(e.target.value)].hz)}
          />
          <span className="tlab">{ctl ? ctl.clockLabel() : clocks[0].label}</span>
        </label>
        <span className="ct-pos" aria-live="off">
          {!live ? S.loading : hc === null ? "" : <>h <b>{hc}</b> · cyc <b>{cyc}</b></>}
        </span>
      </div>
    </div>
  );
}
