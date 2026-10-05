/**
 * The Program window's seam: a lesson's parts fetched from this site
 * (/autopsy/lessons/<key>.parts.json), the program as the reader edits it,
 * and the cartridge built from it in the listing worker (wasm/listing's
 * lesson.rs, the code lessons/build.py runs), loaded into the desk's
 * console. A module-scope store like the listing's.
 */

import { load, snapshot as console_, toggleRun } from "../play/playEngine";

export interface Parts {
  key: string;
  title: string;
  sha256: string;
  board: { mirroring: string; prg: number; org: string; chr: number };
  prg: string;
  chr: string;
}

export interface Built {
  sha256: string;
  code_bytes: number;
  instructions: number;
}

export interface ProgramState {
  parts: Parts | null;
  /** The program as it stands in the editor. */
  text: string;
  /** The tiles as they stand (the Sprite maker can put new ones in). */
  chr: string;
  busy: boolean;
  built: Built | null;
  why: string | null;
}

const INITIAL: ProgramState = { parts: null, text: "", chr: "", busy: false, built: null, why: null };
let state: ProgramState = INITIAL;
const listeners = new Set<() => void>();
function set(patch: Partial<ProgramState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function snapshot(): ProgramState {
  return state;
}
export function serverSnapshot(): ProgramState {
  return INITIAL;
}

// An edit is kept in this browser, per lesson, so a reload does not lose it.
const KEEP = (key: string) => `tm.nes.program.${key}`;
function kept(key: string): string | null {
  try {
    return localStorage.getItem(KEEP(key));
  } catch {
    return null;
  }
}
function keep(key: string, text: string | null) {
  try {
    if (text === null) localStorage.removeItem(KEEP(key));
    else localStorage.setItem(KEEP(key), text);
  } catch {
    // Storage refused (a private window): the edit lives as long as the page.
  }
}

/** Open a lesson's program: its parts from this site, and the edit kept here if there is one. */
export async function open(key: string) {
  if (!/^[a-z0-9-]{1,32}$/.test(key)) return;
  set({ busy: true, why: null, built: null });
  try {
    const r = await fetch(`/autopsy/lessons/${key}.parts.json`);
    if (!r.ok) throw new Error(`no lesson named ${key}`);
    const parts = (await r.json()) as Parts;
    set({ parts, text: kept(key) ?? parts.prg, chr: kept(`${key}.chr`) ?? parts.chr, busy: false });
  } catch (e) {
    set({ busy: false, why: String((e as Error)?.message ?? e) });
  }
}

export function edit(text: string) {
  set({ text, built: null });
  if (state.parts) keep(state.parts.key, text === state.parts.prg ? null : text);
}

/** New tiles for the open lesson (kept here like an edit of the program). */
export function setTiles(chr: string) {
  set({ chr, built: null });
  if (state.parts) keep(`${state.parts.key}.chr`, chr === state.parts.chr ? null : chr);
}

/** Back to the lesson's program and tiles as we wrote them. */
export function ours() {
  if (!state.parts) return;
  edit(state.parts.prg);
  setTiles(state.parts.chr);
}

/** Build the program as it stands into a cartridge and put it in the console. */
export async function assemble() {
  const p = state.parts;
  if (!p) return;
  set({ busy: true, why: null, built: null });
  const w = new Worker("/nes/listing.worker.mjs", { type: "module" });
  try {
    const answer = await new Promise<{ built: string; rom: ArrayBuffer }>((resolve, reject) => {
      w.onmessage = (e) => {
        const d = e.data as { ok?: boolean; answer?: { built: string; rom: ArrayBuffer }; error?: string };
        if (d.ok) resolve(d.answer!);
        else reject(new Error(d.error));
      };
      w.onerror = () => reject(new Error("the listing worker failed to load; its bundle may be absent"));
      w.postMessage({ id: 1, lesson: { prg: state.text, chr: state.chr, board: p.board } });
    });
    const b = JSON.parse(answer.built) as Built & { src: string };
    set({ busy: false, built: { sha256: b.sha256, code_bytes: b.code_bytes, instructions: b.instructions } });
    await load(new File([answer.rom], `${p.key}${b.sha256 === p.sha256 ? "" : "-yours"}.nes`, { type: "application/octet-stream" }));
    // And play, as the button says: a cartridge loads stopped.
    const c = console_();
    if (c.loaded && c.powered && !c.running) toggleRun();
  } catch (e) {
    set({ busy: false, why: String((e as Error)?.message ?? e) });
  } finally {
    w.terminate();
  }
}

/** The program as it stands, as a file. */
export function download() {
  const p = state.parts;
  if (!p) return;
  const url = URL.createObjectURL(new Blob([state.text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.key}${state.text === p.prg ? "" : "-yours"}.s`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
