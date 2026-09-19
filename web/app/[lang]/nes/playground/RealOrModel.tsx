"use client";

import { useEffect, useRef, useState } from "react";
import type { RealModel } from "./realmodel";
import { token } from "./Playground";

/**
 * Real or model: the engineers' three-way picture of one title screen,
 * cut into its panels in the page (their edges found in the picture: the
 * figure's white ground between them), and any two of the three laid
 * one over the other: wipe, blink or difference. A probe reads the same
 * point in both and prints the two colours and how far apart their hues
 * are, so a reader can find the engineers' twelve degrees themselves.
 */

type Rect = { x: number; y: number; w: number; h: number };
const EYES = ["The model", "The real console, recorded by the scope", "The real console, through a USB grabber"] as const;
const MODES = [
  { id: "wipe", label: "Wipe" },
  { id: "blink", label: "Blink" },
  { id: "diff", label: "Difference" },
] as const;
type Mode = (typeof MODES)[number]["id"];

const white = (d: Uint8ClampedArray, i: number) => d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245;

/** The panels: runs of non-white across the middle row, each run's height down its middle column. */
function findPanels(img: ImageData): Rect[] {
  const { width: W, height: H, data } = img;
  const y = Math.floor(H / 2);
  const runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= W; x++) {
    const w = x === W || white(data, (y * W + x) * 4);
    if (!w && start < 0) start = x;
    if (w && start >= 0) {
      runs.push([start, x]);
      start = -1;
    }
  }
  return runs
    .filter(([a, b]) => b - a > W / 10)
    .map(([a, b]) => {
      const cx = Math.floor((a + b) / 2);
      let top = y;
      let bottom = y;
      while (top > 0 && !white(data, ((top - 1) * W + cx) * 4)) top--;
      while (bottom < H - 1 && !white(data, ((bottom + 1) * W + cx) * 4)) bottom++;
      return { x: a, y: top, w: b - a, h: bottom - top + 1 };
    });
}

function hue(r: number, g: number, b: number): number | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  if (c < 24) return null; // too grey for a hue worth reading
  let h: number;
  if (max === r) h = ((g - b) / c) % 6;
  else if (max === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  return (h * 60 + 360) % 360;
}

const CELLS = [
  ["a", "Left picture here"],
  ["b", "Right picture here"],
  ["hue", "Hues apart"],
  ["light", "Brightness apart"],
] as const;

export function RealOrModel({ data }: { data: RealModel }) {
  const [panels, setPanels] = useState<ImageData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(1);
  const [mode, setMode] = useState<Mode>("wipe");
  const [split, setSplit] = useState(0.5);
  const [blinkOn, setBlinkOn] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cells = useRef<HTMLDListElement>(null);
  const chipA = useRef<HTMLSpanElement>(null);
  const chipB = useRef<HTMLSpanElement>(null);

  // The figure, cut into its panels.
  useEffect(() => {
    if (!data.ok) return;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(im, 0, 0);
      const found = findPanels(ctx.getImageData(0, 0, c.width, c.height));
      const same = found.length === EYES.length && found.every((p) => p.w === found[0].w && p.h === found[0].h);
      if (!same) {
        setError(`the picture shows ${found.length} panels of ${new Set(found.map((p) => `${p.w}x${p.h}`)).size} sizes, not ${EYES.length} alike`);
        return;
      }
      setPanels(found.map((p) => ctx.getImageData(p.x, p.y, p.w, p.h)));
    };
    im.onerror = () => setError("the three-way picture did not load");
    im.src = data.src;
  }, [data]);

  // Blink: the two pictures in turn.
  useEffect(() => {
    if (mode !== "blink") return;
    const t = setInterval(() => setBlinkOn((b) => !b), 650);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !panels) return;
    const A = panels[left];
    const B = panels[right];
    c.width = A.width;
    c.height = A.height;
    const ctx = c.getContext("2d")!;
    if (mode === "diff") {
      const out = ctx.createImageData(A.width, A.height);
      for (let i = 0; i < A.data.length; i += 4) {
        for (let k = 0; k < 3; k++) out.data[i + k] = Math.min(255, Math.abs(A.data[i + k] - B.data[i + k]) * 4);
        out.data[i + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
      return;
    }
    if (mode === "blink") {
      ctx.putImageData(blinkOn ? B : A, 0, 0);
      return;
    }
    ctx.putImageData(A, 0, 0);
    const x = Math.round(split * A.width);
    ctx.putImageData(B, 0, 0, x, 0, A.width - x, A.height);
    ctx.fillStyle = token("--color-mustard");
    ctx.fillRect(x - 1, 0, 2, A.height);
  }, [panels, left, right, mode, split, blinkOn]);

  if (!data.ok) return <p className="pg-waiting">The pictures are the engineers&rsquo; report&rsquo;s, and this build could not read it: {data.reason}.</p>;

  const probe = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!panels) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    if (mode === "wipe" && e.buttons) setSplit(Math.max(0, Math.min(1, px)));
    const A = panels[left];
    const B = panels[right];
    const x = Math.floor(px * A.width);
    const y = Math.floor(py * A.height);
    const i = (y * A.width + x) * 4;
    const a = [A.data[i], A.data[i + 1], A.data[i + 2]];
    const b = [B.data[i], B.data[i + 1], B.data[i + 2]];
    const ha = hue(a[0], a[1], a[2]);
    const hb = hue(b[0], b[1], b[2]);
    let apart = "too grey to say";
    if (ha != null && hb != null) {
      const d = Math.abs(((hb - ha + 540) % 360) - 180);
      apart = `${d.toFixed(0)} degrees`;
    }
    const la = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
    const lb = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2];
    const cl = cells.current;
    if (!cl) return;
    const put = (k: string, v: string) => {
      const el = cl.querySelector<HTMLElement>(`[data-k="${k}"]`);
      if (el && el.textContent !== v) el.textContent = v;
    };
    put("a", `(${a.join(", ")})`);
    put("b", `(${b.join(", ")})`);
    put("hue", apart);
    put("light", `${Math.abs(la - lb).toFixed(0)} of 255`);
    if (chipA.current) chipA.current.style.background = `rgb(${a.join(",")})`;
    if (chipB.current) chipB.current.style.background = `rgb(${b.join(",")})`;
  };

  return (
    <div className="pg-rom">
      <div className="pg-row">
        <label className="pg-label" htmlFor="pg-rom-left">Left</label>
        <select id="pg-rom-left" className="pg-select" value={left} onChange={(e) => setLeft(Number(e.target.value))}>
          {EYES.map((n, i) => (
            <option key={n} value={i}>{n}</option>
          ))}
        </select>
        <label className="pg-label" htmlFor="pg-rom-right">Right</label>
        <select id="pg-rom-right" className="pg-select" value={right} onChange={(e) => setRight(Number(e.target.value))}>
          {EYES.map((n, i) => (
            <option key={n} value={i}>{n}</option>
          ))}
        </select>
      </div>
      <div className="pg-seg pg-seg-3" role="radiogroup" aria-label="How to compare">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} className="pg-segbtn" onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="pg-rom-stage" style={{ aspectRatio: panels ? `${panels[0].width} / ${panels[0].height}` : "512 / 470" }}>
        {panels ? (
          <canvas
            ref={canvas}
            className="pg-rom-canvas"
            onPointerMove={probe}
            onPointerDown={probe}
            aria-label={`${EYES[left]} and ${EYES[right]}, compared by ${mode}`}
          />
        ) : (
          <p className="pg-waiting">{error ? `The picture could not be cut into its panels: ${error}.` : "Loading the pictures..."}</p>
        )}
      </div>
      {/* One slot, one height, whichever mode fills it. */}
      <div className="pg-rom-under">
        {mode === "wipe" ? (
          <input className="pg-scrub" type="range" min={0} max={1} step={0.001} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Where the wipe sits" />
        ) : (
          <p className="pg-note">
            {mode === "blink" ? `Now showing: ${blinkOn ? EYES[right] : EYES[left]}.` : "Black where the two agree; the brighter, the further apart (four times the difference)."}
          </p>
        )}
      </div>

      <dl ref={cells} className="pg-console">
        {CELLS.map(([k, label]) => (
          <div key={k}>
            <dt>
              {k === "a" ? <span ref={chipA} className="pg-rom-chip" aria-hidden="true" /> : null}
              {k === "b" ? <span ref={chipB} className="pg-rom-chip" aria-hidden="true" /> : null}
              {label}
            </dt>
            <dd data-k={k}>·</dd>
          </div>
        ))}
      </dl>
      <p className="pg-note">Point at the cyan letters, then the brown sign, with the model on one side and a real console on the other.</p>

      <div className="pg-rom-record">
        <p className="pg-record-h">What the engineers measured on these pictures</p>
        <div className="pg-rom-table" role="table" aria-label="The report's table">
          <div role="row" className="pg-rom-tr pg-rom-th">
            <span role="columnheader">Compared</span>
            <span role="columnheader">Flat blocks, mean difference</span>
            <span role="columnheader">Hue, middle value</span>
            <span role="columnheader">Brightness pattern alike</span>
          </div>
          {data.rows.map((r) => (
            <div role="row" key={r[0]} className="pg-rom-tr">
              {r.map((c, i) => (
                <span role="cell" key={i}>{c}</span>
              ))}
            </div>
          ))}
        </div>
        {data.passages.map((p, i) => (
          <p key={i} className="pg-now-record pg-rom-words">
            {p.replace(/\*\*/g, "").replace(/`/g, "")}
          </p>
        ))}
      </div>
    </div>
  );
}
