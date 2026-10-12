/**
 * The Program window's seam: a lesson's parts fetched from this site
 * (/autopsy/lessons/<key>.parts.json), the program as the reader edits it,
 * and the cartridge built from it in the listing worker (wasm/listing's
 * lesson.rs, the code lessons/build.py runs), loaded into the desk's
 * console. A module-scope store like the listing's.
 */

import { load, snapshot as console_, toggleRun } from "../play/playEngine";
import type { CameraMeasures, JumpMeasures, PlatformsMeasures, RoomsMeasures, RunMeasures, ScrollMeasures, StompMeasures, WalkersMeasures } from "@/lib/lessons";
import { cameraMeasures, cells, jumpMeasures, parseScript, platformsMeasures, roomsMeasures, runMeasures, scrollMeasures, stompMeasures, sweeps, walkersMeasures, type CameraPlan, type JumpPlan, type LogKind, type Plan, type PlatformsPlan, type RoomsPlan, type RunPlan, type ScrollPlan, type StompPlan, type WalkersPlan } from "@/lib/lessonMeasure";

export interface Parts {
  key: string;
  title: string;
  sha256: string;
  board: { mirroring: string; prg: number; org: string; chr: number };
  prg: string;
  chr: string;
  /** How to measure the lesson again here, and our own numbers; null where the page cannot yet. */
  measure: { plan: JumpPlan; ours: JumpMeasures } | { plan: RunPlan; ours: RunMeasures } | { plan: StompPlan; ours: StompMeasures } | { plan: WalkersPlan; ours: WalkersMeasures } | { plan: CameraPlan; ours: CameraMeasures } | { plan: PlatformsPlan; ours: PlatformsMeasures } | { plan: ScrollPlan; ours: ScrollMeasures } | { plan: RoomsPlan; ours: RoomsMeasures } | null;
}

/** What a measurement comes to. The stomp lesson's is without the autopsy's part, which the page does not take. */
export type Yours = JumpMeasures | RunMeasures | Omit<StompMeasures, "compare"> | WalkersMeasures | CameraMeasures | PlatformsMeasures | ScrollMeasures | RoomsMeasures;

/** The reader's cartridge measured the way the lesson was: the numbers, or why there are none. */
export type Measured = { yours: Yours; why: null } | { yours: null; why: string };

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
  /** The cartridge just built, measured; null before a build and for a lesson the page cannot measure. */
  measured: Measured | null;
  why: string | null;
}

const INITIAL: ProgramState = { parts: null, text: "", chr: "", busy: false, built: null, measured: null, why: null };
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
  set({ busy: true, why: null, built: null, measured: null });
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
  set({ text, built: null, measured: null });
  if (state.parts) keep(state.parts.key, text === state.parts.prg ? null : text);
}

/** New tiles for the open lesson (kept here like an edit of the program). */
export function setTiles(chr: string) {
  set({ chr, built: null, measured: null });
  if (state.parts) keep(`${state.parts.key}.chr`, chr === state.parts.chr ? null : chr);
}

/** Back to the lesson's program and tiles as we wrote them. */
export function ours() {
  if (!state.parts) return;
  edit(state.parts.prg);
  setTiles(state.parts.chr);
}

/**
 * The cartridge run through the lesson's own pad script on a thread of its
 * own (public/nes/measure.worker.mjs), and its memory read the way the
 * lesson's was. The run lesson takes forty short runs more, shared among
 * up to four threads. A run the measurement cannot read (a jump
 * that never lands) comes back as the reason.
 */
async function measure(rom: ArrayBuffer, plan: Plan): Promise<Measured> {
  type Job = { script: [number, number][]; frames: number; stop?: { from: number; cell: number }; logs?: LogKind[] };
  /** A run: its memory a frame at a time, and the write logs it asked for (storyboard's text, by kind). */
  type Run = { cell: (f: number, a: number) => number; logs: Partial<Record<LogKind, string>> };
  const workers: Worker[] = [];
  /** One thread taking jobs off the list in turn until it is empty; answers land at each job's own place. */
  const crew = (jobs: Job[], out: Run[], next: { n: number }) =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker("/nes/measure.worker.mjs", { type: "module" });
      workers.push(w);
      const take = () => {
        const id = next.n++;
        if (id >= jobs.length) return resolve();
        w.postMessage({ id, rom, ...jobs[id] });
      };
      w.onmessage = (e) => {
        const d = e.data as { id: number; ok?: boolean; answer?: { ram: ArrayBuffer; logs: Partial<Record<LogKind, string>> }; error?: string };
        if (!d.ok) return reject(new Error(d.error));
        out[d.id] = { cell: cells(new Uint8Array(d.answer!.ram)), logs: d.answer!.logs ?? {} };
        take();
      };
      w.onerror = () => reject(new Error("the measuring worker failed to load"));
      take();
    });
  const runs = async (jobs: Job[]) => {
    const out: Run[] = [], next = { n: 0 };
    const threads = Math.max(1, Math.min(4, jobs.length, navigator.hardwareConcurrency || 1));
    await Promise.all(Array.from({ length: threads }, () => crew(jobs, out, next)));
    return out;
  };
  try {
    const main: Job = { script: parseScript(plan.script), frames: plan.frames };
    if (plan.kind === "jump") return { yours: jumpMeasures((await runs([main]))[0].cell, plan), why: null };
    if (plan.kind === "stomp") return { yours: stompMeasures((await runs([main]))[0].cell, plan), why: null };
    if (plan.kind === "walkers") return { yours: walkersMeasures((await runs([main]))[0].cell, plan), why: null };
    if (plan.kind === "camera") return { yours: cameraMeasures((await runs([main]))[0].cell, plan), why: null };
    if (plan.kind === "platforms") return { yours: platformsMeasures((await runs([main]))[0].cell, plan), why: null };
    if (plan.kind === "scroll") {
      // The strips are read off the picture-memory writes, so the run keeps that log.
      const r = (await runs([{ ...main, logs: ["vram"] }]))[0];
      return { yours: scrollMeasures(r.cell, r.logs.vram ?? "", plan), why: null };
    }
    if (plan.kind === "rooms") {
      // The slide is read as the picture chip was told it, and the new room's columns and rows off the writes.
      const r = (await runs([{ ...main, logs: ["vram", "scroll"] }]))[0];
      return { yours: roomsMeasures(r.cell, r.logs.vram ?? "", r.logs.scroll ?? "", plan), why: null };
    }
    const air = parseInt(plan.memory.air.slice(1), 16);
    const [first, ...swept] = await runs([main, ...sweeps().map((s) => ({ script: s.script, frames: s.frames, stop: { from: s.from, cell: air } }))]);
    return { yours: runMeasures(first.cell, swept.map((r) => r.cell), plan), why: null };
  } catch (e) {
    return { yours: null, why: String((e as Error)?.message ?? e) };
  } finally {
    for (const w of workers) w.terminate();
  }
}

/** Build the program as it stands into a cartridge and put it in the console. */
export async function assemble() {
  const p = state.parts;
  if (!p) return;
  set({ busy: true, why: null, built: null, measured: null });
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
    // Measured from a copy: the console takes the cartridge's own bytes.
    if (p.measure) void measure(answer.rom.slice(0), p.measure.plan).then((m) => state.parts === p && state.built?.sha256 === b.sha256 && set({ measured: m }));
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
