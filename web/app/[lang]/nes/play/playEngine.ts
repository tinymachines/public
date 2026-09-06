/**
 * The console page's seam: two workers, the pacing loop, the canvas, the
 * keyboard and the audio cursor, at module scope, with the component a
 * follower of announcements (the ntsc bench's benchEngine, for the same
 * reasons: render code is not a frame loop).
 *
 * The console worker (public/nes/console.worker.mjs) runs the console
 * paced by the drift policy; one tick is in flight at a time, so the dt
 * each display callback reports is the true cost of the one before. The
 * picture worker (public/nes/picture.worker.mjs) decodes the newest frame
 * at its own rate: a frame the console produced while the picture was
 * busy is replaced by the next and counted as undecoded, so the console
 * never waits for the picture and the sound never stalls for it. The
 * picture worker draws on its own canvas (WebGPU where the browser gives
 * it one and its decode agrees with the wasm decode, the wasm decode
 * otherwise) and sends each frame as an ImageBitmap the page's canvas
 * shows. Sound:
 * each tick's samples are scheduled on a running cursor a little ahead of
 * the audio clock; a cursor that fell behind is an underrun, counted and
 * reset.
 */

export interface DriftStats {
  presented: number;
  duplicated: number;
  dropped: number;
}

export interface PlayState {
  loaded: string | null;
  running: boolean;
  /** Pictures painted. */
  frames: number;
  /** Console frames run but never decoded (the picture was busy). */
  undecoded: number;
  consoleMs: number | null;
  pipeMs: number | null;
  /** Pictures painted in the last second. */
  fps: number | null;
  /** The decode's path: "webgpu" or "wasm", and why the wasm one if so. */
  path: string | null;
  pathWhy: string | null;
  /** The WebGPU decode against the wasm decode on the first frame, bytes of 255. */
  agreement: number | null;
  tolerance: number | null;
  /** The WebGPU encoder against the wasm encoder on the first frame, volts. */
  agreementV: number | null;
  toleranceV: number | null;
  /** The first painted frame's middle-row byte sum: a lit picture. */
  lit: number;
  encodeMs: number | null;
  stats: DriftStats | null;
  underruns: number;
  audio: boolean;
  why: string | null;
}

interface ConsoleAnswer {
  colour: Uint8Array | null;
  emphasis: Uint8Array | null;
  parity: number;
  sound: Float32Array | null;
  stats: DriftStats;
  advanced: number;
  consoleMs: number;
}
interface PictureAnswer {
  bitmap: ImageBitmap;
  path: string;
  why: string | null;
  agreement: number | null;
  tolerance: number;
  agreementV: number | null;
  toleranceV: number;
  lit: number;
  encodeMs: number;
  decodeMs: number;
  width: number;
  height: number;
}
type Outcome<A> = { ok: true; answer: A } | { ok: false; error: string };

const CONSOLE_WORKER = "/nes/console.worker.mjs";
const PICTURE_WORKER = "/nes/picture.worker.mjs";
const RATE = 48_000;
/** Listening level: one table unit times the stage gain to this much of full scale. */
const LEVEL = 0.25;
/** How far ahead of the audio clock the cursor starts, seconds. */
const LEAD = 0.06;

const INITIAL: PlayState = {
  loaded: null,
  running: false,
  frames: 0,
  undecoded: 0,
  consoleMs: null,
  pipeMs: null,
  fps: null,
  path: null,
  pathWhy: null,
  agreement: null,
  tolerance: null,
  agreementV: null,
  toleranceV: null,
  lit: 0,
  encodeMs: null,
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

class Bridge<A> {
  worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<number, (o: Outcome<A>) => void>();
  constructor(private url: string, private onFail: string) {}
  start() {
    if (this.worker) return;
    const w = new Worker(this.url, { type: "module" });
    this.worker = w;
    w.onmessage = (e) => {
      const { id, ...rest } = e.data as { id: number } & Outcome<A>;
      this.pending.get(id)?.(rest as Outcome<A>);
      this.pending.delete(id);
    };
    w.onerror = () => set({ why: this.onFail, running: false });
  }
  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
  call(body: Record<string, unknown>, transfer: Transferable[] = []): Promise<Outcome<A>> {
    if (!this.worker) return Promise.resolve({ ok: false, error: "no worker" });
    const id = ++this.nextId;
    const w = this.worker;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      w.postMessage({ id, ...body }, transfer);
    });
  }
}

const consoleW = new Bridge<ConsoleAnswer>(CONSOLE_WORKER, "the console worker failed to load; the console bundle may be absent");
const pictureW = new Bridge<PictureAnswer>(PICTURE_WORKER, "the picture worker failed to load; the signal path bundle may be absent");

let canvas: HTMLCanvasElement | null = null;
let lastT: number | null = null;
let pad = 0;
let tickInFlight = false;
let pictureBusy = false;
let latest: { colour: Uint8Array; emphasis: Uint8Array; parity: number } | null = null;
let painted: number[] = [];
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
  if (consoleW.worker) return;
  consoleW.start();
  pictureW.start();
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  void consoleW.call({ path: "hello" });
  void pictureW.call({ path: "hello" });
}

export function detach() {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("keyup", onKey);
  consoleW.stop();
  pictureW.stop();
  canvas = null;
  bitmapCtx = null;
  latest = null;
  painted = [];
  void audio?.close();
  audio = null;
  state = INITIAL;
}

/** A ROM from the reader's disk. It goes to the console worker and nowhere else. */
export async function load(file: File) {
  const bytes = await file.arrayBuffer();
  set({ running: false, frames: 0, undecoded: 0, stats: null, consoleMs: null, pipeMs: null, encodeMs: null, fps: null, underruns: 0, why: null });
  latest = null;
  painted = [];
  const r = await consoleW.call({ path: "load", rom: bytes }, [bytes]);
  if (!r.ok) {
    set({ loaded: null, why: r.error });
    return;
  }
  await pictureW.call({ path: "reset" });
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
    if (state.frames > 0) set({ underruns: state.underruns + 1 });
    cursor = now + LEAD;
  }
  src.start(cursor);
  cursor += samples.length / RATE;
}

/** Hand the newest frame to the picture worker if it is idle. */
function kick() {
  if (pictureBusy || !latest) return;
  const f = latest;
  latest = null;
  pictureBusy = true;
  void pictureW
    .call({ path: "frame", colour: f.colour, emphasis: f.emphasis, parity: f.parity }, [f.colour.buffer, f.emphasis.buffer])
    .then((r) => {
      pictureBusy = false;
      if (!r.ok) {
        set({ why: r.error });
        return;
      }
      paint(r.answer);
      kick();
    });
}

let bitmapCtx: ImageBitmapRenderingContext | null = null;

function paint(a: PictureAnswer) {
  // The worker painted on its own canvas (WebGPU or 2d) and sent the
  // bitmap; the page's canvas shows it with no copy.
  if (canvas) {
    if (!bitmapCtx) bitmapCtx = canvas.getContext("bitmaprenderer");
    if (bitmapCtx) bitmapCtx.transferFromImageBitmap(a.bitmap);
    else a.bitmap.close();
  } else {
    a.bitmap.close();
  }
  const now = performance.now();
  painted.push(now);
  while (painted.length && painted[0] < now - 1000) painted.shift();
  set({
    frames: state.frames + 1,
    pipeMs: a.decodeMs,
    encodeMs: a.encodeMs,
    fps: painted.length,
    path: a.path,
    pathWhy: a.why,
    agreement: a.agreement,
    tolerance: a.tolerance,
    agreementV: a.agreementV,
    toleranceV: a.toleranceV,
    lit: a.lit,
  });
  // For the site's own check, which cannot read an OffscreenCanvas.
  (window as unknown as { __playLit?: number }).__playLit = a.lit;
}

async function loop() {
  if (!state.running || tickInFlight) return;
  tickInFlight = true;
  const now = performance.now();
  const dtNs = lastT === null ? 0 : (now - lastT) * 1e6;
  lastT = now;
  const r = await consoleW.call({ path: "tick", dtNs, pad });
  tickInFlight = false;
  if (!r.ok) {
    set({ running: false, why: r.error });
    return;
  }
  const a = r.answer;
  if (a.colour && a.emphasis) {
    if (latest) set({ undecoded: state.undecoded + 1 });
    latest = { colour: a.colour, emphasis: a.emphasis, parity: a.parity };
    set({ consoleMs: a.consoleMs / Math.max(1, a.advanced) });
    kick();
  }
  if (a.sound && a.sound.length > 0) play(a.sound);
  set({ stats: a.stats });
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
