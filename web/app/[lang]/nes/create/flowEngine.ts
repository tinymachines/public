/**
 * The flow tools' seam on the create desk: the recordings kept in this
 * browser (lib/flowStore), the worker that plays one back and reads its
 * trace (public/nes/flow.worker.mjs, wasm/flow), and the report that is
 * open. A module-scope store, as the play engine is, so the Record window
 * and the Flow window look at the same thing.
 */

import {
  deleteRecording,
  exportRecording,
  importRecording,
  listRecordings,
  loadRecording,
  loadReport,
  saveReport,
  supplyRom,
  type RecordingMeta,
} from "@/lib/flowStore";

export type Listed = RecordingMeta & { report: boolean; rom: boolean };

/** The flow crate's report (wasm/flow/src/lib.rs, `Report`). */
export interface Report {
  version: number;
  prg_len: number;
  frames: number;
  cycles: number;
  held: number;
  instructions: number;
  pad2: boolean;
  sites: { key: number; addr: number; op: number; text: string; documented: boolean; count: number; cycles: number; first: number; last: number; routine: number }[];
  routines: {
    id: number;
    key: number;
    addr: number;
    entry: "reset" | "nmi" | "irq" | "brk" | "call" | "dispatch";
    entered: number;
    excl: number;
    incl: number;
    frames: number;
    lines: [number, number] | null;
    callers: [number, number, number][];
    body: number[];
    tags: string[];
    rom_reads: number;
    /** Address, reads, writes: the 64 it touched most outside the ROM. */
    mem: [number, number, number][];
  }[];
  loops: { head: number; tail: number; head_addr: number; tail_addr: number; kind: "idle" | "wait" | "work"; iterations: number; entries: number; on: number | null; cycles: number; routine: number }[];
  variables: { addr: number; writers: [number, number][]; readers: [number, number][]; total: number }[];
  dispatch: { key: number; addr: number; depth: number; targets: [number, number][]; timeline: [number, number, number][] }[];
  modes: { segments: [number, number, number][]; modes: { id: number; frames: number; own: number[] }[] };
  input: { button: string; held: number; presses: number; while_held: [number, number, number][]; after_press: [number, number, number][] }[];
  timeline: { cycles: number[]; idle: number[]; nmi: number[]; rti: number[]; pad: number[] };
}

export interface FlowState {
  list: Listed[] | null;
  /** A playback in progress: which recording, for what, and how far. */
  busy: { id: string; what: "analyze" | "trace"; checked: number; frames: number } | null;
  open: { meta: RecordingMeta; report: Report } | null;
  why: string | null;
}

const INITIAL: FlowState = { list: null, busy: null, open: null, why: null };
let state: FlowState = INITIAL;
const listeners = new Set<() => void>();
function set(patch: Partial<FlowState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function snapshot(): FlowState {
  return state;
}
export function serverSnapshot(): FlowState {
  return INITIAL;
}

const why = (e: unknown) => set({ why: String((e as Error)?.message ?? e) });

export async function refresh() {
  try {
    set({ list: await listRecordings() });
  } catch (e) {
    set({ list: [] });
    why(e);
  }
}

let worker: Worker | null = null;

/** Play a recording back in the worker; resolves with its answer. */
function playBack(id: string, what: "analyze" | "trace", body: Record<string, unknown>, transfer: Transferable[]): Promise<Record<string, unknown>> {
  worker?.terminate();
  const w = new Worker("/nes/flow.worker.mjs", { type: "module" });
  worker = w;
  set({ busy: { id, what, checked: 0, frames: 0 }, why: null });
  return new Promise((resolve, reject) => {
    w.onmessage = (e) => {
      const d = e.data as { progress?: { checked: number; frames: number }; ok?: boolean; answer?: Record<string, unknown>; error?: string };
      if (d.progress) {
        set({ busy: { id, what, ...d.progress } });
        return;
      }
      w.terminate();
      if (worker === w) worker = null;
      set({ busy: null });
      if (d.ok) resolve(d.answer!);
      else reject(new Error(d.error));
    };
    w.onerror = () => {
      w.terminate();
      if (worker === w) worker = null;
      set({ busy: null });
      reject(new Error("the flow worker failed to load; its bundle may be absent"));
    };
    w.postMessage({ id: 1, path: what, ...body }, transfer);
  });
}

/** Stop a playback in progress. */
export function cancel() {
  worker?.terminate();
  worker = null;
  set({ busy: null });
}

async function inputs(id: string) {
  const r = await loadRecording(id);
  if (!r.rom) throw new Error("this browser does not have the game this recording was made on; load it here to play the recording back");
  return r;
}

export async function analyze(id: string) {
  try {
    const r = await inputs(id);
    const bat = r.battery ?? new Uint8Array(0);
    const st = r.state ?? new Uint8Array(0);
    const a = await playBack(id, "analyze", { rom: r.rom!.buffer, battery: bat.buffer, state: st.buffer, log: r.log.buffer, prgLen: r.meta.prgLen }, [r.rom!.buffer, bat.buffer, st.buffer, r.log.buffer]);
    const report = a.report as string;
    await saveReport(id, report);
    set({ open: { meta: r.meta, report: JSON.parse(report) as Report } });
    await refresh();
  } catch (e) {
    why(e);
  }
}

export async function open(id: string) {
  try {
    const { meta } = await loadRecording(id);
    const report = await loadReport(id);
    if (!report) throw new Error("this recording has not been read yet");
    set({ open: { meta, report: JSON.parse(report) as Report }, why: null });
  } catch (e) {
    why(e);
  }
}

export async function remove(id: string) {
  try {
    await deleteRecording(id);
    if (state.open?.meta.id === id) set({ open: null });
    await refresh();
  } catch (e) {
    why(e);
  }
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stem = (m: RecordingMeta) => `${m.name.replace(/\.nes$/i, "")}-${m.id.slice(0, 19)}`;

export async function exportOne(m: RecordingMeta) {
  try {
    download(`${stem(m)}.nesrec`, await exportRecording(m.id));
  } catch (e) {
    why(e);
  }
}

export async function importOne(file: File) {
  try {
    await importRecording(file);
    await refresh();
  } catch (e) {
    why(e);
  }
}

/** The image a recording was made on, from the reader's disk, for a recording that came without it. */
export async function giveRom(m: RecordingMeta, file: File) {
  try {
    await supplyRom(m, new Uint8Array(await file.arrayBuffer()));
    await refresh();
  } catch (e) {
    why(e);
  }
}

export function downloadReport() {
  const o = state.open;
  if (o) download(`${stem(o.meta)}.flow.json`, new Blob([JSON.stringify(o.report)], { type: "application/json" }));
}

/** The raw trace of pictures from..to, as the console writes it, to a file. */
export async function saveTrace(id: string, from: number, to: number) {
  try {
    const r = await inputs(id);
    const bat = r.battery ?? new Uint8Array(0);
    const st = r.state ?? new Uint8Array(0);
    const a = await playBack(id, "trace", { rom: r.rom!.buffer, battery: bat.buffer, state: st.buffer, log: r.log.buffer, from, to }, [r.rom!.buffer, bat.buffer, st.buffer, r.log.buffer]);
    const t = a.trace as Uint8Array;
    download(`${stem(r.meta)}-f${a.from}-${a.to}.trace`, new Blob([t.slice().buffer as ArrayBuffer], { type: "application/octet-stream" }));
  } catch (e) {
    why(e);
  }
}
