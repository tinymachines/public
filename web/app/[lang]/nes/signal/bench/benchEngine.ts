/**
 * The bench's seam: the worker, the pacing loop and the canvas, at module
 * scope, with the component reduced to a follower of announcements. The
 * same shape as the console's localEngine.ts, for the same reason: a React
 * component's body is render code, and a frame loop that reads clocks and
 * refs does not belong in render code.
 *
 * The worker (public/ntsc/bench.worker.mjs) holds the boarded wasm; one
 * request is in flight at a time, so the dt each display callback reports
 * is the true cost of the frame before it, which is what the pipeline's
 * drift counters are for.
 */

export type Rung = "notch" | "comb3";
export type Pattern = "hue-bands" | "stripes" | "solid";

export interface DriftStats {
  presented: number;
  duplicated: number;
  dropped: number;
}

export interface BenchState {
  rung: Rung;
  pattern: Pattern;
  running: boolean;
  busy: boolean;
  frames: number;
  ms: number | null;
  stats: DriftStats | null;
  why: string | null;
}

interface Answer {
  rgba: Uint8Array | null;
  ms?: number;
  width?: number;
  height?: number;
  stats: DriftStats | null;
  advanced: number;
}
type Outcome = { ok: true; answer: Answer } | { ok: false; error: string };

const WORKER = "/ntsc/bench.worker.mjs";

const INITIAL: BenchState = {
  rung: "notch",
  pattern: "hue-bands",
  running: false,
  busy: false,
  frames: 0,
  ms: null,
  stats: null,
  why: null,
};

let state: BenchState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<BenchState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function snapshot(): BenchState {
  return state;
}
/** What the server rendered: the state before any worker existed. */
export function serverSnapshot(): BenchState {
  return INITIAL;
}

let worker: Worker | null = null;
let canvas: HTMLCanvasElement | null = null;
let nextId = 0;
let lastT: number | null = null;
const pending = new Map<number, (o: Outcome) => void>();

/** The component mounts the canvas here; unmount tears the thread down. */
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
    set({ why: "the bench worker failed to load; the wasm bundle may be absent", running: false });
  };
}

export function detach() {
  worker?.terminate();
  worker = null;
  canvas = null;
  pending.clear();
  state = INITIAL;
}

function call(body: Record<string, unknown>): Promise<Outcome> {
  if (!worker) return Promise.resolve({ ok: false, error: "no worker" });
  const id = ++nextId;
  const w = worker;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, ...body });
  });
}

function paint(a: Answer) {
  if (a.rgba && a.width && a.height && canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = a.width;
      canvas.height = a.height;
      const bytes = new Uint8ClampedArray(a.rgba.buffer as ArrayBuffer);
      ctx.putImageData(new ImageData(bytes, a.width, a.height), 0, 0);
    }
    set({
      frames: state.frames + 1,
      ...(a.ms !== undefined ? { ms: a.ms } : null),
    });
  }
  if (a.stats) set({ stats: a.stats });
}

export function choose(patch: { rung?: Rung; pattern?: Pattern }) {
  set(patch);
}

export async function step() {
  if (state.busy || state.running) return;
  set({ busy: true });
  const r = await call({ path: "step", rung: state.rung, pattern: state.pattern });
  if (!r.ok) {
    set({ busy: false, why: r.error });
    return;
  }
  set({ busy: false, why: null });
  paint(r.answer);
}

async function loop() {
  if (!state.running) return;
  const now = performance.now();
  const dtNs = lastT === null ? 0 : (now - lastT) * 1e6;
  lastT = now;
  const r = await call({ path: "tick", dtNs, rung: state.rung, pattern: state.pattern });
  if (!r.ok) {
    set({ running: false, why: r.error });
    return;
  }
  if (state.why) set({ why: null });
  paint(r.answer);
  requestAnimationFrame(() => void loop());
}

export function toggleRun() {
  if (state.running) {
    set({ running: false });
    return;
  }
  set({ running: true });
  lastT = null;
  void loop();
}
