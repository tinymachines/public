"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shape } from "./engine";
import type { Step, Taps, Xray } from "./xray";
import { BIT, BUTTONS, token } from "./Playground";
import { twinsWords } from "./ui.twins";
import { ui } from "./ui";
import type { Lang } from "@/lib/lang";
import { ShelfPicker } from "@/app/components/ShelfPicker";

/**
 * Spot the difference: two consoles (public/nes/twin.worker.mjs) built
 * from one cartridge and fed the same buttons, one of them handed a
 * single extra tap. Every dot on which their pictures differ is the
 * tap's doing, and the frame they agree again is when its effect ended,
 * or they never do. Beside it, the engineers' x-ray of the same kind of
 * tap on their own pad cartridge, followed bit by bit, and their two
 * taps on Super Mario Bros., both read from their documents (xray.ts).
 *
 * The console's cells are fixed: labels never move, values change in
 * place.
 */

type Outcome<A> = { id: number; ok: true; answer: A } | { id: number; ok: false; error: string };
interface StepAnswer {
  left: Uint8Array;
  right: Uint8Array;
  differ: number;
}

const CARTS = [
  { url: "/nes/cal.nes", key: "cal" },
  { url: "/nes/bars.nes", key: "bars" },
  { url: "/nes/pad.nes", key: "pad" },
] as const;

const PACES = [
  { id: "two", ms: 500 },
  { id: "ten", ms: 100 },
  { id: "real", ms: 0 },
] as const;

/** The console's cells: the keys the readout writes by, in their order. */
const CELLS = ["frame", "since", "now", "most", "first", "again"] as const;

/** The calibration strip's fields a tap reaches, the rest unnamed. */
const FIELDS = ["pad", "parity"] as const;
type FieldName = (typeof FIELDS)[number];

interface Field {
  row: number;
  col: number;
  bits: number;
  name: string;
}
interface Strip {
  x0: number;
  y0: number;
  block: number;
  rows: number;
  fields: Field[];
}

/** The rows of the picture a panel shows: all of them, or the strip and a block's margin. */
interface View {
  top: number;
  rows: number;
}

const HISTORY = 120;

interface Tally {
  frame: number;
  tapAt: number;
  most: number;
  firstApart: number;
  againAt: number;
  history: Float64Array;
  tapMarks: Int32Array;
}

/** One console's picture: the visible dots of its plane, in the measured colours. */
function paintPicture(c: HTMLCanvasElement | null, plane: Uint8Array, palette: [number, number, number][] | null, shape: Shape, view: View) {
  if (!c || !palette) return;
  const W = shape.pictureW;
  const H = view.rows;
  if (c.width !== W) {
    c.width = W;
    c.height = H;
  }
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = palette[plane[(y + view.top) * shape.dots + shape.pictureX + x] & 63];
      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** The last frames' differences as bars, the taps marked. */
function drawTimeline(c: HTMLCanvasElement | null, s: Tally) {
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth;
  const H = 56;
  if (c.width !== W * dpr) {
    c.width = W * dpr;
    c.height = H * dpr;
  }
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = token("--color-panel-sunk");
  ctx.fillRect(0, 0, W, H);
  const top = Math.log1p(Math.max(1, ...s.history));
  const bw = W / HISTORY;
  for (let j = 0; j < HISTORY; j++) {
    if (s.tapMarks[j] > 0) {
      ctx.fillStyle = token("--color-burnt");
      ctx.fillRect(j * bw, 0, Math.max(2, bw), H);
    }
    const v = s.history[j];
    if (v > 0) {
      const h = (Math.log1p(v) / top) * (H - 6);
      ctx.fillStyle = token("--color-mustard");
      ctx.fillRect(j * bw + 1, H - h, Math.max(1, bw - 2), h);
    }
  }
}

/** The console's cells, each written in place. */
function writeCells(cl: HTMLDListElement | null, s: Tally, now: number, notYet: string) {
  if (!cl) return;
  const put = (key: string, v: string) => {
    const el = cl.querySelector<HTMLElement>(`[data-k="${key}"]`);
    if (el && el.textContent !== v) el.textContent = v;
  };
  put("frame", s.frame.toLocaleString("en"));
  put("since", s.tapAt >= 0 ? String(s.frame - s.tapAt) : "·");
  put("now", now.toLocaleString("en"));
  put("most", s.tapAt >= 0 ? s.most.toLocaleString("en") : "·");
  put("first", s.firstApart >= 0 ? s.firstApart.toLocaleString("en") : s.tapAt >= 0 ? notYet : "·");
  put("again", s.againAt >= 0 ? s.againAt.toLocaleString("en") : s.firstApart >= 0 ? notYet : "·");
}

export function Twins({
  lang,
  shape,
  palette,
  framePeriodMs,
  xray,
  taps,
}: {
  lang: Lang;
  shape: Shape;
  palette: [number, number, number][] | null;
  framePeriodMs: number;
  xray: Xray;
  taps: Taps;
}) {
  const U = twinsWords(lang);
  const KEYS = ui(lang).padStation.names;
  const [cart, setCart] = useState<string>(CARTS[0].url);
  const [own, setOwn] = useState<string | null>(null);
  const [pace, setPace] = useState<(typeof PACES)[number]["id"]>("ten");
  const [running, setRunning] = useState(false);
  const [button, setButton] = useState<(typeof BUTTONS)[number]>("a");
  const [held, setHeld] = useState(0);
  const [strip, setStrip] = useState<Strip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const worker = useRef<Worker | null>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const right = useRef<HTMLCanvasElement>(null);
  const where = useRef<HTMLCanvasElement>(null);
  const timeline = useRef<HTMLCanvasElement>(null);
  const cells = useRef<HTMLDListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const S = useRef({
    frame: 0,
    tapAt: -1,
    pendingTap: 0,
    most: 0,
    firstApart: -1,
    againAt: -1,
    history: new Float64Array(HISTORY),
    tapMarks: new Int32Array(HISTORY).fill(-1),
    heat: null as Float32Array | null,
    busy: false,
    last: 0,
  });

  // The worker, when the station first nears the screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver((seen) => {
      if (worker.current || !seen.some((s) => s.isIntersecting)) return;
      worker.current = new Worker("/nes/twin.worker.mjs", { type: "module" });
      setReady(true);
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => {
      io.disconnect();
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  // The calibration strip's layout, the cartridge's own file.
  useEffect(() => {
    fetch("/nes/cal.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.strip && setStrip(j.strip))
      .catch(() => {});
  }, []);

  const ask = useCallback(<A,>(msg: Record<string, unknown>, transfer: Transferable[] = []) => {
    const w = worker.current;
    if (!w) return Promise.reject(new Error("no worker"));
    const id = Math.floor(Math.random() * 1e9);
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

  const reset = () => {
    const s = S.current;
    s.frame = 0;
    s.tapAt = -1;
    s.pendingTap = 0;
    s.most = 0;
    s.firstApart = -1;
    s.againAt = -1;
    s.history.fill(0);
    s.tapMarks.fill(-1);
    s.heat = null;
  };

  // A cartridge: both consoles from the same bytes, from power on.
  useEffect(() => {
    if (!ready || cart === "own") return;
    reset();
    ask({ path: "load", url: cart })
      .then(() => {
        setError(null);
        setRunning(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [ready, cart, ask]);

  const loadOwn = async (file: File) => {
    reset();
    setError(null);
    setOwn(file.name);
    setCart("own");
    try {
      await ask({ path: "load", rom: await file.arrayBuffer() });
      setRunning(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  // On the calibration cartridge the panels show its strip, large; on
  // anything else, the whole picture.
  const onStrip = cart === "/nes/cal.nes" && strip != null;
  const view: View = useMemo(
    () => (onStrip && strip ? { top: 0, rows: Math.min(shape.pictureH, strip.y0 + (strip.rows + 1) * strip.block) } : { top: 0, rows: shape.pictureH }),
    [onStrip, strip, shape.pictureH],
  );

  // One frame on both, drawn, counted.
  const step = useCallback(async () => {
    const s = S.current;
    if (s.busy || !worker.current) return;
    s.busy = true;
    const extra = s.pendingTap;
    s.pendingTap = 0;
    try {
      const a = await ask<StepAnswer>({ path: "step", pad: held, extra });
      s.frame += 1;
      if (extra) {
        s.tapAt = s.frame;
        s.most = 0;
        s.firstApart = -1;
        s.againAt = -1;
      }
      if (s.tapAt >= 0) {
        if (a.differ > 0 && s.firstApart < 0) s.firstApart = s.frame;
        if (a.differ > 0) s.againAt = -1;
        if (a.differ === 0 && s.firstApart >= 0 && s.againAt < 0) s.againAt = s.frame;
        s.most = Math.max(s.most, a.differ);
      }
      s.history.copyWithin(0, 1);
      s.history[HISTORY - 1] = a.differ;
      s.tapMarks.copyWithin(0, 1);
      s.tapMarks[HISTORY - 1] = extra ? 1 : -1;
      paintPicture(left.current, a.left, palette, shape, view);
      paintPicture(right.current, a.right, palette, shape, view);
      // Where they differ: every differing dot lit, fading over a second
      // or so, so a difference that lasts one frame can still be seen.
      const W = shape.pictureW;
      const H = view.rows;
      if (!s.heat || s.heat.length !== W * H) s.heat = new Float32Array(W * H);
      const fade = Math.pow(0.5, Math.max(framePeriodMs, PACES.find((p) => p.id === pace)!.ms) / 400);
      const c = where.current;
      if (c) {
        if (c.width !== W) {
          c.width = W;
          c.height = H;
        }
        const ctx = c.getContext("2d")!;
        const img = ctx.createImageData(W, H);
        const n = parseInt(token("--color-mustard").slice(1), 16);
        const [mr, mg, mb] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        const k = parseInt(token("--color-panel-sunk").slice(1), 16);
        const [kr, kg, kb] = [(k >> 16) & 255, (k >> 8) & 255, k & 255];
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const p = (y + view.top) * shape.dots + shape.pictureX + x;
            const j = y * W + x;
            s.heat[j] = a.left[p] !== a.right[p] ? 1 : s.heat[j] * fade;
            const t = s.heat[j];
            const i = j * 4;
            img.data[i] = kr + (mr - kr) * t;
            img.data[i + 1] = kg + (mg - kg) * t;
            img.data[i + 2] = kb + (mb - kb) * t;
            img.data[i + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      }
      drawTimeline(timeline.current, s);
      writeCells(cells.current, s, a.differ, U.notYet);
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setRunning(false);
    } finally {
      s.busy = false;
    }
  }, [ask, held, palette, shape, pace, framePeriodMs, view, U.notYet]);

  // The pace: a frame pair every so often, or as fast as they come.
  useEffect(() => {
    if (!running || !ready) return;
    const ms = PACES.find((p) => p.id === pace)!.ms || framePeriodMs;
    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - S.current.last >= ms) {
        S.current.last = t;
        step();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, ready, pace, framePeriodMs, step]);

  const tap = () => {
    S.current.pendingTap = BIT[button];
    if (!running) step();
  };

  const fieldBox = (f: Field) => {
    if (!strip) return null;
    const x = strip.x0 + f.col * strip.block;
    const y = strip.y0 + f.row * strip.block;
    return {
      left: `${(x / shape.pictureW) * 100}%`,
      top: `${((y - view.top) / view.rows) * 100}%`,
      width: `${((f.bits * strip.block) / shape.pictureW) * 100}%`,
      height: `${(strip.block / view.rows) * 100}%`,
    };
  };
  const named = (f: Field): FieldName | null =>
    (FIELDS as readonly string[]).includes(f.name) ? (f.name as FieldName) : null;
  const labelled = onStrip && strip ? strip.fields.filter((f) => named(f)) : [];

  const panel = (ref: React.RefObject<HTMLCanvasElement | null>, caption: string, label: string, marks: boolean) => (
    <figure className="pg-twin-fig">
      <div className="pg-twin-screen">
        <canvas ref={ref} className="pg-slow-canvas" style={{ aspectRatio: `${shape.pictureW} / ${view.rows}` }} aria-label={label} />
        {marks
          ? labelled.map((f) => (
              <span key={`${f.row}-${f.col}`} className="pg-twin-field" data-above={f.row === 0} style={fieldBox(f) ?? undefined}>
                <span>{U.fields[named(f)!]}</span>
              </span>
            ))
          : null}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );

  return (
    <div className="pg-twins" ref={root}>
      <div className="pg-twin-trio">
        {panel(left, U.panels.left, U.panels.leftPicture, true)}
        {panel(right, U.panels.right, U.panels.rightPicture, true)}
        {panel(where, U.panels.where, U.panels.wherePicture, false)}
      </div>

      <div className="pg-row">
        <label className="pg-label" htmlFor="pg-twin-button">{U.tapLabel}</label>
        <select id="pg-twin-button" className="pg-select" value={button} onChange={(e) => setButton(e.target.value as (typeof BUTTONS)[number])}>
          {BUTTONS.map((b) => (
            <option key={b} value={b}>{KEYS[b]}</option>
          ))}
        </select>
        <button className="pg-btn pg-btn-hot" onClick={tap} disabled={!ready}>
          {U.tapIt}
        </button>
        <button className="pg-btn" onClick={() => setRunning((r) => !r)} disabled={!ready}>
          {running ? U.pause : U.play}
        </button>
        <button className="pg-btn" onClick={() => step()} disabled={!ready || running}>
          {U.nextFrame}
        </button>
      </div>

      <div className="pg-seg pg-seg-3" role="radiogroup" aria-label={U.howFast}>
        {PACES.map((p) => (
          <button key={p.id} role="radio" aria-checked={pace === p.id} className="pg-segbtn" onClick={() => setPace(p.id)}>
            {U.paces[p.id]}
          </button>
        ))}
      </div>

      <dl ref={cells} className="pg-console pg-console-3">
        {CELLS.map((k) => (
          <div key={k}>
            <dt>{U.cells[k]}</dt>
            <dd data-k={k}>·</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="pg-shift-h">{U.apartHeading}</p>
        <canvas ref={timeline} className="pg-trace" style={{ height: 56 }} aria-label={U.apartTrace} />
      </div>

      <div className="pg-row">
        <label className="pg-label" htmlFor="pg-twin-cart">{U.cartridge}</label>
        <select id="pg-twin-cart" className="pg-select" value={cart} onChange={(e) => setCart(e.target.value)}>
          {CARTS.map((c) => (
            <option key={c.url} value={c.url}>{U.carts[c.key]}</option>
          ))}
          {own ? <option value="own">{own}</option> : null}
        </select>
        <label className="pg-btn pg-file">
          {U.yourOwn}
          <input type="file" accept=".nes" onChange={(e) => e.target.files?.[0] && loadOwn(e.target.files[0])} />
        </label>
        <ShelfPicker lang={lang} onPick={loadOwn} selectClass="pg-select" />
      </div>
      <div className="pg-row">
        <span className="pg-label">{U.holdBoth}</span>
        <div className="pg-minipad">
          {BUTTONS.map((name) => (
            <button key={name} className="pg-padkey" aria-pressed={(held & BIT[name]) !== 0} onClick={() => setHeld((h) => h ^ BIT[name])}>
              {KEYS[name]}
            </button>
          ))}
        </div>
      </div>
      <p className="pg-note pg-fixed-note">
        {error ?? U.note}
      </p>

      <FollowTheBit lang={lang} xray={xray} />
      <MarioTaps lang={lang} taps={taps} />
    </div>
  );
}

/** Which plain sentence a step gets, from the instruction the report names. */
function stepKind(s: Step): "echo" | "read" | "rotate" | "load" | "store" | null {
  if (s.echo) return "echo";
  if (/^LDA \$4016/.test(s.instruction)) return "read";
  if (/^ROR /.test(s.instruction)) return "rotate";
  if (/^LDA /.test(s.instruction)) return "load";
  if (/^STA \$2007/.test(s.instruction)) return "store";
  return null;
}

/** The byte's value after a step, read from the step's own effects: the last value written, else read. */
function byteAfter(s: Step): string | null {
  const w = [...s.effects.matchAll(/<- ([0-9A-F]{2})/gi)].map((m) => m[1]);
  if (w.length) return w[w.length - 1];
  const r = s.effects.match(/read ([0-9A-F]{2})/i);
  return r ? r[1] : null;
}

function FollowTheBit({ lang, xray }: { lang: Lang; xray: Xray }) {
  const U = twinsWords(lang).bit;
  const [at, setAt] = useState(0);
  if (!xray.ok) {
    return <p className="pg-waiting">{U.missing(xray.reason)}</p>;
  }
  // The path, with the report's abridgement kept where it stood (after the
  // first rotations), so nothing it left out is filled in here.
  const rows: ({ kind: "step"; s: Step } | { kind: "elided"; text: string })[] = [];
  let placed = false;
  xray.steps.forEach((s, i) => {
    rows.push({ kind: "step", s });
    const nextIsRor = xray.steps[i + 1] && /^ROR /.test(xray.steps[i + 1].instruction);
    if (!placed && /^ROR /.test(s.instruction) && !nextIsRor) {
      for (const text of xray.elided) rows.push({ kind: "elided", text });
      placed = true;
    }
  });
  const row = rows[Math.min(at, rows.length - 1)];
  const value = row.kind === "step" ? (row.s.instruction.startsWith("LDA $4016") ? null : byteAfter(row.s)) : null;
  const bits = value ? parseInt(value, 16) : null;
  const onPath = new Set(xray.steps.map((s) => s.at.slice(1).toUpperCase()));
  const kind = row.kind === "step" ? stepKind(row.s) : null;

  return (
    <div className="pg-xray">
      <p className="pg-instr-h">
        {U.heading}
        <span>{U.headingRest}</span>
      </p>
      <div className="pg-xray-grid">
        <div className="pg-xray-now">
          <div className="pg-row">
            <button className="pg-btn" onClick={() => setAt((a) => Math.max(0, a - 1))} disabled={at === 0}>
              {U.back}
            </button>
            <button className="pg-btn" onClick={() => setAt((a) => Math.min(rows.length - 1, a + 1))} disabled={at >= rows.length - 1}>
              {U.next}
            </button>
            <span className="pg-note">{U.step(Math.min(at, rows.length - 1) + 1, rows.length)}</span>
          </div>
          <div className="pg-byte" aria-label={U.byte}>
            {Array.from({ length: 8 }, (_, i) => 7 - i).map((b) => (
              <span key={b} className="pg-byte-bit" data-on={bits != null && ((bits >> b) & 1) === 1}>
                {bits == null ? "·" : (bits >> b) & 1}
              </span>
            ))}
            <span className="pg-byte-hex">{value ? `$${value}` : "·"}</span>
          </div>
          <div className="pg-now pg-xray-caption">
            {row.kind === "step" ? (
              <>
                <p className="pg-now-plain">{kind ? U.steps[kind] : ""}</p>
                <p className="pg-now-record">
                  <span>{row.s.echo ? U.echoMark : ""}{row.s.when}</span> {row.s.instruction}
                  {U.at}
                  {row.s.at}: {row.s.effects}
                </p>
              </>
            ) : (
              <>
                <p className="pg-now-plain">{U.elided}</p>
                <p className="pg-now-record">{row.text}</p>
              </>
            )}
          </div>
        </div>
        <pre className="pg-code" aria-label={U.code}>
          {xray.code.map((l) => {
            const addr = l.slice(0, 4).toUpperCase();
            const here = row.kind === "step" && row.s.at.slice(1).toUpperCase() === addr;
            return (
              <span key={l} className="pg-code-line" data-path={onPath.has(addr)} data-here={here}>
                {l + "\n"}
              </span>
            );
          })}
        </pre>
      </div>
      <p className="pg-now-record">{xray.diverge}</p>
      <p className="pg-now-record">{xray.rejoin}</p>
    </div>
  );
}

function Code({ text }: { text: string }) {
  return <>{text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>))}</>;
}

function MarioTaps({ lang, taps }: { lang: Lang; taps: Taps }) {
  const U = twinsWords(lang).mario;
  if (!taps.ok) {
    return <p className="pg-waiting">{U.missing(taps.reason)}</p>;
  }
  const again = /agree again/.test(taps.air);
  const never = /never rejoin/.test(taps.jump);
  return (
    <div className="pg-mario-taps">
      <p className="pg-instr-h">
        {U.heading}
        <span>{U.headingRest}</span>
      </p>
      <div className="pg-twin-cards">
        <article className="pg-twin-card">
          <p className="pg-eyebrow">{U.air}</p>
          <p className="pg-now-plain">{again ? U.airPlain : U.fallback}</p>
          <p className="pg-now-record">
            <Code text={taps.air} />
          </p>
        </article>
        <article className="pg-twin-card">
          <p className="pg-eyebrow">{U.ground}</p>
          <p className="pg-now-plain">{never ? U.groundPlain : U.fallback}</p>
          <p className="pg-now-record">
            <Code text={taps.jump} />
          </p>
        </article>
      </div>
    </div>
  );
}
