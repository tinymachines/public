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

import { getSave, putSave, type Cart } from "@/lib/shelf";
import { latest as newestEvery } from "@/lib/latest";

export interface DriftStats {
  presented: number;
  duplicated: number;
  dropped: number;
}

export interface PlayState {
  loaded: string | null;
  running: boolean;
  /** False after power off: the cartridge is kept, the console is gone until power on. */
  powered: boolean;
  /** Console frames run, whether or not their picture was decoded. */
  framesRun: number;
  /** The CPU's half-cycles since power on, the bundle's one counter. */
  halfCycles: number;
  /** The image the reader loaded, as loaded: the base every edit is against. */
  base: Uint8Array | null;
  /** The image the console is running: the base, or the base with the reader's patch. */
  rom: Uint8Array | null;
  /** Whether the running image differs from the base, decided once at load. */
  patched: boolean;
  /** The 64 colours as the picture worker measured them, or null until a frame has been painted. */
  palette: number[][] | null;
  /** The shelf cartridge the image came from, or null for a file off the disk. */
  cart: Cart | null;
  /** The machine as the bundle reads it, after the last frame; null before one, or on a bundle without the reads. */
  machine: Machine | null;
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
  /** The save, for a shelf cartridge with a battery: when it was last written, and whether one came back on load. */
  battery: { has: boolean; restored: boolean; savedAt: number | null; saving: boolean; why: string | null } | null;
}

/** The CPU as the core holds it, from the bundle's ten bytes. */
export interface Cpu {
  a: number; x: number; y: number; s: number; p: number; pc: number;
  /** The last opcode fetch: where, and the opcode. */
  fetchPc: number; opcode: number;
}

/** The PPU's registers and where its beam is, from the bundle's twenty bytes. */
export interface Ppu {
  line: number; dot: number; ctrl: number; mask: number; v: number; t: number; fineX: number; w: boolean; oamAddr: number;
  vbl: boolean; spr0Hit: { line: number; dot: number } | null; sprOverflow: boolean;
}

export interface Machine {
  cpu: Cpu;
  ppu: Ppu;
  /** Palette RAM, 32 bytes. */
  palette: Uint8Array;
  /** OAM, 256 bytes. */
  oam: Uint8Array;
  /** The bus range the memory panel watches, and where it starts. */
  watched: Uint8Array;
  watchAt: number;
  /** A page of the bus from the program counter, for the code panel. */
  code: Uint8Array;
  codeAt: number;
}

interface RawState {
  cpu: Uint8Array; ppu: Uint8Array; palette: Uint8Array; oam: Uint8Array; watched: Uint8Array; watchAt: number; code: Uint8Array; codeAt: number;
}

function parseMachine(r: RawState | null | undefined): Machine | null {
  if (!r || r.cpu.length < 10 || r.ppu.length < 20) return null;
  const c = r.cpu, p = r.ppu;
  const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
  return {
    cpu: { a: c[0], x: c[1], y: c[2], s: c[3], p: c[4], pc: u16(c, 5), fetchPc: u16(c, 7), opcode: c[9] },
    ppu: {
      line: u16(p, 0), dot: u16(p, 2), ctrl: p[4], mask: p[5], v: u16(p, 6), t: u16(p, 8), fineX: p[10], w: p[11] !== 0, oamAddr: p[12],
      vbl: p[13] !== 0, spr0Hit: p[14] ? { line: u16(p, 15), dot: u16(p, 17) } : null, sprOverflow: p[19] !== 0,
    },
    palette: r.palette,
    oam: r.oam,
    watched: r.watched,
    watchAt: r.watchAt,
    code: r.code,
    codeAt: r.codeAt,
  };
}

interface ConsoleAnswer {
  colour: Uint8Array | null;
  emphasis: Uint8Array | null;
  parity: number;
  sound: Float32Array | null;
  stats: DriftStats;
  advanced: number;
  consoleMs: number;
  halfCycles?: number;
  state?: RawState | null;
  /** The "battery" path's answer: the header's bit and the RAM, or `restored` when one was put back. */
  has?: boolean;
  ram?: Uint8Array;
  restored?: boolean;
}
interface PaletteAnswer {
  rgb: number[][];
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
  powered: false,
  framesRun: 0,
  halfCycles: 0,
  base: null,
  rom: null,
  patched: false,
  palette: null,
  cart: null,
  machine: null,
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
  battery: null,
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
const pictureW = new Bridge<PictureAnswer | PaletteAnswer | null>(PICTURE_WORKER, "the picture worker failed to load; the signal path bundle may be absent");

let canvas: HTMLCanvasElement | null = null;
let lastT: number | null = null;
let pad = 0;
let tickInFlight = false;
/** Whether a call to the console is out; the site's checks read it too, to tell a pause from the tick it let finish. */
function setTicking(v: boolean) {
  tickInFlight = v;
  (window as unknown as { __playTicking?: boolean }).__playTicking = v;
}
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
/** Controller 2, on the left hand: W A S D for the cross, G is A, F is B, R Select, T Start. */
const KEYS2: Record<string, number> = {
  KeyG: 1,
  KeyF: 2,
  KeyR: 4,
  KeyT: 8,
  KeyW: 16,
  KeyS: 32,
  KeyA: 64,
  KeyD: 128,
};
let pad2 = 0;

function onKey(e: KeyboardEvent) {
  const bit = KEYS[e.code];
  const bit2 = KEYS2[e.code];
  if (bit === undefined && bit2 === undefined) return;
  // A key typed into a field is typing, not a button.
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (bit !== undefined) {
    if (e.type === "keydown") pad |= bit;
    else pad &= ~bit;
  }
  if (bit2 !== undefined) {
    if (e.type === "keydown") pad2 |= bit2;
    else pad2 &= ~bit2;
  }
  e.preventDefault();
}

/** Controller 2's byte. */
export function pad2Byte(): number {
  return pad2 & 0xff;
}

/** The on-screen pad's buttons, ORed with the keyboard's: bits in the register's order. */
let touchPad = 0;
export function setTouchPad(bits: number) {
  touchPad = bits & 0xff;
}
/** The byte the console will read on its next poll. */
export function padByte(): number {
  return (pad | touchPad) & 0xff;
}

/**
 * The screen hidden (the tab left, the phone locked, the app put away)
 * pauses the console (owner, 2026-09-23): a game that ran on in the
 * background was a game the reader came back to somewhere else, and its
 * battery was a save nobody watched. It does not resume on its own; the
 * play key does.
 */
function onPageHidden() {
  if (document.visibilityState !== "hidden" || !state.running) return;
  set({ running: false });
  void saveNow(true);
}

export function attach(c: HTMLCanvasElement) {
  canvas = c;
  if (consoleW.worker) return;
  consoleW.start();
  pictureW.start();
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  document.addEventListener("visibilitychange", onPageHidden);
  void consoleW.call({ path: "hello" });
  void pictureW.call({ path: "hello" });
}

export function detach() {
  void saveNow(true);
  stopWatching();
  keeper = null;
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("keyup", onKey);
  document.removeEventListener("visibilitychange", onPageHidden);
  consoleW.stop();
  pictureW.stop();
  canvas = null;
  bitmapCtx = null;
  latest = null;
  painted = [];
  last = null;
  void audio?.close();
  audio = null;
  state = INITIAL;
}

// ---------------------------------------------------------------------------
// The battery. A cartridge with one keeps what the game writes to its RAM;
// here the page keeps it, beside the cartridge on the account's shelf, and
// only for a cartridge that came from the shelf: a file off the disk has
// nowhere for its save to go. The RAM goes up when it has changed, every
// SAVE_EVERY_MS while the game runs, when it pauses, when the page is
// hidden, and before another cartridge loads. Nothing is written for a
// header without the battery bit.
// ---------------------------------------------------------------------------

const SAVE_EVERY_MS = 10_000;

/** The shelf cartridge that is loaded, if one is; the disk's files have none. */
let keeper: { cart: Cart; lastSent: string | null } | null = null;
let saveTimer: ReturnType<typeof setInterval> | null = null;

async function digest(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Write the cartridge RAM to the shelf if it has changed since it was last written. */
export async function saveNow(keepalive = false): Promise<void> {
  const k = keeper;
  if (!k || !state.battery?.has || state.battery.saving) return;
  const r = await consoleW.call({ path: "battery" });
  if (!r.ok) return;
  const ram = r.answer.ram;
  if (!ram) return;
  const d = await digest(ram);
  if (d === k.lastSent) return;
  set({ battery: { ...state.battery, saving: true } });
  try {
    await putSave(k.cart.id, ram, keepalive);
    k.lastSent = d;
    if (keeper === k && state.battery) set({ battery: { ...state.battery, saving: false, savedAt: Date.now(), why: null } });
  } catch (e) {
    if (keeper === k && state.battery) set({ battery: { ...state.battery, saving: false, why: String((e as Error).message ?? e) } });
  }
}

function watchForSaves() {
  if (saveTimer !== null) return;
  saveTimer = setInterval(() => void saveNow(), SAVE_EVERY_MS);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);
}
function onHide() {
  if (document.visibilityState === "hidden") void saveNow(true);
}
function stopWatching() {
  if (saveTimer !== null) clearInterval(saveTimer);
  saveTimer = null;
  document.removeEventListener("visibilitychange", onHide);
  window.removeEventListener("pagehide", onHide);
}

/**
 * A ROM, from the reader's disk or their shelf. It goes to the console
 * worker and nowhere else. With `cart` (the shelf's entry it came from) the
 * save comes back before the game starts and is kept from then on.
 */
export async function load(file: File, cart: Cart | null = null, base: Uint8Array | null = null) {
  set({ running: false });
  await waitIdle();
  await saveNow();
  keeper = null;
  last = { file, cart };
  const bytes = await file.arrayBuffer();
  // A copy stays on the page: the sprite sheet reads it, and the base is
  // what a patch is measured against. The buffer itself goes to the worker.
  const rom = new Uint8Array(bytes).slice();
  const patched = base !== null && !sameBytes(rom, base);
  set({ running: false, powered: false, framesRun: 0, halfCycles: 0, frames: 0, undecoded: 0, stats: null, consoleMs: null, pipeMs: null, encodeMs: null, fps: null, underruns: 0, why: null, battery: null, rom, base: base ?? rom, patched, cart });
  latest = null;
  painted = [];
  const r = await consoleW.call({ path: "load", rom: bytes }, [bytes]);
  if (!r.ok) {
    set({ loaded: null, why: r.error });
    return;
  }
  await pictureW.call({ path: "reset" });
  if (cart) {
    const b = await consoleW.call({ path: "battery" });
    if (b.ok && b.answer.has) {
      let restored = false;
      let why: string | null = null;
      let lastSent: string | null = null;
      try {
        const saved = cart.save ? await getSave(cart.id) : null;
        if (saved) {
          // The digest first: the buffer is handed to the worker and gone.
          lastSent = await digest(saved);
          const put = await consoleW.call({ path: "battery", ram: saved.buffer }, [saved.buffer]);
          if (!put.ok) throw new Error(put.error);
          restored = true;
        } else if (b.answer.ram) {
          // No save yet: the fresh RAM is the baseline, so a game that never
          // writes its RAM never makes one.
          lastSent = await digest(b.answer.ram);
        }
      } catch (e) {
        why = String((e as Error).message ?? e);
        lastSent = null;
      }
      keeper = { cart, lastSent };
      set({ battery: { has: true, restored, savedAt: cart.save ? Date.parse(cart.save.saved_at) : null, saving: false, why } });
      watchForSaves();
    } else {
      set({ battery: { has: false, restored: false, savedAt: null, saving: false, why: null } });
    }
  }
  set({ loaded: file.name, powered: true });
  void refreshMachine();
}

/**
 * The machine's state reaches the panels through a buffer while the
 * console runs: the worker answers every tick with it, and publishing
 * every one redrew every panel sixty times a second (the owner, on a
 * phone: "lots of blinking"). The newest answer is kept and published a
 * few times a second; paused, a step or a reset publishes at once, since
 * a reader stepping wants the panels to follow the step.
 */
const PANELS_EVERY_MS = 200;
const panels = newestEvery<Machine | null>(PANELS_EVERY_MS, (m) => set({ machine: m }));
function publishMachine(m: Machine | null, now = false) {
  if (now || !state.running) panels.now(m);
  else panels.push(m);
}

/** Until no tick or step is in flight: what every change of the console's life waits for. */
async function waitIdle() {
  while (tickInFlight) await new Promise((r) => setTimeout(r, 5));
}

/** The machine as it stands, asked of the worker: after a load and when a panel changes its watch. */
export async function refreshMachine() {
  const r = await consoleW.call({ path: "state" });
  if (r.ok) publishMachine(parseMachine((r.answer as { state?: RawState | null }).state), true);
}

/** The bus range the memory panel follows; the worker sends it back with every frame. */
export async function watch(at: number, len = 256) {
  const r = await consoleW.call({ path: "watch", at, len });
  if (r.ok) {
    const st = (r.answer as { state?: RawState | null }).state;
    if (st) publishMachine(parseMachine(st), true);
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The last cartridge loaded, for power on and the power cycle. */
let last: { file: File; cart: Cart | null } | null = null;

/**
 * Power, as the transport's key. Off drops the console in the worker and
 * keeps the cartridge; the picture it last painted stays on the page, as
 * the chip pages leave what they hold. On loads the cartridge again, which
 * is the state it powered on into (and the save comes back with it): the
 * bundle has no reset of its own, so a power cycle is the reset.
 */
export async function setPower(on: boolean) {
  if (!state.loaded || !last) return;
  if (!on) {
    if (!state.powered) return;
    set({ running: false });
    // The tick in flight finishes on the console that is about to go: an
    // "off" that overtook it answered "no cartridge loaded" to the tick,
    // which the page showed as a refusal (the owner's lockups).
    await waitIdle();
    await saveNow();
    stopWatching();
    keeper = null;
    await consoleW.call({ path: "off" });
    publishMachine(null, true);
    set({ powered: false });
    return;
  }
  if (state.powered) return;
  await load(last.file, last.cart, state.base);
}

/** Back to power on: the same cartridge, loaded again. */
export async function powerCycle() {
  if (!state.loaded || !last) return;
  await load(last.file, last.cart, state.base);
}

/**
 * The reader's patched image into the console: the same name, the same
 * shelf cartridge (so its save still belongs to it), the base kept as the
 * base. Power cycles from here on run the patched image, until the base
 * is loaded back the same way.
 */
export async function reloadWith(image: Uint8Array) {
  if (!state.loaded || !last || !state.base) return;
  const name = last.file.name;
  await load(new File([image.slice().buffer as ArrayBuffer], name, { type: "application/octet-stream" }), last.cart, state.base);
}

/** The picture worker's measured colours, asked for once per paint until there are some. */
let paletteAsked = false;
function askPalette() {
  if (state.palette || paletteAsked) return;
  paletteAsked = true;
  void pictureW.call({ path: "palette" }).then((r) => {
    paletteAsked = false;
    if (r.ok && r.answer && "rgb" in r.answer) set({ palette: r.answer.rgb });
  });
}

/**
 * One step of the machine's own unit, while paused: a CPU half-cycle, a
 * cycle, an instruction, or a scanline. A frame that completes inside the
 * step is painted; the state comes back with every step.
 */
export async function step(kind: "half" | "cycle" | "op" | "line") {
  if (!state.loaded || !state.powered || state.running || tickInFlight) return;
  setTicking(true);
  const r = await consoleW.call({ path: "step", kind, pad: padByte(), pad2: pad2Byte() });
  setTicking(false);
  if (!r.ok) {
    set({ why: r.error });
    return;
  }
  const a = r.answer;
  if (a.colour && a.emphasis) {
    if (latest) set({ undecoded: state.undecoded + 1 });
    latest = { colour: a.colour, emphasis: a.emphasis, parity: a.parity };
    kick();
  }
  set({ framesRun: state.framesRun + (a.advanced ?? 0), halfCycles: a.halfCycles ?? state.halfCycles });
  if (a.state) publishMachine(parseMachine(a.state), true);
}

/** The front panel's reset button: the CPU restarts at its vector; RAM and the save keep what they hold. */
export async function reset() {
  if (!state.loaded || !state.powered) return;
  const wasRunning = state.running;
  if (wasRunning) set({ running: false });
  await waitIdle();
  const r = await consoleW.call({ path: "reset" });
  if (!r.ok) {
    set({ why: r.error });
    return;
  }
  const a = r.answer;
  if (a.colour && a.emphasis) {
    latest = { colour: a.colour, emphasis: a.emphasis, parity: a.parity };
    kick();
  }
  set({ halfCycles: a.halfCycles ?? state.halfCycles });
  if (a.state) publishMachine(parseMachine(a.state), true);
  if (wasRunning) toggleRun();
}

/** One frame, while paused: the way to watch a game a frame at a time. */
export async function stepFrame() {
  if (!state.loaded || !state.powered || state.running || tickInFlight) return;
  setTicking(true);
  const r = await consoleW.call({ path: "frame", pad: padByte(), pad2: pad2Byte() });
  setTicking(false);
  if (!r.ok) {
    set({ why: r.error });
    return;
  }
  const a = r.answer;
  if (a.colour && a.emphasis) {
    if (latest) set({ undecoded: state.undecoded + 1 });
    latest = { colour: a.colour, emphasis: a.emphasis, parity: a.parity };
    kick();
  }
  if (a.sound && a.sound.length > 0 && audio) play(a.sound);
  set({ framesRun: state.framesRun + a.advanced, halfCycles: a.halfCycles ?? state.halfCycles, consoleMs: a.consoleMs });
  if (a.state) publishMachine(parseMachine(a.state), true);
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
      paint(r.answer as PictureAnswer);
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
  askPalette();
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
  if (!state.running) return;
  // A step or a frame still in flight: try again next frame rather than
  // give up, which left the key reading "pause" over a console that never
  // ran again (the owner's lockups, 2026-09-23).
  if (tickInFlight) {
    requestAnimationFrame(() => void loop());
    return;
  }
  setTicking(true);
  const now = performance.now();
  const dtNs = lastT === null ? 0 : (now - lastT) * 1e6;
  lastT = now;
  const r = await consoleW.call({ path: "tick", dtNs, pad: padByte(), pad2: pad2Byte() });
  setTicking(false);
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
  set({ stats: a.stats, framesRun: state.framesRun + a.advanced, halfCycles: a.halfCycles ?? state.halfCycles });
  if (a.state) publishMachine(parseMachine(a.state));
  if (state.running) requestAnimationFrame(() => void loop());
}

export function toggleRun() {
  if (!state.loaded || !state.powered) return;
  if (state.running) {
    set({ running: false });
    void saveNow();
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
