"use client";

import { useEffect } from "react";

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
 * What the console can honour: reset (its power/reset button) and the
 * half-cycle count (its own readout). It runs whole frames over a round trip
 * and has no half-step, no step back and no clock, so the page hands the
 * strip a capability map and those controls do not appear. The driver
 * carrying its own capabilities is part of the upstream proposal in
 * notes/upstream-transport.md; until then the page states them.
 */

interface Store {
  isRunning(): boolean;
  setRunning(on: boolean): void;
  registerDriver(d: unknown): void;
  subscribe(fn: () => void): () => void;
}

const $ = (id: string) => document.getElementById(id);

function readConsole() {
  const power = $("b-power") as HTMLButtonElement | null;
  const pause = $("b-pause") as HTMLButtonElement | null;
  if (!power || !pause) return null;
  const booting = power.disabled || /boot/i.test(power.textContent ?? "");
  const powered = !pause.disabled;
  const running = powered && /^pause$/i.test((pause.textContent ?? "").trim());
  return { power, pause, booting, powered, running };
}

export function ConsoleDriver() {
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    let observer: MutationObserver | null = null;
    (async () => {
      const res = await fetch("/6502/chip/asset-manifest.json", { cache: "no-cache" });
      if (!res.ok) return;
      const manifest = (await res.json()) as Record<string, string>;
      const hashed = manifest["chip-controls.js"];
      if (!hashed) return;
      const store = (await import(/* webpackIgnore: true */ `/6502/chip/${hashed}`)) as Store;
      if (cancelled) return;

      store.registerDriver({
        reset() {
          const c = readConsole();
          if (c && !c.booting) c.power.click();
        },
        halfCycle() {
          const n = Number(($("k-hc")?.textContent ?? "").replace(/[^\d]/g, ""));
          return Number.isFinite(n) ? n : null;
        },
      });

      // console -> store
      const tell = () => {
        const c = readConsole();
        if (!c || c.booting) return;
        if (c.running !== store.isRunning()) store.setRunning(c.running);
      };
      const power = $("b-power");
      const pause = $("b-pause");
      if (power && pause) {
        observer = new MutationObserver(tell);
        const opts = { attributes: true, attributeFilter: ["disabled"], childList: true, characterData: true, subtree: true };
        observer.observe(power, opts);
        observer.observe(pause, opts);
      }

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
      if (observer) observer.disconnect();
    };
  }, []);
  return null;
}
