/**
 * The console page's seam: the worker, the pacing loop, the canvas, the
 * keyboard and the audio cursor, at module scope, with the component a
 * follower of announcements (the ntsc bench's benchEngine, for the same
 * reasons: render code is not a frame loop).
 *
 * The worker (public/nes/console.worker.mjs) holds both boarded bundles.
 * One tick is in flight at a time, so the dt each display callback
 * reports is the true cost of the one before, which is what the drift
 * counters measure. Sound: each tick's samples are scheduled on a running
 * cursor a little ahead of the audio clock; a cursor that fell behind is
 * an underrun, counted and reset.
 */

export interface DriftStats {
  presented: number;
  duplicated: number;
  dropped: number;
}

export interface PlayState {
  loaded: string | null;
  running: boolean;
  frames: number;
  consoleMs: number | null;
  pipeMs: number | null;
  stats: DriftStats | null;
  underruns: number;
  audio: boolean;
  why: string | null;
}

interface Answer {
  rgba: Uint8Array | null;
  sound: Float32Array | null;
  stats: DriftStats;
  advanced: number;
  consoleMs: number;
  pipeMs: number;
  width?: number;
  height?: number;
}
type Outcome = { ok: true; answer: Answer } | { ok: false; error: string };

const WORKER = "/nes/console.worker.mjs";
const RATE = 48_000;
/** Listening level: one table unit times the stage gain to this much of full scale. */
const LEVEL = 0.25;
/** How far ahead of the audio clock the cursor starts, seconds. */
const LEAD = 0.06;

const INITIAL: PlayState = {
  loaded: null,
  running: false,
  frames: 0,
  consoleMs: null,
  pipeMs: null,
  stats: null,
  underruns: 0,
  audio: false,
  why: null,
};

let state: PlayState = INITIAL;
const listeners = new Set<() => void>();
function set(patch: Partial<PlayState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function snapshot(): PlayState {
  return state;
}
export function serverSnapshot(): PlayState {
  return INITIAL;
}

let worker: Worker | null = null;
let canvas: HTMLCanvasElement | null = null;
let nextId = 0;
let lastT: number | null = null;
let pad = 0;
let inFlight = false;
const pending = new Map<number, (o: Outcome) => void>();
let audio: AudioContext | null = null;
let cursor = 0;

/** The pad as the register's byte: A, B, Select, Start, Up, Down, Left, Right from bit 0. */
const KEYS: Record<string, number> = {
  KeyX: 1,
  KeyZ: 2,
  ShiftRight: 4,
  Enter: 8,
  ArrowUp: 16,
  ArrowDown: 32,
  ArrowLeft: 64,
  ArrowRight: 128,
};

function onKey(e: KeyboardEvent) {
  const bit = KEYS[e.code];
  if (bit === undefined) return;
  if (e.type === "keydown") pad |= bit;
  else pad &= ~bit;
  e.preventDefault();
}

export function attach(c: HTMLCanvasElement) {
  canvas = c;
  if (worker) return;
  const w = new Worker(WORKER, { type: "module" });
  worker = w;
  w.onmessage = (e) => {
    const { id, ...rest } = e.data as { id: number } & Outcome;
    pending.get(id)?.(rest as Outcome);
    pending.delete(id);
  };
  w.onerror = () => {
    set({ why: "the console worker failed to load; a bundle may be absent", running: false });
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  void call({ path: "hello" });
}

export function detach() {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("keyup", onKey);
  worker?.terminate();
  worker = null;
  canvas = null;
  pending.clear();
  void audio?.close();
  audio = null;
  state = INITIAL;
}

function call(body: Record<string, unknown>, transfer: Transferable[] = []): Promise<Outcome> {
  if (!worker) return Promise.resolve({ ok: false, error: "no worker" });
  const id = ++nextId;
  const w = worker;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, ...body }, transfer);
  });
}

/** A ROM from the reader's disk. It goes to the worker and nowhere else. */
export async function load(file: File) {
  const bytes = await file.arrayBuffer();
  set({ running: false, frames: 0, stats: null, consoleMs: null, pipeMs: null, underruns: 0, why: null });
  const r = await call({ path: "load", rom: bytes }, [bytes]);
  if (!r.ok) {
    set({ loaded: null, why: r.error });
    return;
  }
  set({ loaded: file.name });
}

function play(samples: Float32Array) {
  if (!audio) return;
  const buf = audio.createBuffer(1, samples.length, RATE);
  const data = buf.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    data[i] = Math.max(-1, Math.min(1, samples[i] * LEVEL));
  }
  const src = audio.createBufferSource();
  src.buffer = buf;
  src.connect(audio.destination);
  const now = audio.currentTime;
  if (cursor < now) {
    // The cursor fell behind the clock: an underrun, counted, and the
    // cursor restarts a little ahead.
    if (state.frames > 0) set({ underruns: state.underruns + 1 });
    cursor = now + LEAD;
  }
  src.start(cursor);
  cursor += samples.length / RATE;
}

function paint(a: Answer) {
  if (a.rgba && a.width && a.height && canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (canvas.width !== a.width || canvas.height !== a.height) {
        canvas.width = a.width;
        canvas.height = a.height;
      }
      ctx.putImageData(new ImageData(new Uint8ClampedArray(a.rgba.buffer as ArrayBuffer), a.width, a.height), 0, 0);
    }
    set({ frames: state.frames + 1, consoleMs: a.consoleMs, pipeMs: a.pipeMs });
  }
  if (a.sound && a.sound.length > 0) play(a.sound);
  set({ stats: a.stats });
}

async function loop() {
  if (!state.running || inFlight) return;
  inFlight = true;
  const now = performance.now();
  const dtNs = lastT === null ? 0 : (now - lastT) * 1e6;
  lastT = now;
  const r = await call({ path: "tick", dtNs, pad });
  inFlight = false;
  if (!r.ok) {
    set({ running: false, why: r.error });
    return;
  }
  paint(r.answer);
  if (state.running) requestAnimationFrame(() => void loop());
}

export function toggleRun() {
  if (!state.loaded) return;
  if (state.running) {
    set({ running: false });
    return;
  }
  if (!audio) {
    try {
      audio = new AudioContext({ sampleRate: RATE });
      set({ audio: true });
    } catch {
      audio = null;
      set({ audio: false });
    }
  }
  void audio?.resume();
  cursor = 0;
  set({ running: true, why: null });
  lastT = null;
  void loop();
}
