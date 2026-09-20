"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Palette, Shape } from "./engine";
import { anatomy, beat } from "./signal";
import { token } from "./Playground";
import { ui } from "./ui";
import type { Lang } from "@/lib/lang";

/**
 * The console's colours, every code, as the worker measured them through
 * the model's encoder and decoder; and for the one picked, its stretch of
 * wire beside the burst, and the clock face: each hand's angle is the
 * phase of the colour's beat against the burst's, measured here from the
 * samples (signal.ts). Nothing on this station is a colour or an angle
 * from a chart.
 */

function hex2(n: number) {
  return n.toString(16).padStart(2, "0");
}

interface Reading {
  angle: number | null; // degrees ahead of the burst, or null for no swing
  swing: number;
  mean: number;
}

export function Colours({ lang, palette, shape }: { lang: Lang; palette: Palette; shape: Shape }) {
  const U = ui(lang).colours;
  const rows = palette.waves.length;
  const [picked, setPicked] = useState(0x16);
  const wave = useRef<HTMLCanvasElement>(null);

  // Every code's reading, from its row's line of wire.
  const readings = useMemo(() => {
    const out: Reading[] = [];
    let period = 0;
    for (let r = 0; r < rows; r++) {
      const w = palette.waves[r];
      const a = anatomy(w, shape.pictureX * shape.perDot, shape.pictureX * shape.perDot + shape.outW);
      period = a.period ?? period;
      const b = a.burst && a.period ? beat(w, a.burst[0], a.burst[1], a.period) : null;
      for (let c = 0; c < 16; c++) {
        const len = palette.cellW * shape.perDot;
        const x0 = (shape.pictureX + c * palette.cellW) * shape.perDot;
        const k = beat(w, x0 + len / 4, x0 + (3 * len) / 4, a.period ?? 12);
        let angle: number | null = null;
        if (b && k.swing > (b.swing || 1) * 0.05) {
          angle = ((((b.phase - k.phase) * 180) / Math.PI) % 360 + 360) % 360;
        }
        out.push({ angle, swing: k.swing, mean: k.mean });
      }
    }
    return { out, period };
  }, [palette, shape, rows]);

  const row = picked >> 4;
  const col = picked & 15;
  const reading = readings.out[picked];
  const hueAngles = new Map<number, number>();
  readings.out.forEach((r, i) => {
    if (r.angle != null && !hueAngles.has(i & 15)) hueAngles.set(i & 15, r.angle);
  });

  useEffect(() => {
    const c = wave.current;
    if (!c) return;
    const w = palette.waves[row];
    const a = anatomy(w, shape.pictureX * shape.perDot, shape.pictureX * shape.perDot + shape.outW);
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = 150;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = token("--color-panel-sunk");
    ctx.fillRect(0, 0, W, H);
    const period = a.period ?? 12;
    const n = period * 4; // four beats of each
    const len = palette.cellW * shape.perDot;
    const colStart = (shape.pictureX + col * palette.cellW) * shape.perDot + Math.round(len / 4);
    // Start both windows at the same place in the beat, so their timing compares.
    const burstStart = a.burst ? a.burst[0] + ((colStart - a.burst[0]) % period + period) % period : null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of w) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const y = (v: number) => H - 14 - ((v - lo) / (hi - lo)) * (H - 28);
    const draw = (from: number, colour: string, label: string, top: boolean) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x0 = (i / n) * W;
        const x1 = ((i + 1) / n) * W;
        const v = w[from + i];
        if (i === 0) ctx.moveTo(x0, y(v));
        else ctx.lineTo(x0, y(v));
        ctx.lineTo(x1, y(v));
      }
      ctx.stroke();
      ctx.fillStyle = colour;
      ctx.font = `600 11px ${token("--font-sans")}`;
      ctx.fillText(label, 6, top ? 14 : 28);
    };
    if (burstStart != null) draw(burstStart, token("--color-ocean"), U.burstLabel, true);
    const [r, g, b] = palette.rgb[picked];
    draw(colStart, `rgb(${r},${g},${b})`, U.colourLabel(hex2(picked)), false);
  }, [picked, palette, shape, row, col, U]);

  const [r, g, b] = palette.rgb[picked];
  const hand = (deg: number, len: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x2: 60 + Math.cos(rad) * len, y2: 60 + Math.sin(rad) * len };
  };
  const maxSwing = Math.max(...readings.out.map((x) => x.swing));

  return (
    <div className="pg-colours">
      <div className="pg-swatches" role="listbox" aria-label={U.swatches}>
        {Array.from({ length: rows }, (_, rr) => (
          <div key={rr} className="pg-swatch-row">
            {Array.from({ length: 16 }, (_, cc) => {
              const code = (rr << 4) | cc;
              const [R, G, B] = palette.rgb[code];
              return (
                <button
                  key={cc}
                  role="option"
                  aria-selected={picked === code}
                  aria-label={U.swatch(hex2(code))}
                  className="pg-swatch"
                  style={{ background: `rgb(${R},${G},${B})` }}
                  onClick={() => setPicked(code)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && e.buttons === 0 && setPicked(code)}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="pg-colour-detail">
        <div className="pg-chip" style={{ background: `rgb(${r},${g},${b})` }} aria-hidden="true" />
        <div>
          <p className="pg-code">${hex2(picked)}</p>
          <p className="pg-readout">
            {U.reading(row, col)}{" "}
            {reading.angle == null ? U.grey : U.angle(Math.round(reading.angle))}{" "}
            {U.volts(reading.mean.toFixed(2), (reading.swing / 2).toFixed(2))}
          </p>
        </div>
      </div>

      <div className="pg-colour-plots">
        <canvas ref={wave} className="pg-trace" style={{ height: 150 }} aria-label={U.plot} />
        <svg className="pg-clock" viewBox="0 0 120 120" role="img" aria-label={U.clock}>
          <circle cx="60" cy="60" r="54" className="pg-clock-face" />
          {[...hueAngles.entries()].map(([hue, deg]) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const code = (Math.max(1, row) << 4) | hue;
            const [R, G, B] = palette.rgb[code];
            return (
              <circle
                key={hue}
                cx={60 + Math.cos(rad) * 48}
                cy={60 + Math.sin(rad) * 48}
                r={hue === col ? 6 : 4}
                fill={`rgb(${R},${G},${B})`}
                className={hue === col ? "pg-clock-on" : undefined}
                onClick={() => setPicked((row << 4) | hue)}
              />
            );
          })}
          <line x1="60" y1="60" {...hand(0, 40)} className="pg-clock-burst" />
          {reading.angle != null ? (
            <line x1="60" y1="60" {...hand(reading.angle, 12 + 30 * (reading.swing / maxSwing))} stroke={`rgb(${r},${g},${b})`} strokeWidth="3" strokeLinecap="round" />
          ) : null}
          <circle cx="60" cy="60" r="3" className="pg-clock-hub" />
        </svg>
      </div>
      <p className="pg-note">{U.note}</p>
    </div>
  );
}
