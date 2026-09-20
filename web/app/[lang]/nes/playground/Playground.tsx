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

/**
 * The playground's live half: one console in a worker, and the stations
 * that look at what it makes. The hero is the whole frame the picture
 * chip walks through, blanking and all, drawn at a speed a person can
 * follow. Every other station reads the same frames, the same measured
 * colours and the same shape, so a line picked on the hero is the line
 * the scope shows.
 */

const CARTS = [
  { url: "/nes/bars.nes", name: "Colour bars", about: "Every hue at one brightness, the brightness stepping every few seconds. Nobody's game: we wrote it to test the picture." },
  { url: "/nes/cal.nes", name: "The calibration cartridge", about: "The screens we show a real console and the model, so the two pictures can be compared." },
  { url: "/nes/pad.nes", name: "The pad tester", about: "Press buttons below and watch the console notice." },
] as const;

export const BIT = { a: 1, b: 2, select: 4, start: 8, up: 16, down: 32, left: 64, right: 128 } as const;
export const BUTTONS = ["a", "b", "select", "start", "up", "down", "left", "right"] as const;
const KEYS: Record<string, number> = {
  KeyX: BIT.a, KeyZ: BIT.b, ShiftRight: BIT.select, Enter: BIT.start,
  ArrowUp: BIT.up, ArrowDown: BIT.down, ArrowLeft: BIT.left, ArrowRight: BIT.right,
};

/** Frame lengths a person can watch, as a multiple of nothing: a length in ms. */
const PACES = [
  { id: "real", label: "Real speed", ms: 0 },
  { id: "second", label: "A frame a second", ms: 1000 },
  { id: "ten", label: "A frame in ten seconds", ms: 10_000 },
  { id: "minute", label: "A frame a minute", ms: 60_000 },
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
const CONSOLE = [
  ["line", "Line"],
  ["dot", "Dot"],
  ["beam", "Beam"],
  ["time", "Into the frame"],
  ["each", "One dot lasts"],
  ["slower", "Slower than real"],
] as const;

export interface Selection {
  line: number;
  serial: number;
}

export function Playground({
  mario,
  framePeriodMs,
  slowChip,
  xray,
  taps,
}: {
  mario: MarioFrame;
  framePeriodMs: number;
  slowChip: string | null;
  xray: Xray;
  taps: Taps;
}) {
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
        const beam = inside ? "drawing" : line >= s.pictureH ? "off: to the top" : "off: to the left";
        const dotNs = (framePeriodMs * 1e6) / total;
        const us = (pos * dotNs) / 1000;
        const put = (k: string, v: string) => {
          const cell = r.querySelector<HTMLElement>(`[data-k="${k}"]`);
          if (cell && cell.textContent !== v) cell.textContent = v;
        };
        put("line", slow ? String(line) : "·");
        put("dot", slow ? String(dot) : "·");
        put("beam", slow ? beam : "too fast to see");
        put("time", slow ? `${us.toFixed(1)} µs` : "·");
        put("each", `${dotNs.toFixed(0)} ns`);
        put("slower", slow ? `${Math.round(paceMs / framePeriodMs).toLocaleString("en")}×` : "1×");
      }
      const sc = scrub.current;
      if (sc && running) sc.value = String(L.beam);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, paceMs, slow, palette, present, request, framePeriodMs]);

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
  const aboutCart = CARTS.find((c) => c.url === cart)?.about;
  const lut = useMemo(() => palette?.rgb ?? null, [palette]);

  return (
    <>
      <section className="pg-hero" aria-labelledby="pg-title">
        <div className="pg-hero-words">
          <p className="pg-kicker">A playground, not yet a page</p>
          <h1 id="pg-title">The NES at human speed</h1>
          <p className="pg-lead">
            Everything a Nintendo does to put one picture on a television happens in{" "}
            {framePeriodMs.toLocaleString("en", { maximumFractionDigits: 1 })} thousandths of a second.
            Here is the console the engineers rebuilt from the chips&rsquo; own transistors, running in this page,
            slowed down until you can watch it think.
          </p>
        </div>

        <div
          className="pg-stage"
          tabIndex={0}
          onKeyDown={onKey(true)}
          onKeyUp={onKey(false)}
          aria-label="The console's frame. Focus it to play with the keyboard: arrows, X for A, Z for B, Enter for Start."
        >
          <div className="pg-field" style={s ? { aspectRatio: `${s.dots} / ${s.lines}` } : undefined}>
            <canvas ref={canvas} onClick={pick} className="pg-canvas" aria-label="The whole frame the beam walks, picture and blanking" />
            {s ? (
              <>
                <div className="pg-zone pg-zone-picture" style={{ left: pct(s.pictureX, s.dots), width: pct(s.pictureW, s.dots), height: pct(s.pictureH, s.lines) }}>
                  <span>the picture you see</span>
                </div>
                <div className="pg-zone pg-zone-right" style={{ left: pct(s.pictureX + s.pictureW, s.dots), height: pct(s.pictureH, s.lines) }}>
                  <span>the beam flies back</span>
                </div>
                <div className="pg-zone pg-zone-bottom" style={{ top: pct(s.pictureH, s.lines) }}>
                  <span>the beam climbs back to the top: a game&rsquo;s quiet moment to change the picture</span>
                </div>
                {selection ? <div className="pg-picked" style={{ top: pct(selection.line + 0.5, s.lines) }} aria-hidden="true" /> : null}
              </>
            ) : (
              <p className="pg-waiting">{error ?? "Waking the console up..."}</p>
            )}
          </div>

          <div className="pg-controls">
            <div className="pg-seg" role="radiogroup" aria-label="How fast">
              {PACES.map((p) => (
                <button key={p.id} role="radio" aria-checked={pace === p.id} className="pg-segbtn" onClick={() => setPace(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="pg-row">
              <button className="pg-btn" onClick={() => setRunning(!running)}>
                {running ? "Pause" : "Play"}
              </button>
              <button className="pg-btn" onClick={stepFrame} disabled={running}>
                Next frame
              </button>
              <label className="pg-check">
                <input type="checkbox" checked={tvView} onChange={(e) => setTvView(e.target.checked)} />
                Through the television&rsquo;s signal
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
              aria-label="Where the beam is in the frame"
              onChange={(e) => {
                setRunning(false);
                loop.current.beam = Number(e.target.value);
              }}
            />
            <dl ref={readout} className="pg-console" aria-live="off">
              {CONSOLE.map(([k, label]) => (
                <div key={k}>
                  <dt>{label}</dt>
                  <dd data-k={k}>·</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="pg-carts">
            <label className="pg-label" htmlFor="pg-cart">Cartridge</label>
            <select id="pg-cart" className="pg-select" value={cart} onChange={(e) => setCart(e.target.value)}>
              {CARTS.map((c) => (
                <option key={c.url} value={c.url}>{c.name}</option>
              ))}
              {own ? <option value="own">{own}</option> : null}
            </select>
            <label className="pg-btn pg-file">
              Your own .nes
              <input type="file" accept=".nes" onChange={(e) => e.target.files?.[0] && loadOwn(e.target.files[0])} />
            </label>
            <p className="pg-note">
              {cart === "own"
                ? "Read from your disk into this browser, and nowhere else. Only the simplest cartridge boards load; anything else is refused by name."
                : aboutCart}
            </p>
            {error && s ? <p className="pg-error">{error}</p> : null}
          </div>

          <MiniPad bits={pad} onChange={setTouchPad} />
        </div>
      </section>

      <Station
        id="tour"
        eyebrow="Start here"
        title="A guided tour"
        words={
          <>
            <p>
              This page is a workshop, not a book: the pieces are in no particular order, and any of them can be poked at
              on its own. If you would rather be shown around, this is one path through them.
            </p>
            <p>
              It starts with a picture on a television and ends inside a single chip, with a line at each stop saying what
              to look at. A bar follows you down the page while it runs, and you can leave it whenever you like.
            </p>
          </>
        }
        record={[
          { href: "/docs/nes", label: "The console arc's notebook, if you would rather read the record" },
          { href: "/nes", label: "The NES section: the chips, the signal, the console and the bench" },
        ]}
      >
        <Tour />
      </Station>

      <Station
        id="wire"
        eyebrow="The wire"
        title="A picture is one long wiggle"
        words={
          <>
            <p>
              The NES never sends a picture to the television. It sends one wire&rsquo;s worth of voltage that rises and
              falls, line after line, and the television rebuilds the picture from it. Click any line of the frame above and
              this is that line, exactly as the console&rsquo;s model encodes it.
            </p>
            <p>
              The deep dip is the <b>sync</b>: the television&rsquo;s cue to start a new line. The little wave after it is
              the <b>colour burst</b>, a metronome the television tunes to. Then the picture: how high the wire sits is how
              bright a dot is, and the fast wiggle on top carries its colour.
            </p>
          </>
        }
        record={[
          { href: "/docs/nes/ntsc-spec", label: "The signal path's specification" },
          { href: "/docs/nes/m1-report", label: "The NES encoder, checked against its reference" },
        ]}
      >
        <Wire
          engine={engine}
          line={selection?.line ?? (shown ? Math.floor((shown.shape.pictureH * 2) / 5) : null)}
          serial={selection?.serial ?? shown?.serial ?? null}
          palette={lut}
        />
      </Station>

      <Station
        id="colours"
        eyebrow="The colours"
        title="Every colour is a timing"
        words={
          <>
            <p>
              The NES has a fixed set of colours: a handful of brightnesses, each crossed with every hue. Each colour here was made by
              the console&rsquo;s model and decoded by our model of a television, just now, in your browser. None of them
              came from a chart.
            </p>
            <p>
              Pick one. The wire swings up and down at the colour burst&rsquo;s own beat, and the only thing that
              changes the hue is <i>when</i> it swings. The clock face shows how far each colour&rsquo;s swing runs ahead of
              the burst: every hue has its own hour on the clock.
            </p>
          </>
        }
        record={[
          { href: "/docs/nes/p1-report", label: "The picture chip's colour output, checked against the table" },
          { href: "/docs/nes/eyes-vs-scope", label: "Where our colours and a real console's still differ" },
        ]}
      >
        {palette && s ? <Colours palette={palette} shape={s} /> : <p className="pg-waiting">Measuring the colours...</p>}
      </Station>

      <Station
        id="mario"
        eyebrow="A real game"
        title="Where Super Mario Bros. spends a frame"
        words={
          <>
            <p>
              The engineers ran Super Mario Bros. on the model and wrote down, for one ordinary frame, what the processor
              was doing while the beam was at each point on the screen. This map is their table, painted onto the frame.
            </p>
            <p>
              The surprise is the grey: most of the time, the game is doing nothing at all. It finishes its work early and
              waits. The top of the picture is spent waiting for the beam to pass the status bar, so the score can stay
              still while the level scrolls underneath.
            </p>
          </>
        }
        record={[
          { href: "/docs/nes/mario-dissection", label: "Super Mario Bros., dissected (the table this map is drawn from)" },
          { href: "/docs/nes/encyclopedia", label: "The encyclopedia of code patterns" },
        ]}
      >
        {s ? <MarioMap mario={mario} shape={s} framePeriodMs={framePeriodMs} /> : <p className="pg-waiting">Waiting for the console to report the frame&rsquo;s shape...</p>}
      </Station>

      <Station
        id="pad"
        eyebrow="The controller"
        title="Eight buttons down one wire"
        words={
          <>
            <p>
              Inside the pad is one small chip that takes a snapshot of all eight buttons when the console asks, then hands
              them over one at a time, a bit per tick, down a single wire. Hold some buttons, on screen or on your keyboard
              with the frame above focused, and watch a read.
            </p>
            <p>A pressed button reads as a zero on the wire. The console flips it back.</p>
          </>
        }
        record={[
          { href: "/docs/nes/bench-v1b", label: "How a console reads a pad, and the bridge that pretends to be one" },
          { href: "/docs/nes/encyclopedia", label: "The poll routine, entry one of the encyclopedia" },
        ]}
      >
        <PadRegister bits={pad} onChange={setTouchPad} />
      </Station>

      <Station
        id="difference"
        eyebrow="Spot the difference"
        title="One button, one frame"
        words={
          <>
            <p>
              Two consoles, the same cartridge, the same buttons, frame for frame. They are the same machine running the
              same program, so their pictures are the same. Now tap one button, for one frame, in one of them only.
            </p>
            <p>
              Whatever differs from then on is that tap&rsquo;s doing, and nothing else&rsquo;s. Sometimes the two
              pictures come back together a moment later; sometimes they never do. This is how the engineers find out what
              a game does with a button, with no source code at all: they run it twice and look for the difference.
            </p>
            <p>
              On the calibration cartridge the buttons are printed in its strip of black and white blocks, two frames after
              they were read. Watch for the block that lights, and how long it stays.
            </p>
          </>
        }
        record={[
          { href: "/docs/nes/encyclopedia", label: "The encyclopedia of code patterns (entry one, the x-ray below)" },
          { href: "/docs/nes/mario-dissection", label: "Super Mario Bros., dissected (from the pad to the jump)" },
          { href: "/docs/nes/exercise", label: "The exercise notebook: how the x-ray works" },
        ]}
      >
        {s ? (
          <Twins shape={s} palette={lut} framePeriodMs={framePeriodMs} xray={xray} taps={taps} />
        ) : (
          <p className="pg-waiting">Waiting for the console to report the frame&rsquo;s shape...</p>
        )}
      </Station>

      <Station
        id="xray"
        eyebrow="Your own game"
        title="X-ray something you own"
        words={
          <>
            <p>
              The same trick, on a cartridge of your own. Play for a while: the page writes down which buttons you held
              on every frame, exactly as the engineers&rsquo; bench writes down a run. Then ask it to x-ray a tap at the
              moment you stopped.
            </p>
            <p>
              Both consoles replay everything you played, from the moment they were switched on, and one of them gets one
              extra tap. Anything they differ by after that is that tap&rsquo;s doing, and the report says when the
              pictures first parted, where on the screen, how far apart they got and whether they ever came back together.
            </p>
            <p>The cartridge is read in this browser and goes nowhere else.</p>
          </>
        }
        record={[
          { href: "/docs/nes/exercise", label: "The exercise notebook: the x-ray, and the recordings it works from" },
          { href: "/docs/nes/mario-dissection", label: "What their x-ray found in Super Mario Bros." },
          { href: "/docs/nes/bench-script", label: "The bench script: one file both the bench and the model read" },
        ]}
      >
        {s ? (
          <XRay shape={s} palette={lut} framePeriodMs={framePeriodMs} />
        ) : (
          <p className="pg-waiting">Waiting for the console to report the frame&rsquo;s shape...</p>
        )}
      </Station>

      <Station
        id="sound"
        eyebrow="The sound"
        title="Five voices, one chip"
        words={
          <>
            <p>
              All the NES&rsquo;s music comes from five voices inside the processor chip: two squares, a triangle, a
              noise maker and a player for recorded samples. A game makes music by writing a few numbers into the chip
              every so often: which note, how loud, what shape.
            </p>
            <p>
              Here you write those numbers by pressing keys. This is the engineers&rsquo; model of the sound hardware,
              built from measurements of the real chip&rsquo;s transistors, playing in your browser. Each voice is drawn as
              the chip produces it, and its pitch is measured from that drawing, not assumed.
            </p>
            <p>
              Mute a voice and listen to the others change slightly: the chip does not simply add its voices together.
              That mixing is written from the NES community&rsquo;s published table, and the engineers mark it as a claim
              they have not yet measured on their own console. The steady offset the chip&rsquo;s pins sit at is taken out
              before your speakers.
            </p>
          </>
        }
        record={[
          { href: "/docs/nes/a3-report", label: "First sound from the 2A03 (the mixer, a labelled claim)" },
          { href: "/docs/nes/n3-report", label: "The fast 2A03: the sound tables measured out of the chip" },
          { href: "/docs/nes/n7-report", label: "The console's sound, through the board's audio stage" },
        ]}
      >
        <SoundVoices halfCyclesPerFrame={shown?.halfCycles ?? null} framePeriodMs={framePeriodMs} />
      </Station>

      <Station
        id="slow"
        eyebrow="The slow chip"
        title="Every transistor, switching"
        words={
          <>
            <p>
              Before the engineers wrote a fast picture chip, they built a slow one: a simulation of every transistor on
              the real chip&rsquo;s silicon, switching on and off exactly as the photographs of the die say they are wired.
              Here it is, running in your browser, drawing the engineers&rsquo; test scene one dot at a time.
            </p>
            <p>
              Beside it is their fast chip&rsquo;s picture of the same scene. The fast one has to agree with the slow one
              on every single dot, and this page checks it as you watch. The lamps are the chip&rsquo;s own wires: its
              dot and line counters counting in binary, and the colour leaving the chip.
            </p>
            <p>
              The bars at the bottom are how many transistors change state for each dot. The chip fetches a new tile every
              few dots, and you can see its rhythm.
            </p>
          </>
        }
        record={[
          { href: "/docs/nes/p0-report", label: "The 2C02 at its switches" },
          { href: "/docs/nes/p1-report", label: "The 2C02's first picture (this scene)" },
          { href: "/docs/nes/p3-report", label: "The fast 2C02, dot for dot with the chip" },
        ]}
      >
        {slowChip ? (
          <SlowChip palette={lut} framePeriodMs={framePeriodMs} />
        ) : (
          <p className="pg-waiting">The slow chip is not in this build: scripts/build-playground-wasm.py makes it, from the engineers&rsquo; checkout.</p>
        )}
      </Station>
      <Station
        id="die"
        eyebrow="The die"
        title="The chip itself, lit up"
        words={
          <>
            <p>
              This is the picture chip&rsquo;s own silicon: the shapes traced from photographs of a real chip with its
              casing removed, which is where every one of these models came from in the first place. The wires that are
              carrying a signal right now are lit, as the transistor-level chip runs in your browser.
            </p>
            <p>
              Point at anything to see which wire it is. Many of them have names, given by the people who traced the
              photographs, and those names are what the engineers&rsquo; reports talk about when they say a signal rose or
              a latch held.
            </p>
            <p>The colours are the layers: the metal on top, the silicon underneath, and the switching layer between.</p>
          </>
        }
        record={[
          { href: "/docs/nes/p0-report", label: "The 2C02 at its switches (this chip, from this die data)" },
          { href: "/docs/nes/p1-report", label: "The 2C02's first picture" },
          { href: "/docs/words", label: "Words the reports use" },
        ]}
      >
        {slowChip ? <Die /> : <p className="pg-waiting">The die needs the slow chip&rsquo;s bundle, which is not in this build.</p>}
      </Station>

    </>
  );
}

type SetBits = React.Dispatch<React.SetStateAction<number>>;

function MiniPad({ bits, onChange }: { bits: number; onChange: SetBits }) {
  const hold = (b: number, on: boolean) => onChange((was) => (on ? was | b : was & ~b));
  return (
    <div className="pg-minipad" aria-label="The controller">
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
          {name}
        </button>
      ))}
    </div>
  );
}

export function Station({
  id,
  eyebrow,
  title,
  words,
  record,
  children,
}: {
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
          <p className="pg-record-h">Go deeper: the engineers&rsquo; record</p>
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
