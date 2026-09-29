/**
 * Recordings and what the flow tools made of them, kept in this browser's
 * private file store (the Origin Private File System: the canonical place
 * a web app keeps files of its own, on every current browser, never sent
 * anywhere). Nothing here reaches the server.
 *
 *   flow/recordings/<id>/meta.json     what, when, how long (RecordingMeta)
 *   flow/recordings/<id>/inputs.bin    the input log (nes-console record.rs)
 *   flow/recordings/<id>/battery.bin   the cartridge RAM it started with, if any
 *   flow/recordings/<id>/report.json   the flow tools' report, once made
 *   flow/recordings/<id>/state.bin     the whole console, when the recording began mid-game
 *   flow/roms/<sha256>.nes             the image it was played on, once per image
 *   flow/moments/<sha256>/<id>.bin     a moment: the console saved at one instant (below)
 *   flow/moments/<sha256>/<id>.json    what the list shows of it
 *
 * The image is kept so a recording can be played back later without the
 * reader finding the file again. It stays in this browser: an exported
 * recording carries the inputs and the save, never the game, and playing
 * one back asks for the same image (its digest must match).
 */

export interface RecordingMeta {
  v: 1;
  id: string;
  /** The cartridge's name as loaded. */
  name: string;
  /** SHA-256 of the image the console ran (a patched image is its own). */
  sha256: string;
  /** PRG ROM bytes, from the header: the flow tools key code by offset into it. */
  prgLen: number;
  /** Pictures the recording holds, from the log itself. */
  frames: number;
  recordedAt: string;
  battery: boolean;
  patched: boolean;
  /** Kept as it went and never stopped: the page was left while it ran, and it ends at the last copy taken. */
  left?: true;
  /** Started where the game stood rather than at power-on: the console's saved state there is kept with it (`state.bin`), and a replay starts from it. */
  fromState?: true;
}

const EXPORT_MAGIC = "TMNESREC";

async function root(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) throw new Error("this browser has no private file store, so recordings cannot be kept");
  const r = await navigator.storage.getDirectory();
  return r.getDirectoryHandle("flow", { create: true });
}

async function dir(path: string[], create = true): Promise<FileSystemDirectoryHandle> {
  let d = await root();
  for (const p of path) d = await d.getDirectoryHandle(p, { create });
  return d;
}

async function write(d: FileSystemDirectoryHandle, name: string, data: Uint8Array | string) {
  const f = await d.getFileHandle(name, { create: true });
  const w = await f.createWritable();
  await w.write(typeof data === "string" ? data : data.slice().buffer);
  await w.close();
}

async function read(d: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> {
  try {
    const f = await d.getFileHandle(name);
    return new Uint8Array(await (await f.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** PRG ROM bytes from an iNES or NES 2.0 header. */
export function prgLength(rom: Uint8Array): number {
  const nes2 = (rom[7] & 0x0c) === 0x08;
  const units = rom[4] | (nes2 ? (rom[9] & 0x0f) << 8 : 0);
  return units * 0x4000;
}

/** Pictures in an input log: its FRAME events (kind 3), sixteen bytes each. */
export function framesIn(log: Uint8Array): number {
  let n = 0;
  for (let i = 0; i + 16 <= log.length; i += 16) if (log[i] === 3) n++;
  return n;
}

/** Ask the browser to keep the store through a clean-up; it may say no. */
async function keep() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    // Kept on a best-effort basis either way.
  }
}

/**
 * Keep a recording. A recording still running is kept again and again under
 * the one id (`over`, the meta its first keeping answered) as it goes, with
 * `left` set, and a last time without it when it is stopped; a page closed
 * in between leaves the last copy, which says it was never stopped.
 */
export async function saveRecording(r: { name: string; rom: Uint8Array; battery: Uint8Array | null; state?: Uint8Array | null; log: Uint8Array; patched: boolean; left?: boolean; over?: RecordingMeta | null }): Promise<RecordingMeta> {
  await keep();
  const sha = r.over?.sha256 ?? (await sha256(r.rom));
  const recordedAt = r.over?.recordedAt ?? new Date().toISOString();
  const id = r.over?.id ?? `${recordedAt.replace(/[:.]/g, "-")}-${sha.slice(0, 8)}`;
  const meta: RecordingMeta = {
    v: 1,
    id,
    name: r.name,
    sha256: sha,
    prgLen: prgLength(r.rom),
    frames: framesIn(r.log),
    recordedAt,
    battery: !!r.battery && r.battery.length > 0,
    patched: r.patched,
    ...(r.left ? { left: true as const } : {}),
    ...(r.state && r.state.length ? { fromState: true as const } : {}),
  };
  const roms = await dir(["roms"]);
  if (!(await read(roms, `${sha}.nes`))) await write(roms, `${sha}.nes`, r.rom);
  const d = await dir(["recordings", id]);
  // The log before the meta that counts it: each file is replaced whole
  // when its writer closes, so a page gone between the two leaves a meta a
  // copy behind its log, never one that promises more than the log holds.
  await write(d, "inputs.bin", r.log);
  if (meta.battery && !r.over) await write(d, "battery.bin", r.battery!);
  if (meta.fromState && !r.over) await write(d, "state.bin", r.state!);
  await write(d, "meta.json", JSON.stringify(meta));
  return meta;
}

export async function listRecordings(): Promise<(RecordingMeta & { report: boolean; rom: boolean })[]> {
  const recs = await dir(["recordings"]);
  const roms = await dir(["roms"]);
  const out: (RecordingMeta & { report: boolean; rom: boolean })[] = [];
  for await (const [name, h] of recs as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (h.kind !== "directory") continue;
    const d = h as FileSystemDirectoryHandle;
    const m = await read(d, "meta.json");
    if (!m) continue;
    try {
      const meta = JSON.parse(new TextDecoder().decode(m)) as RecordingMeta;
      if (meta.id !== name) continue;
      const report = !!(await read(d, "report.json"));
      const rom = !!(await read(roms, `${meta.sha256}.nes`));
      out.push({ ...meta, report, rom });
    } catch {
      // A recording whose meta cannot be read is not listed.
    }
  }
  return out.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export async function loadRecording(id: string): Promise<{ meta: RecordingMeta; log: Uint8Array; battery: Uint8Array | null; state: Uint8Array | null; rom: Uint8Array | null }> {
  const d = await dir(["recordings", id], false);
  const m = await read(d, "meta.json");
  const log = await read(d, "inputs.bin");
  if (!m || !log) throw new Error("the recording is incomplete");
  const meta = JSON.parse(new TextDecoder().decode(m)) as RecordingMeta;
  const state = await read(d, "state.bin");
  if (meta.fromState && !state) throw new Error("the recording is incomplete: the state it starts from is missing");
  const rom = await read(await dir(["roms"]), `${meta.sha256}.nes`);
  return { meta, log, battery: await read(d, "battery.bin"), state, rom };
}

/** Keep an image for a recording that arrived without it; refused unless it is the one recorded on. */
export async function supplyRom(meta: RecordingMeta, rom: Uint8Array): Promise<void> {
  const sha = await sha256(rom);
  if (sha !== meta.sha256) throw new Error("that is not the image this recording was made on");
  await write(await dir(["roms"]), `${sha}.nes`, rom);
}

export async function saveReport(id: string, report: string) {
  await write(await dir(["recordings", id], false), "report.json", report);
}

export async function loadReport(id: string): Promise<string | null> {
  const b = await read(await dir(["recordings", id], false), "report.json");
  return b ? new TextDecoder().decode(b) : null;
}

/** Remove a recording, and its image once no other recording was made on it. */
export async function deleteRecording(id: string) {
  const { meta } = await loadRecording(id).catch(() => ({ meta: null }));
  await (await dir(["recordings"])).removeEntry(id, { recursive: true });
  if (meta && !(await listRecordings()).some((r) => r.sha256 === meta.sha256)) {
    await (await dir(["roms"])).removeEntry(`${meta.sha256}.nes`).catch(() => {});
  }
}

/**
 * A recording as one file: the magic, then meta, save, inputs and the
 * state it starts from (empty for power-on), each behind its length. Never
 * the image. A file from before states ends after the inputs, and reads
 * as power-on.
 */
export function packRecording(meta: RecordingMeta, battery: Uint8Array | null, log: Uint8Array, state: Uint8Array | null): Uint8Array {
  const m = new TextEncoder().encode(JSON.stringify(meta));
  const b = battery ?? new Uint8Array(0);
  const st = state ?? new Uint8Array(0);
  const len = (n: number) => new Uint8Array(new Uint32Array([n]).buffer);
  const parts = [new TextEncoder().encode(EXPORT_MAGIC), len(m.length), m, len(b.length), b, len(log.length), log, len(st.length), st];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The parts of a packed recording, refused whole if it is not one. */
export function unpackRecording(bytes: Uint8Array): { meta: RecordingMeta; battery: Uint8Array; log: Uint8Array; state: Uint8Array } {
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== EXPORT_MAGIC) throw new Error("that file is not a recording");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  const part = () => {
    if (at + 4 > bytes.length) throw new Error("the recording is cut short");
    const n = dv.getUint32(at, true);
    at += 4;
    if (at + n > bytes.length) throw new Error("the recording is cut short");
    const p = bytes.slice(at, at + n);
    at += n;
    return p;
  };
  const meta = JSON.parse(new TextDecoder().decode(part())) as RecordingMeta;
  const battery = part();
  const log = part();
  // A file from before states ends here; one after carries the state, or
  // an empty part for power-on.
  const state = at < bytes.length ? part() : new Uint8Array(0);
  if (meta.v !== 1 || !/^[0-9a-f]{64}$/.test(meta.sha256) || log.length % 16 !== 0) throw new Error("that file is not a recording this page can read");
  if (meta.fromState && !state.length) throw new Error("the recording starts mid-game and the file has no state to start it from");
  return { meta, battery, log, state };
}

export async function exportRecording(id: string): Promise<Blob> {
  const { meta, log, battery, state } = await loadRecording(id);
  return new Blob([packRecording(meta, battery, log, state).buffer as ArrayBuffer], { type: "application/octet-stream" });
}

export async function importRecording(file: File): Promise<RecordingMeta> {
  const { meta, battery, log, state } = unpackRecording(new Uint8Array(await file.arrayBuffer()));
  await keep();
  const id = meta.id.replace(/[^0-9A-Za-z-]/g, "");
  const d = await dir(["recordings", id]);
  await write(d, "inputs.bin", log);
  if (battery.length) await write(d, "battery.bin", battery);
  if (state.length) await write(d, "state.bin", state);
  // What the file holds decides, not what its meta claims.
  const clean: RecordingMeta = { ...meta, id, frames: framesIn(log), battery: battery.length > 0 };
  if (state.length) clean.fromState = true;
  else delete clean.fromState;
  await write(d, "meta.json", JSON.stringify(clean));
  return clean;
}

// ---------------------------------------------------------------------------
// Moments: the whole console saved at one instant, per game, kept beside the
// recordings. `moments/<sha>/<id>.bin` is the console's bytes (the ROM's
// digest inside them, so a moment refuses any other image), `<id>.json`
// what the list shows.
// ---------------------------------------------------------------------------

export interface MomentMeta {
  v: 1;
  id: string;
  /** SHA-256 of the image the console ran. */
  sha256: string;
  /** The cartridge's name as loaded. */
  name: string;
  savedAt: string;
  /** Frames the page had run when it was saved. */
  frame: number;
  bytes: number;
}

export async function saveMoment(m: { rom: Uint8Array; name: string; frame: number; state: Uint8Array }): Promise<MomentMeta> {
  await keep();
  const sha = await sha256(m.rom);
  const savedAt = new Date().toISOString();
  const meta: MomentMeta = { v: 1, id: savedAt.replace(/[:.]/g, "-"), sha256: sha, name: m.name, savedAt, frame: m.frame, bytes: m.state.length };
  const d = await dir(["moments", sha]);
  await write(d, `${meta.id}.bin`, m.state);
  await write(d, `${meta.id}.json`, JSON.stringify(meta));
  return meta;
}

/** The moments saved on one image, newest first. */
export async function listMoments(sha: string): Promise<MomentMeta[]> {
  const d = await dir(["moments", sha]);
  const out: MomentMeta[] = [];
  for await (const [name, h] of d as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (h.kind !== "file" || !name.endsWith(".json")) continue;
    const b = await read(d, name);
    if (!b) continue;
    try {
      const m = JSON.parse(new TextDecoder().decode(b)) as MomentMeta;
      // A moment whose bytes are gone is not listed.
      if (m.sha256 === sha && `${m.id}.json` === name && (await read(d, `${m.id}.bin`))) out.push(m);
    } catch {
      // A moment whose meta cannot be read is not listed.
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
}

export async function loadMoment(sha: string, id: string): Promise<Uint8Array> {
  const b = await read(await dir(["moments", sha], false), `${id}.bin`);
  if (!b) throw new Error("that moment is no longer in this browser");
  return b;
}

export async function deleteMoment(sha: string, id: string) {
  const d = await dir(["moments", sha], false);
  await d.removeEntry(`${id}.bin`).catch(() => {});
  await d.removeEntry(`${id}.json`).catch(() => {});
}
