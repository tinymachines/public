/**
 * The flow tools' worker: a recording played back with the trace on, the
 * trace read by the flow crate as it comes, and the report handed back.
 *
 *   main -> here   { id, path: 'analyze', rom, battery, log, prgLen }
 *                  { id, path: 'trace', rom, battery, log, from, to }
 *   here -> main   { id, progress: { checked, frames } }   (while it runs)
 *                  { id, ok: true, answer } | { id, ok: false, error }
 *
 * 'analyze' answers the report (wasm/flow's JSON). The replay holds every
 * picture to the recording's digest and stops, saying where, the moment
 * one differs: a report is only ever of the run that was recorded. The
 * trace itself (about 19 MB for each second of play) is never kept whole;
 * each chunk goes into the analysis and is dropped.
 *
 * 'trace' answers the raw trace of pictures from..to (the console's 8-byte
 * records, nes-console/src/record.rs), for a reader who wants the raw run
 * in a tool of their own; it is capped, because it is kept whole.
 *
 * The ROM, the save and the recording never leave this browser.
 */

import initNes, { NesReplay } from "./wasm/nes_wasm.js";
import initFlow, { FlowTool } from "./flow/flow.js";

const ready = Promise.all([initNes(), initFlow()]);
/** Pictures a 'trace' request may span: about 100 MB. */
const TRACE_MAX = 320;
/** Pictures played between progress reports. */
const CHUNK = 30;

self.onmessage = async (e) => {
  const { id, path } = e.data;
  try {
    await ready;
    if (!NesReplay) throw new Error("this console bundle cannot replay a recording");
    const r = new NesReplay(new Uint8Array(e.data.rom), new Uint8Array(e.data.battery ?? new ArrayBuffer(0)), new Uint8Array(e.data.log));
    const frames = r.frames();
    if (path === "analyze") {
      const flow = new FlowTool(e.data.prgLen >>> 0);
      let ended = false;
      while (!ended) {
        ended = r.run(CHUNK);
        flow.feed(r.take_trace());
        self.postMessage({ id, progress: { checked: r.frames_checked(), frames } });
      }
      const report = flow.report();
      flow.free();
      r.free();
      self.postMessage({ id, ok: true, answer: { report } });
      return;
    }
    if (path === "trace") {
      const from = Math.max(0, e.data.from | 0);
      const to = Math.min(frames - 1, e.data.to | 0);
      if (to < from) throw new Error("no pictures in that range");
      if (to - from + 1 > TRACE_MAX) throw new Error(`at most ${TRACE_MAX} pictures at a time`);
      // Up to the first picture asked for, the trace is dropped as it comes.
      while (r.frames_checked() < from) {
        r.run(Math.min(CHUNK, from - r.frames_checked()));
        r.take_trace();
        self.postMessage({ id, progress: { checked: r.frames_checked(), frames } });
      }
      const parts = [];
      let bytes = 0;
      while (r.frames_checked() <= to) {
        const ended = r.run(1);
        const t = r.take_trace();
        parts.push(t);
        bytes += t.length;
        if (ended) break;
      }
      r.free();
      const out = new Uint8Array(bytes);
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.length;
      }
      self.postMessage({ id, ok: true, answer: { trace: out, from, to } }, [out.buffer]);
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(path)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
