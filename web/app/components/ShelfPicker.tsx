"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";
import { localize } from "@/lib/lang";
import { fetchCart, fileNameOf, listShelf, onChange, type Cart } from "@/lib/shelf";
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
 * It shows the cartridge the page has loaded, and it learns that from the
 * page (`loaded`, the file name the page is running) rather than from its
 * own last click, so a file picked off the disk instead clears it and the
 * menu never claims a cartridge the console is not running.
 */

const L = {
  en: {
    label: "Your cartridges",
    loading: (name: string) => `Fetching ${name}`,
    manage: "manage",
    empty: "Your shelf is empty: add your cartridges",
  },
  ja: {
    label: "あなたのカートリッジ",
    loading: (name: string) => `${name} を取得中`,
    manage: "管理",
    empty: "棚は空です: カートリッジを追加する",
  },
} as const;

export const SHELF_PATH = "/nes/shelf";

export function ShelfPicker({
  lang,
  onPick,
  loaded = null,
  selectClass = "input",
  className = "shelf-picker",
}: {
  lang: Lang;
  onPick: (file: File) => void;
  /** The file name the page is running, if any: the menu shows it when it is one of the shelf's. */
  loaded?: string | null;
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

  const current = busy ? "" : (carts.find((c) => fileNameOf(c) === loaded)?.id ?? "");
  return (
    <span className={className} data-shelf-picker="open">
      <select className={selectClass} aria-label={S.label} value={current} disabled={busy !== null} onChange={(e) => void pick(e.target.value)} data-shelf-select>
        <option value="" disabled>
          {busy ? S.loading(busy) : S.label}
        </option>
        {carts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
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
