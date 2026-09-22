"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";
import { localize } from "@/lib/lang";
import { fetchCart, listShelf, onChange, type Cart } from "@/lib/shelf";
import "./shelf-picker.css";

/**
 * Your own cartridges, as a menu, for any page that asks for a .nes file.
 *
 * Put it beside the page's own file input and give it the function that
 * input already calls:
 *
 *     <ShelfPicker lang={lang} onPick={load} />
 *
 * It hands `onPick` a File, the same thing the input does, so the page's
 * loading code is untouched. It renders NOTHING for a reader who is signed
 * out or whose account has no shelf, which is almost every reader: the menu
 * is for the person whose cartridges they are, and nobody else should see a
 * control that does nothing for them.
 *
 * It works as a menu, not as a field: choosing a cartridge loads it and the
 * control goes back to its label, because the page already says what is
 * loaded and a second place saying it would go stale the moment a file is
 * picked off the disk instead.
 */

const L = {
  en: {
    label: "Your cartridges",
    loading: (name: string) => `Fetching ${name}`,
    manage: "manage",
    empty: "Your shelf is empty: add your cartridges",
    board: (n: number) => `mapper ${n}`,
  },
  ja: {
    label: "あなたのカートリッジ",
    loading: (name: string) => `${name} を取得中`,
    manage: "管理",
    empty: "棚は空です: カートリッジを追加する",
    board: (n: number) => `マッパー ${n}`,
  },
} as const;

export const SHELF_PATH = "/nes/shelf";

export function ShelfPicker({
  lang,
  onPick,
  selectClass = "input",
  className = "shelf-picker",
}: {
  lang: Lang;
  onPick: (file: File) => void;
  selectClass?: string;
  className?: string;
}) {
  const S = L[lang];
  const [carts, setCarts] = useState<Cart[] | null>(null);
  const [room, setRoom] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      listShelf()
        .then((s) => {
          if (!live) return;
          setCarts(s.state === "open" ? s.carts : null);
          setRoom(s.state === "open" && s.limits.max > 0);
        })
        // A shelf that cannot be read is a menu that is not offered. The page
        // it sits on still takes a file from the disk.
        .catch(() => live && setCarts(null));
    void load();
    const off = onChange(load);
    return () => {
      live = false;
      off();
    };
  }, []);

  if (!carts?.length) {
    // Signed in, given a shelf, nothing on it yet: say where it is filled.
    return room ? (
      <a className={`${className} shelf-picker-empty`} href={localize(lang, SHELF_PATH)} data-shelf-picker="empty">
        {S.empty}
      </a>
    ) : null;
  }

  async function pick(id: string) {
    const cart = carts?.find((c) => c.id === id);
    if (!cart) return;
    setBusy(cart.name);
    setError(null);
    try {
      onPick(await fetchCart(cart));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className={className} data-shelf-picker="open">
      <select className={selectClass} aria-label={S.label} value="" disabled={busy !== null} onChange={(e) => void pick(e.target.value)}>
        <option value="" disabled>
          {busy ? S.loading(busy) : S.label}
        </option>
        {carts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({S.board(c.mapper)})
          </option>
        ))}
      </select>{" "}
      <a className="shelf-picker-manage" href={localize(lang, SHELF_PATH)}>
        {S.manage}
      </a>
      {error ? (
        <span className="shelf-picker-error" role="alert">
          {" "}
          {error}
        </span>
      ) : null}
    </span>
  );
}
