"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Write a program: a few lines of the processor's own instructions, typed
 * here, assembled and run on the transistor-level 6502 the 6502 project
 * serves (its own API, the same chip its pages drive), one instruction at
 * a time, with the registers and the memory answering.
 *
 * Nothing is simulated in this file: the assembling, the chip and every
 * figure shown are the service's, and its refusals are shown as it words
 * them. The plain line beside each instruction is ours.
 */

interface Observe {
  pc: number;
  a: number;
  x: number;
  y: number;
  s: number;
  flags: string;
  last_fetch?: { addr: number; opcode: number };
}
interface Line {
  n: number;
  text: string;
  addr: number | null;
  bytes: string;
}
interface Assembled {
  org: number;
  end: number;
  size: number;
  listing: Line[];
}
interface Machine {
  state: { last_fetch?: { addr: number; opcode: number } };
  memory: { fill: string; pages: Record<string, string> };
}

const ORG = 0x0200;
const LIMIT = 200;

const EXAMPLES = [
  {
    name: "Keep a number",
    why: "The smallest program there is: put a number in the processor, then put it somewhere in memory.",
    source: "  LDA #$2A\n  STA $10\n  BRK\n",
  },
  {
    name: "Add two numbers",
    why: "The processor adds with whatever it is carrying from the last sum, so the first thing to do is clear that.",
    source: "  CLC\n  LDA #$07\n  ADC #$23\n  STA $11\n  BRK\n",
  },
  {
    name: "Count to ten",
    why: "A loop: count up, compare, and go back if you are not there yet. Every game's main loop is this shape.",
    source: "  LDX #$00\nloop:\n  INX\n  CPX #$0A\n  BNE loop\n  STX $12\n  BRK\n",
  },
  {
    name: "Fill a row of memory",
    why: "The same loop, writing as it goes: eight bytes of memory filled with the same value.",
    source: "  LDX #$00\n  LDA #$FF\nfill:\n  STA $20,X\n  INX\n  CPX #$08\n  BNE fill\n  BRK\n",
  },
] as const;

/** What an instruction does, in the reader's words. Ours, not the chip's. */
const GLOSS: [RegExp, string][] = [
  [/^LDA/, "put this number into A, the main working register"],
  [/^LDX/, "put this number into X, a counting register"],
  [/^LDY/, "put this number into Y, the other counting register"],
  [/^STA/, "copy A into memory here"],
  [/^STX/, "copy X into memory here"],
  [/^STY/, "copy Y into memory here"],
  [/^INX/, "add one to X"],
  [/^INY/, "add one to Y"],
  [/^DEX/, "take one away from X"],
  [/^DEY/, "take one away from Y"],
  [/^CLC/, "clear the carry: start an addition cleanly"],
  [/^ADC/, "add this number to A"],
  [/^SBC/, "subtract this number from A"],
  [/^CMP/, "compare A with this number"],
  [/^CPX/, "compare X with this number"],
  [/^CPY/, "compare Y with this number"],
  [/^BNE/, "if that comparison was not equal, go back to the label"],
  [/^BEQ/, "if that comparison was equal, jump to the label"],
  [/^JMP/, "go to this place and carry on from there"],
  [/^BRK/, "stop"],
  [/^NOP/, "do nothing for a moment"],
];

function gloss(text: string): string {
  const t = text.trim().toUpperCase();
  for (const [re, words] of GLOSS) if (re.test(t)) return words;
  return "";
}

const hex = (n: number, w = 2) => n.toString(16).toUpperCase().padStart(w, "0");

const CELLS = [
  ["a", "A, the working register"],
  ["x", "X"],
  ["y", "Y"],
  ["pc", "Where it is"],
  ["flags", "Flags"],
  ["ran", "Instructions run"],
] as const;

export function ProgramChip({ api }: { api: string }) {
  const [source, setSource] = useState<string>(EXAMPLES[0].source);
  const [why, setWhy] = useState<string>(EXAMPLES[0].why);
  const [assembled, setAssembled] = useState<Assembled | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [observe, setObserve] = useState<Observe | null>(null);
  const [ran, setRan] = useState(0);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<number>>(new Set());
  const stop = useRef(false);

  const call = useCallback(
    async (path: string, body: unknown) => {
      const res = await fetch(api + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = out?.detail;
        throw new Error(typeof detail === "string" ? detail : (detail?.error ?? `the chip answered ${res.status}`));
      }
      return out;
    },
    [api],
  );

  const assemble = useCallback(async () => {
    setBusy(true);
    setError(null);
    stop.current = true;
    setRunning(false);
    try {
      const out = await call("/v1/boot", { rom: { source, org: ORG } });
      setAssembled(out.assembled ?? null);
      setMachine(out.machine);
      setObserve(out.observe);
      setRan(0);
      setTouched(new Set());
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setAssembled(null);
      setMachine(null);
      setObserve(null);
    } finally {
      setBusy(false);
    }
  }, [call, source]);

  /** One instruction on the chip. Returns false when the program has stopped. */
  const one = useCallback(
    async (m: Machine): Promise<{ m: Machine; o: Observe; more: boolean } | null> => {
      const out = await call("/v1/step", { machine: m, until: "instruction", max_half_cycles: 400 });
      const o: Observe = out.observe;
      const next: Machine = out.machine;
      const fetched = next.state.last_fetch?.opcode ?? 0;
      const inside = assembled ? o.pc >= assembled.org && o.pc < assembled.end : true;
      return { m: next, o, more: fetched !== 0 && inside };
    },
    [call, assembled],
  );

  const remember = (before: Machine | null, after: Machine) => {
    // A page the machine has not written is not in `pages`: it is the fill
    // byte, all through. Reading a missing page as an empty string marked
    // every byte as changed the first time a program wrote anything.
    const page = (m: Machine | null) => m?.memory?.pages?.["00"] ?? (m ? (m.memory.fill ?? "00").repeat(256) : "");
    const a = page(before);
    const b = page(after);
    if (!b) return;
    const changed = new Set(touched);
    for (let i = 0; i < 256; i++) {
      if (a.slice(i * 2, i * 2 + 2) !== b.slice(i * 2, i * 2 + 2)) changed.add(i);
    }
    setTouched(changed);
  };

  const step = useCallback(async () => {
    if (!machine || busy) return;
    setBusy(true);
    try {
      const r = await one(machine);
      if (!r) return;
      remember(machine, r.m);
      setMachine(r.m);
      setObserve(r.o);
      setRan((n) => n + 1);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine, busy, one]);

  const run = useCallback(async () => {
    if (!machine || running) return;
    setRunning(true);
    stop.current = false;
    let m = machine;
    let n = ran;
    try {
      for (let i = 0; i < LIMIT && !stop.current; i++) {
        const r = await one(m);
        if (!r) break;
        remember(m, r.m);
        m = r.m;
        n += 1;
        setMachine(r.m);
        setObserve(r.o);
        setRan(n);
        if (!r.more) break;
        await new Promise((res) => setTimeout(res, 90));
      }
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine, running, ran, one]);

  const page0 = machine?.memory?.pages?.["00"] ?? "";
  const byte = (i: number) => (page0 ? page0.slice(i * 2, i * 2 + 2) : machine ? (machine.memory.fill ?? "00") : "");


  return (
    <div className="pg-prog">
      <div className="pg-prog-top">
        <div className="pg-prog-write">
          <label className="pg-label" htmlFor="pg-prog-src">Your program</label>
          <textarea
            id="pg-prog-src"
            className="pg-prog-src"
            spellCheck={false}
            rows={9}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <div className="pg-row">
            <button className="pg-btn pg-btn-hot" onClick={assemble} disabled={busy}>
              Put it on the chip
            </button>
            <button className="pg-btn" onClick={step} disabled={!machine || busy || running}>
              One instruction
            </button>
            <button
              className="pg-btn"
              onClick={() => {
                if (running) {
                  stop.current = true;
                  setRunning(false);
                } else run();
              }}
              disabled={!machine || busy}
            >
              {running ? "Stop" : "Run it"}
            </button>
          </div>
          <p className="pg-note pg-prog-why">{error ? <span className="pg-error">{error}</span> : why}</p>
          <div className="pg-row">
            <span className="pg-label">Try one</span>
            {EXAMPLES.map((e) => (
              <button
                key={e.name}
                className="pg-btn pg-prog-example"
                onClick={() => {
                  stop.current = true;
                  setRunning(false);
                  setSource(e.source);
                  setWhy(e.why);
                  setAssembled(null);
                  setMachine(null);
                  setObserve(null);
                  setError(null);
                  setRan(0);
                  setTouched(new Set());
                }}
              >
                {e.name}
              </button>
            ))}
          </div>
        </div>

        <div className="pg-prog-listing">
          <p className="pg-record-h">What the chip was given</p>
          {assembled ? (
            <ol>
              {assembled.listing
                .filter((l) => l.text.trim())
                .map((l) => (
                  <li key={l.n} data-here={observe != null && l.addr === observe.pc}>
                    <span className="pg-prog-addr">{l.addr != null ? `$${hex(l.addr, 4)}` : ""}</span>
                    <span className="pg-prog-bytes">{l.bytes}</span>
                    <span className="pg-prog-text">{l.text.trim()}</span>
                    <span className="pg-prog-gloss">{gloss(l.text)}</span>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="pg-note">Press &ldquo;Put it on the chip&rdquo; and the assembled program appears here, with what each line does.</p>
          )}
        </div>
      </div>

      <dl className="pg-console pg-console-3">
        {CELLS.map(([k, label]) => (
          <div key={k}>
            <dt>{label}</dt>
            <dd data-k={k}>
              {!observe
                ? "·"
                : k === "a"
                  ? `${observe.a} ($${hex(observe.a)})`
                  : k === "x"
                    ? `${observe.x} ($${hex(observe.x)})`
                    : k === "y"
                      ? `${observe.y} ($${hex(observe.y)})`
                      : k === "pc"
                        ? `$${hex(observe.pc, 4)}`
                        : k === "flags"
                          ? observe.flags
                          : String(ran)}
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="pg-record-h">The first page of memory, as the program leaves it</p>
        <div className="pg-prog-mem" aria-label="The first 256 bytes of memory">
          {Array.from({ length: 256 }, (_, i) => (
            <span key={i} className="pg-prog-cell" data-set={byte(i) !== "00"} data-touched={touched.has(i)} title={`$${hex(i)}`}>
              {byte(i) || "··"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
