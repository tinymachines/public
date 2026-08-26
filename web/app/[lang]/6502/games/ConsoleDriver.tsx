"use client";

import { useEffect } from "react";
import { readConsole, watchConsole } from "./consoleState";

/**
 * The console, registered as a driver of the one chip store.
 *
 * game.js is upstream's byte for byte and exports nothing: it owns a
 * `state.running` of its own, a power button that boots and a pause button
 * that toggles. The floor transport drives the explorer's `chip-controls.js`
 * store, and "a pause in one is a pause in all" needs the console on that
 * store too. This is the bridge, and it goes through the DOM contract game.js
 * was written against (the sixteen ids the page already promises it) rather
 * than through a fork of the module.
 *
 * Two directions, one rule each:
 *
 *   store -> console   when the store's running state differs from the
 *                      console's, press the console's own button. Power if
 *                      it has not booted, pause otherwise. The click is the
 *                      same click a finger makes, so game.js stays the only
 *                      thing that changes its own state.
 *   console -> store   a MutationObserver on the two buttons reads the
 *                      console's state off what game.js paints into them
 *                      (pause enabled and reading "pause" means running) and
 *                      tells the store. Game over, a boot failure and the
 *                      engine going quiet all pass through the same reading.
 *
 * While the console is booting ("booting..." on the power button) neither
 * direction acts: a boot is neither running nor stopped, and syncing against
 * it made the strip flicker to pause and back.
 *
 * What the console can honour: power (boot; off is a pause, since game.js
 * has no off and holds the frame it was on), reset (its power/reset button)
 * and the half-cycle count (its own readout). It runs whole frames over a
 * round trip and has no half-step, no step back and no clock, and the
 * driver says so in `caps`, which is what the strip shows.
 */

interface Store {
  isRunning(): boolean;
  setRunning(on: boolean): void;
  registerDriver(d: unknown): void;
  subscribe(fn: () => void): () => void;
  isPowered?(): boolean;
  setPower?(on: boolean): Promise<void>;
}

const $ = (id: string) => document.getElementById(id);

export function ConsoleDriver() {
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    let unwatch: (() => void) | null = null;
    (async () => {
      const res = await fetch("/6502/chip/asset-manifest.json", { cache: "no-cache" });
      if (!res.ok) return;
      const manifest = (await res.json()) as Record<string, string>;
      const hashed = manifest["chip-controls.js"];
      if (!hashed) return;
      const store = (await import(/* webpackIgnore: true */ `/6502/chip/${hashed}`)) as Store;
      if (cancelled) return;

      const settled = () =>
        new Promise<void>((done) => {
          const t0 = Date.now();
          const poll = () => {
            const c = readConsole();
            if (!c || !c.booting || Date.now() - t0 > 30000) done();
            else setTimeout(poll, 100);
          };
          poll();
        });
      store.registerDriver({
        caps: { power: true, back: false, step: false, cycle: false, op: false, rate: false, seek: false },
        powered() {
          return readConsole()?.powered ?? false;
        },
        async power(on: boolean) {
          const c = readConsole();
          if (!c || c.booting) return;
          if (on) {
            if (!c.powered) c.power.click();
            await settled();
          } else if (c.running) {
            c.pause.click();
          }
        },
        reset() {
          const c = readConsole();
          if (c && !c.booting) c.power.click();
        },
        halfCycle() {
          const n = Number(($("k-hc")?.textContent ?? "").replace(/[^\d]/g, ""));
          return Number.isFinite(n) ? n : null;
        },
      });

      // console -> store. Running, and power: the console's own power button
      // (the shell's reset key) boots a machine, and the store must know it
      // is on before it will let it run.
      // On the EDGE, not the level: the store's off is a paused console
      // (game.js has no off), so a powered console with the store off is
      // the off state itself, not a boot to report.
      let wasPowered = readConsole()?.powered ?? false;
      const tell = () => {
        const c = readConsole();
        if (!c || c.booting) return;
        if (c.powered && !wasPowered && store.isPowered && !store.isPowered()) void store.setPower?.(true);
        wasPowered = c.powered;
        if (c.running !== store.isRunning()) store.setRunning(c.running);
      };
      unwatch = watchConsole(tell);

      // store -> console
      unsub = store.subscribe(() => {
        const c = readConsole();
        if (!c || c.booting) return;
        const want = store.isRunning();
        if (want === c.running) return;
        if (want && !c.powered) c.power.click();
        else c.pause.click();
      });
    })().catch(() => { /* no store on this origin: the strip withdraws on its own */ });
    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (unwatch) unwatch();
    };
  }, []);
  return null;
}
