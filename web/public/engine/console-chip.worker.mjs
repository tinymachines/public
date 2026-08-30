/**
 * The console's chip, on a thread of its own.
 *
 * The console's frames are answered by whoever holds the chip: halfwave over
 * HTTP, or this worker. It speaks the API's own two verbs so that the page
 * side is a transport and nothing more:
 *
 *   main -> here    { id, path: 'hello' | 'boot' | 'step', body, engine }
 *   here -> main    { id, ok: true, answer } | { id, ok: false, error }
 *
 * `engine` picks which chip answers: 'chip' (rung 0, the switch-level
 * solver), 'hybrid' (rung 1, the same solver with the recognised gates
 * folded into counters, bit-exact with rung 0 every node every half-cycle),
 * or 'compiled' (rung 2, the recognised network as generated code, held to
 * rung 0 at the pins, the gates and the memory rather than node for node).
 * All of them hold the machine as the SAME value, so a run can cross
 * between them mid-game; the page's settings screen is where that choice
 * lives. A release whose glue lacks an engine refuses it by name rather
 * than answering with the wrong chip.
 *
 * ## Why a worker and not just the chip in the page
 *
 * Measured on production, 2026-08-28, with the chip on the main thread: a
 * frame of Die Runner is one synchronous 350 ms run of the engine, and
 * `game.js`'s loop starts the next as soon as the last resolves. Between two
 * frames there is a microtask and nothing else, so the browser never got a
 * turn: in thirteen seconds a `setInterval(250)` fired ONCE, the canvas never
 * repainted, the shell's readouts and LED stayed on the values they had
 * before the boot, and the d-pad took no presses. The game ran perfectly and
 * the console looked broken.
 *
 * On this thread the same run leaves the page's thread free, so the screen
 * draws, the readouts count and a press lands while the chip is working. The
 * cost is one structured clone of the machine per call (about 5 KB), which
 * is what the round trip was posting anyway.
 *
 * ## No die data here
 *
 * The wasm bundle embeds `netlist.bin`, which is derived from CC BY-NC-SA
 * 3.0 die data (NOTICE.md). This file contains no chip: it reads the 6502
 * project's own release, which nginx serves at `/6502/chip/`, through that
 * release's asset manifest, so the hashed names are never written down here
 * and a new release needs no rebuild.
 */

const CHIP = "/6502/chip";

/**
 * The engine, loaded once. The PROMISE is what is kept, not the machine it
 * settles to, and that is the whole of it: a second caller arriving while
 * the first is still loading has to wait on the first load, not start
 * another.
 *
 * Measured, 2026-08-28, when it kept only the machine. Two `hello` messages
 * posted a millisecond apart both passed the `if (chip)` guard, both ran the
 * glue's `init()`, which instantiates the wasm module a second time and
 * rebinds the glue to it, and both built a Machine. The console then ran on
 * a pointer into the FIRST instance while every call went to the second: it
 * played fourteen frames of Die Runner, perfectly, and then trapped
 * (`unreachable`) with the console reporting "the engine stopped answering".
 * Every later call failed with wasm-bindgen's "recursive use of an object",
 * because the panic left the borrow held. Nothing about the failure pointed
 * at its cause, which is what a race gets you.
 */
let glueReady = null;

function loadGlue() {
  if (!glueReady) {
    glueReady = (async () => {
      const res = await fetch(`${CHIP}/asset-manifest.json`, { cache: "no-cache" });
      if (!res.ok) {
        throw new Error(`the chip is not served here: ${CHIP}/asset-manifest.json answered ${res.status}`);
      }
      const manifest = await res.json();
      const glue = manifest["pkg/v6502_wasm.js"];
      if (!glue) throw new Error("the chip release has no pkg/v6502_wasm.js");
      // No argument to init(): the glue resolves the bundle against its own
      // URL, and the build rewrote that to the hashed name, so the pair
      // always match.
      const mod = await import(`${CHIP}/${glue}`);
      await mod.default();
      return mod;
    })().catch((e) => {
      glueReady = null; // a failed load is not a loaded chip; the next call retries
      throw e;
    });
  }
  return glueReady;
}

/** One machine per engine, each held as its promise like the glue above. */
const machines = new Map();

function engine(kind) {
  const which = kind === "hybrid" || kind === "compiled" ? kind : "chip";
  if (!machines.has(which)) {
    const p = (async () => {
      const mod = await loadGlue();
      if (which === "hybrid") {
        if (typeof mod.HybridMachine !== "function") {
          throw new Error("this chip release has no rung 1 (HybridMachine); the 6502 site needs a newer release");
        }
        return new mod.HybridMachine();
      }
      if (which === "compiled") {
        if (typeof mod.CompiledMachine !== "function") {
          throw new Error("this chip release has no rung 2 (CompiledMachine); the 6502 site needs a newer release");
        }
        return new mod.CompiledMachine();
      }
      return new mod.Machine();
    })().catch((e) => {
      machines.delete(which); // a refused engine is not a loaded engine
      throw e;
    });
    machines.set(which, p);
  }
  return machines.get(which);
}

const pageBytes = (hex) => {
  const out = new Uint8Array(256);
  for (let i = 0; i < 256; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Put a machine into the chip: the state and its memory, or neither. */
function put(m, machine) {
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
 * A name the die does not carry is refused rather than reported low. The
 * cartridge's gates are eight real switches, and one drawn shut because
 * nobody could find its control line would be a plausible answer where a
 * refusal belongs. `nodeId` gives -1 for a name it does not know.
 */
function sample(m, names) {
  const out = {};
  for (const name of names ?? []) {
    const id = m.nodeId(name);
    if (id < 0) throw new Error(`this cartridge watches ${name}, which is not a node on this die`);
    out[name] = m.isNodeHigh(id);
  }
  return out;
}

/**
 * `boot` lays the memory out and power-cycles, which is what halfwave's own
 * BOOT does (load the image, then `power_cycle`); `step` runs half-cycles.
 * Any other path is refused rather than answered with an `undefined` the
 * console would carry as a machine.
 */
async function answer(path, body, kind) {
  if (path === "hello") {
    await engine(kind);
    return { ok: true };
  }
  const m = await engine(kind);
  const watch = body?.watch;
  if (path === "boot") {
    const mem = body?.memory ?? { fill: "00", pages: {} };
    m.fillMemory(parseInt(mem.fill ?? "00", 16));
    for (const [page, hex] of Object.entries(mem.pages ?? {})) {
      m.load(parseInt(page, 16) << 8, pageBytes(hex));
    }
    m.powerCycle();
    return { machine: JSON.parse(m.exportMachine()), observe: { watch: sample(m, watch) } };
  }
  if (path === "step") {
    const half = Number(body?.half_cycles ?? 0);
    if (!Number.isFinite(half) || half < 0) throw new Error(`step: ${body?.half_cycles} half-cycles`);
    put(m, body.machine);
    m.runHalfCycles(half);
    return {
      machine: JSON.parse(m.exportMachine()),
      observe: { watch: sample(m, watch) },
      stepped: half,
    };
  }
  throw new Error(`the chip in this page does not answer /v1/${path}`);
}

self.onmessage = async (e) => {
  const { id, path, body, engine: kind } = e.data ?? {};
  try {
    self.postMessage({ id, ok: true, answer: await answer(path, body, kind) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
