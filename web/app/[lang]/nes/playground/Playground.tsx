"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Engine, type Frame, type Palette, type Shape } from "./engine";
import { Wire } from "./Wire";
import { Colours } from "./Colours";
import { MarioMap } from "./MarioMap";
import { PadRegister } from "./PadRegister";
import { SlowChip } from "./SlowChip";
import { Die } from "./Die";
import { Twins } from "./Twins";
import { XRay } from "./XRay";
import { SoundVoices } from "./SoundVoices";
import { Tour } from "./Tour";
import type { Taps, Xray } from "./xray";
import type { MarioFrame } from "./mario";
import { words, type StationKey } from "./words";
import { ui } from "./ui";
import type { Lang } from "@/lib/lang";

/**
 * The playground's live half: one console in a worker, and the stations
 * that look at what it makes. The hero is the whole frame the picture
 * chip walks through, blanking and all, drawn at a speed a person can
 * follow. Every other station reads the same frames, the same measured
 * colours and the same shape, so a line picked on the hero is the line
 * the scope shows.
 */

const CARTS = [
  { url: "/nes/bars.nes", key: "bars" },
  { url: "/nes/cal.nes", key: "cal" },
  { url: "/nes/pad.nes", key: "pad" },
] as const;

export const BIT = { a: 1, b: 2, select: 4, start: 8, up: 16, down: 32, left: 64, right: 128 } as const;
export const BUTTONS = ["a", "b", "select", "start", "up", "down", "left", "right"] as const;
const KEYS: Record<string, number> = {
  KeyX: BIT.a, KeyZ: BIT.b, ShiftRight: BIT.select, Enter: BIT.start,
  ArrowUp: BIT.up, ArrowDown: BIT.down, ArrowLeft: BIT.left, ArrowRight: BIT.right,
};

/** Frame lengths a person can watch, as a multiple of nothing: a length in ms. */
const PACES = [
  { id: "real", ms: 0 },
  { id: "second", ms: 1000 },
  { id: "ten", ms: 10_000 },
  { id: "minute", ms: 60_000 },
] as const;
type Pace = (typeof PACES)[number]["id"];

/** A token's value, for drawing on a canvas with the site's colours. */
export function token(name: string): string {
  if (typeof document === "undefined") return "#000";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}
function rgbOf(css: string): [number, number, number] {
  const m = css.match(/^#([0-9a-f]{6})$/i);
  if (!m) return [11, 11, 10];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The frame as the field the beam walks: picture in its colours, the rest dark. */
function paintField(ctx: CanvasRenderingContext2D, f: Frame, pal: Palette, tv: HTMLCanvasElement | null) {
  const s = f.shape;
  const img = ctx.createImageData(s.dots, s.lines);
  const [br, bg, bb] = rgbOf(token("--color-panel-sunk"));
  for (let y = 0; y < s.lines; y++) {
    for (let x = 0; x < s.dots; x++) {
      const i = y * s.dots + x;
      const inside = x >= s.pictureX && x < s.pictureX + s.pictureW && y < s.pictureH;
      const [r, g, b] = inside ? pal.rgb[f.colour[i] & 63] : [br, bg, bb];
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (f.rgba && tv) {
    const t = tv.getContext("2d")!;
    tv.width = s.outW;
    tv.height = s.pictureH;
    t.putImageData(new ImageData(new Uint8ClampedArray(f.rgba), s.outW, s.pictureH), 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tv, s.pictureX, 0, s.pictureW, s.pictureH);
  }
}

const STILL = "(prefers-reduced-motion: reduce)";
export function subscribeMotion(fn: () => void) {
  const m = window.matchMedia(STILL);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
}
export function prefersStill() {
  return window.matchMedia(STILL).matches;
}

/** The hero's console: a key and a label per cell, in reading order. */
const CONSOLE = ["line", "dot", "beam", "time", "each", "slower"] as const;

export interface Selection {
  line: number;
  serial: number;
}

export function Playground({
  lang,
  mario,
  framePeriodMs,
  slowChip,
  xray,
  taps,
}: {
  lang: Lang;
  mario: MarioFrame;
  framePeriodMs: number;
  slowChip: string | null;
  xray: Xray;
  taps: Taps;
}) {
  const W = words(lang);
  const U = ui(lang);
  const say = (key: StationKey) => ({ eyebrow: W.stations[key].eyebrow, title: W.stations[key].title, words: W.stations[key].body, record: W.stations[key].record });
  const engine = useRef<Engine | null>(null);
  const [shape, setShape] = useState<Shape | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [cart, setCart] = useState<string>(CARTS[0].url);
  const [own, setOwn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pace, setPace] = useState<Pace>("second");
  // Reduced motion: start still, and the reader presses play. The reader's
  // own choice, once made, wins.
  const reduced = useSyncExternalStore(subscribeMotion, prefersStill, () => false);
  const [runChoice, setRunning] = useState<boolean | null>(null);
  const running = runChoice ?? !reduced;
  const [tvView, setTvView] = useState(false);
  const [touchPad, setTouchPad] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [shown, setShown] = useState<Frame | null>(null);

  const [keyPad, setKeyPad] = useState(0);
  const pad = keyPad | touchPad;
  // The loop asks for frames outside render, so it reads the pad from here.
  const padRef = useRef(0);
  useEffect(() => {
    padRef.current = pad;
  }, [pad]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const readout = useRef<HTMLDListElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const loop = useRef({
    cur: null as HTMLCanvasElement | null,
    prev: null as HTMLCanvasElement | null,
    tv: null as HTMLCanvasElement | null,
    frame: null as Frame | null,
    next: null as Promise<Frame> | null,
    ready: null as Frame | null,
    beam: 0,
    last: 0,
    generation: 0,
    told: 0,
  });

  const paceMs = PACES.find((p) => p.id === pace)!.ms || framePeriodMs;
  const slow = paceMs >= 250;

  // The worker, once.
  useEffect(() => {
    const e = new Engine();
    engine.current = e;
    const L = loop.current;
    L.cur = document.createElement("canvas");
    L.prev = document.createElement("canvas");
    L.tv = document.createElement("canvas");
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, []);

  const request = useCallback(() => {
    const e = engine.current;
    const L = loop.current;
    if (!e || L.next) return;
    const gen = L.generation;
    L.next = e.run(1, padRef.current, tvView);
    L.next
      .then((f) => {
        if (gen !== L.generation) return;
        L.ready = f;
      })
      .catch((err) => setError(String(err.message ?? err)))
      .finally(() => {
        if (gen === L.generation) L.next = null;
      });
  }, [tvView]);

  const present = useCallback(
    (f: Frame) => {
      const L = loop.current;
      if (!palette || !L.cur || !L.prev) return;
      // The old frame becomes the phosphor the beam draws over.
      [L.cur, L.prev] = [L.prev, L.cur];
      L.cur.width = f.shape.dots;
      L.cur.height = f.shape.lines;
      paintField(L.cur.getContext("2d")!, f, palette, L.tv);
      L.frame = f;
      // The stations below follow the frame at a reader's pace, not the console's.
      const now = performance.now();
      if (now - L.told > 500) {
        L.told = now;
        setShown(f);
      }
    },
    [palette],
  );

  // Loading a cartridge: a fresh console, one frame to learn the shape,
  // then the colours measured through the signal path.
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const L = loop.current;
    L.generation += 1;
    L.next = null;
    L.ready = null;
    L.frame = null;
    L.beam = 0;
    setError(null);
    if (cart === "own") return;
    (async () => {
      try {
        await e.load(cart);
        const f = await e.run(1, 0, false);
        setShape(f.shape);
        setPalette(await e.palette());
        L.ready = f;
      } catch (err) {
        setError(String((err as Error).message ?? err));
      }
    })();
  }, [cart]);

  const loadOwn = useCallback(async (file: File) => {
    const e = engine.current;
    if (!e) return;
    const L = loop.current;
    L.generation += 1;
    L.next = null;
    L.ready = null;
    L.frame = null;
    setError(null);
    setOwn(file.name);
    setCart("own");
    try {
      await e.loadBytes(await file.arrayBuffer());
      const f = await e.run(1, 0, false);
      setShape(f.shape);
      setPalette(await e.palette());
      L.ready = f;
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  }, []);

  // The loop: the beam walks the frame at the chosen pace; at the end of
  // a frame the next one (already asked for) takes over.
  useEffect(() => {
    let raf = 0;
    const L = loop.current;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = L.last ? Math.min(250, t - L.last) : 0;
      L.last = t;
      if (!L.frame && L.ready && palette) {
        present(L.ready);
        L.ready = null;
      }
      if (!L.frame) return;
      if (running) {
        L.beam += dt / paceMs;
        if (!L.ready) request();
        if (L.beam >= 1) {
          if (L.ready) {
            present(L.ready);
            L.ready = null;
            L.beam = slow ? L.beam % 1 : 0;
            request();
          } else L.beam = 1;
        }
      }
      draw();
    };
    const draw = () => {
      const c = canvas.current;
      const f = L.frame;
      if (!c || !f || !L.cur || !L.prev) return;
      const s = f.shape;
      const k = 3;
      if (c.width !== s.dots * k) {
        c.width = s.dots * k;
        c.height = s.lines * k;
      }
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      const total = s.dots * s.lines;
      const pos = Math.min(total - 1, Math.floor(L.beam * total));
      const line = Math.floor(pos / s.dots);
      const dot = pos % s.dots;
      if (!slow) {
        ctx.drawImage(L.cur, 0, 0, c.width, c.height);
      } else {
        // Behind the beam, the new frame; ahead of it, the last one fading.
        ctx.fillStyle = token("--color-panel-sunk");
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.globalAlpha = 0.28;
        ctx.drawImage(L.prev, 0, 0, c.width, c.height);
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, c.width, line * k);
        ctx.rect(0, line * k, (dot + 1) * k, k);
        ctx.clip();
        ctx.drawImage(L.cur, 0, 0, c.width, c.height);
        ctx.restore();
        // The beam: a hot dot and a short tail along its line.
        const bx = (dot + 0.5) * k;
        const by = (line + 0.5) * k;
        const grd = ctx.createLinearGradient(bx - 60 * k, by, bx, by);
        grd.addColorStop(0, "rgba(255,255,255,0)");
        grd.addColorStop(1, token("--color-mustard"));
        ctx.fillStyle = grd;
        ctx.fillRect(Math.max(0, bx - 60 * k), by - k / 2, Math.min(60 * k, bx), k);
        const glow = ctx.createRadialGradient(bx, by, 0, bx, by, 9 * k);
        glow.addColorStop(0, "rgba(255,250,230,1)");
        glow.addColorStop(0.25, token("--color-mustard"));
        glow.addColorStop(1, "rgba(210,183,113,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(bx - 9 * k, by - 9 * k, 18 * k, 18 * k);
      }
      // The console: fixed labels, each value written into its own cell.
      // At real speed the beam is too fast to follow, and the cells say so
      // with a placeholder rather than a blur of numbers.
      const r = readout.current;
      if (r) {
        const inside = dot >= s.pictureX && dot < s.pictureX + s.pictureW && line < s.pictureH;
        const beam = inside ? U.hero.beamDrawing : line >= s.pictureH ? U.hero.beamTop : U.hero.beamLeft;
        const dotNs = (framePeriodMs * 1e6) / total;
        const us = (pos * dotNs) / 1000;
        const put = (k: string, v: string) => {
          const cell = r.querySelector<HTMLElement>(`[data-k="${k}"]`);
          if (cell && cell.textContent !== v) cell.textContent = v;
        };
        put("line", slow ? String(line) : U.common.none);
        put("dot", slow ? String(dot) : U.common.none);
        put("beam", slow ? beam : U.hero.beamFast);
        put("time", slow ? `${us.toFixed(1)} µs` : U.common.none);
        put("each", `${dotNs.toFixed(0)} ns`);
        put("slower", slow ? `${Math.round(paceMs / framePeriodMs).toLocaleString("en")}×` : "1×");
      }
      const sc = scrub.current;
      if (sc && running) sc.value = String(L.beam);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, paceMs, slow, palette, present, request, framePeriodMs, U]);

  // A new view throws the frame in hand away, so the next one is drawn the new way.
  useEffect(() => {
    const L = loop.current;
    L.generation += 1;
    L.next = null;
    L.ready = null;
  }, [tvView]);

  // Keys, while the stage has focus.
  const onKey = (down: boolean) => (e: React.KeyboardEvent) => {
    const bit = KEYS[e.code];
    if (!bit) return;
    e.preventDefault();
    setKeyPad((was) => (down ? was | bit : was & ~bit));
  };

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const f = loop.current.frame;
    if (!f) return;
    const r = e.currentTarget.getBoundingClientRect();
    const line = Math.floor(((e.clientY - r.top) / r.height) * f.shape.lines);
    setSelection({ line: Math.max(0, Math.min(f.shape.lines - 1, line)), serial: f.serial });
  };

  // One whole frame on, drawn complete: the one waiting, and the next asked for.
  const stepFrame = () => {
    const L = loop.current;
    if (!L.ready) {
      request();
      return;
    }
    present(L.ready);
    L.ready = null;
    L.beam = 0.99999;
    request();
  };

  const s = shape;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const aboutCart = CARTS.find((c) => c.url === cart)?.key ?? "bars";
  const lut = useMemo(() => palette?.rgb ?? null, [palette]);

  return (
    <>
      <section className="pg-hero" aria-labelledby="pg-title">
        <div className="pg-hero-words">
          <p className="pg-kicker">{W.hero.kicker}</p>
          <h1 id="pg-title">{W.hero.title}</h1>
          <p className="pg-lead">{W.hero.lead(framePeriodMs.toLocaleString("en", { maximumFractionDigits: 1 }))}</p>
        </div>

        <div
          className="pg-stage"
          tabIndex={0}
          onKeyDown={onKey(true)}
          onKeyUp={onKey(false)}
          aria-label={U.hero.stage}
        >
          <div className="pg-field" style={s ? { aspectRatio: `${s.dots} / ${s.lines}` } : undefined}>
            <canvas ref={canvas} onClick={pick} className="pg-canvas" aria-label={U.hero.field} />
            {s ? (
              <>
                <div className="pg-zone pg-zone-picture" style={{ left: pct(s.pictureX, s.dots), width: pct(s.pictureW, s.dots), height: pct(s.pictureH, s.lines) }}>
                  <span>{U.hero.zonePicture}</span>
                </div>
                <div className="pg-zone pg-zone-right" style={{ left: pct(s.pictureX + s.pictureW, s.dots), height: pct(s.pictureH, s.lines) }}>
                  <span>{U.hero.zoneRight}</span>
                </div>
                <div className="pg-zone pg-zone-bottom" style={{ top: pct(s.pictureH, s.lines) }}>
                  <span>{U.hero.zoneBottom}</span>
                </div>
                {selection ? <div className="pg-picked" style={{ top: pct(selection.line + 0.5, s.lines) }} aria-hidden="true" /> : null}
              </>
            ) : (
              <p className="pg-waiting">{error ?? U.common.waiting}</p>
            )}
          </div>

          <div className="pg-controls">
            <div className="pg-seg" role="radiogroup" aria-label={U.hero.howFast}>
              {PACES.map((p) => (
                <button key={p.id} role="radio" aria-checked={pace === p.id} className="pg-segbtn" onClick={() => setPace(p.id)}>
                  {U.hero.paces[p.id]}
                </button>
              ))}
            </div>
            <div className="pg-row">
              <button className="pg-btn" onClick={() => setRunning(!running)}>
                {running ? U.common.pause : U.common.play}
              </button>
              <button className="pg-btn" onClick={stepFrame} disabled={running}>
                {U.common.nextFrame}
              </button>
              <label className="pg-check">
                <input type="checkbox" checked={tvView} onChange={(e) => setTvView(e.target.checked)} />
                {U.hero.throughTv}
              </label>
            </div>
            {/* Always there, so changing the pace moves nothing; idle at real speed. */}
            <input
              ref={scrub}
              className="pg-scrub"
              type="range"
              min={0}
              max={1}
              step={0.0001}
              disabled={!slow}
              aria-label={U.hero.scrub}
              onChange={(e) => {
                setRunning(false);
                loop.current.beam = Number(e.target.value);
              }}
            />
            <dl ref={readout} className="pg-console" aria-live="off">
              {CONSOLE.map((k) => (
                <div key={k}>
                  <dt>{U.hero.cells[k]}</dt>
                  <dd data-k={k}>·</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="pg-carts">
            <label className="pg-label" htmlFor="pg-cart">{U.common.cartridge}</label>
            <select id="pg-cart" className="pg-select" value={cart} onChange={(e) => setCart(e.target.value)}>
              {CARTS.map((c) => (
                <option key={c.url} value={c.url}>{U.hero.carts[c.key].name}</option>
              ))}
              {own ? <option value="own">{own}</option> : null}
            </select>
            <label className="pg-btn pg-file">
              {U.common.yourOwn}
              <input type="file" accept=".nes" onChange={(e) => e.target.files?.[0] && loadOwn(e.target.files[0])} />
            </label>
            <p className="pg-note">
              {cart === "own"
                ? U.hero.carts.own
                : U.hero.carts[aboutCart].about}
            </p>
            {error && s ? <p className="pg-error">{error}</p> : null}
          </div>

          <MiniPad bits={pad} onChange={setTouchPad} pad={U.hero.pad} names={U.padStation.names} />
        </div>
      </section>

      <Station
        lang={lang}
        id="tour"
        {...say("tour")}
      >
        <Tour lang={lang} />
      </Station>

      <Station
        lang={lang}
        id="wire"
        {...say("wire")}
      >
        <Wire
          lang={lang}
          engine={engine}
          line={selection?.line ?? (shown ? Math.floor((shown.shape.pictureH * 2) / 5) : null)}
          serial={selection?.serial ?? shown?.serial ?? null}
          palette={lut}
        />
      </Station>

      <Station
        lang={lang}
        id="colours"
        {...say("colours")}
      >
        {palette && s ? <Colours lang={lang} palette={palette} shape={s} /> : <p className="pg-waiting">{U.colours.measuring}</p>}
      </Station>

      <Station
        lang={lang}
        id="mario"
        {...say("mario")}
      >
        {s ? <MarioMap lang={lang} mario={mario} shape={s} framePeriodMs={framePeriodMs} /> : <p className="pg-waiting">{U.mario.waiting}</p>}
      </Station>

      <Station
        lang={lang}
        id="pad"
        {...say("pad")}
      >
        <PadRegister lang={lang} bits={pad} onChange={setTouchPad} />
      </Station>

      <Station
        lang={lang}
        id="difference"
        {...say("difference")}
      >
        {s ? (
          <Twins lang={lang} shape={s} palette={lut} framePeriodMs={framePeriodMs} xray={xray} taps={taps} />
        ) : (
          <p className="pg-waiting">{U.mario.waiting}</p>
        )}
      </Station>

      <Station
        lang={lang}
        id="xray"
        {...say("xray")}
      >
        {s ? (
          <XRay lang={lang} shape={s} palette={lut} framePeriodMs={framePeriodMs} />
        ) : (
          <p className="pg-waiting">{U.mario.waiting}</p>
        )}
      </Station>

      <Station
        lang={lang}
        id="sound"
        {...say("sound")}
      >
        <SoundVoices lang={lang} halfCyclesPerFrame={shown?.halfCycles ?? null} framePeriodMs={framePeriodMs} />
      </Station>

      <Station
        lang={lang}
        id="slow"
        {...say("slow")}
      >
        {slowChip ? (
          <SlowChip lang={lang} palette={lut} framePeriodMs={framePeriodMs} />
        ) : (
          <p className="pg-waiting">{U.common.noSlow}</p>
        )}
      </Station>
      <Station
        lang={lang}
        id="die"
        {...say("die")}
      >
        {slowChip ? <Die lang={lang} /> : <p className="pg-waiting">{U.common.noDie}</p>}
      </Station>

    </>
  );
}

type SetBits = React.Dispatch<React.SetStateAction<number>>;

function MiniPad({ bits, onChange, pad, names }: { bits: number; onChange: SetBits; pad: string; names: Record<(typeof BUTTONS)[number], string> }) {
  const hold = (b: number, on: boolean) => onChange((was) => (on ? was | b : was & ~b));
  return (
    <div className="pg-minipad" aria-label={pad}>
      {BUTTONS.map((name) => (
        <button
          key={name}
          className="pg-padkey"
          aria-pressed={(bits & BIT[name]) !== 0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            hold(BIT[name], true);
          }}
          onPointerUp={() => hold(BIT[name], false)}
          onPointerCancel={() => hold(BIT[name], false)}
        >
          {names[name]}
        </button>
      ))}
    </div>
  );
}

export function Station({
  lang,
  id,
  eyebrow,
  title,
  words,
  record,
  children,
}: {
  lang: Lang;
  id: string;
  eyebrow: string;
  title: string;
  words: React.ReactNode;
  record: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <section className="pg-station" id={id} aria-labelledby={`${id}-h`}>
      <div className="pg-words">
        <p className="pg-eyebrow">{eyebrow}</p>
        <h2 id={`${id}-h`}>{title}</h2>
        {words}
        <div className="pg-record">
          <p className="pg-record-h">{ui(lang).station.deeper}</p>
          <ul>
            {record.map((r) => (
              <li key={r.href}>
                <a href={r.href}>{r.label}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="pg-instrument">{children}</div>
    </section>
  );
}
