"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { token } from "./Playground";

/**
 * The die, lit: the picture chip's own shapes, from the photographs of
 * its silicon that the die data carries (served as /nes/slow/geometry.bin
 * beside the chip's bundle, never committed), with every wire lit while
 * the switch-level chip runs in the page.
 *
 * Drawn once into two pictures the size of the view: the dim one, each
 * shape in its layer's colour, and a map of which node owns each pixel.
 * After that a frame is one pass over the pixels, so the die can be lit
 * from the chip's levels several times a second, and the pointer can
 * name the wire under it by looking in the same map.
 */

type Outcome<A> = { id: number; ok: true; answer: A } | { id: number; ok: false; error: string };
interface Run {
  levels: Uint8Array | null;
  halfSteps: number;
  steps: number;
  ms: number;
}

/** The die data's layers, in its own order. */
const LAYERS: { name: string; token: string }[] = [
  { name: "metal", token: "--color-chrome-lo" },
  { name: "diffusion", token: "--color-ocean-ink" },
  { name: "diffusion", token: "--color-ocean-ink" },
  { name: "diffusion, to ground", token: "--color-forest-ink" },
  { name: "diffusion, to the supply", token: "--color-burnt-ink" },
  { name: "polysilicon", token: "--color-mustard-ink" },
];

const SIZE = 820;

const CELLS = [
  ["wire", "The wire under the pointer"],
  ["level", "Its level"],
  ["lit", "Wires high now"],
  ["steps", "Half-steps run"],
] as const;

function rgbOf(css: string): [number, number, number] {
  const n = parseInt(css.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function Die() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cells = useRef<HTMLDListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const art = useRef<{ base: ImageData; nodes: Uint16Array; w: number; h: number } | null>(null);
  const names = useRef<Map<number, string>>(new Map());
  const levels = useRef<Uint8Array | null>(null);
  const hover = useRef<number | null>(null);
  const nextId = useRef(1);

  const ask = useCallback(<A,>(msg: Record<string, unknown>) => {
    const w = worker.current;
    if (!w) return Promise.reject(new Error("no worker"));
    const id = nextId.current++;
    return new Promise<A>((resolve, reject) => {
      const on = (e: MessageEvent<Outcome<A>>) => {
        if (e.data.id !== id) return;
        w.removeEventListener("message", on as EventListener);
        if (e.data.ok) resolve(e.data.answer);
        else reject(new Error(e.data.error));
      };
      w.addEventListener("message", on as EventListener);
      w.postMessage({ id, ...msg });
    });
  }, []);

  /** The two pictures, drawn once from the die's shapes. */
  const draw = useCallback(async () => {
    const res = await fetch("/nes/slow/geometry.bin");
    if (!res.ok) throw new Error(`the die's shapes answered ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const view = new DataView(buf.buffer);
    if (String.fromCharCode(...buf.subarray(0, 4)) !== "DIE1") throw new Error("the die's shapes are not in the shape this page reads");
    const count = view.getUint32(4, true);
    const dieW = view.getUint16(8, true);
    const dieH = view.getUint16(10, true);
    const scale = SIZE / Math.max(dieW, dieH);
    const w = Math.round(dieW * scale);
    const h = Math.round(dieH * scale);
    const paint = document.createElement("canvas");
    paint.width = w;
    paint.height = h;
    const pc = paint.getContext("2d", { willReadFrequently: true })!;
    const map = document.createElement("canvas");
    map.width = w;
    map.height = h;
    const mc = map.getContext("2d", { willReadFrequently: true })!;
    pc.fillStyle = token("--color-panel-sunk");
    pc.fillRect(0, 0, w, h);
    mc.fillStyle = "#000000";
    mc.fillRect(0, 0, w, h);
    const colours = LAYERS.map((l) => token(l.token));
    let at = 12;
    for (let i = 0; i < count; i++) {
      const node = view.getUint16(at, true);
      const layer = buf[at + 2];
      const pts = view.getUint16(at + 3, true);
      at += 5;
      const path = new Path2D();
      for (let p = 0; p < pts; p++) {
        // The die's y runs up the photograph; the page's runs down.
        const x = view.getUint16(at + p * 4, true) * scale;
        const y = h - view.getUint16(at + p * 4 + 2, true) * scale;
        if (p === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      at += pts * 4;
      path.closePath();
      pc.fillStyle = colours[layer] ?? colours[0];
      pc.fill(path);
      // The map: the node's number as a colour, so a pixel names its wire.
      mc.fillStyle = `rgb(${node & 255},${(node >> 8) & 255},255)`;
      mc.fill(path);
    }
    const base = pc.getImageData(0, 0, w, h);
    const raw = mc.getImageData(0, 0, w, h).data;
    const nodes = new Uint16Array(w * h);
    for (let i = 0; i < nodes.length; i++) {
      if (raw[i * 4 + 2] > 128) nodes[i] = raw[i * 4] | (raw[i * 4 + 1] << 8);
    }
    art.current = { base, nodes, w, h };
  }, []);

  /** One painting: the dim die, with every high node's pixels lit. */
  const paint = useCallback(() => {
    const a = art.current;
    const c = canvas.current;
    const lv = levels.current;
    if (!a || !c) return;
    if (c.width !== a.w) {
      c.width = a.w;
      c.height = a.h;
    }
    const ctx = c.getContext("2d")!;
    const out = ctx.createImageData(a.w, a.h);
    out.data.set(a.base.data);
    const [hr, hg, hb] = rgbOf(token("--color-mustard"));
    const [sr, sg, sb] = rgbOf(token("--color-glass"));
    const pinned = hover.current;
    let lit = 0;
    const seen = new Uint8Array(lv ? lv.length : 0);
    for (let i = 0; i < a.nodes.length; i++) {
      const n = a.nodes[i];
      if (!n) continue;
      const high = lv && n < lv.length && lv[n] === 1;
      if (high && !seen[n]) {
        seen[n] = 1;
        lit++;
      }
      if (n === pinned) {
        out.data[i * 4] = sr;
        out.data[i * 4 + 1] = sg;
        out.data[i * 4 + 2] = sb;
      } else if (high) {
        out.data[i * 4] = hr;
        out.data[i * 4 + 1] = hg;
        out.data[i * 4 + 2] = hb;
      }
    }
    ctx.putImageData(out, 0, 0);
    const cl = cells.current;
    if (cl) {
      const put = (k: string, v: string) => {
        const el = cl.querySelector<HTMLElement>(`[data-k="${k}"]`);
        if (el && el.textContent !== v) el.textContent = v;
      };
      put("lit", lv ? lit.toLocaleString("en") : "·");
      put("wire", pinned ? (names.current.get(pinned) ?? `${pinned}, unnamed`) : "·");
      put("level", pinned && lv ? (lv[pinned] === 1 ? "high" : "low") : "·");
    }
  }, []);

  // The die's shapes, the chip's names, and its worker, once the station nears.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let started = false;
    const io = new IntersectionObserver(
      (seen) => {
        if (started || !seen.some((s) => s.isIntersecting)) return;
        started = true;
        worker.current = new Worker("/nes/slowppu.worker.mjs", { type: "module" });
        (async () => {
          try {
            await draw();
            const n = await ask<{ names: string }>({ path: "names" });
            for (const line of n.names.split("\n")) {
              const [id, ...rest] = line.split(" ");
              if (rest.length) names.current.set(Number(id), rest.join(" "));
            }
            const first = await ask<Run>({ path: "run", budgetMs: 5, levels: true });
            levels.current = first.levels;
            setReady(true);
            paint();
            if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
          } catch (e) {
            setError(String((e as Error).message ?? e));
          }
        })();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      worker.current?.terminate();
      worker.current = null;
    };
  }, [ask, draw, paint]);

  // Running: a slice of the chip, then the die lit from its levels.
  useEffect(() => {
    if (!playing || !ready) return;
    let live = true;
    let busy = false;
    const t = setInterval(async () => {
      if (!live || busy) return;
      busy = true;
      try {
        const r = await ask<Run>({ path: "run", budgetMs: 60, levels: true });
        if (!live) return;
        levels.current = r.levels;
        const cl = cells.current?.querySelector<HTMLElement>('[data-k="steps"]');
        if (cl) cl.textContent = Math.round(r.halfSteps).toLocaleString("en");
        paint();
      } catch (e) {
        setError(String((e as Error).message ?? e));
      } finally {
        busy = false;
      }
    }, 120);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [playing, ready, ask, paint]);

  const probe = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = art.current;
    if (!a) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * a.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * a.h);
    const n = a.nodes[y * a.w + x] || null;
    if (n !== hover.current) {
      hover.current = n;
      paint();
    }
  };

  return (
    <div className="pg-die" ref={root}>
      <div className="pg-die-stage">
        <canvas ref={canvas} className="pg-die-canvas" onPointerMove={probe} aria-label="The picture chip's die, its wires lit as the chip runs" />
        {!ready ? <p className="pg-waiting">{error ? `The die could not be drawn: ${error}.` : "Drawing the die's shapes..."}</p> : null}
      </div>
      <div className="pg-row">
        <button className="pg-btn" onClick={() => setPlaying((p) => !p)} disabled={!ready}>
          {playing ? "Pause the chip" : "Run the chip"}
        </button>
        <ul className="pg-die-key">
          {LAYERS.filter((l, i) => LAYERS.findIndex((o) => o.name === l.name) === i).map((l) => (
            <li key={l.name}>
              <span className="pg-key" style={{ background: `var(${l.token})` }} aria-hidden="true" />
              {l.name}
            </li>
          ))}
          <li>
            <span className="pg-key" style={{ background: "var(--color-mustard)" }} aria-hidden="true" />
            high right now
          </li>
        </ul>
      </div>
      <dl ref={cells} className="pg-console pg-console-4">
        {CELLS.map(([k, label]) => (
          <div key={k}>
            <dt>{label}</dt>
            <dd data-k={k}>·</dd>
          </div>
        ))}
      </dl>
      {error && ready ? <p className="pg-error">{error}</p> : null}
    </div>
  );
}
