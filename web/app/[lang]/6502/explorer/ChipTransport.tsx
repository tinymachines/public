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
  en: { power: "Power cycle", back: "Back one half-cycle", play: "Run", pause: "Pause", step: "Forward one half-cycle", clock: "Clock", none: "no chip on this page", loading: "finding the chip" },
  ja: { power: "電源を入れ直す", back: "半サイクル戻る", play: "実行", pause: "一時停止", step: "半サイクル進む", clock: "クロック", none: "このページにチップは無い", loading: "チップを探している" },
} as const;

export function ChipTransport({ lang = "en" }: { lang?: Lang }) {
  const S = L[lang];
  const [ctl, setCtl] = useState<Controls | null>(null);
  const [failed, setFailed] = useState(false);
  // A tick so the view repaints when the store announces. The store's own
  // subscribe calls back immediately, which paints the first frame.
  const [, setTick] = useState(0);

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

  if (failed) return null;

  const live = ctl?.hasDriver() ?? false;
  const running = ctl?.isRunning() ?? false;
  const hc = ctl?.chipHalfCycle() ?? null;

  return (
    <div className="chip-transport" role="toolbar" aria-label="Chip transport">
      <button type="button" title={S.power} aria-label={S.power} disabled={!live} onClick={() => { ctl?.reset(); try { sessionStorage.setItem(KEY, "0"); } catch { /* private mode */ } }}>
        ⏻
      </button>
      <button type="button" title={S.back} aria-label={S.back} disabled={!live} onClick={() => ctl?.stepBack()}>
        ◀
      </button>
      <button
        type="button"
        className={running ? "on" : undefined}
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
        {running ? "❚❚" : "▶"}
      </button>
      <button type="button" title={S.step} aria-label={S.step} disabled={!live} onClick={() => ctl?.step()}>
        ▶❙
      </button>
      <label className="ct-clock">
        <span>{S.clock}</span>
        <select
          value={ctl?.clockHz() ?? 1}
          disabled={!ctl}
          onChange={(e) => ctl?.setClock(Number(e.target.value))}
          aria-label={S.clock}
        >
          {(ctl?.CLOCKS ?? [{ hz: 1, label: "1 Hz" }]).map((c) => (
            <option key={c.hz} value={c.hz}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <span className="ct-readout" aria-live="off">
        {!ctl ? S.loading : !live ? S.none : hc === null ? "" : `h ${hc}`}
      </span>
    </div>
  );
}
