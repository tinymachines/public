/**
 * tm6502: one interface over two backends.
 *
 * A transistor-level MOS 6502 can be driven two ways. In a page, through the
 * wasm build of the engine, which is an object you hold and call. Over HTTP,
 * through the API, which is a value you pass: the whole machine travels out
 * and back and the server keeps nothing. This module presents the same small
 * interface over either, so a program written against one runs against the
 * other.
 *
 * The property that makes that worth doing rather than merely tidy: because
 * the HTTP API is stateless and carries the whole machine, the two backends
 * are interchangeable by construction. Start a run in the browser, hand the
 * machine to the server, finish it there, bring it back. Nothing new has to
 * be true for that to work, and this module's `export` and `import` are the
 * whole mechanism.
 *
 * MIT, and it ships no die data. That is not a detail. The wasm bundle embeds
 * netlist.bin, which is derived from CC BY-NC-SA 3.0 die data, so a JavaScript
 * package that bundled it would carry NonCommercial and ShareAlike whatever
 * its licence file said. This module therefore never fetches, contains or
 * builds a chip: the local backend is handed an engine the caller already
 * has. Same line the Rust side draws between halfphi and v6502-netlist. See
 * NOTICE.md in tinymachines/public.
 *
 * No build step, no dependencies. An ES module you can point a <script
 * type="module"> at.
 *
 *   import { remote, local } from "https://tinymachines.ai/engine/tm6502.mjs";
 *
 *   const cpu = await remote().boot({ source: "  LDA #$2E\n  BRK\n" });
 *   await cpu.step(8);
 *   console.log(cpu.halfCycle(), await cpu.registers());
 */

const DEFAULT_API = "https://tinymachines.ai/6502/api";

/** A refusal that carries its reason, rather than a thrown string. */
export class EngineError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "EngineError";
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * The shared shape.
 *
 * A `machine` is the API's own JSON: { state, memory }. The wasm crate's
 * exportMachine() emits exactly this, which is what lets the two backends
 * exchange one. Verified against the live API: a machine with no `version`
 * field, which is what the wasm emits, is accepted and steps correctly.
 * ------------------------------------------------------------------ */

/** The four chip bitsets, as the codec writes them: lowercase hex. */
export function chipHex(machine) {
  const s = machine.state;
  return { value: s.value, pullup: s.pullup, pulldown: s.pulldown, trans_on: s.trans_on };
}

/* ------------------------------------------------------------------ *
 * Remote: the machine is a value you pass.
 * ------------------------------------------------------------------ */

export function remote({ api = DEFAULT_API, fetch: f = globalThis.fetch } = {}) {
  if (typeof f !== "function") {
    throw new EngineError("no fetch available; pass one in as options.fetch");
  }

  async function call(path, body) {
    let res;
    try {
      res = await f(api + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new EngineError(`could not reach ${api}${path}`, String(cause));
    }
    if (!res.ok) {
      let detail = await res.text().catch(() => "");
      throw new EngineError(`${api}${path} returned ${res.status}`, detail.slice(0, 400));
    }
    return res.json();
  }

  return session({
    kind: "remote",
    async boot({ source, org = 0x0200, machine = null }) {
      if (machine) return { machine, observe: null };
      const out = await call("/v1/boot", { rom: { source, org } });
      return { machine: out.machine ?? out, observe: out.observe ?? null };
    },
    async step(machine, halfCycles) {
      const out = await call("/v1/step", { machine, half_cycles: halfCycles });
      return { machine: out.machine ?? out, observe: out.observe ?? null };
    },
    async runUntil(machine, until, maxHalfCycles) {
      const out = await call("/v1/step", {
        machine,
        until,
        max_half_cycles: maxHalfCycles,
      });
      return { machine: out.machine ?? out, observe: out.observe ?? null };
    },
  });
}

/* ------------------------------------------------------------------ *
 * Local: the machine is an object you drive.
 *
 * `engine` is an instantiated wasm Machine from the v6502-wasm build. It is
 * NOT loaded here, on purpose: see the licence note at the top. The caller
 * loads it, which is also the only way this module can stay MIT.
 * ------------------------------------------------------------------ */

export function local({ engine } = {}) {
  if (!engine) {
    throw new EngineError(
      "local() needs an instantiated v6502-wasm Machine.",
      "This module ships no die data and therefore no chip: the wasm bundle " +
        "embeds netlist.bin, which is CC BY-NC-SA 3.0, so bundling it here " +
        "would put NonCommercial and ShareAlike on an MIT package. Load the " +
        "wasm yourself and pass it in.",
    );
  }
  for (const fn of ["exportMachine", "importState", "runHalfCycles", "load", "fillMemory"]) {
    if (typeof engine[fn] !== "function") {
      throw new EngineError(
        `the engine passed to local() has no ${fn}()`,
        "It does not look like a v6502-wasm Machine. exportMachine and " +
          "importState are the two that matter: without them a machine cannot " +
          "leave or enter the browser, and the backends cannot be exchanged.",
      );
    }
  }

  return session({
    kind: "local",
    async boot({ source, org = 0x0200, machine = null }) {
      if (machine) {
        restoreInto(engine, machine);
        return { machine: JSON.parse(engine.exportMachine()), observe: readRegisters(engine) };
      }
      throw new EngineError(
        "the local backend cannot assemble",
        "There is no assembler in the wasm build. Assemble with the remote " +
          "backend, or load bytes yourself with engine.load(addr, bytes) and " +
          "pass the resulting machine in as options.machine.",
      );
    },
    async step(machine, halfCycles) {
      restoreInto(engine, machine);
      engine.runHalfCycles(halfCycles);
      return { machine: JSON.parse(engine.exportMachine()), observe: readRegisters(engine) };
    },
    async runUntil(machine, until, maxHalfCycles) {
      restoreInto(engine, machine);
      if (until === "instruction") engine.stepInstruction(maxHalfCycles);
      else if (until === "cycle") engine.stepCycle();
      else throw new EngineError(`unknown until: ${until}`);
      return { machine: JSON.parse(engine.exportMachine()), observe: readRegisters(engine) };
    },
  });
}

/**
 * Put a machine into a wasm engine.
 *
 * importState restores the chip half only; the crate's own comment says
 * memory travels separately. So memory is written here, and this asymmetry is
 * the one place the two backends genuinely differ rather than merely differ in
 * naming.
 */
function restoreInto(engine, machine) {
  const s = machine.state;
  const f = s.last_fetch;
  engine.importState(
    s.value, s.pullup, s.pulldown, s.trans_on,
    s.half_cycle,
    f ? f.addr : -1,
    f ? f.opcode : 0,
  );
  const mem = machine.memory ?? { fill: "00", pages: {} };
  engine.fillMemory(parseInt(mem.fill ?? "00", 16));
  for (const [page, hex] of Object.entries(mem.pages ?? {})) {
    const addr = parseInt(page, 16) * 256;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    engine.load(addr, bytes);
  }
}

/**
 * The registers, read off a wasm engine.
 *
 * This is the one place the two backends look nothing alike and mean the same
 * thing. Over HTTP the registers arrive in the step response's `observe`,
 * because the server has just watched the run. In the browser they are methods
 * on the object. Same six values either way, so the session exposes them the
 * same way and this function is where the difference stops.
 */
function readRegisters(engine) {
  return {
    pc: engine.pc(), a: engine.a(), x: engine.x(), y: engine.y(),
    s: engine.s(), p: engine.p(), ir: engine.ir(),
    half_cycle: engine.halfCycle(),
  };
}

/* ------------------------------------------------------------------ *
 * The session: identical over either backend.
 * ------------------------------------------------------------------ */

function session(backend) {
  let machine = null;
  let observed = null;

  const api = {
    /** Which backend this is. The only thing that differs by design. */
    kind: backend.kind,

    async boot(opts) {
      ({ machine, observe: observed } = await backend.boot(opts ?? {}));
      return api;
    },

    async step(halfCycles = 1) {
      requireMachine();
      ({ machine, observe: observed } = await backend.step(machine, halfCycles));
      return api;
    },

    async runUntil(until = "instruction", maxHalfCycles = 200) {
      requireMachine();
      ({ machine, observe: observed } = await backend.runUntil(machine, until, maxHalfCycles));
      return api;
    },

    /**
     * The registers as of the last step, or null if nothing has been run.
     *
     * Null rather than zeros: a register file that has not been observed is
     * not a register file full of zeros, and returning one would be a
     * plausible answer where a refusal belongs.
     */
    registers() {
      return observed;
    },

    /** The whole machine, as a value. This is the hand-off point. */
    export() {
      requireMachine();
      return machine;
    },

    /** Adopt a machine produced anywhere, including the other backend. */
    import(next) {
      if (!next || !next.state) {
        throw new EngineError("that is not a machine", "expected { state, memory }");
      }
      machine = next;
      return api;
    },

    halfCycle() {
      requireMachine();
      return machine.state.half_cycle;
    },

    lastFetch() {
      requireMachine();
      return machine.state.last_fetch ?? null;
    },

    /**
     * Read bytes out of the machine's memory. Sparse: a page that is not
     * listed is the fill byte, so this reconstructs rather than assuming zero.
     */
    read(addr, length = 1) {
      requireMachine();
      const mem = machine.memory;
      const fill = parseInt(mem.fill ?? "00", 16);
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        const a = (addr + i) & 0xffff;
        const page = (a >> 8).toString(16).padStart(2, "0");
        const hex = mem.pages?.[page];
        out[i] = hex ? parseInt(hex.slice((a & 0xff) * 2, (a & 0xff) * 2 + 2), 16) : fill;
      }
      return out;
    },
  };

  function requireMachine() {
    if (!machine) {
      throw new EngineError(
        "no machine yet",
        "Call boot() first, or import() one from the other backend.",
      );
    }
  }

  return api;
}
