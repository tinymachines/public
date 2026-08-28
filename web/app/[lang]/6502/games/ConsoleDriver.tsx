"use client";

import { useEffect } from "react";
import { readConsole, watchConsole } from "./consoleState";
import { inPage, runHere, runOverApi } from "./localEngine";

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
 * and the half-cycle count (its own readout). It runs whole frames and has
 * no half-step, no step back and no clock, and the driver says so in
 * `caps`, which is what the strip shows.
 *
 * ## The engine key
 *
 * The console honours it (`caps.engine`), which is the last piece of
 * notes/one-engine.md the console owed. The store holds the choice for the
 * whole floor and this driver follows it: `api` leaves every frame to
 * halfwave over HTTP, `local` puts the wasm chip of games/localEngine.ts
 * behind `console.js`'s own `post()`. Nothing reboots at the switch, because
 * the machine is a value the console is holding: the next frame simply
 * leaves for somewhere else.
 *
 * **The console's default is the API, and it says so in the store** when the
 * floor has no recorded choice. The store's own default is the chip in the
 * page, which is right for the explorer, where a press is a few half-cycles.
 * A frame of Die Runner is 8,704, and measured (notes/one-engine.md) that is
 * 0.36 s in this page against 0.30 s over the API on a desk, and 1.5 s in
 * the page under a fourfold CPU throttle, which is a phone. Defaulting a
 * console on a phone to two frames every three seconds would be a choice
 * nobody made, so it is made here, once, and the key overrules it.
 */

interface Store {
  isRunning(): boolean;
  setRunning(on: boolean): void;
  registerDriver(d: unknown): void;
  subscribe(fn: () => void): () => void;
  isPowered?(): boolean;
  isBooting?(): boolean;
  setPower?(on: boolean): Promise<void>;
  engine?(): "local" | "api";
  setEngine?(which: "local" | "api"): void;
}

/**
 * Where the store writes the floor's engine choice. Read here, and only to
 * tell a choice that was made from one that has never been made: the console
 * states its own default in that second case (the block comment above), and
 * a store that already has a choice is followed without argument.
 */
const ENGINE_KEY = "v6502.engine";

const $ = (id: string) => document.getElementById(id);

export function ConsoleDriver() {
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    let unwatch: (() => void) | null = null;
    let unfollow: (() => void) | null = null;
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
      // The console's default, stated once, before anything registers: a
      // floor that has never chosen an engine plays over the API.
      const chosen = (() => {
        try { return localStorage.getItem(ENGINE_KEY); } catch { return null; }
      })();
      if (chosen !== "local" && chosen !== "api") store.setEngine?.("api");

      store.registerDriver({
        // A function, so `runsOn` is where the frames are running now rather
        // than where they were when the console loaded.
        caps: () => ({
          power: true, back: false, step: false, cycle: false, op: false,
          rate: false, seek: false, engine: true, runsOn: inPage() ? "local" : "api",
        }),
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

      // The engine, followed off the store. The strip's key and the settings
      // page's row are two views of that one choice; neither decides
      // anything here, and this is the only place the transport is installed
      // or taken away.
      const follow = async () => {
        const want = store.engine?.() ?? "api";
        if (want === (inPage() ? "local" : "api")) return;
        if (want === "api") { runOverApi(); return; }
        try {
          await runHere();
          // A load takes a moment, and the key can be pressed twice inside
          // it. The choice that stands when it lands is the one that holds.
          if (store.engine?.() !== "local") runOverApi();
        } catch {
          // Why is on localEngine's refusal(), which the settings page
          // shows. Back to the engine that is answering.
          store.setEngine?.("api");
        }
      };
      void follow();
      unfollow = store.subscribe(() => { void follow(); });

      // console -> store. Running, and power: the console's own power button
      // (the shell's reset key) boots a machine, and the store must know it
      // is on before it will let it run.
      // On the EDGE, not the level: the store's off is a paused console
      // (game.js has no off), so a powered console with the store off is
      // the off state itself, not a boot to report.
      let wasPowered = readConsole()?.powered ?? false;
      const tell = async () => {
        const c = readConsole();
        if (!c || c.booting) return;
        // Power first, and awaited: the store refuses to run a chip it has
        // not seen powered, so running is told only once power has landed.
        if (c.powered && !wasPowered && store.isPowered && !store.isPowered()) {
          wasPowered = true;
          await store.setPower?.(true);
        }
        // And the other edge: the console dropping its own power, which is
        // a cartridge change, a game over, or the engine going quiet (pause
        // disabled, "power on" back on the button). The store's off is the
        // driver's power(false), a pause; this is not that, and a store
        // left saying "powered" over a console with no machine had the
        // strip's power key lit while the glass said "power on to play"
        // (measured 2026-08-28). Not while the store is booting: the boot
        // itself passes through unpowered on the way up.
        if (!c.powered && wasPowered && store.isPowered?.() && !store.isBooting?.()) {
          wasPowered = false;
          await store.setPower?.(false);
        }
        wasPowered = c.powered;
        const now = readConsole();
        if (!now || now.booting) return;
        if (now.running !== store.isRunning()) store.setRunning(now.running);
      };
      unwatch = watchConsole(tell);

      // store -> console, on the EDGE of the store's running state. Every
      // announce used to be compared against the console, and setPower's
      // own announce (the console had just booted itself, tell() had not
      // yet reported it running) read as "the store says stopped": one
      // pause click, and a rocker boot ended paused.
      let lastWant = store.isRunning();
      unsub = store.subscribe(() => {
        const want = store.isRunning();
        if (want === lastWant) return;
        lastWant = want;
        const c = readConsole();
        if (!c || c.booting) return;
        // Only a powered store drives the console: off is the driver's own
        // power(false), and a store still booting has nothing to say yet.
        if (store.isBooting?.() || (store.isPowered && !store.isPowered())) return;
        if (want === c.running) return;
        if (want && !c.powered) c.power.click();
        else c.pause.click();
      });
    })().catch(() => { /* no store on this origin: the strip withdraws on its own */ });
    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (unwatch) unwatch();
      if (unfollow) unfollow();
      // The transport is this page's; a page without the console must not
      // find one on the window.
      runOverApi();
    };
  }, []);
  return null;
}
