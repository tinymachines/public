/**
 * The listing's seam on the create desk: the open recording's cartridge
 * and report handed to the listing worker (public/nes/listing.worker.mjs,
 * wasm/listing), and what came back. A module-scope store like the flow
 * engine's, so the Listing window and anything else look at one thing.
 */

import { loadRecording, loadReport, type RecordingMeta } from "@/lib/flowStore";

/** The game model (wasm/listing/src/game.rs), as far as the window reads it. */
export interface Model {
  sha256: string;
  mapper: number;
  prg: number;
  chr: number;
  run: { frames?: number; instructions?: number; executed?: number; of?: number } | null;
  banks: { bank: string; executed: number; of: number; sites: number }[];
  patterns: Record<string, number>;
  routines: { name: string; bank: string; addr: number; kind: string; entered?: number; by: string; inside?: number; is: { pattern: string; evidence: Record<string, number | string> }[] }[];
  tables: { bank: string; addr: number; kind: string; entries: number; seen: number; words: { addr: number; label: string | null; ran: number | null }[] }[];
  arrays: { base: string; slots: number; sites: number }[];
  variables: { addr: string; writers: { name: string; count: number }[]; readers: { name: string; count: number }[]; total: number }[];
}

export interface ListingState {
  /** The recording the listing is of, or being written for. */
  forId: string | null;
  busy: boolean;
  out: { meta: RecordingMeta; src: string; rendered: string; model: Model } | null;
  why: string | null;
}

const INITIAL: ListingState = { forId: null, busy: false, out: null, why: null };
let state: ListingState = INITIAL;
const listeners = new Set<() => void>();
function set(patch: Partial<ListingState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function snapshot(): ListingState {
  return state;
}
export function serverSnapshot(): ListingState {
  return INITIAL;
}

let worker: Worker | null = null;

/** Write the listing of a recording that has been read (its report kept). */
export async function build(id: string) {
  try {
    const { meta, rom } = await loadRecording(id);
    if (!rom) throw new Error("this browser does not have the game this recording was made on");
    const report = await loadReport(id);
    if (!report) throw new Error("this recording has not been read yet");
    worker?.terminate();
    const w = new Worker("/nes/listing.worker.mjs", { type: "module" });
    worker = w;
    set({ forId: id, busy: true, why: null });
    const answer = await new Promise<{ src: string; rendered: string; model: string }>((resolve, reject) => {
      w.onmessage = (e) => {
        const d = e.data as { ok?: boolean; answer?: { src: string; rendered: string; model: string }; error?: string };
        w.terminate();
        if (worker === w) worker = null;
        if (d.ok) resolve(d.answer!);
        else reject(new Error(d.error));
      };
      w.onerror = () => {
        w.terminate();
        if (worker === w) worker = null;
        reject(new Error("the listing worker failed to load; its bundle may be absent"));
      };
      w.postMessage({ id: 1, rom: rom.buffer, report }, [rom.buffer]);
    });
    set({ busy: false, out: { meta, src: answer.src, rendered: answer.rendered, model: JSON.parse(answer.model) as Model } });
  } catch (e) {
    set({ busy: false, why: String((e as Error)?.message ?? e) });
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

export function downloadListing() {
  const o = state.out;
  if (o) download(`${stem(o.meta)}.lst`, new Blob([o.src], { type: "text/plain" }));
}

export function downloadModel() {
  const o = state.out;
  if (o) download(`${stem(o.meta)}.model.json`, new Blob([JSON.stringify(o.model, null, 1)], { type: "application/json" }));
}
