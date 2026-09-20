"use client";

import { useEffect, useRef, useState } from "react";
import { token } from "./Playground";
import { slowWords } from "./ui.slow";
import type { Lang } from "@/lib/lang";

/**
 * The slow chip: the engineers' switch-level 2C02 running in a worker
 * (public/nes/slowppu.worker.mjs), drawing their standard test scene dot
 * by dot at whatever pace the transistors manage in this browser, beside
 * their fast chip's finished frame of the same scene. Every dot the slow
 * chip presents is held to the fast chip's: the alignment between the
 * two is fitted from the dots (the engineers pinned theirs the same way,
 * from a fit), and the counts are printed as they grow.
 *
 * The console's cells are fixed: labels never move, values change in
 * place, and what they are called is in ui.slow.ts, both languages. The lamps are the chip's own nodes; the counters' values are
 * read off their lamps, bit by bit.
 */

type Outcome<A> = { id: number; ok: true; answer: A } | { id: number; ok: false; error: string };
interface Hello {
  size: [number, number];
  geometry: [number, number, number, number];
  lampNames: string[];
  lamps: number[];
  halfSteps: number;
  fast: Uint8Array;
}
interface Run {
  dots: Uint32Array;
  steps: number;
  ms: number;
  lamps: number[];
  halfSteps: number;
}

/** The cells, in the order they are shown; their labels are in ui.slow.ts. */
const CELLS = ["line", "dot", "drawn", "agree", "differ", "align", "rate", "slower", "switched"] as const;

/** Offsets the fit tries: how many dots later the slow chip presents a pixel. */
const OFFSETS = 8;
const HEART = 682;

export function SlowChip({ lang, palette, framePeriodMs }: { lang: Lang; palette: [number, number, number][] | null; framePeriodMs: number }) {
  const U = slowWords(lang);
  const [hello, setHello] = useState<Hello | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [lamps, setLamps] = useState<number[]>([]);
  const slowCanvas = useRef<HTMLCanvasElement>(null);
  const fastCanvas = useRef<HTMLCanvasElement>(null);
  const heart = useRef<HTMLCanvasElement>(null);
  const cells = useRef<HTMLDListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const state = useRef({
    plane: null as Uint8Array | null,
    seen: null as Uint8Array | null,
    agree: new Float64Array(OFFSETS),
    compared: new Float64Array(OFFSETS),
    beats: new Uint16Array(HEART),
    beatAt: 0,
    drawn: 0,
    dotsTimed: 0,
    msTimed: 0,
    last: [0, 0] as [number, number],
    lastSwitched: 0,
  });

  // The worker, once, asked for its chip when the station first nears the screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let started = false;
    const io = new IntersectionObserver((seen) => {
      if (started || !seen.some((s) => s.isIntersecting)) return;
      started = true;
      const w = new Worker("/nes/slowppu.worker.mjs", { type: "module" });
      worker.current = w;
      w.onmessage = (e: MessageEvent<Outcome<Hello>>) => {
        if (e.data.id !== 0) return;
        if (!e.data.ok) {
          setError(e.data.error);
          return;
        }
        const h = e.data.answer;
        const [dots, lines] = h.geometry;
        state.current.plane = new Uint8Array(dots * lines);
        state.current.seen = new Uint8Array(dots * lines);
        setHello(h);
        setLamps(h.lamps);
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
      };
      w.onerror = () => setError(U.noBundle);
      w.postMessage({ id: 0, path: "hello" });
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => {
      io.disconnect();
      worker.current?.terminate();
      worker.current = null;
    };
  }, [U]);

  // The fast chip's frame, painted once the colours are known.
  useEffect(() => {
    const c = fastCanvas.current;
    if (!c || !hello || !palette) return;
    const [dots, , ad, ar] = hello.geometry;
    c.width = ad;
    c.height = ar;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(ad, ar);
    for (let r = 0; r < ar; r++) {
      for (let x = 0; x < ad; x++) {
        const [R, G, B] = palette[hello.fast[r * dots + x + 1] & 63];
        const i = (r * ad + x) * 4;
        img.data[i] = R;
        img.data[i + 1] = G;
        img.data[i + 2] = B;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [hello, palette]);

  // The run loop: ask for a batch, take what came back, ask again.
  useEffect(() => {
    const w = worker.current;
    if (!playing || !w || !hello) return;
    let live = true;
    let id = 1;
    const [dots, , ad, ar] = hello.geometry;
    const S = state.current;
    const onRun = (e: MessageEvent<Outcome<Run>>) => {
      if (!live || e.data.id === 0) return;
      if (!e.data.ok) {
        setError(e.data.error);
        return;
      }
      const a = e.data.answer;
      const d = a.dots;
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i];
        const h = d[i + 1];
        const colour = d[i + 2];
        S.beats[S.beatAt] = d[i + 3];
        S.beatAt = (S.beatAt + 1) % HEART;
        S.last = [v, h];
        S.lastSwitched = d[i + 3];
        if (v >= ar) continue;
        const cell = v * dots + h + 1;
        if (h + 1 >= dots) continue;
        S.plane![cell] = colour;
        S.seen![cell] = 1;
        S.drawn++;
        for (let k = 0; k < OFFSETS; k++) {
          const fd = h + 1 - k;
          if (fd < 1 || fd > ad) continue;
          S.compared[k]++;
          if (hello.fast[v * dots + fd] === colour) S.agree[k]++;
        }
      }
      S.dotsTimed += d.length / 4;
      S.msTimed += a.ms;
      setLamps(a.lamps);
      paint();
      w.postMessage({ id: ++id, path: "run", budgetMs: 40 });
    };
    const paint = () => {
      // The best alignment so far: the offset under which the most dots agree.
      let k = 0;
      for (let j = 1; j < OFFSETS; j++) if (S.agree[j] > S.agree[k]) k = j;
      const c = slowCanvas.current;
      if (c && palette && S.plane && S.seen) {
        if (c.width !== ad) {
          c.width = ad;
          c.height = ar;
        }
        const ctx = c.getContext("2d")!;
        const img = ctx.createImageData(ad, ar);
        const n = parseInt(token("--color-panel-sunk").slice(1), 16);
        const [br, bg, bb] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        for (let r = 0; r < ar; r++) {
          for (let x = 0; x < ad; x++) {
            const cell = r * dots + x + 1 + k;
            const i = (r * ad + x) * 4;
            if (cell < S.seen.length && S.seen[cell]) {
              const [R, G, B] = palette[S.plane[cell] & 63];
              img.data[i] = R;
              img.data[i + 1] = G;
              img.data[i + 2] = B;
            } else {
              img.data[i] = br;
              img.data[i + 1] = bg;
              img.data[i + 2] = bb;
            }
            img.data[i + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        // Where the chip is: a bright mark at its own counters.
        const [v, h] = S.last;
        if (v < ar) {
          ctx.fillStyle = token("--color-mustard");
          ctx.fillRect(Math.max(0, h - k), v, 3, 1);
        }
      }
      const hb = heart.current;
      if (hb) {
        const dpr = window.devicePixelRatio || 1;
        const W = hb.clientWidth;
        const H = 64;
        if (hb.width !== W * dpr) {
          hb.width = W * dpr;
          hb.height = H * dpr;
        }
        const ctx = hb.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = token("--color-panel-sunk");
        ctx.fillRect(0, 0, W, H);
        let max = 1;
        for (const b of S.beats) max = Math.max(max, b);
        ctx.fillStyle = token("--color-ocean");
        for (let j = 0; j < HEART; j++) {
          const b = S.beats[(S.beatAt + j) % HEART];
          const bh = (b / max) * (H - 4);
          ctx.fillRect((j / HEART) * W, H - bh, Math.max(1, W / HEART), bh);
        }
      }
      const cl = cells.current;
      if (cl) {
        const put = (key: string, v: string) => {
          const el = cl.querySelector<HTMLElement>(`[data-k="${key}"]`);
          if (el && el.textContent !== v) el.textContent = v;
        };
        const perSecond = S.msTimed ? (S.dotsTimed * 1000) / S.msTimed : 0;
        const realPerSecond = (hello.geometry[0] * hello.geometry[1] * 1000) / framePeriodMs;
        put("line", String(S.last[0]));
        put("dot", String(S.last[1]));
        put("drawn", S.drawn.toLocaleString("en"));
        put("agree", S.agree[k].toLocaleString("en"));
        put("differ", (S.compared[k] - S.agree[k]).toLocaleString("en"));
        put("align", S.compared[k] ? U.dots(k) : "·");
        put("rate", perSecond ? Math.round(perSecond).toLocaleString("en") : "·");
        put("slower", perSecond ? `${Math.round(realPerSecond / perSecond).toLocaleString("en")}×` : "·");
        put("switched", S.lastSwitched.toLocaleString("en"));
      }
    };
    w.addEventListener("message", onRun as EventListener);
    w.postMessage({ id: ++id, path: "run", budgetMs: 40 });
    return () => {
      live = false;
      w.removeEventListener("message", onRun as EventListener);
    };
  }, [playing, hello, palette, framePeriodMs, U]);

  const named = (prefix: string) =>
    hello ? hello.lampNames.map((n, i) => [n, i] as const).filter(([n]) => n.startsWith(prefix)) : [];
  const valueOf = (prefix: string) => named(prefix).reduce((acc, [, i], bit) => acc | ((lamps[i] ?? 0) << bit), 0);

  return (
    <div className="pg-slow" ref={root}>
      {error ? <p className="pg-error">{U.failed(error)}</p> : null}
      <div className="pg-slow-pair">
        <figure className="pg-slow-fig">
          <canvas ref={slowCanvas} className="pg-slow-canvas" aria-label={U.slowPicture} />
          <figcaption>{U.slowCaption}</figcaption>
        </figure>
        <figure className="pg-slow-fig">
          <canvas ref={fastCanvas} className="pg-slow-canvas" aria-label={U.fastPicture} />
          <figcaption>{U.fastCaption}</figcaption>
        </figure>
      </div>

      <div className="pg-row">
        <button className="pg-btn" onClick={() => setPlaying((p) => !p)} disabled={!hello}>
          {playing ? U.pause : U.run}
        </button>
        <p className="pg-note pg-size">
          {hello ? U.size(hello.size[0].toLocaleString("en"), hello.size[1].toLocaleString("en")) : U.waking}
        </p>
      </div>

      <dl ref={cells} className="pg-console pg-console-3">
        {CELLS.map((k) => (
          <div key={k}>
            <dt>{U.cells[k]}</dt>
            <dd data-k={k}>·</dd>
          </div>
        ))}
      </dl>

      <div className="pg-lamps" aria-label={U.lamps}>
        {[
          ["hpos", U.hpos],
          ["vpos", U.vpos],
          ["pal_d", U.palD],
        ].map(([prefix, label]) => (
          <div key={prefix} className="pg-lamp-row">
            <span className="pg-lamp-label">{label}</span>
            <span className="pg-lamp-set">
              {named(prefix)
                .slice()
                .reverse()
                .map(([n, i]) => (
                  <span key={n} className="pg-lamp" data-on={lamps[i] === 1} title={n} />
                ))}
            </span>
            <span className="pg-lamp-value">
              {!hello ? "·" : prefix === "pal_d" ? `$${valueOf(prefix).toString(16).padStart(2, "0")}` : valueOf(prefix)}
            </span>
          </div>
        ))}
        <div className="pg-lamp-row">
          <span className="pg-lamp-label">{U.clocks}</span>
          <span className="pg-lamp-set">
            {hello
              ? hello.lampNames.map((n, i) =>
                  /^(clk0|pclk0|pclk1|ale|rd)$/.test(n) ? (
                    <span key={n} className="pg-lamp-named">
                      <span className="pg-lamp" data-on={lamps[i] === 1} />
                      {n}
                    </span>
                  ) : null,
                )
              : null}
          </span>
          <span className="pg-lamp-value" />
        </div>
      </div>

      <div>
        <p className="pg-shift-h">{U.heart}</p>
        <canvas ref={heart} className="pg-trace" style={{ height: 64 }} aria-label={U.heartPicture} />
      </div>
    </div>
  );
}
