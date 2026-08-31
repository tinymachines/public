"use client";

/**
 * The console's other engine: the chip, in this page.
 *
 * A frame on this console is a whole machine handed to something that steps
 * it: the ROM's bytes, 64 KiB of memory, and every node and transistor on the
 * die, out and back. Over HTTP that is `POST /v1/step` and halfwave answers
 * it. Here the same request is answered by the wasm build of the same engine,
 * on a worker thread beside the page, and nothing leaves the tab.
 *
 * The two are exchangeable because the machine is a value, not a session:
 * `console.js` holds it between frames and posts it whole, so whoever answers
 * the next post continues the same run. That is checked rather than asserted
 * (`e2e/console-engine.spec.ts`): boot and one 8,704 half-cycle frame of Die
 * Runner leave the API and this chip with identical state, identical memory
 * and the same eight gates. A switch between two engines that quietly
 * disagreed would show up as a game that misbehaves after a keypress, with
 * nothing to say why.
 *
 * This file is the page's half: it installs a transport at
 * `globalThis.tm6502Transport`, which the build patches `console.js`'s
 * `post()` to try first (lib/console-modules.ts). The chip itself, and the
 * two verbs, are in `public/engine/console-chip.worker.mjs`, which is where
 * the comment about why a worker is, and where the wasm is loaded from the
 * 6502 release at `/6502/chip/` rather than copied into this repository
 * (it embeds die data; NOTICE.md).
 */

/** A machine, in the shape the API carries it and `console.js` holds it.
 * The node engines carry four hex planes; rung 3 carries `micro`, its own
 * value, where the planes would be. Exactly one of the two shapes is
 * present, and the worker refuses a machine handed to an engine that
 * cannot continue it. */
export interface Machine {
  state: {
    value?: string; pullup?: string; pulldown?: string; trans_on?: string;
    micro?: string;
    half_cycle: number;
    last_fetch: { addr: number; opcode: number } | null;
  };
  memory: { fill: string; pages: Record<string, string> };
}

interface Answer {
  machine: Machine;
  observe: { watch: Record<string, boolean> };
  stepped?: number;
}

type Transport = (path: string, body: Record<string, unknown>) => Promise<Answer>;

type Host = typeof globalThis & { tm6502Transport?: Transport };

const WORKER = "/engine/console-chip.worker.mjs";

/**
 * Which chip in this page answers: rung 0 (`chip`, the switch-level solver),
 * rung 1 (`hybrid`, the same solver with the recognised gates folded into
 * counters, bit-exact with rung 0 every node every half-cycle), rung 2
 * (`compiled`, the recognised network as generated code, held to rung 0 at
 * the pins, the gates and the memory rather than node for node), or rung 3
 * (`micro`, no nodes at all: the control table measured out of rung 0,
 * held to the whole pin golden, and quick enough for real time). The
 * machine is the same value on the first three, so switching among them or
 * to the API hands the run over whole. Rung 3's machine value is ITS OWN
 * (state.micro on the wire), so a run cannot cross onto or off it
 * mid-game: the worker refuses by name, and pressing power starts the
 * cartridge on the chosen engine.
 */
export type EngineKind = "chip" | "hybrid" | "compiled" | "micro";

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { ok: (a: Answer) => void; no: (e: Error) => void }>();

let on = false;
let kind: EngineKind = "chip";
/** An install in flight, so a second caller waits on the first. */
let starting: Promise<void> | null = null;
let refused: string | null = null;
/** Where the refusal came from, so the right thing clears it. */
let refusedBy: "transport" | "switch" | null = null;
const watchers = new Set<() => void>();

/** Whether the console's frames are running in this page right now. */
export function inPage(): boolean {
  return on;
}

/** Which in-page engine is answering, or null while the API is. */
export function engineKind(): EngineKind | null {
  return on ? kind : null;
}

/**
 * Why the in-page chip is not running, or null. A refusal knows its source:
 * a TRANSPORT refusal (a frame that failed here) is cleared by the next call
 * that lands, and a SWITCH refusal (an engine that never started) stays
 * until a switch lands or the API takes over. The frames landing on the old
 * engine prove the transport works; they say nothing about the refused
 * switch, and wiping its reason was exactly the bug (2026-08-30).
 */
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
 * The worker, started once.
 *
 * A module worker: the chip's glue is an ES module and imports the wasm
 * bundle itself. A browser without them refuses here rather than starting
 * something that would answer nothing.
 */
function thread(): Worker {
  if (!worker) {
    const w = new Worker(WORKER, { type: "module" });
    w.onmessage = (e: MessageEvent) => {
      const { id, ok, answer, error } = e.data ?? {};
      const seat = waiting.get(id);
      if (!seat) return;
      waiting.delete(id);
      if (ok) seat.ok(answer as Answer);
      else seat.no(new Error(String(error)));
    };
    // A worker that dies takes every frame in flight with it, and says so
    // rather than leaving the console waiting on a promise nobody will keep.
    w.onerror = (e: ErrorEvent) => {
      const err = new Error(e.message || "the chip's thread stopped");
      for (const [, seat] of waiting) seat.no(err);
      waiting.clear();
      worker = null;
      refused = err.message;
      refusedBy = "transport";
      on = false;
      delete (globalThis as Host).tm6502Transport;
      announce();
    };
    worker = w;
  }
  return worker;
}

function ask(path: string, body: Record<string, unknown>, engine: EngineKind): Promise<Answer> {
  const id = nextId++;
  const w = thread();
  return new Promise<Answer>((ok, no) => {
    waiting.set(id, { ok, no });
    w.postMessage({ id, path, body, engine });
  });
}

/**
 * The transport, in the shape `post()` returns.
 *
 * A frame that refuses says where it refused. `console.js` reports any failed
 * post as "the engine stopped answering", which is true of a round trip and a
 * lie about a chip that is in the room, so the reason is kept here and the
 * settings page shows it while the console shows its own words.
 */
const transport: Transport = async (path, body) => {
  try {
    // The kind is read per call, like the transport itself: a switch between
    // the two in-page engines lands on the next frame, machine in hand.
    const out = await ask(path, body, kind);
    if (refused && refusedBy === "transport") { refused = null; refusedBy = null; announce(); }
    return out;
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
    refusedBy = "transport";
    announce();
    throw e;
  }
};

/**
 * Run the console's frames in this page.
 *
 * The chip is loaded and greeted before the transport is installed, so a
 * browser or an origin that cannot have it refuses at the switch rather than
 * mid-game: the caller (ConsoleDriver) puts the console back on the API and
 * `refusal()` is what the settings page shows. Idempotent.
 */
export function runHere(which: EngineKind = "chip"): Promise<void> {
  if (on && kind === which) return Promise.resolve();
  // The PROMISE is kept, not just the flag: the store announces more than
  // once at mount and every announce asks the driver to follow it, so two
  // installs used to start a millisecond apart, and both greeted the chip
  // before either had set the flag. The worker's own comment has what that
  // cost (two wasm instances, a console that played fourteen frames and
  // then trapped). With two in-page engines the starts are serialised for
  // the same reason: the second wish waits for the first greeting, then
  // greets its own chip.
  const start = (starting ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (on && kind === which) return;
    if (typeof Worker !== "function") throw new Error("this browser has no workers to run the chip on");
    await ask("hello", {}, which);
    kind = which;
    (globalThis as Host).tm6502Transport = transport;
    on = true;
    refused = null;
    refusedBy = null;
    announce();
  }).catch((e) => {
    // A greeting that failed leaves whatever was answering before it (a
    // running rung keeps running, a cold start stays on the API), and the
    // reason is kept for the settings screen either way.
    refused = e instanceof Error ? e.message : String(e);
    refusedBy = "switch";
    announce();
    throw e;
  }).finally(() => { if (starting === start) starting = null; });
  starting = start;
  return start;
}

/**
 * Hand the frames back to the API. The machine in flight is unaffected: it is
 * a value the console is holding, and the next post simply goes over HTTP.
 * The thread stays, so a switch back does not reload the chip.
 */
export function runOverApi(): void {
  delete (globalThis as Host).tm6502Transport;
  on = false;
  refused = null;
  refusedBy = null;
  announce();
}
