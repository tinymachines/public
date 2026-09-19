"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Shape } from "./engine";
import type { Kind, MarioFrame, Row } from "./mario";
import { token } from "./Playground";

/**
 * The dissection's frame painted onto the frame: every dot the beam
 * passes coloured by what the processor was doing at that moment, read
 * from the table's own lines and dots (mario.ts). Where a row says how
 * far it ran ("to line 30 dot 92"), the stretch ends there; otherwise it
 * runs to the next row. The shares printed are counted from those
 * stretches, dot by dot, and say so.
 */

const KINDS: Record<Kind, { label: string; token: string }> = {
  wait: { label: "waiting for the beam", token: "--color-mustard" },
  logic: { label: "the game's own work", token: "--color-forest" },
  busy: { label: "talking to the picture chip, the sound and the pad", token: "--color-burnt" },
  copy: { label: "copying the sprites across (the processor is frozen)", token: "--color-ocean" },
  idle: { label: "nothing at all: done, and waiting for the next frame", token: "--color-chrome-lo" },
};
const ORDER: Kind[] = ["logic", "wait", "busy", "copy", "idle"];

interface Stretch {
  from: number;
  to: number;
  kind: Kind;
  row: number | null;
}

function stretches(rows: Row[], s: Shape): Stretch[] {
  const total = s.dots * s.lines;
  const pos = (line: number, dot: number) => line * s.dots + dot;
  const starts: number[] = [];
  rows.forEach((r, i) => {
    const prev = i ? starts[i - 1] : -1;
    starts.push(r.dot == null ? Math.max(prev + 1, pos(r.line, 0)) : pos(r.line, r.dot));
  });
  const out: Stretch[] = [];
  rows.forEach((r, i) => {
    const next = i + 1 < rows.length ? starts[i + 1] : total + starts[0];
    const said = r.what.match(/(?:to|until) line (\d+) dot (\d+)/);
    let end = next;
    if (said) end = Math.min(next, pos(Number(said[1]), Number(said[2])));
    else if (r.lineTo != null) end = Math.min(next, pos(r.lineTo, 0));
    out.push({ from: starts[i], to: end, kind: r.kind, row: i });
    if (end < next) out.push({ from: end, to: next, kind: "busy", row: null });
  });
  return out;
}

/** The record's words, with its code spans as code. */
function Record({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>))}
    </>
  );
}

export function MarioMap({ mario, shape, framePeriodMs }: { mario: MarioFrame; shape: Shape; framePeriodMs: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [beam, setBeam] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const total = shape.dots * shape.lines;
  const parts = useMemo(() => (mario.ok ? stretches(mario.rows, shape) : []), [mario, shape]);

  const shares = useMemo(() => {
    const m = new Map<Kind, number>();
    for (const p of parts) m.set(p.kind, (m.get(p.kind) ?? 0) + (p.to - p.from));
    return m;
  }, [parts]);

  // The map itself, painted once.
  const base = useMemo(() => {
    if (typeof document === "undefined" || !parts.length) return null;
    const c = document.createElement("canvas");
    c.width = shape.dots;
    c.height = shape.lines;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(shape.dots, shape.lines);
    const rgb = (t: string) => {
      const n = parseInt(token(t).slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const colours = Object.fromEntries(ORDER.map((k) => [k, rgb(KINDS[k].token)])) as Record<Kind, number[]>;
    for (const p of parts) {
      for (let q = p.from; q < p.to; q++) {
        const i = q % total;
        const x = i % shape.dots;
        const y = Math.floor(i / shape.dots);
        const inside = x >= shape.pictureX && x < shape.pictureX + shape.pictureW && y < shape.pictureH;
        const [r, g, b] = colours[p.kind];
        const k = inside ? 1 : 0.55; // the blanking a shade darker, so the picture's edge shows
        img.data[i * 4] = r * k;
        img.data[i * 4 + 1] = g * k;
        img.data[i * 4 + 2] = b * k;
        img.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [parts, shape, total]);

  // A frame of Mario in twenty seconds, when playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? t - last : 0;
      last = t;
      setBeam((b) => (b + dt / 20_000) % 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const at = Math.floor(beam * total);
  const here = parts.find((p) => (at >= p.from && at < p.to) || (at + total >= p.from && at + total < p.to));
  const shownRow = focus ?? here?.row ?? null;

  useEffect(() => {
    const c = canvas.current;
    if (!c || !base) return;
    const k = 3;
    c.width = shape.dots * k;
    c.height = shape.lines * k;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, c.width, c.height);
    // The picture's edge.
    ctx.strokeStyle = token("--color-glass");
    ctx.lineWidth = 1;
    ctx.strokeRect(shape.pictureX * k + 0.5, 0.5, shape.pictureW * k, shape.pictureH * k);
    // Each row of the table, a pin where it happened.
    if (mario.ok) {
      mario.rows.forEach((r, i) => {
        const x = ((r.dot ?? 0) + 0.5) * k;
        const y = (r.line + 0.5) * k;
        ctx.fillStyle = i === shownRow ? token("--color-glass") : token("--color-panel");
        ctx.strokeStyle = token("--color-glass");
        ctx.beginPath();
        ctx.arc(x, y, i === shownRow ? 7 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
    // The beam.
    const line = Math.floor(at / shape.dots);
    const dot = at % shape.dots;
    ctx.fillStyle = token("--color-glass");
    ctx.fillRect(0, line * k, c.width, 1);
    ctx.beginPath();
    ctx.arc((dot + 0.5) * k, (line + 0.5) * k, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  if (!mario.ok) {
    return (
      <p className="pg-waiting">
        The map is drawn from the dissection&rsquo;s table, and this build could not read it: {mario.reason}. Nothing is
        drawn in its place.
      </p>
    );
  }

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * shape.dots;
    const y = ((e.clientY - r.top) / r.height) * shape.lines;
    setPlaying(false);
    setFocus(null);
    setBeam((Math.floor(y) * shape.dots + Math.floor(x)) / total);
  };

  const row = shownRow != null ? mario.rows[shownRow] : null;
  const kind = here?.kind ?? "busy";
  const line = Math.floor(at / shape.dots);
  const dotNs = (framePeriodMs * 1e6) / total;

  return (
    <div className="pg-mario">
      <div className="pg-field" style={{ aspectRatio: `${shape.dots} / ${shape.lines}` }}>
        <canvas ref={canvas} className="pg-canvas" onClick={pick} aria-label={`Frame ${mario.frame} of Super Mario Bros., coloured by what the processor was doing at each point of the beam`} />
      </div>
      <div className="pg-row">
        <button className="pg-btn" onClick={() => { setFocus(null); setPlaying((p) => !p); }}>
          {playing ? "Pause" : "Sweep the beam"}
        </button>
        <input
          className="pg-scrub"
          type="range"
          min={0}
          max={1}
          step={0.0005}
          value={beam}
          aria-label="Where the beam is in Mario's frame"
          onChange={(e) => {
            setPlaying(false);
            setFocus(null);
            setBeam(Number(e.target.value));
          }}
        />
      </div>
      <div className="pg-now" data-kind={kind}>
        <p className="pg-now-h">
          <span className="pg-key" style={{ background: `var(${KINDS[kind].token})` }} aria-hidden="true" />
          Line {line}: {KINDS[kind].label}. {((at * dotNs) / 1e6).toFixed(2)} ms into the frame.
        </p>
        {row ? (
          <>
            <p className="pg-now-plain">{row.plain || "The engineers' words are below."}</p>
            <p className="pg-now-record">
              <span>line {row.lineTo != null ? `${row.line} to ${row.lineTo}` : row.line}{row.dot != null ? `, dot ${row.dot}` : ""}</span> <Record text={row.what} />
              {row.where ? <> at <Record text={row.where} /></> : null}
            </p>
          </>
        ) : null}
      </div>
      <div className="pg-shares" aria-label="Share of the frame, counted dot by dot from the table's stretches">
        {ORDER.map((k) => {
          const n = shares.get(k) ?? 0;
          return n ? <span key={k} style={{ flexGrow: n, background: `var(${KINDS[k].token})` }} title={KINDS[k].label} /> : null;
        })}
      </div>
      <ul className="pg-legend">
        {ORDER.map((k) => (
          <li key={k}>
            <span className="pg-key" style={{ background: `var(${KINDS[k].token})` }} aria-hidden="true" />
            {KINDS[k].label} <b>{Math.round(((shares.get(k) ?? 0) / total) * 100)}%</b>
          </li>
        ))}
      </ul>
      <p className="pg-note">
        The shares are counted dot by dot from the table&rsquo;s own lines and dots, so they are the table&rsquo;s clock,
        not a stopwatch. The dissection&rsquo;s profiler has its own figure for the idle time.
      </p>
      <ol className="pg-rows">
        {mario.rows.map((r, i) => (
          <li key={i}>
            <button className="pg-rowbtn" aria-pressed={shownRow === i} onClick={() => {
              setPlaying(false);
              setFocus(i);
              setBeam(((r.line * shape.dots + (r.dot ?? 0)) % total) / total);
            }}>
              <span className="pg-key" style={{ background: `var(${KINDS[r.kind].token})` }} aria-hidden="true" />
              <span className="pg-rowpos">{r.line}{r.dot != null ? `.${r.dot}` : ""}</span>
              <span>{r.plain || <Record text={r.what} />}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
