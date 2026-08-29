"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";
import type { Builder, Index, Rom } from "@/lib/registry";
import { inPage, refusal, runHere, runOverApi, watchEngine } from "../games/localEngine";

/**
 * The three screens of console v2: play, cartridges, settings.
 *
 * `children` is the server markup game.js binds to. It is rendered ONCE and
 * never conditionally: the screens are shown and hidden with a `data-screen`
 * attribute the stylesheet reads, so the canvas, the keys, the buttons and
 * the two inputs keep the handlers game.js gave them at load.
 *
 * Choosing a cartridge goes through game.js's own two inputs. A built-in is
 * the hidden `#cart` select, set and told it changed. A registry cartridge
 * is fetched here and dropped into `#cart-file` as a File, which is the same
 * path a cartridge chosen from disk takes; game.js decodes it, appends it to
 * its own table and boots it on the next power press. Nothing in the module
 * had to learn a new entry point.
 */

export interface CartOption { value: string; name: string; }

type Screen = "play" | "carts" | "settings";
const SLOW_MS = 250;

const S = {
  en: {
    play: "play", carts: "cartridges", settings: "settings",
    builtIn: "built in", loading: "loading", failed: "could not load",
    registry: "published", fetching: "reading the registry", none: "the registry answered with nothing playable",
    engine: "engine", local: "the chip in this page", api: "halfwave over the API",
    speed: "speed", fast: "fast: as quick as the frame returns", slow: `slow: one frame every ${SLOW_MS} ms`,
    readout: "readout", by: "by",
  },
  ja: {
    play: "プレイ", carts: "カートリッジ", settings: "設定",
    builtIn: "内蔵", loading: "読み込み中", failed: "読み込めなかった",
    registry: "公開済み", fetching: "レジストリを読んでいる", none: "レジストリに遊べるものがなかった",
    engine: "エンジン", local: "このページ内のチップ", api: "API 経由の halfwave",
    speed: "速度", fast: "fast: フレームが戻り次第", slow: `slow: ${SLOW_MS} ms に 1 フレーム`,
    readout: "読み出し", by: "作",
  },
} as const;

const $ = (id: string) => document.getElementById(id);

/** A published cartridge this console can play: it draws a screen. */
function playable(r: Rom): boolean {
  const kind = r.kind ?? r.measured?.kind ?? "console";
  return kind !== "headless" && !!r.measured?.booted && !!r.measured?.screen_changed;
}

export function ConsoleV2({ lang, carts, chipApi, children }: { lang: Lang; carts: CartOption[]; chipApi: string; children: React.ReactNode }) {
  const T = S[lang] ?? S.en;
  const [screen, setScreen] = useState<Screen>("play");
  const [picked, setPicked] = useState<string>(`b:${carts[0]?.value ?? "0"}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [roms, setRoms] = useState<Rom[] | null>(null);
  const [romsErr, setRomsErr] = useState<string | null>(null);
  const [engine, setEngine] = useState<"local" | "api">("api");
  const [why, setWhy] = useState<string | null>(null);
  const [pace, setPace] = useState<"fast" | "slow">("fast");

  // The engine: the site's default is the chip in the page, and this
  // console starts there too. A browser that cannot run it says why on the
  // settings screen and the frames go over the API instead.
  useEffect(() => {
    const paint = () => { setEngine(inPage() ? "local" : "api"); setWhy(refusal()); };
    const off = watchEngine(paint);
    runHere().catch(() => {}).finally(paint);
    return off;
  }, []);

  // The shelf: every builder's cartridges, kept if the chip saw them draw.
  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const ix = (await (await fetch(`${chipApi}/v1/registry`, { cache: "no-cache" })).json()) as Index;
        const all: Rom[] = [];
        for (const b of ix.builders) {
          if (!b.roms) continue;
          const r = await fetch(`${chipApi}/v1/registry/b/${encodeURIComponent(b.handle)}?art=none`, { cache: "no-cache" });
          if (!r.ok) continue;
          all.push(...((await r.json()) as Builder).roms);
        }
        const names = new Set(carts.map((c) => c.name.toLowerCase()));
        if (!gone) setRoms(all.filter(playable).filter((r) => !names.has(r.title.toLowerCase())));
      } catch (e) {
        if (!gone) setRomsErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { gone = true; };
  }, [chipApi, carts]);

  const pickBuiltIn = useCallback((value: string) => {
    const sel = $("cart") as HTMLSelectElement | null;
    if (!sel) return;
    sel.value = value;
    sel.dispatchEvent(new Event("change"));
    setPicked(`b:${value}`);
    setScreen("play");
  }, []);

  const pickRom = useCallback(async (r: Rom) => {
    const key = `${r.handle}/${r.slug}`;
    const input = $("cart-file") as HTMLInputElement | null;
    if (!input || busy) return;
    setBusy(key);
    setFailed((f) => { const rest = { ...f }; delete rest[key]; return rest; });
    try {
      const res = await fetch(`${chipApi}${r.cart_url}`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const file = new File([await res.arrayBuffer()], `${r.slug}.cart.gz`, { type: "application/gzip" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change"));
      setPicked(key);
      setScreen("play");
    } catch (e) {
      setFailed((f) => ({ ...f, [key]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  }, [chipApi, busy]);

  const chooseEngine = useCallback(async (which: "local" | "api") => {
    if (which === "api") { runOverApi(); return; }
    try { await runHere(); } catch { /* refusal() has the reason; the watcher paints it */ }
  }, []);

  return (
    <div className="cv2-body" data-screen={screen}>
      <nav className="cv2-tabs" aria-label="screens">
        {(["play", "carts", "settings"] as Screen[]).map((s) => (
          <button key={s} type="button" className="cv2-tab" aria-pressed={screen === s} onClick={() => setScreen(s)}>{T[s]}</button>
        ))}
      </nav>

      {/* game.js reads the first [data-frame-ms] on the page. 0 is as fast as the round trip. */}
      <span data-frame-ms={pace === "slow" ? SLOW_MS : 0} hidden />

      {children}

      <section className="cv2-carts" aria-label={T.carts}>
        {/* game.js's #note: the running cartridge's blurb. It lives on the
            shelf rather than under the keys so the play screen is the screen
            and the controls, nothing else (owner, 2026-08-28). */}
        <p className="cv2-blurb" id="note" />
        <h2 className="cv2-h">{T.builtIn}</h2>
        <div className="cv2-grid">
          {carts.map((c) => (
            <button key={c.value} type="button" className="cv2-card" aria-pressed={picked === `b:${c.value}`} onClick={() => pickBuiltIn(c.value)}>
              <b>{c.name}</b>
              <span>{T.builtIn}</span>
            </button>
          ))}
        </div>
        <h2 className="cv2-h">{T.registry}</h2>
        {roms === null && !romsErr && <p className="cv2-note">{T.fetching}</p>}
        {romsErr && <p className="cv2-err">{romsErr}</p>}
        {roms !== null && roms.length === 0 && <p className="cv2-note">{T.none}</p>}
        <div className="cv2-grid">
          {(roms ?? []).map((r) => {
            const key = `${r.handle}/${r.slug}`;
            return (
              <button key={key} type="button" className="cv2-card" aria-pressed={picked === key} aria-busy={busy === key} disabled={!!busy} onClick={() => pickRom(r)}>
                <b>{r.title}</b>
                <span>{T.by} {r.handle} · {r.bytes} B</span>
                {busy === key && <i>{T.loading}</i>}
                {failed[key] && <i className="cv2-bad">{T.failed}: {failed[key]}</i>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="cv2-settings" aria-label={T.settings}>
        <h2 className="cv2-h">{T.engine}</h2>
        <div className="cv2-opts">
          <button type="button" className="cv2-opt" aria-pressed={engine === "local"} onClick={() => chooseEngine("local")}>{T.local}</button>
          <button type="button" className="cv2-opt" aria-pressed={engine === "api"} onClick={() => chooseEngine("api")}>{T.api}</button>
        </div>
        {why && <p className="cv2-err">{why}</p>}
        <h2 className="cv2-h">{T.speed}</h2>
        <div className="cv2-opts">
          <button type="button" className="cv2-opt" aria-pressed={pace === "fast"} onClick={() => setPace("fast")}>{T.fast}</button>
          <button type="button" className="cv2-opt" aria-pressed={pace === "slow"} onClick={() => setPace("slow")}>{T.slow}</button>
        </div>
        <h2 className="cv2-h">{T.readout}</h2>
        {/* the readouts and gates are in `children` (.cv2-status), shown on this screen by the stylesheet */}
      </section>
    </div>
  );
}
