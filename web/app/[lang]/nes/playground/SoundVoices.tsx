"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { token } from "./Playground";

/**
 * The sound, voice by voice: the engineers' fast 2A03 sound unit in a
 * worker (public/nes/voices.worker.mjs), played by writing its registers
 * from the page as a game would, heard through their DACs, each voice
 * drawn as its own trace and muted at the DAC on its own.
 *
 * The clock is the console's: the CPU half-cycles in one frame, which
 * the playground's console reports each frame, over the frame period
 * from data/nes.json. The notes are equal temperament on A at 440, a
 * musical convention and ours; the pitch each voice actually plays is
 * measured from its own trace and printed beside it, so a wrong divider
 * or a wrong clock would show.
 *
 * One liberty, said on the page: the pins' steady level (the triangle
 * rests on a high step) is taken out before the speakers, as any audio
 * input would. The console's own audio stage is not modelled here.
 */

type Outcome<A> = { id: number; ok: true; answer: A } | { id: number; ok: false; error: string };
interface Chunk {
  sound: Float32Array;
  codes: Float32Array;
  status: number;
}

const RATE = 48_000;
const CHUNK = 2048;
const AHEAD = 0.15;

/** One octave and a note, named as a keyboard names them. */
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C"].map((name, i) => ({
  name,
  sharp: name.includes("#"),
  // Equal temperament from middle C: A above it is 440.
  hz: 440 * Math.pow(2, (i - 9) / 12),
}));

const VOICES = [
  { key: "sq0", name: "Square one", role: "the melody, usually", max: 15 },
  { key: "sq1", name: "Square two", role: "harmony, or a second melody", max: 15 },
  { key: "tri", name: "Triangle", role: "the bass line", max: 15 },
  { key: "noi", name: "Noise", role: "drums, wind, explosions", max: 15 },
  { key: "dmc", name: "Samples", role: "recorded sounds, played from memory", max: 127 },
] as const;

/** The squares' four shapes: how much of each cycle is high, in eighths. */
const DUTIES = [1, 2, 4, 6];

interface VoiceState {
  note: number | null;
  duty: number;
  volume: number;
  noiseRate: number;
  noiseLoop: boolean;
  on: boolean;
}

const INITIAL: VoiceState[] = [
  { note: null, duty: 2, volume: 12, noiseRate: 0, noiseLoop: false, on: false },
  { note: null, duty: 1, volume: 10, noiseRate: 0, noiseLoop: false, on: false },
  { note: null, duty: 0, volume: 15, noiseRate: 0, noiseLoop: false, on: false },
  { note: null, duty: 0, volume: 8, noiseRate: 8, noiseLoop: false, on: false },
  { note: null, duty: 0, volume: 0, noiseRate: 14, noiseLoop: true, on: false },
];

function dutyPath(eighths: number) {
  const x = (eighths / 8) * 40;
  return `M0,14 L0,2 L${x},2 L${x},14 L40,14`;
}

export function SoundVoices({ halfCyclesPerFrame, framePeriodMs }: { halfCyclesPerFrame: number | null; framePeriodMs: number }) {
  const [on, setOn] = useState(false);
  const [voices, setVoices] = useState<VoiceState[]>(INITIAL);
  const [mute, setMute] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const audio = useRef<{ ctx: AudioContext; out: AudioNode; until: number } | null>(null);
  const traces = useRef<(HTMLCanvasElement | null)[]>([]);
  const pitch = useRef<(HTMLElement | null)[]>([]);
  const muteRef = useRef(0);
  const busy = useRef(false);
  const nextId = useRef(1);

  // CPU half-cycles a second, from the console's own count: the first
  // frame's count the station sees, held, so the clock does not move
  // under a note (odd and even frames differ by a dot).
  const [frameCount, setFrameCount] = useState<number | null>(null);
  if (frameCount == null && halfCyclesPerFrame) setFrameCount(halfCyclesPerFrame);
  const perSecond = frameCount ? frameCount / (framePeriodMs / 1000) : null;
  const cpuHz = perSecond ? perSecond / 2 : null;

  useEffect(() => {
    muteRef.current = mute;
  }, [mute]);

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

  const write = useCallback((reg: number, value: number) => ask({ path: "write", reg, value }).catch(() => {}), [ask]);

  // The registers, from the voices' state: what a game would write.
  const program = useCallback(
    (vs: VoiceState[]) => {
      if (!cpuHz) return;
      let enable = 0;
      vs.forEach((v, k) => {
        if (k < 2) {
          const base = k * 4;
          if (v.note == null) return;
          enable |= 1 << k;
          const t = Math.max(8, Math.min(0x7ff, Math.round(cpuHz / (16 * NOTES[v.note].hz)) - 1));
          write(base, (v.duty << 6) | 0x30 | v.volume); // shape, hold, constant volume
          write(base + 1, 0x08); // sweep off, negate set so it never mutes
          write(base + 2, t & 0xff);
          write(base + 3, (t >> 8) & 7);
        } else if (k === 2) {
          if (v.note == null) return;
          enable |= 4;
          const t = Math.max(2, Math.min(0x7ff, Math.round(cpuHz / (32 * NOTES[v.note].hz)) - 1));
          write(0x08, 0xff); // hold the length and the linear counter: the note sustains
          write(0x0a, t & 0xff);
          write(0x0b, (t >> 8) & 7);
        } else if (k === 3) {
          if (!v.on) return;
          enable |= 8;
          write(0x0c, 0x30 | v.volume);
          write(0x0e, (v.noiseLoop ? 0x80 : 0) | (15 - v.noiseRate));
          write(0x0f, 0x00);
        } else if (k === 4) {
          if (!v.on) return;
          enable |= 16;
          write(0x10, 0x40 | v.noiseRate); // loop the sample, at this rate
          write(0x12, 0x00); // the sample at $C000
          write(0x13, 0x02); // thirty-three bytes
        }
      });
      write(0x15, enable);
    },
    [cpuHz, write],
  );

  const change = (k: number, patch: Partial<VoiceState>) => {
    setVoices((vs) => {
      const next = vs.map((v, i) => (i === k ? { ...v, ...patch } : v));
      program(next);
      return next;
    });
  };

  const drawChunk = useCallback((c: Chunk) => {
    const n = c.sound.length;
    VOICES.forEach((v, k) => {
      const codes = c.codes.subarray(k * n, (k + 1) * n);
      let lo = Infinity;
      let hi = -Infinity;
      for (const x of codes) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      // The pitch, measured: rises through the middle of the trace, per second.
      const cell = pitch.current[k];
      if (cell) {
        let text = "silent";
        if (hi - lo >= 1) {
          if (v.key === "noi") text = "no pitch: noise";
          else if (v.key === "dmc") text = "no pitch: a sample";
          else {
            const mid = (lo + hi) / 2;
            const rises: number[] = [];
            for (let i = 1; i < n; i++) if (codes[i - 1] < mid && codes[i] >= mid) rises.push(i);
            text = rises.length >= 3 ? `${((RATE * (rises.length - 1)) / (rises[rises.length - 1] - rises[0])).toFixed(1)} Hz` : "too low to count";
          }
        }
        if (cell.textContent !== text) cell.textContent = text;
      }
      const cv = traces.current[k];
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth;
      const H = 44;
      if (cv.width !== W * dpr) {
        cv.width = W * dpr;
        cv.height = H * dpr;
      }
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = token("--color-panel-sunk");
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = muteRef.current & (1 << k) ? token("--color-glass-muted") : token("--color-mustard");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const show = Math.min(n, 1024);
      for (let i = 0; i < show; i++) {
        const x = (i / (show - 1)) * W;
        const y = H - 3 - (codes[i] / v.max) * (H - 6);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }, []);

  // The sound loop: keep a little ahead of the speakers.
  useEffect(() => {
    if (!on || !perSecond) return;
    let live = true;
    const pump = async () => {
      const a = audio.current;
      if (!live || !a || busy.current) return;
      if (a.until > a.ctx.currentTime + AHEAD) return;
      busy.current = true;
      try {
        const c = await ask<Chunk>({ path: "render", n: CHUNK, perSample: perSecond / RATE, mute: muteRef.current });
        const buf = a.ctx.createBuffer(1, c.sound.length, RATE);
        buf.copyToChannel(new Float32Array(c.sound), 0);
        const src = a.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(a.out);
        const at = Math.max(a.until, a.ctx.currentTime + 0.03);
        src.start(at);
        a.until = at + c.sound.length / RATE;
        drawChunk(c);
      } catch (e) {
        setError(String((e as Error).message ?? e));
      } finally {
        busy.current = false;
      }
    };
    const t = setInterval(pump, 15);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [on, perSecond, ask, drawChunk]);

  useEffect(
    () => () => {
      worker.current?.terminate();
      audio.current?.ctx.close();
    },
    [],
  );

  const start = async () => {
    if (!worker.current) worker.current = new Worker("/nes/voices.worker.mjs", { type: "module" });
    if (!audio.current) {
      const ctx = new AudioContext({ sampleRate: RATE });
      // Take out the pins' steady level before the speakers, then a
      // comfortable loudness.
      const dc = ctx.createBiquadFilter();
      dc.type = "highpass";
      dc.frequency.value = 20;
      const gain = ctx.createGain();
      gain.gain.value = 0.6;
      dc.connect(gain).connect(ctx.destination);
      audio.current = { ctx, out: dc, until: 0 };
    }
    await audio.current.ctx.resume();
    setOn(true);
    program(voices);
  };
  const stop = async () => {
    setOn(false);
    await audio.current?.ctx.suspend();
  };

  if (!cpuHz) return <p className="pg-waiting">Waiting for the console to report its clock...</p>;

  return (
    <div className="pg-voices">
      <div className="pg-row">
        <button className="pg-btn pg-btn-hot" onClick={on ? stop : start}>
          {on ? "Turn the sound off" : "Turn the sound on"}
        </button>
        <p className="pg-note pg-voices-clock">
          The chip&rsquo;s clock, from the console&rsquo;s own count: {(cpuHz / 1e6).toFixed(4)} million cycles a second.
        </p>
      </div>
      {error ? <p className="pg-error">{error}</p> : null}

      {VOICES.map((v, k) => {
        const s = voices[k];
        const muted = (mute & (1 << k)) !== 0;
        return (
          <section key={v.key} className="pg-voice" data-muted={muted} aria-label={v.name}>
            <div className="pg-voice-head">
              <p className="pg-voice-name">
                {v.name}
                <span>{v.role}</span>
              </p>
              <button className="pg-btn pg-voice-mute" aria-pressed={muted} onClick={() => setMute((m) => m ^ (1 << k))}>
                {muted ? "Muted" : "Mute"}
              </button>
            </div>
            <canvas ref={(el) => void (traces.current[k] = el)} className="pg-trace pg-voice-trace" style={{ height: 44 }} aria-label={`${v.name}'s output, as the chip produces it`} />
            <dl className="pg-console pg-voice-cells">
              <div>
                <dt>Pitch, measured</dt>
                <dd ref={(el) => void (pitch.current[k] = el)} data-k={`pitch-${v.key}`}>
                  ·
                </dd>
              </div>
              <div>
                <dt>{k < 3 ? "Note asked for" : "Playing"}</dt>
                <dd>{k < 3 ? (s.note == null ? "none" : `${NOTES[s.note].name} (${NOTES[s.note].hz.toFixed(1)} Hz)`) : s.on ? "yes" : "no"}</dd>
              </div>
            </dl>
            <div className="pg-voice-controls">
              {k < 3 ? (
                <div className="pg-keys" role="group" aria-label={`${v.name}'s keyboard`}>
                  {NOTES.map((n, i) => (
                    <button
                      key={i}
                      className="pg-key"
                      data-sharp={n.sharp}
                      aria-pressed={s.note === i}
                      aria-label={`${v.name}: ${n.name}`}
                      onClick={() => change(k, { note: s.note === i ? null : i })}
                    >
                      {n.sharp ? "" : n.name}
                    </button>
                  ))}
                </div>
              ) : (
                <button className="pg-btn" aria-pressed={s.on} onClick={() => change(k, { on: !s.on })}>
                  {s.on ? "Stop" : "Play"}
                </button>
              )}
              {k < 2 ? (
                <div className="pg-duties" role="radiogroup" aria-label={`${v.name}'s shape`}>
                  {DUTIES.map((d, i) => (
                    <button key={d} role="radio" aria-checked={s.duty === i} className="pg-duty" onClick={() => change(k, { duty: i })} aria-label={`high for ${d} eighths of each cycle`}>
                      <svg viewBox="0 0 40 16" aria-hidden="true">
                        <path d={dutyPath(d)} />
                      </svg>
                    </button>
                  ))}
                </div>
              ) : null}
              {k !== 2 && k !== 4 ? (
                <label className="pg-voice-slider">
                  Volume
                  <input type="range" min={0} max={15} value={s.volume} onChange={(e) => change(k, { volume: Number(e.target.value) })} />
                </label>
              ) : null}
              {k >= 3 ? (
                <label className="pg-voice-slider">
                  {k === 3 ? "Pitch" : "Rate"}
                  <input type="range" min={0} max={15} value={s.noiseRate} onChange={(e) => change(k, { noiseRate: Number(e.target.value) })} />
                </label>
              ) : null}
              {k === 3 ? (
                <label className="pg-check">
                  <input type="checkbox" checked={s.noiseLoop} onChange={(e) => change(k, { noiseLoop: e.target.checked })} />
                  Metallic (the short loop)
                </label>
              ) : null}
              {k === 2 ? <p className="pg-note">The triangle has no volume control: it is always this loud.</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
