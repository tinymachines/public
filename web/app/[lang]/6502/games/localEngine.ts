"use client";

/**
 * The console's other engine: the chip, in this page.
 *
 * A frame on this console is a whole machine handed to something that steps
 * it: the ROM's bytes, 64 KiB of memory and every node and transistor on the
 * die, out and back. Over HTTP that is `POST /v1/step` and halfwave answers
 * it. Here the same request is answered by the wasm build of the same engine,
 * running in the tab, and nothing leaves the page.
 *
 * The two are exchangeable because the machine is a value, not a session:
 * `console.js` holds it between frames and posts it whole, so whoever
 * answers the next post continues the same run. Measured on production
 * (e2e/console-engine.spec.ts, and notes/one-engine.md has the numbers):
 * boot and one 8,704 half-cycle frame of Die Runner leave the API and this
 * page with identical chip state, identical memory and the same eight gates.
 * That is the property the engine key is built on; it is checked rather than
 * asserted, because a switch between two engines that disagree would show up
 * as a game that misbehaves after a keypress and nothing would say why.
 *
 * ## What this module does not contain
 *
 * A chip. The wasm bundle embeds `netlist.bin`, which is derived from
 * CC BY-NC-SA 3.0 die data (NOTICE.md), so it is not built here and not
 * copied here: it is loaded at runtime from the 6502 project's own release,
 * which nginx already serves at `/6502/chip/` and which every explorer page
 * on this site already runs. The hashed filenames come from that release's
 * `asset-manifest.json`, so a new release is picked up without a rebuild
 * here, and a site that does not serve `/6502/chip/` (a preview, a local
 * `next start`) gets a refusal naming the reason rather than a console that
 * powers on and never draws.
 */

/** The part of the v6502-wasm `Machine` this transport uses. */
interface WasmMachine {
  load(addr: number, bytes: Uint8Array): void;
  fillMemory(byte: number): void;
  powerCycle(): void;
  runHalfCycles(n: number): void;
  exportMachine(): string;
  importMachine(
    value: string, pullup: string, pulldown: string, transOn: string,
    halfCycle: number, fetchAddr: number, fetchOpcode: number,
    fill: number, pageIds: Uint8Array, pageBytes: Uint8Array,
  ): void;
  nodeId(name: string): number;
  isNodeHigh(node: number): boolean;
}

interface WasmModule {
  default(): Promise<unknown>;
  Machine: new () => WasmMachine;
}

/** A machine, in the shape the API carries it and `console.js` holds it. */
export interface Machine {
  state: {
    value: string; pullup: string; pulldown: string; trans_on: string;
    half_cycle: number;
    last_fetch: { addr: number; opcode: number } | null;
  };
  memory: { fill: string; pages: Record<string, string> };
}

interface Answer {
  machine: Machine;
  observe: { watch: Record<string, boolean> };
  /** Half-cycles this call was asked for, as the API reports them. */
  stepped?: number;
}

type Transport = (path: string, body: Record<string, unknown>) => Promise<Answer>;

type Host = typeof globalThis & { tm6502Transport?: Transport };

const CHIP = "/6502/chip";

/** The engine, once. A second call while the first is in flight waits on it. */
let engine: Promise<WasmMachine> | null = null;

let on = false;
let refused: string | null = null;
const watchers = new Set<() => void>();

/** Whether the console's frames are running in this page right now. */
export function inPage(): boolean {
  return on;
}

/** Why the in-page chip is not running, or null. Cleared by a switch that lands. */
export function refusal(): string | null {
  return refused;
}

/** Repainted whenever either of the two above changes. */
export function watchEngine(fn: () => void): () => void {
  watchers.add(fn);
  return () => { watchers.delete(fn); };
}

function announce() {
  for (const fn of watchers) fn();
}

/**
 * A file from the 6502 release, by its unhashed name.
 *
 * The manifest rather than a written-out path: every asset there is content
 * hashed, so a path typed here would be right until the next release of that
 * project and then 404 with the page still rendering. ConsoleDriver.tsx
 * reaches `chip-controls.js` the same way.
 */
async function chipAsset(name: string): Promise<string> {
  const res = await fetch(`${CHIP}/asset-manifest.json`, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`the chip is not served here: ${CHIP}/asset-manifest.json answered ${res.status}`);
  }
  const manifest = (await res.json()) as Record<string, string>;
  const hashed = manifest[name];
  if (!hashed) throw new Error(`the chip release has no ${name}`);
  return `${CHIP}/${hashed}`;
}

/**
 * The wasm chip, loaded once.
 *
 * `init()` with no argument is deliberate: the glue resolves the bundle
 * against its own URL, and the build rewrote that to the hashed name, so the
 * pair always match. Passing a path from the manifest would be the same file
 * by a second route, which is one route too many.
 */
function loadEngine(): Promise<WasmMachine> {
  if (!engine) {
    engine = (async () => {
      const glue = await chipAsset("pkg/v6502_wasm.js");
      const mod = (await import(/* webpackIgnore: true */ glue)) as WasmModule;
      await mod.default();
      return new mod.Machine();
    })().catch((e) => {
      engine = null; // a failed load is not a loaded engine; the next try reloads
      throw e;
    });
  }
  return engine;
}

const pageBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(256);
  for (let i = 0; i < 256; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Write a machine into the engine: chip and memory in one call, or neither. */
function put(m: WasmMachine, machine: Machine) {
  const s = machine.state;
  const mem = machine.memory ?? { fill: "00", pages: {} };
  const keys = Object.keys(mem.pages ?? {});
  const ids = new Uint8Array(keys.map((k) => parseInt(k, 16)));
  const bytes = new Uint8Array(keys.length * 256);
  keys.forEach((k, i) => bytes.set(pageBytes(mem.pages[k]), i * 256));
  m.importMachine(
    s.value, s.pullup, s.pulldown, s.trans_on, s.half_cycle,
    s.last_fetch ? s.last_fetch.addr : -1,
    s.last_fetch ? s.last_fetch.opcode : 0,
    parseInt(mem.fill ?? "00", 16), ids, bytes,
  );
}

/**
 * The gates, sampled on this chip.
 *
 * A name the die does not carry is refused rather than reported low: the
 * cartridge's gates are eight real switches and a gate drawn shut because
 * nobody could find its control line is the plausible answer this site does
 * not give. `nodeId` returns -1 for a name it does not know.
 */
function sample(m: WasmMachine, names: string[] | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const name of names ?? []) {
    const id = m.nodeId(name);
    if (id < 0) throw new Error(`this cartridge watches ${name}, which is not a node on this die`);
    out[name] = m.isNodeHigh(id);
  }
  return out;
}

/**
 * The transport: the API's two verbs, answered here.
 *
 * `boot` lays the memory out and power-cycles, which is exactly what
 * halfwave's own BOOT does (load the image, then `power_cycle`), and `step`
 * runs half-cycles. Any other path is refused: a console that grew a third
 * call would otherwise get a quiet `undefined` from this engine and a real
 * answer from the other one.
 */
function transport(m: WasmMachine): Transport {
  const answer = async (path: string, body: Record<string, unknown>): Promise<Answer> => {
    const watch = body.watch as string[] | undefined;
    if (path === "boot") {
      const mem = (body.memory ?? { fill: "00", pages: {} }) as Machine["memory"];
      m.fillMemory(parseInt(mem.fill ?? "00", 16));
      for (const [page, hex] of Object.entries(mem.pages ?? {})) {
        m.load(parseInt(page, 16) << 8, pageBytes(hex));
      }
      m.powerCycle();
      return { machine: JSON.parse(m.exportMachine()) as Machine, observe: { watch: sample(m, watch) } };
    }
    if (path === "step") {
      const half = Number(body.half_cycles ?? 0);
      if (!Number.isFinite(half) || half < 0) throw new Error(`step: ${body.half_cycles} half-cycles`);
      put(m, body.machine as Machine);
      m.runHalfCycles(half);
      return {
        machine: JSON.parse(m.exportMachine()) as Machine,
        observe: { watch: sample(m, watch) },
        stepped: half,
      };
    }
    throw new Error(`the chip in this page does not answer /v1/${path}`);
  };
  /**
   * A frame that refuses says where it refused. `console.js` reports any
   * failed post as "the engine stopped answering", which is true of a round
   * trip and a lie about a chip that is in the room: the reason is kept here
   * and the settings page shows it while the console shows its own words.
   */
  return async (path, body) => {
    try {
      const out = await answer(path, body);
      if (refused) { refused = null; announce(); }
      return out;
    } catch (e) {
      refused = e instanceof Error ? e.message : String(e);
      announce();
      throw e;
    }
  };
}

/**
 * Run the console's frames in this page.
 *
 * Idempotent, and it throws with the reason when the chip cannot be loaded,
 * having changed nothing: the caller (ConsoleDriver) puts the console back
 * on the API and the refusal is what the settings page shows.
 */
export async function runHere(): Promise<void> {
  if (on) return;
  try {
    const m = await loadEngine();
    (globalThis as Host).tm6502Transport = transport(m);
    on = true;
    refused = null;
  } catch (e) {
    on = false;
    refused = e instanceof Error ? e.message : String(e);
    announce();
    throw e;
  }
  announce();
}

/** Hand the frames back to the API. The machine in flight is unaffected. */
export function runOverApi(): void {
  delete (globalThis as Host).tm6502Transport;
  on = false;
  refused = null;
  announce();
}
