"use client";

import { useEffect, useRef, useState } from "react";
import type { Engine, Wire as WireData } from "./engine";
import { anatomy, type Anatomy } from "./signal";
import { token } from "./Playground";
import { ui } from "./ui";
import type { Lang } from "@/lib/lang";

/**
 * One line of the frame as the volts on the wire: the model's encode of a
 * real frame (the worker's 'wire'), drawn whole, with the sync, the burst
 * and the picture found in the signal itself (signal.ts), and a lens that
 * magnifies the few dots under the pointer to their samples.
 */

const H = 240;
const LENS_DOTS = 4;

function hex2(n: number) {
  return n.toString(16).padStart(2, "0");
}

export function Wire({
  lang,
  engine,
  line,
  serial,
  palette,
}: {
  lang: Lang;
  engine: React.RefObject<Engine | null>;
  line: number | null;
  serial: number | null;
  palette: [number, number, number][] | null;
}) {
  const U = ui(lang).wire;
  const [data, setData] = useState<WireData | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const trace = useRef<HTMLCanvasElement>(null);
  const lens = useRef<HTMLCanvasElement>(null);
  const asked = useRef(0);

  // A fresh encode when the line's frame changes, at most twice a second.
  useEffect(() => {
    if (serial == null || !engine.current) return;
    const now = performance.now();
    const wait = Math.max(0, 500 - (now - asked.current));
    const t = setTimeout(() => {
      asked.current = performance.now();
      engine.current
        ?.wire(serial)
        .then(setData)
        .catch(() => {});
    }, wait);
    return () => clearTimeout(t);
  }, [serial, engine]);

  const s = data?.shape;
  const L = s?.lineLen ?? 0;
  const ln = line ?? 0;
  const samples = data && s ? data.volts.subarray(ln * L, (ln + 1) * L) : null;
  const pic: [number, number] | null = s ? [s.pictureX * s.perDot, s.pictureX * s.perDot + s.outW] : null;
  const parts: Anatomy | null = samples && pic ? anatomy(samples, pic[0], pic[1]) : null;

  // The range of the whole frame, so lines can be compared by eye.
  let vmin = 0;
  let vmax = 1;
  if (data) {
    vmin = Infinity;
    vmax = -Infinity;
    for (let i = 0; i < data.volts.length; i += 7) {
      vmin = Math.min(vmin, data.volts[i]);
      vmax = Math.max(vmax, data.volts[i]);
    }
    const pad = (vmax - vmin) * 0.08;
    vmin -= pad;
    vmax += pad;
  }

  useEffect(() => {
    const c = trace.current;
    if (!c || !samples || !s || !parts || !pic) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = token("--color-panel-sunk");
    ctx.fillRect(0, 0, W, H);
    const x = (i: number) => (i / L) * W;
    const y = (v: number) => H - 28 - ((v - vmin) / (vmax - vmin)) * (H - 56);
    const band = (a: number, b: number, colour: string, label: string) => {
      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.14;
      ctx.fillRect(x(a), 0, x(b) - x(a), H);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colour;
      ctx.font = `600 11px ${token("--font-sans")}`;
      ctx.fillText(label, x(a) + 4, 14);
    };
    band(pic[0], pic[1], token("--color-mustard"), U.bands.picture);
    band(parts.sync[0], parts.sync[1], token("--color-burnt"), U.bands.sync);
    if (parts.burst) band(parts.burst[0], parts.burst[1], token("--color-ocean"), U.bands.burst);
    // The dots' colours, a ribbon under the trace.
    if (palette && data) {
      for (let d = 0; d < s.pictureW; d++) {
        const code = data.colour[ln * s.dots + s.pictureX + d] & 63;
        const [r, g, b] = palette[code];
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x(pic[0] + d * s.perDot), H - 18, Math.max(1, x(s.perDot)) + 0.5, 12);
      }
    }
    // Levels: blank.
    ctx.strokeStyle = token("--color-rule-panel");
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y(parts.blank));
    ctx.lineTo(W, y(parts.blank));
    ctx.stroke();
    ctx.setLineDash([]);
    // The trace: min and max per pixel column, so the wiggle reads as a band.
    ctx.strokeStyle = token("--color-glass");
    ctx.lineWidth = 1;
    ctx.beginPath();
    const per = L / W;
    for (let px = 0; px < W; px++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = Math.floor(px * per); i < Math.min(L, Math.floor((px + 1) * per) + 1); i++) {
        lo = Math.min(lo, samples[i]);
        hi = Math.max(hi, samples[i]);
      }
      ctx.moveTo(px + 0.5, y(hi));
      ctx.lineTo(px + 0.5, y(lo) + 0.5);
    }
    ctx.stroke();
    if (hover != null) {
      ctx.strokeStyle = token("--color-mustard");
      ctx.strokeRect(x(hover - (LENS_DOTS / 2) * s.perDot), 20, x(LENS_DOTS * s.perDot), H - 42);
    }
  });

  useEffect(() => {
    const c = lens.current;
    if (!c || !samples || !s || hover == null) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const LH = 160;
    c.width = W * dpr;
    c.height = LH * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = token("--color-panel-sunk");
    ctx.fillRect(0, 0, W, LH);
    const n = LENS_DOTS * s.perDot;
    const a = Math.max(0, Math.min(L - n, Math.round(hover - n / 2)));
    const x = (i: number) => ((i - a) / n) * W;
    const y = (v: number) => LH - 30 - ((v - vmin) / (vmax - vmin)) * (LH - 50);
    // Dot boundaries, and each dot's colour under it.
    for (let i = a - (a % s.perDot); i <= a + n; i += s.perDot) {
      const dot = i / s.perDot;
      ctx.strokeStyle = token("--color-rule-panel");
      ctx.beginPath();
      ctx.moveTo(x(i), 0);
      ctx.lineTo(x(i), LH - 24);
      ctx.stroke();
      const inside = dot >= s.pictureX && dot < s.pictureX + s.pictureW;
      if (inside && palette && data) {
        const code = data.colour[ln * s.dots + dot] & 63;
        const [r, g, b] = palette[code];
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x(i) + 1, LH - 20, x(i + s.perDot) - x(i) - 2, 14);
        ctx.fillStyle = token("--color-glass-muted");
        ctx.font = `11px ${token("--font-mono")}`;
        ctx.fillText(`$${hex2(code)}`, x(i) + 4, 14);
      }
    }
    // The samples themselves, held flat between ticks as the encoder emits them.
    ctx.strokeStyle = token("--color-mustard");
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = a; i < a + n; i++) {
      const v = samples[i];
      if (i === a) ctx.moveTo(x(i), y(v));
      else ctx.lineTo(x(i), y(v));
      ctx.lineTo(x(i + 1), y(v));
    }
    ctx.stroke();
    ctx.fillStyle = token("--color-glass");
    for (let i = a; i < a + n; i++) {
      ctx.beginPath();
      ctx.arc(x(i + 0.5), y(samples[i]), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  if (!data || !s || !samples || !parts) return <p className="pg-waiting">{U.encoding}</p>;

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.round(((e.clientX - r.left) / r.width) * L));
  };
  const dotAt = hover != null ? Math.floor(hover / s.perDot) : null;
  const inside = dotAt != null && dotAt >= s.pictureX && dotAt < s.pictureX + s.pictureW;
  const code = inside && dotAt != null ? data.colour[ln * s.dots + dotAt] & 63 : null;

  return (
    <div className="pg-wire">
      <p className="pg-instr-h">
        {U.line(ln)}
        <span>{U.ofFrame}</span>
      </p>
      <canvas
        ref={trace}
        className="pg-trace"
        style={{ height: H }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        aria-label={U.trace(ln)}
      />
      {/* The lens and its line are always there, so pointing at the trace
          fills them in without moving the page. */}
      <canvas ref={lens} className="pg-lens" style={{ height: 160 }} aria-hidden="true" />
      <p className="pg-readout">
            {hover == null
              ? U.hint
              : dotAt != null && inside && code != null
              ? U.dot(dotAt, hex2(code), code >> 4, code & 15, s.perDot)
              : parts.burst && hover >= parts.burst[0] && hover < parts.burst[1]
                ? U.burst(String(parts.period ?? "?"), parts.period ? (parts.period / s.perDot).toFixed(1) : "?")
                : hover >= parts.sync[0] && hover < parts.sync[1]
                  ? U.sync
                  : U.blanking}
      </p>
    </div>
  );
}
