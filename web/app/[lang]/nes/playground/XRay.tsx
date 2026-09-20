"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Shape } from "./engine";
import { BIT, BUTTONS, token } from "./Playground";
import { xrayWords } from "./ui.xray";
import { ui } from "./ui";
import type { Lang } from "@/lib/lang";

/**
 * Your own game, x-rayed: the reader plays their own cartridge while the
 * page writes down the pad byte of every frame, exactly as the bench's
 * script does; then that recording is replayed twice from power on, the
 * second run handed one extra tap at one frame, and everything the two
 * differ by afterwards is that tap's doing.
 *
 * What it can say is what the bench can say: which frame the pictures
 * first differ at, where on the screen, how long it lasts, and whether
 * they ever agree again. What the engineers' own x-ray says as well (the
 * instruction that diverged, the path through the code) is not in this
 * bundle, and the report says so rather than implying it.
 *
 * The cartridge is read in this browser and goes nowhere else.
 */

type Outcome<A> = { id: number; ok: true; answer: A } | { id: number; ok: false; error: string };
interface Solo {
  left: Uint8Array;
}
interface Report {
  apart: Uint32Array;
  firstAt: number;
  lastAt: number;
  worstAt: number;
  box: [number, number, number, number] | null;
  left: Uint8Array | null;
  right: Uint8Array | null;
  ms: number;
}

/** How long a recording may run, and how long both runs go on after the tap. */
const MOST = 1800;
const TAIL = 150;

/** The report's cells: the keys it writes by, in their order. */
const CELLS = ["tap", "first", "gap", "dots", "worst", "rejoin"] as const;

export function XRay({ lang, shape, palette, framePeriodMs }: { lang: Lang; shape: Shape; palette: [number, number, number][] | null; framePeriodMs: number }) {
  const U = xrayWords(lang);
  const KEYS = ui(lang).padStation.names;
  const [name, setName] = useState<string | null>(null);
  const [frames, setFrames] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [button, setButton] = useState<(typeof BUTTONS)[number]>("a");
  const [held, setHeld] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const script = useRef<number[]>([]);
  const heldRef = useRef(0);
  const screen = useRef<HTMLCanvasElement>(null);
  const worst = useRef<HTMLCanvasElement>(null);
  const bars = useRef<HTMLCanvasElement>(null);
  const cells = useRef<HTMLDListElement>(null);
  const nextId = useRef(1);
  // The recording loop reads the held buttons outside render, from here.
  useEffect(() => {
    heldRef.current = held;
  }, [held]);

  useEffect(() => {
    worker.current = new Worker("/nes/twin.worker.mjs", { type: "module" });
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  const ask = useCallback(<A,>(msg: Record<string, unknown>, transfer: Transferable[] = []) => {
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
      w.postMessage({ id, ...msg }, transfer);
    });
  }, []);

  const paint = useCallback(
    (c: HTMLCanvasElement | null, plane: Uint8Array, mark?: Uint8Array) => {
      if (!c || !palette) return;
      const W = shape.pictureW;
      const H = shape.pictureH;
      if (c.width !== W) {
        c.width = W;
        c.height = H;
      }
      const ctx = c.getContext("2d")!;
      const img = ctx.createImageData(W, H);
      const hot = token("--color-mustard");
      const n = parseInt(hot.slice(1), 16);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = y * shape.dots + shape.pictureX + x;
          const i = (y * W + x) * 4;
          const differs = mark && mark[p] !== plane[p];
          const [r, g, b] = differs ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : palette[plane[p] & 63];
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [palette, shape],
  );

  const load = async (file: File) => {
    setError(null);
    setReport(null);
    setPlaying(false);
    script.current = [];
    setFrames(0);
    try {
      await ask({ path: "load", rom: await file.arrayBuffer() }, []);
      setName(file.name);
      setPlaying(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setName(null);
    }
  };

  // Playing: one console, and the pad byte of every frame written down.
  useEffect(() => {
    if (!playing || !name) return;
    let live = true;
    let busyFrame = false;
    const t = setInterval(async () => {
      if (!live || busyFrame || script.current.length >= MOST) return;
      busyFrame = true;
      try {
        const pad = heldRef.current;
        const out = await ask<Solo>({ path: "solo", pad });
        script.current.push(pad);
        setFrames(script.current.length);
        paint(screen.current, out.left);
      } catch (e) {
        setError(String((e as Error).message ?? e));
        setPlaying(false);
      } finally {
        busyFrame = false;
      }
    }, framePeriodMs);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [playing, name, ask, paint, framePeriodMs]);

  const xray = async () => {
    if (!name || busy) return;
    setBusy(true);
    setPlaying(false);
    setError(null);
    const at = Math.max(0, script.current.length - 1);
    const full = new Uint8Array(script.current.length + TAIL);
    full.set(script.current);
    try {
      const r = await ask<Report>({ path: "xray", script: full, at, extra: BIT[button], dots: shape.dots });
      setReport(r);
      const cl = cells.current;
      const put = (k: string, v: string) => {
        const el = cl?.querySelector<HTMLElement>(`[data-k="${k}"]`);
        if (el && el.textContent !== v) el.textContent = v;
      };
      const apart = r.apart;
      put("tap", U.tapAt(button.toUpperCase(), at.toLocaleString("en")));
      put("first", r.firstAt >= 0 ? r.firstAt.toLocaleString("en") : U.never);
      put("gap", r.firstAt >= 0 ? String(r.firstAt - at) : U.none);
      put("dots", r.firstAt >= 0 ? apart[r.firstAt].toLocaleString("en") : U.none);
      put("worst", r.worstAt >= 0 ? U.worstAt(apart[r.worstAt].toLocaleString("en"), r.worstAt.toLocaleString("en")) : U.none);
      put(
        "rejoin",
        r.firstAt < 0 ? U.neverDiffered : r.lastAt >= full.length - 1 ? U.notInThese : U.atFrame((r.lastAt + 1).toLocaleString("en")),
      );
      if (r.left && r.right) paint(worst.current, r.right, r.left);
      // The frames, as bars: what differed, frame by frame.
      const c = bars.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const W = c.clientWidth;
        const H = 70;
        c.width = W * dpr;
        c.height = H * dpr;
        const ctx = c.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = token("--color-panel-sunk");
        ctx.fillRect(0, 0, W, H);
        let top = 1;
        for (const v of apart) top = Math.max(top, v);
        const bw = W / apart.length;
        ctx.fillStyle = token("--color-burnt");
        ctx.fillRect(at * bw, 0, Math.max(2, bw), H);
        ctx.fillStyle = token("--color-mustard");
        for (let f = 0; f < apart.length; f++) {
          if (!apart[f]) continue;
          const h = (Math.log1p(apart[f]) / Math.log1p(top)) * (H - 4);
          ctx.fillRect(f * bw, H - h, Math.max(1, bw), h);
        }
      }
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const ready = !!name;
  return (
    <div className="pg-xray">
      <div className="pg-xray-top">
        <div className="pg-xray-play">
          <div className="pg-field" style={{ aspectRatio: `${shape.pictureW} / ${shape.pictureH}` }}>
            <canvas ref={screen} className="pg-canvas" aria-label={U.playing} />
            {!ready ? <p className="pg-waiting">{U.choose}</p> : null}
          </div>
          <div className="pg-row">
            <label className="pg-btn pg-file">
              {U.yourOwn}
              <input type="file" accept=".nes" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
            </label>
            <button className="pg-btn" onClick={() => setPlaying((p) => !p)} disabled={!ready || busy}>
              {playing ? U.pause : U.play}
            </button>
            <span className="pg-note">
              {name ? U.recorded(name, frames.toLocaleString("en")) : U.onlySimple}
            </span>
          </div>
          <div className="pg-minipad">
            {BUTTONS.map((b) => (
              <button key={b} className="pg-padkey" aria-pressed={(held & BIT[b]) !== 0} onClick={() => setHeld((h) => h ^ BIT[b])}>
                {KEYS[b]}
              </button>
            ))}
          </div>
          <div className="pg-row">
            <label className="pg-label" htmlFor="pg-xray-button">{U.xrayOf}</label>
            <select id="pg-xray-button" className="pg-select" value={button} onChange={(e) => setButton(e.target.value as (typeof BUTTONS)[number])}>
              {BUTTONS.map((b) => (
                <option key={b} value={b}>{KEYS[b]}</option>
              ))}
            </select>
            <button className="pg-btn pg-btn-hot" onClick={xray} disabled={!ready || busy || frames < 2}>
              {busy ? U.running : U.doIt}
            </button>
          </div>
          <p className="pg-note pg-xray-note">
            {error ? (
              <span className="pg-error">{error}</span>
            ) : (
              U.how
            )}
          </p>
        </div>

        <div className="pg-xray-report">
          <p className="pg-record-h">{U.report}</p>
          <dl ref={cells} className="pg-console pg-console-3">
            {CELLS.map((k) => (
              <div key={k}>
                <dt>{U.cells[k]}</dt>
                <dd data-k={k}>·</dd>
              </div>
            ))}
          </dl>
          <p className="pg-shift-h">{U.apartHeading}</p>
          <canvas ref={bars} className="pg-trace" style={{ height: 70 }} aria-label={U.apartTrace} />
          <figure className="pg-xray-worst">
            <div className="pg-field" style={{ aspectRatio: `${shape.pictureW} / ${shape.pictureH}` }}>
              <canvas ref={worst} className="pg-canvas" aria-label={U.worstPicture} />
            </div>
            <figcaption>
              {report && report.worstAt >= 0 ? U.worstCaption : U.worstEmpty}
            </figcaption>
          </figure>
          <p className="pg-note">{U.limits}</p>
        </div>
      </div>
    </div>
  );
}
