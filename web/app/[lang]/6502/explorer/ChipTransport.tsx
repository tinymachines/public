"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/lang";
import { FullscreenButton } from "@/app/components/Fullscreen";

/**
 * One transport for every page that runs the chip.
 *
 * The explorer's `chip-controls.js` is the single store: powered or not,
 * running or not, the simulated clock in Hz, and whichever page's machine is
 * registered as the driver. Every control on their pages is a view of it, and
 * this bar is one more, so pressing pause here pauses the chip the page is
 * showing. The bar imports the SAME URL their modules import, resolved from
 * their asset manifest at runtime exactly as ChipModules does, which is what
 * makes it the same instance rather than a second store with the same shape.
 *
 * ## One strip, mounted once
 *
 * The 6502 layout mounts this once for every route under /6502, and it
 * renders only on a page that has declared a chip floor
 * (`.workbench.has-transport`). Pages no longer mount it themselves, so a
 * page cannot carry a second one and cannot hand it a capability map: what
 * the strip offers is what the registered driver says it can do
 * (`driverCaps()`), and a control the driver cannot honour is DISABLED, not
 * hidden. A strip that loses a button per page reads as a different strip
 * on each.
 *
 * ## Power first, solid when on
 *
 * The first key is power, the Lab's arrangement. Solid while a machine is
 * powered; off, every other key is grey and the store refuses to run or
 * step. The switch is written down by the store (`v6502.power`) so the next
 * page opens in the same state, and the machine itself crosses pages the
 * same way (`chip-machine.js` upstream): the half-cycle you left the
 * explorer at is the one the tracer opens on. Opcode step and seek are real
 * on any page whose driver offers them; the wasm pages all do.
 *
 * A store from before those additions (a served release that lags) has none
 * of the new functions. Each is feature-detected and its key stays disabled,
 * which is the strip this was until 2026-08-26 and still an honest one.
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
  // Since 6502@chip-machine: absent on an older store.
  driverCaps?(): Partial<Record<"power" | "back" | "step" | "cycle" | "op" | "rate" | "seek" | "engine", boolean>> & { runsOn?: "local" | "api" };
  isPowered?(): boolean;
  isBooting?(): boolean;
  setPower?(on: boolean): Promise<void>;
  stepOp?(): void;
  seek?(h: number): void;
  chipEarliest?(): number | null;
  chipLength?(): number | null;
  // Since 6502@api-engine.
  engine?(): "local" | "api";
  setEngine?(which: "local" | "api"): void;
  engineLatency?(): number | null;
  engineError?(): string | null;
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
    powerOn: "Power off. The chip stops; what it holds stays on the page.",
    powerOff: "Power on. Boots the chip again from its program.",
    booting: "Booting a new machine.",
    powerNone: "Power. This page's chip has no switch.",
    op: "Next opcode fetch",
    opNone: "Next opcode fetch. This page's chip cannot step by opcode.",
    seek: "Position in the run. Drag to seek within what the chip can rewind.",
    seekNone: "Position in the run. This page's chip cannot seek.",
    engLocal: "Local engine: the chip steps in this page, in WebAssembly.",
    engApi: "API engine: halfwave steps the chip over HTTP. The whole machine travels out and back; the page draws the answer.",
    engNone: "Engine. This page's chip runs where it runs; there is no switch.",
    engErr: "The API stopped answering",
    wPower: "power", wStart: "start", wPlay: "play", wPause: "pause", wHalf: "½", wCyc: "cyc", wOp: "op",
    wLocal: "local", wApi: "api",
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
    powerOn: "電源を切る。チップは止まり、保持している状態はページに残る。",
    powerOff: "電源を入れる。プログラムからチップを起動し直す。",
    booting: "新しいマシンを起動中。",
    powerNone: "電源。このページのチップにスイッチはない。",
    op: "次のオペコード取得へ",
    opNone: "次のオペコード取得へ。このページのチップはオペコード単位で進めない。",
    seek: "実行中の位置。ドラッグで、巻き戻せる範囲の中をシーク。",
    seekNone: "実行中の位置。このページのチップはシークできない。",
    engLocal: "ローカルエンジン: チップはこのページの中、WebAssembly で進む。",
    engApi: "API エンジン: halfwave が HTTP 越しにチップを進める。マシン全体が往復し、ページはその答えを描く。",
    engNone: "エンジン。このページのチップは走る場所が決まっていて、切り替えはない。",
    engErr: "API が応答しなくなった",
    wPower: "power", wStart: "start", wPlay: "play", wPause: "pause", wHalf: "½", wCyc: "cyc", wOp: "op",
    wLocal: "local", wApi: "api",
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
  // The engines: a chip in the page, and a signal out to the API.
  local: "M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4",
  api: "M12 21v-7M8.5 10.5a5 5 0 0 1 7 0M5.5 7.5a9 9 0 0 1 13 0M2.5 4.5a13 13 0 0 1 19 0",
};
function Ic({ d }: { d: string }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Whether the current document has declared a chip floor. */
const hasFloor = () => !!document.querySelector(".workbench.has-transport");

export function ChipTransport({ lang = "en" }: { lang?: Lang }) {
  const S = L[lang];
  const pathname = usePathname();
  const [floor, setFloor] = useState(false);
  const [ctl, setCtl] = useState<Controls | null>(null);
  const [failed, setFailed] = useState(false);
  // A tick so the view repaints when the store announces. The store's own
  // subscribe calls back immediately, which paints the first frame.
  const [tick, setTick] = useState(0);

  // The floor is the page's to declare. Read after the route has painted,
  // and again on every client navigation: the games page has one, the
  // manage page beside it does not, and the strip is mounted above both.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFloor(hasFloor()));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  // Deps are the floor alone. `ctl` is set inside this effect, and listing
  // it re-ran the effect on that change, whose cleanup UNSUBSCRIBED the
  // view: the first deploy of the real power key changed the store and
  // never repainted (probe: powered false, key still solid).
  useEffect(() => {
    if (!floor) return;
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
      // The Lab's script registers with the store through this handover
      // (it imports no modules of its own): the global for a script that
      // runs after this, the event for one that ran before.
      (window as unknown as { tmChipStore?: Controls }).tmChipStore = mod;
      window.dispatchEvent(new CustomEvent("tm:chip-store", { detail: mod }));
      // The running state crosses pages by being written down, because each
      // explorer page is a fresh document (see MenuItem.hard) and the store
      // starts stopped. Their clock already persists the same way, in their
      // own localStorage key, and power in the store's own. Applied once the
      // page has a chip to run.
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
  }, [floor]);

  const live = ctl?.hasDriver() ?? false;
  const running = ctl?.isRunning() ?? false;
  const powered = ctl?.isPowered ? ctl.isPowered() : live;
  const booting = ctl?.isBooting?.() ?? false;
  const has = ctl?.driverCaps?.() ?? {};
  // An older store says nothing about capabilities; every key it has a
  // function for is offered, as before, and the new ones stay disabled.
  const can = {
    power: !!ctl?.setPower && (has.power ?? true),
    back: has.back ?? !ctl?.driverCaps,
    step: has.step ?? !ctl?.driverCaps,
    cycle: has.cycle ?? !ctl?.driverCaps,
    rate: has.rate ?? !ctl?.driverCaps,
    op: !!ctl?.stepOp && (has.op ?? false),
    seek: !!ctl?.seek && (has.seek ?? false),
    engine: !!ctl?.setEngine && (has.engine ?? false),
  };
  // The engine shown is the one stepping: the store's choice where the driver
  // honours the switch, else where the driver says it runs (the console and
  // the Lab run on the API whatever the store says).
  const eng = can.engine ? (ctl?.engine?.() ?? "local") : (has.runsOn ?? ctl?.engine?.() ?? "local");
  const latency = ctl?.engineLatency?.() ?? null;
  const engErr = ctl?.engineError?.() ?? null;
  const on = live && powered && !booting;

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

  if (!floor || failed) return null;
  if (gaveUp && !(ctl?.hasDriver() ?? false)) return null;
  const hc = ctl?.chipHalfCycle() ?? null;

  const clocks = ctl?.CLOCKS ?? [{ hz: 1, label: "1 Hz" }];
  const hz = ctl?.clockHz() ?? 1;
  const rateIndex = Math.max(0, clocks.findIndex((c) => c.hz === hz));
  const cyc = hc === null ? null : Math.floor(hc / 2);

  // The seek slider spans what the driver can reach: from the oldest
  // half-cycle it can rewind to, to the end of a recording or, on a live
  // machine, to where it is now (the slider's end moves as the chip runs).
  const earliest = can.seek ? (ctl?.chipEarliest?.() ?? hc ?? 0) : 0;
  const length = can.seek ? (ctl?.chipLength?.() ?? hc ?? 0) : 0;
  const seekMax = Math.max(earliest, length);

  const powerTitle = !ctl?.setPower || !live ? S.powerNone : booting ? S.booting : powered ? S.powerOn : S.powerOff;

  return (
    <div className="chip-transport" role="toolbar" aria-label="Chip transport" data-powered={on ? "1" : "0"}>
      <div className="ct-row">
        <button
          type="button"
          className={"tbtn pw" + (on ? " on" : "")}
          title={powerTitle}
          aria-label={powerTitle}
          aria-pressed={on}
          disabled={!live || !can.power || booting}
          onClick={() => {
            if (!ctl?.setPower) return;
            void ctl.setPower(!powered);
            if (powered) { try { sessionStorage.setItem(KEY, "0"); } catch { /* private mode */ } }
          }}
        >
          <Ic d={IC.power} /><span className="lb">{S.wPower}</span>
        </button>
        {/* The engine, beside power (one-engine.md rule 3): local wasm or
            halfwave over the API. A driver that runs in one place only (the
            console, the Lab, a recording) has no switch and says so. */}
        <div className="ct-engine" role="group" aria-label="Engine" title={can.engine ? (eng === "api" ? S.engApi : S.engLocal) : S.engNone}>
          <button type="button" className={"tbtn eng" + (eng === "local" ? " on" : "")} aria-pressed={eng === "local"} disabled={!live || !can.engine} title={S.engLocal} aria-label={S.engLocal} onClick={() => ctl?.setEngine?.("local")}>
            <Ic d={IC.local} /><span className="lb">{S.wLocal}</span>
          </button>
          <button type="button" className={"tbtn eng" + (eng === "api" ? " on" : "")} aria-pressed={eng === "api"} disabled={!live || !can.engine} title={S.engApi} aria-label={S.engApi} onClick={() => ctl?.setEngine?.("api")}>
            <Ic d={IC.api} /><span className="lb">{S.wApi}</span>
          </button>
        </div>
        <button type="button" className="tbtn" title={S.start} aria-label={S.start} disabled={!on} onClick={() => { ctl?.reset(); try { sessionStorage.setItem(KEY, "0"); } catch { /* private mode */ } }}>
          <Ic d={IC.start} /><span className="lb">{S.wStart}</span>
        </button>
        <button type="button" className="tbtn" title={S.back} aria-label={S.back} disabled={!on || !can.back} onClick={() => ctl?.stepBack()}>
          <Ic d={IC.prev} /><span className="lb">{S.wHalf}</span>
        </button>
        <button
          type="button"
          className={"tbtn play" + (running ? " on" : "")}
          title={running ? S.pause : S.play}
          aria-label={running ? S.pause : S.play}
          aria-pressed={running}
          disabled={!on}
          onClick={() => {
            if (!ctl) return;
            ctl.toggleRunning();
            try { sessionStorage.setItem(KEY, ctl.isRunning() ? "1" : "0"); } catch { /* private mode */ }
          }}
        >
          <Ic d={running ? IC.pause : IC.play} /><span className="lb">{running ? S.wPause : S.wPlay}</span>
        </button>
        <button type="button" className="tbtn" title={S.step} aria-label={S.step} disabled={!on || !can.step} onClick={() => ctl?.step()}>
          <Ic d={IC.next} /><span className="lb">{S.wHalf}</span>
        </button>
        <button type="button" className="tbtn" title={S.cycle} aria-label={S.cycle} disabled={!on || !can.cycle} onClick={() => { ctl?.step(); ctl?.step(); }}>
          <Ic d={IC.cycle} /><span className="lb">{S.wCyc}</span>
        </button>
        <button type="button" className="tbtn" title={can.op ? S.op : S.opNone} aria-label={can.op ? S.op : S.opNone} disabled={!on || !can.op} onClick={() => ctl?.stepOp?.()}>
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
          {/* Measured, not assumed: the API path shows its last round trip. */}
          {eng === "api" ? (
            <span className={"tlab ct-lat" + (engErr ? " err" : "")} title={engErr ? `${S.engErr}: ${engErr}` : S.engApi} data-latency={latency ?? ""}>
              {engErr ? "api ✕" : latency === null ? "api" : `api ${latency} ms`}
            </span>
          ) : null}
        </label>
        <input
          type="range"
          className="ct-seek"
          min={earliest}
          max={seekMax}
          step={1}
          value={Math.min(Math.max(hc ?? 0, earliest), seekMax)}
          disabled={!on || !can.seek}
          aria-label={can.seek ? S.seek : S.seekNone}
          title={can.seek ? S.seek : S.seekNone}
          onChange={(e) => { ctl?.seek?.(Number(e.target.value)); try { sessionStorage.setItem(KEY, "0"); } catch { /* private mode */ } }}
        />
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
