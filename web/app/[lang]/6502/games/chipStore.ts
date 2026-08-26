"use client";

import { useEffect, useState } from "react";

/**
 * The site's chip store, as the strip hands it over.
 *
 * ChipTransport.tsx sets `window.tmChipStore` once it has imported
 * `chip-controls.js` from the 6502 release, and announces it with a
 * `tm:chip-store` event for anything that was listening before. The Lab's
 * script takes it that way; so does the console's shell, so that every key
 * on the console is a view of the one store rather than a click on a
 * button game.js owns. One source, whichever arrived first.
 */

export interface ChipStore {
  hasDriver(): boolean;
  isRunning(): boolean;
  isPowered(): boolean;
  isBooting(): boolean;
  setRunning(on: boolean): void;
  toggleRunning(): void;
  setPower(on: boolean): Promise<void>;
  reset(): void;
  subscribe(fn: () => void): () => void;
}

type Host = Window & { tmChipStore?: ChipStore };

/** The store, now or when it arrives. Null until then. */
export function useChipStore(): ChipStore | null {
  const [store, setStore] = useState<ChipStore | null>(null);
  useEffect(() => {
    // The already-present case after a frame rather than inside the effect
    // body: a synchronous setState here renders twice (SectionStrip.tsx).
    const frame = requestAnimationFrame(() => {
      const have = (window as Host).tmChipStore;
      if (have && typeof have.setPower === "function") setStore(have);
    });
    const onStore = (e: Event) => {
      const s = (e as CustomEvent<ChipStore>).detail;
      if (s && typeof s.setPower === "function") setStore(s);
    };
    window.addEventListener("tm:chip-store", onStore);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("tm:chip-store", onStore); };
  }, []);
  return store;
}

/** A view of the store's three facts, repainted on every announce. */
export function useChipState(store: ChipStore | null): { powered: boolean; running: boolean; booting: boolean; live: boolean } {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!store) return;
    return store.subscribe(() => tick((n) => n + 1));
  }, [store]);
  if (!store) return { powered: false, running: false, booting: false, live: false };
  return { powered: store.isPowered(), running: store.isRunning(), booting: store.isBooting(), live: store.hasDriver() };
}
