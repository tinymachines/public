"use client";

import { useState } from "react";

/**
 * The worked example, run in your browser against the real chip.
 *
 * It uses /engine/tm6502.mjs, the same module the page documents, loaded the
 * same way a reader would load it. Nothing is reimplemented here: if the
 * wrapper breaks, this stops working, which is the point of demonstrating with
 * it rather than beside it.
 *
 * The readout is a panel. STYLE.md section 1: these values came off the engine
 * on a run that happened, and paper is for documentation. The half-cycle
 * numbers are whatever the chip did, not what this component expected.
 */

/** Only what this page uses. The module's full surface is documented beside it. */
interface Session {
  boot(opts: { source: string; org?: number }): Promise<Session>;
  step(halfCycles?: number): Promise<Session>;
  runUntil(until?: string, maxHalfCycles?: number): Promise<Session>;
  halfCycle(): number;
  registers(): { pc: number; a: number; x: number; y: number; s: number; p: number; ir: number } | null;
}

interface Row {
  label: string;
  halfCycle: number;
  a: number;
  pc: number;
}

const SOURCE = "  LDA #$2E\n  CLC\n  ADC #$14\n  BRK\n";

export function TwoWaysDemo() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setRows([]);
    try {
      // The specifier is a variable on purpose. It is a URL served by this
      // site, not a module in the bundle: TypeScript cannot resolve it and
      // should not try, and the bundler must not follow it either. Keeping it
      // dynamic means the reader and this page load exactly the same file, so
      // a broken wrapper breaks the demo rather than only the reader.
      const url = "/engine/tm6502.mjs";
      const mod = (await import(/* webpackIgnore: true */ url)) as {
        remote: () => Session;
      };
      const cpu = mod.remote();
      await cpu.boot({ source: SOURCE, org: 0x0200 });

      const out: Row[] = [];
      for (const label of ["LDA #$2E", "CLC", "ADC #$14"]) {
        await cpu.runUntil("instruction");
        const r = cpu.registers();
        if (!r) throw new Error("the run reported no registers");
        out.push({ label, halfCycle: cpu.halfCycle(), a: r.a, pc: r.pc });
      }
      // The write lands after the next fetch is already underway, so the sum
      // is not in A at the instruction boundary. Two more half-cycles.
      for (let i = 0; i < 2; i++) {
        await cpu.step(1);
        const r = cpu.registers();
        if (!r) throw new Error("the run reported no registers");
        out.push({ label: "+1 half-cycle", halfCycle: cpu.halfCycle(), a: r.a, pc: r.pc });
      }
      setRows(out);
    } catch (e) {
      const err = e as { message?: string; detail?: string };
      setError([err.message, err.detail].filter(Boolean).join(" ") || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rail">
      <p className="quiet">
        This runs in your browser, against the chip on{" "}
        <code>6502.tinymachines.ai</code>, through the module below. Nothing is
        precomputed.
      </p>
      <p>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? "Running" : "Run it"}
        </button>
      </p>

      {error ? (
        <p className="notice">
          It did not run: {error}
          <br />
          Nothing is shown rather than a plausible number.
        </p>
      ) : null}

      {rows.length > 0 ? (
        /* .panel is the bezel and .panel-face is the instrument face inside
           it. Using .panel alone renders the brushed gradient as the ground,
           which is what this did first: a grey box with grey text on it. The
           zoo is the reference for how its own components nest. */
        <div className="panel">
          <div className="panel-face">
            <div className="panel-bar">
              <b>$2E + $14</b>
              <span>measured just now</span>
            </div>
            <table className="readout">
              <thead>
                <tr>
                  <th>after</th>
                  <th className="num">half-cycle</th>
                  <th className="num">A</th>
                  <th className="num">PC</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.label}</td>
                    <td className="num">{r.halfCycle}</td>
                    <td className={r.a === 0x42 ? "num changed" : "num"}>
                      ${r.a.toString(16).toUpperCase().padStart(2, "0")}
                    </td>
                    <td className="num">
                      ${r.pc.toString(16).toUpperCase().padStart(4, "0")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
