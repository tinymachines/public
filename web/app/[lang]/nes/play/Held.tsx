"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { heldFor, onStoreChange } from "@/lib/flowStore";
import { listBlocks as shelfBlocks, onChange as onShelfChange } from "@/lib/shelf";
import { useDigest } from "./digest";
import { serverSnapshot, snapshot, subscribe } from "./playEngine";

/**
 * What is already kept for the game that just loaded, on the cartridge
 * line of both pages: the moments and recordings this browser holds under
 * its digest, and its code blocks, which are the shelf's for a cartridge
 * from there and the browser's for one from the disk. Everything counted
 * here is keyed by the digest already (docs/nes/workbench.md, "keyed by
 * the game's digest"), so the line costs nothing new to keep: it is read
 * again whenever the store or the shelf says it changed. It says nothing
 * while the counts are not known, never three zeroes as a guess.
 */

const S = {
  en: {
    none: "nothing kept for this game yet",
    kept: (m: number, r: number, b: number, shelf: boolean) => {
      const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
      return `kept for this game: ${n(m, "moment", "moments")}, ${n(r, "recording", "recordings")}, ${n(b, "block", "blocks")}${shelf ? " on your shelf" : ""}`;
    },
  },
  ja: {
    none: "このゲームについて残っているものはまだ無い",
    kept: (m: number, r: number, b: number, shelf: boolean) => `このゲームについて残っているもの: モーメント ${m}、記録 ${r}、ブロック ${b}${shelf ? "（棚に）" : ""}`,
  },
} as const;

export function Held({ lang }: { lang: Lang }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const digest = useDigest(s.rom);
  const shelfId = s.cart?.id ?? null;
  // Each answer names what it counted for, so a count for the last game
  // never stands under the next one.
  const [held, setHeld] = useState<{ key: string; moments: number; recordings: number; blocks: number } | null>(null);
  const key = digest ? `${digest}:${shelfId ?? ""}` : null;
  useEffect(() => {
    if (!digest || !key) return;
    let live = true;
    const count = async () => {
      const store = await heldFor(digest);
      if (!store) return;
      let blocks = store.blocks;
      if (shelfId) {
        try {
          blocks = (await shelfBlocks(shelfId)).blocks.length;
        } catch {
          return;
        }
      }
      if (live) setHeld({ key, moments: store.moments, recordings: store.recordings, blocks });
    };
    void count();
    const offStore = onStoreChange(() => void count());
    const offShelf = onShelfChange(() => void count());
    return () => {
      live = false;
      offStore();
      offShelf();
    };
  }, [digest, shelfId, key]);
  if (!s.loaded || !held || held.key !== key) return null;
  const shelf = !!shelfId;
  const empty = held.moments + held.recordings + held.blocks === 0;
  return (
    <span className="measured" data-play-held={`${held.moments}/${held.recordings}/${held.blocks}`} data-play-held-blocks={shelf ? "shelf" : "browser"}>
      {empty ? T.none : T.kept(held.moments, held.recordings, held.blocks, shelf)}
    </span>
  );
}
