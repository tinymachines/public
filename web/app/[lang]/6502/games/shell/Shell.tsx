"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { localize, type Lang } from "@/lib/lang";
import { LangSwitch } from "@/app/components/LangSwitch";
import { clipPolygon, points } from "@/lib/shell/geom";
import { solve, type Dock, type Solved } from "@/lib/shell/solve";
import { readConsole, watchConsole, type Phase } from "../consoleState";
import { useChipStore, useChipState } from "../chipStore";
import { AB, Cart, Coin, Counter, Dpad, Pills, Power, Quick, Rail, Speaker } from "./Kit";

/**
 * The console: one shell, every ratio, solved from the viewport and drawn
 * from the kit. The pack (notes/console-shell/) calls this M3 and M4, the
 * assembly and the interaction prototype, and it is both at once because the
 * assembly is the page.
 *
 * What is real here and what is drawn:
 *
 *   the glass       game.js's `.screen` box and `#screen` canvas, exactly as
 *                   its DOM contract has them; the solver picks the box's
 *                   width so game.js's own fit() chooses the same integer k
 *   the d-pad       four `[data-dir]` buttons game.js already listens to
 *   power / reset   the site's chip store (chipStore.ts): power boots or
 *                   pauses through `setPower`/`toggleRunning`, reset is the
 *                   store's `reset`, and the console's driver (ConsoleDriver)
 *                   turns those into game.js's own clicks. Until the store
 *                   arrives the keys press `#b-power`/`#b-pause` directly
 *   select / start  select cycles `#cart`; start spends a credit to continue
 *                   after game over, and pauses while live
 *   the coin        given, never sold (NOTICE.md): a tap drops one in
 *   the LED         off, boot (ATTENTION amber), live (ACTIVE blue). Not red.
 *   A and B         drawn and disabled: the controller byte has no A or B
 *                   (ISSUES #2)
 *   the pages       gameplay, shelf, status, settings, swiped on the glass
 *                   or picked on the rail (swipe decision: ISSUES #6)
 *
 * The readouts, gates and legend the old side rail held are on the status
 * page, still under the ids game.js writes into. Nothing about the module
 * changed; this is the third page written against its contract.
 */

const PAGES = ["play", "shelf", "status", "settings"] as const;

const W = {
  en: {
    pages: { play: "play", shelf: "shelf", status: "status", settings: "settings" },
    select: "select", start: "start", power: "power", reset: "reset",
    up: "Up", down: "Down", left: "Left", right: "Right",
    a: "A: this cartridge reads four directions and no buttons", b: "B: this cartridge reads four directions and no buttons",
    coin: "Insert a coin. They are given, never sold.",
    credits: "credits",
    selectT: "Next cartridge", startT: "Start: continue with a credit, pause while playing",
    powerT: "Power: pause and resume; hold to switch off", resetT: "Reset: boot the cartridge again",
    quick: ["menu", "pause", "sound", "snap"] as string[],
    quickT: ["Settings", "Pause or resume", "No sound: this console has no audio out", "Save the screen as a picture"],
    page: (p: string) => `Go to ${p}`,
    hud: { off: "power on to play", boot: "booting", paused: "PAUSE", over: "GAME OVER", insert: "INSERT COIN", cont: "CONTINUE? press start", stopped: "the engine stopped answering", live: "" },
    load: "load a .cart.gz",
    loaded: "loaded",
    theChip: "the chip", measured: "measured",
    gatesReal: "the gates are real", sampled: "sampled",
    crt: "CRT", scan: "scanlines", tv: "picture", rewind: "rewind", ach: "achievements", pal: "palette",
    tvs: ["NTSC", "PAL"],
    rewindWhy: "Not here: the engine keeps no snapshots, every frame travels whole.",
    achWhy: "None minted. What this console counts is on the status page: frames, half-cycles, requests.",
    palWhy: "A cartridge carries tiles, not a palette. The four colours are the die's own layers.",
    off: "off",
    wear: "wear",
    site: "the site",
    siteWhy: "The console has no bar: this is the way out, and the other language.",
    home: "6502", builders: "builders", editor: "editor",
  },
  ja: {
    pages: { play: "プレイ", shelf: "棚", status: "状態", settings: "設定" },
    select: "select", start: "start", power: "power", reset: "reset",
    up: "上", down: "下", left: "左", right: "右",
    a: "A: このカートリッジは方向 4 つだけを読む", b: "B: このカートリッジは方向 4 つだけを読む",
    coin: "コインを入れる。コインは配られるもので、売られない。",
    credits: "クレジット",
    selectT: "次のカートリッジ", startT: "start: クレジットで続行、プレイ中は一時停止",
    powerT: "電源: 一時停止と再開。長押しで切る", resetT: "リセット: カートリッジを起動し直す",
    quick: ["menu", "pause", "sound", "snap"] as string[],
    quickT: ["設定", "一時停止 / 再開", "音は出ない: このコンソールに音声出力はない", "画面を画像として保存"],
    page: (p: string) => `${p}へ`,
    hud: { off: "電源を入れて遊ぶ", boot: "起動中", paused: "PAUSE", over: "GAME OVER", insert: "INSERT COIN", cont: "CONTINUE? start を押す", stopped: "エンジンが応答しなくなった", live: "" },
    load: ".cart.gz を読み込む",
    loaded: "装着中",
    theChip: "チップ", measured: "実測",
    gatesReal: "ゲートは実物", sampled: "サンプル済み",
    crt: "CRT", scan: "走査線", tv: "映像", rewind: "巻き戻し", ach: "実績", pal: "パレット",
    tvs: ["NTSC", "PAL"],
    rewindWhy: "ここにはない: エンジンはスナップショットを持たず、毎フレームが丸ごと往復する。",
    achWhy: "まだ鋳造されていない。このコンソールが数えるものは状態ページにある: フレーム、半サイクル、リクエスト。",
    palWhy: "カートリッジが運ぶのはタイルで、パレットではない。四色はダイ自身の層だ。",
    off: "オフ",
    wear: "使用感",
    site: "サイト",
    siteWhy: "コンソールにバーはない。ここが出口で、もう一つの言語への道。",
    home: "6502", builders: "ビルダー", editor: "エディタ",
  },
} as const;

const HUES = ["--color-accent", "--color-ocean", "--color-forest", "--color-mustard"];

interface Fx { crt: boolean; scan: number; tv: 0 | 1; wear: boolean }
const FX0: Fx = { crt: false, scan: 1, tv: 0, wear: false };

/**
 * A session fact (credits, the toy drawer) as an external store: the server
 * snapshot is the fallback, the client's is what sessionStorage holds, and
 * React reconciles the two after hydration rather than the page setting
 * state inside an effect. A private window that refuses storage keeps the
 * value for the page's life and forgets it after, which is the right amount.
 */
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();
function readStored<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let v: T = fallback;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw !== null) v = JSON.parse(raw) as T;
  } catch { /* no storage: the fallback */ }
  cache.set(key, v);
  return v;
}
function writeStored<T>(key: string, v: T) {
  cache.set(key, v);
  try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: the session forgets */ }
  listeners.get(key)?.forEach((fn) => fn());
}
function useSession<T>(key: string, fallback: T): [T, (v: T | ((was: T) => T)) => void] {
  const subscribe = useCallback((fn: () => void) => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(fn);
    return () => { listeners.get(key)!.delete(fn); };
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => readStored(key, fallback), () => fallback);
  const set = useCallback((v: T | ((was: T) => T)) => {
    writeStored(key, typeof v === "function" ? (v as (was: T) => T)(readStored(key, fallback)) : v);
  }, [key, fallback]);
  return [value, set];
}

export interface CartOption { value: string; name: string }

export function Shell({ lang = "en", carts, children }: { lang?: Lang; carts: CartOption[]; children: React.ReactNode }) {
  const S = W[lang];
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [page, setPage] = useState(0);
  const [phase, setPhase] = useState<Phase>("off");
  const [cartIx, setCartIx] = useState(0);
  const [cartName, setCartName] = useState(carts[0]?.name ?? "");
  const [credits, setCredits] = useSession("tm6502.credits", 0);
  const [drop, setDrop] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [fx, setFx] = useSession<Fx>("tm6502.fx", FX0);
  // Off is the store's fact (owner's call, 2026-08-26: all control through
  // the strip). Before the store arrives the shell keeps its own flag, and
  // hands it over the moment it does.
  const store = useChipStore();
  const chip = useChipState(store);
  const [localOff, setLocalOff] = useState(false);
  // Off, as distinct from never booted: the store is off while the console
  // holds a paused machine. A console that has not booted is "off" in the
  // HUD's words already, and start spends a credit to boot it.
  const off = store
    ? chip.live && !chip.powered && !chip.booting && (phase === "live" || phase === "paused")
    : localOff;

  // The frame: whatever the stage is, measured, and the strip's height
  // published so the stage can stop above it.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // The strip is mounted by the 6502 layout and appears once the store has
    // loaded, which is after this runs: it has to be found when it arrives,
    // not assumed to be here. Measured once at mount, the fallback height
    // stood and left a 15px gap between the stage and the strip.
    let strip: HTMLElement | null = null;
    const ro = new ResizeObserver(() => measure());
    const measure = () => {
      const found = document.querySelector<HTMLElement>(".chip-transport");
      if (found && found !== strip) { strip = found; ro.observe(strip); }
      // A strip that is on the page but has no height yet (its store is
      // still loading, or never loads) is not a measurement: the fallback
      // stands until it has one, else the stage learns 0px and keeps it.
      const h = strip ? strip.offsetHeight : 0;
      if (h > 0) document.documentElement.style.setProperty("--strip-h", `${Math.ceil(h)}px`);
      else document.documentElement.style.removeProperty("--strip-h");
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((s) => (s && s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure(); // before the first paint; the observers keep it true after
    ro.observe(el);
    const mo = new MutationObserver(() => { if (!strip && document.querySelector(".chip-transport")) measure(); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); document.documentElement.style.removeProperty("--strip-h"); };
  }, []);

  // The machine, read off game.js.
  useEffect(() => {
    const tell = () => {
      const c = readConsole();
      if (!c) return;
      setPhase((was) => {
        if (was !== "boot" && c.phase === "boot") { setWipe(true); setTimeout(() => setWipe(false), 420); }
        return c.phase;
      });
      const sel = document.getElementById("cart") as HTMLSelectElement | null;
      if (sel) { setCartIx(sel.selectedIndex); setCartName(sel.selectedOptions[0]?.textContent ?? ""); }
    };
    tell();
    const un = watchConsole(tell);
    const sel = document.getElementById("cart");
    sel?.addEventListener("change", tell);
    return () => { un(); sel?.removeEventListener("change", tell); };
  }, []);

  // Before the frame is measured (the server, and the first client render)
  // the shell is solved for a stand-in phone and hidden. So the docks exist
  // from the first byte: game.js binds `[data-dir]` at load and the build
  // check looks for it, and React keeps the nodes across the real solve
  // because the docks are keyed by part.
  const measured = size !== null;
  const solved: Solved = useMemo(() => (size ? solve(size.w, size.h, cartIx) : solve(390, 700, cartIx)), [size, cartIx]);

  // game.js sizes its canvas on window resize only; a re-solve is one too.
  useEffect(() => { if (measured) window.dispatchEvent(new Event("resize")); }, [measured, solved.boxPx]);

  // Actions, every one on the store where it has arrived: power on boots (the
  // driver's power), reset reboots (the driver's reset), pause and resume are
  // the store's running. The clicks are the fallback for a page whose strip
  // never loaded a store, and are what the driver makes of the store anyway.
  const boot = useCallback(() => {
    if (store?.hasDriver()) {
      if (!store.isPowered()) void store.setPower(true);
      else store.reset();
      return;
    }
    const c = readConsole(); if (c && !c.booting) c.power.click();
  }, [store]);
  const togglePause = useCallback(() => {
    if (store?.hasDriver()) { if (store.isPowered()) store.toggleRunning(); return; }
    const c = readConsole(); if (c && c.powered) c.pause.click();
  }, [store]);
  const switchOff = useCallback(() => {
    if (store?.hasDriver()) { void store.setPower(false); return; }
    if (phase === "live") togglePause();
    setLocalOff(true);
  }, [store, phase, togglePause]);
  const switchOn = useCallback(async () => {
    if (store?.hasDriver()) {
      await store.setPower(true);
      // Off held a paused machine; on is it running again.
      if (store.isPowered() && !store.isRunning()) store.setRunning(true);
      return;
    }
    setLocalOff(false);
    if (phase === "paused") togglePause();
  }, [store, phase, togglePause]);
  const insertCoin = () => {
    if (drop) return;
    setDrop(true);
    setTimeout(() => { setDrop(false); setCredits((n) => Math.min(99, n + 1)); }, 300);
  };
  const start = () => {
    if (off) { void switchOn(); return; }
    if (phase === "live" || phase === "paused") { togglePause(); return; }
    if (phase === "boot") return;
    if (credits > 0) { setCredits((n) => n - 1); boot(); }
    else { setNudge(true); setTimeout(() => setNudge(false), 700); }
  };
  const holdT = useRef<number | null>(null);
  const powerDown = () => {
    holdT.current = window.setTimeout(() => {
      holdT.current = null;
      if (phase === "live" || phase === "paused") switchOff();
    }, 600);
  };
  const powerUp = () => {
    if (holdT.current === null) return; // the hold fired: that was the action
    clearTimeout(holdT.current); holdT.current = null;
    if (off) { void switchOn(); return; }
    if (phase === "live" || phase === "paused") togglePause();
    else if (phase !== "boot") boot();
  };
  const nextCart = () => {
    const sel = document.getElementById("cart") as HTMLSelectElement | null;
    if (!sel || sel.options.length < 2) return;
    sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
    sel.dispatchEvent(new Event("change"));
  };
  const pickCart = (i: number) => {
    const sel = document.getElementById("cart") as HTMLSelectElement | null;
    if (!sel || sel.selectedIndex === i) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event("change"));
  };
  const snapshot = () => {
    const cv = document.getElementById("screen") as HTMLCanvasElement | null;
    if (!cv) return;
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = `${cartName || "screen"}.png`;
    a.click();
  };

  // Swipe on the glass. Plain one-finger horizontal travel of 48px or more:
  // the glass takes no gameplay gesture (the d-pad and the keys do), so
  // there is nothing to conflict with (ISSUES #6).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const s = swipe.current; swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy)) setPage((p) => Math.max(0, Math.min(PAGES.length - 1, p - Math.sign(dx))));
  };

  const led = phase === "boot" ? "boot" : off ? "off" : phase === "live" || phase === "paused" ? "live" : "off";
  const hud = off ? S.off : phase === "over" ? (credits > 0 ? S.hud.cont : S.hud.insert) : S.hud[phase];
  const accent = `var(${HUES[cartIx % HUES.length]})`;

  const ppu = solved.ppu;
  const px = (u: number) => `${+(u * ppu).toFixed(2)}px`;
  const at = (b: Dock["box"]) => ({ left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h) });

  // A d-pad press is the arrow key game.js listens for. game.js also binds
  // `[data-dir]` buttons it finds at load, but a dock that arrives after the
  // first solve is not there yet at load, and a press must not depend on
  // which came first. The same value set twice is one input.
  const KEY = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } as const;
  const press = (dir: keyof typeof KEY) => () => window.dispatchEvent(new KeyboardEvent("keydown", { key: KEY[dir], bubbles: true, cancelable: true }));

  const part = (d: Dock) => {
    const { w, h } = d.box;
    const stack = d.variant === "stack";
    switch (d.id) {
      case "dpad":
        return (<>
          <Dpad w={w} h={h} />
          <button type="button" className="hit" style={{ left: "25%", top: 0, width: "50%", height: "40%" }} data-dir="up" onPointerDown={press("up")} aria-label={S.up} />
          <button type="button" className="hit" style={{ left: 0, top: "25%", width: "40%", height: "50%" }} data-dir="left" onPointerDown={press("left")} aria-label={S.left} />
          <button type="button" className="hit" style={{ left: "25%", bottom: 0, width: "50%", height: "40%" }} data-dir="down" onPointerDown={press("down")} aria-label={S.down} />
          <button type="button" className="hit" style={{ right: 0, top: "25%", width: "40%", height: "50%" }} data-dir="right" onPointerDown={press("right")} aria-label={S.right} />
        </>);
      case "ab":
        return (<>
          <AB w={w} h={h} />
          <button type="button" className="hit" style={{ left: 0, bottom: 0, width: "48%", height: "85%" }} disabled title={S.b} aria-label="B"><span className="lb key">B</span></button>
          <button type="button" className="hit" style={{ right: 0, top: 0, width: "48%", height: "85%" }} disabled title={S.a} aria-label="A"><span className="lb key">A</span></button>
        </>);
      case "pills":
        return (<>
          <Pills w={w} h={h} stack={stack} />
          <button type="button" className="hit" style={stack ? { left: 0, top: 0, width: "100%", height: "48%" } : { left: 0, top: 0, width: "48%", height: "100%" }} onClick={nextCart} title={S.selectT} data-act="select"><span className="lb">{S.select}</span></button>
          <button type="button" className="hit" style={stack ? { left: 0, bottom: 0, width: "100%", height: "48%" } : { right: 0, top: 0, width: "48%", height: "100%" }} onClick={start} title={S.startT} data-act="start"><span className="lb">{S.start}</span></button>
        </>);
      case "power":
        return (<>
          <Power w={w} h={h} stack={stack} />
          <button type="button" className="hit" style={stack ? { left: 0, top: 0, width: "100%", height: "45%" } : { left: 0, top: 0, width: "52%", height: "100%" }}
            onPointerDown={powerDown} onPointerUp={powerUp} onPointerCancel={() => { if (holdT.current) { clearTimeout(holdT.current); holdT.current = null; } }}
            title={S.powerT} data-act="power"><span className="lb">{S.power}</span></button>
          <button type="button" className="hit" style={stack ? { left: 0, top: "48%", width: "100%", height: "40%" } : { left: "55%", top: 0, width: "36%", height: "100%" }} onClick={boot} disabled={phase === "boot"} title={S.resetT} data-act="reset"><span className="lb">{S.reset}</span></button>
        </>);
      case "coin":
        return (<>
          <Coin w={w} h={h} credits={credits} />
          <button type="button" className="hit" style={{ left: 0, top: 0, width: "100%", height: "60%" }} onClick={insertCoin} title={S.coin} aria-label={S.coin} data-act="coin" />
        </>);
      case "speaker":
        return <Speaker w={w} h={h} />;
      case "quick":
        return (<>
          <Quick w={w} h={h} stack={stack} />
          {S.quick.map((q, i) => {
            const b = stack ? { left: `${(i % 2) * 52}%`, top: `${Math.floor(i / 2) * 52}%`, width: "46%", height: "46%" } : { left: `${i * 25.5}%`, top: 0, width: "23%", height: "100%" };
            const act = [() => setPage(3), togglePause, undefined, snapshot][i];
            return <button key={q} type="button" className="hit" style={b} onClick={act} disabled={!act} title={S.quickT[i]} aria-label={S.quickT[i]} data-act={q}><span className="lb glyph" aria-hidden="true">{["≡", "⏸", "♪", "▣"][i]}</span></button>;
          })}
        </>);
      case "rail":
        return (<>
          <Rail w={w} h={h} pages={PAGES.length} active={page} />
          {PAGES.map((p, i) => (
            <button key={p} type="button" className="hit" style={{ left: `${(i / PAGES.length) * 100}%`, top: 0, width: `${100 / PAGES.length}%`, height: "100%" }} onClick={() => setPage(i)} aria-label={S.page(S.pages[p])} aria-current={i === page ? "page" : undefined} data-act={`page-${p}`} />
          ))}
        </>);
      case "credits":
        return <Counter w={w} h={h} value={credits} />;
      case "marquee":
        return <div className="marquee" aria-hidden="true"><span>{cartName}</span></div>;
      case "shelf":
        return <ShelfRow w={w} h={h} stack={stack} carts={carts} loaded={cartIx} pick={pickCart} accent={(i) => `var(${HUES[i % HUES.length]})`} load={S.load} />;
    }
  };

  const maskStyle = measured
    ? { left: px(solved.mask.x), top: px(solved.mask.y), width: px(solved.S), height: px(solved.S), clipPath: clipPolygon(solved.mask.poly.map(([x, y]) => [x - solved.mask.x, y - solved.mask.y] as const), ppu) }
    : undefined;

  return (
    <div
      ref={root}
      className="shell"
      data-led={led}
      data-phase={phase}
      data-page={PAGES[page]}
      data-off={off || undefined}
      data-drop={drop || undefined}
      data-nudge={nudge || undefined}
      data-wipe={wipe || undefined}
      data-crt={fx.crt || undefined}
      data-scan={fx.scan}
      data-tv={S.tvs[fx.tv]}
      data-wear={fx.wear || undefined}
      data-solved={measured ? "1" : undefined}
      style={{ ["--shell-accent" as string]: accent }}
    >
      {measured ? (
        <svg className="shell-bg" viewBox={`0 0 256 ${solved.Hu}`} width={solved.W} height={solved.H} preserveAspectRatio="xMinYMin meet" aria-hidden="true">
          {solved.facets.map((f, i) => (
            <polygon key={i} className={`facet ${f.family} ${f.tone}`} points={points(f.poly)} />
          ))}
          <polygon className="mask-edge" points={points(solved.mask.poly)} />
        </svg>
      ) : null}

      {solved.docks.map((d) => (
        <div key={d.id} className={"dock" + (d.ghost ? " ghost" : "")} data-id={d.id} data-zone={d.zone} style={at(d.box)}>
          {part(d)}
        </div>
      ))}

      {/* The glass: the mask, and inside it the box game.js measures. One
          tree whether or not the frame is solved yet, so the canvas and the
          ids game.js binds at load are never remounted under it. */}
      <div className="glass" style={maskStyle} onPointerDown={onDown} onPointerUp={onUp} data-cramped={(measured && solved.cramped) || undefined}>
        <div className="screen" style={measured ? { width: solved.boxPx, height: solved.boxPx } : undefined}>
          <canvas id="screen" width={256} height={256} />
        </div>
        <div className="fx fx-scan" aria-hidden="true" />
        <div className="fx fx-crt" aria-hidden="true" />
        <div className="fx fx-wipe" aria-hidden="true" />
        <p className="hud" aria-live="polite">{hud}</p>

        <div className="pages" style={{ transform: `translateX(-${page * 100}%)` }}>
          <section className="pane pane-play" aria-label={S.pages.play} />
          <section className="pane pane-shelf" aria-label={S.pages.shelf}>
            <h2 className="pane-title">{S.pages.shelf}</h2>
            <div className="shelf-grid">
              {carts.map((c, i) => (
                <button key={c.value} type="button" className={"cart-btn" + (i === cartIx ? " on" : "")} onClick={() => pickCart(i)} aria-pressed={i === cartIx}>
                  <Cart w={48} h={40} accent={`var(${HUES[i % HUES.length]})`} loaded={i === cartIx} />
                  <span className="cart-name">{c.name}</span>
                  <span className="cart-cap">{c.name}{i === cartIx ? ` · ${S.loaded}` : ""}</span>
                </button>
              ))}
              <label className="cart-btn cart-load" htmlFor="cart-file">
                <span className="cart-slot" aria-hidden="true" />
                <span className="cart-cap">{S.load}</span>
              </label>
            </div>
          </section>
          <section className="pane pane-status" aria-label={S.pages.status}>
            {children}
          </section>
          <section className="pane pane-settings" aria-label={S.pages.settings}>
            <h2 className="pane-title">{S.pages.settings}</h2>
            <div className="toys">
              <label><span>{S.crt}</span><input type="checkbox" checked={fx.crt} onChange={(e) => setFx({ ...fx, crt: e.target.checked })} /></label>
              <label><span>{S.scan}</span><input type="range" min={0} max={3} step={1} value={fx.scan} onChange={(e) => setFx({ ...fx, scan: Number(e.target.value) })} /></label>
              <label><span>{S.tv}</span>
                <span className="seg">
                  {S.tvs.map((t, i) => <button key={t} type="button" className={fx.tv === i ? "on" : ""} aria-pressed={fx.tv === i} onClick={() => setFx({ ...fx, tv: i as 0 | 1 })}>{t}</button>)}
                </span>
              </label>
              <label><span>{S.wear}</span><input type="checkbox" checked={fx.wear} onChange={(e) => setFx({ ...fx, wear: e.target.checked })} /></label>
              <label className="no"><span>{S.rewind}</span><input type="range" disabled aria-disabled="true" /><small>{S.rewindWhy}</small></label>
              <label className="no"><span>{S.ach}</span><small>{S.achWhy}</small></label>
              <label className="no"><span>{S.pal}</span><small>{S.palWhy}</small></label>
              {/* The way out, and the other language: the console page has
                  no bar (console-full), so the site's two promises, a route
                  home and a flag on every page, are kept here. */}
              <label className="site"><span>{S.site}</span>
                <span className="seg">
                  <Link href={localize(lang, "/6502")}>{S.home}</Link>
                  <Link href={localize(lang, "/6502/builders")}>{S.builders}</Link>
                  <Link href={localize(lang, "/6502/manage")}>{S.editor}</Link>
                  <LangSwitch lang={lang} />
                </span>
                <small>{S.siteWhy}</small>
              </label>
            </div>
          </section>
        </div>
      </div>

      {measured ? <p className="params" aria-hidden="true">{solved.params}</p> : null}
    </div>
  );
}

function ShelfRow({ w, h, stack, carts, loaded, pick, accent, load }: { w: number; h: number; stack?: boolean; carts: CartOption[]; loaded: number; pick: (i: number) => void; accent: (i: number) => string; load: string }) {
  const cw = stack ? w : Math.min(48, Math.floor((w - 8 * carts.length) / (carts.length + 1) / 4) * 4);
  const ch = stack ? Math.min(40, Math.floor((h - 8 * carts.length) / (carts.length + 1) / 4) * 4) : h - 8;
  return (
    <div className={"shelf-row" + (stack ? " stack" : "")}>
      {carts.map((c, i) => (
        <button key={c.value} type="button" className={"cart-btn" + (i === loaded ? " on" : "")} style={{ width: `${(cw / w) * 100}%`, height: `${(ch / h) * 100}%` }} onClick={() => pick(i)} aria-pressed={i === loaded} title={c.name}>
          <Cart w={cw} h={ch} accent={accent(i)} loaded={i === loaded} />
          <span className="cart-name">{c.name}</span>
        </button>
      ))}
      <label className="cart-btn cart-load" htmlFor="cart-file" title={load} style={{ width: `${(cw / w) * 100}%`, height: `${(ch / h) * 100}%` }}>
        <span className="cart-slot" aria-hidden="true" />
      </label>
      <div className="shelf-rail" aria-hidden="true" />
    </div>
  );
}
