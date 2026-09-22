/**
 * Your own cartridges: the one place the site talks to /api/v1/me/carts.
 *
 * Several pages ask for a .nes file (the console at /nes/play, and three
 * benches in the playground). Each of them already loads a `File` a reader
 * picked off their disk, so the shelf hands them exactly that: `fetchCart`
 * answers with a `File`, and no page's loading code knows or cares whether
 * the bytes came from a disk or from the account. Add a page that asks for a
 * cartridge and it gets the shelf by rendering <ShelfPicker>; nothing here
 * needs to hear about it.
 *
 * A cartridge answers only to the signed-in account that put it there
 * (api/carts.py says why and how). Signed out, or signed in with no shelf,
 * `listShelf` answers with nothing to show rather than throwing, because
 * that is the ordinary case for almost every reader and a menu should not
 * treat it as a failure.
 */

export interface Cart {
  id: string;
  name: string;
  note: string;
  sha256: string;
  crc32: string;
  size: number;
  mapper: number;
  prg_bytes: number;
  chr_bytes: number;
  rom: string;
  created_at: string;
  updated_at: string;
}

export interface ShelfLimits {
  max: number;
  held: number;
  remaining: number;
  bytes_max: number;
}

export type Shelf =
  /** Nobody is signed in (or sign-in is off). */
  | { state: "signed-out" }
  /** Signed in. `limits.max === 0` means the account has not been given a shelf. */
  | { state: "open"; carts: Cart[]; limits: ShelfLimits };

const API = "/api/v1/me/carts";

/** Tell every picker on the page that the shelf changed (the manager does, after each write). */
const CHANGED = "tm:shelf-changed";
export const announceChange = () => window.dispatchEvent(new Event(CHANGED));
export function onChange(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

/** The refusal's own words, which the API writes to be shown. */
export class ShelfError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function refuse(r: Response): Promise<never> {
  const j = (await r.json().catch(() => null)) as { detail?: unknown } | null;
  const detail = typeof j?.detail === "string" ? j.detail : null;
  throw new ShelfError(r.status, detail ?? `The shelf answered ${r.status}.`);
}

export async function listShelf(): Promise<Shelf> {
  const r = await fetch(API, { cache: "no-store" });
  if (r.status === 401 || r.status === 503) return { state: "signed-out" };
  if (!r.ok) return refuse(r);
  const j = (await r.json()) as { carts: Cart[]; limits: ShelfLimits };
  return { state: "open", carts: j.carts, limits: j.limits };
}

/**
 * The cartridge's bytes as a File, named the way a file on disk would be.
 *
 * The digest is checked here as well as at the server: what reaches a console
 * is the dump that was put on the shelf, or nothing.
 */
export async function fetchCart(cart: Cart): Promise<File> {
  const r = await fetch(`/api${cart.rom}`, { cache: "no-store" });
  if (!r.ok) return refuse(r);
  const bytes = await r.arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (digest !== cart.sha256) throw new ShelfError(0, `${cart.name} arrived with a different digest from the one the shelf recorded, so it was not loaded.`);
  return new File([bytes], `${cart.name}.nes`, { type: "application/octet-stream" });
}

export async function addCart(file: File, name?: string, note = ""): Promise<Cart> {
  const q = new URLSearchParams({ name: name ?? file.name, note });
  const r = await fetch(`${API}?${q}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
  if (!r.ok) return refuse(r);
  return (await r.json()) as Cart;
}

export async function patchCart(id: string, changes: { name?: string; note?: string }): Promise<Cart> {
  const r = await fetch(`${API}/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes) });
  if (!r.ok) return refuse(r);
  return (await r.json()) as Cart;
}

export async function deleteCart(id: string): Promise<void> {
  const r = await fetch(`${API}/${id}`, { method: "DELETE" });
  if (!r.ok) return refuse(r);
}

/** "256 KiB", for a size that is a whole number of them, which a ROM's always is. */
export function kib(bytes: number): string {
  return `${(bytes / 1024).toLocaleString("en", { maximumFractionDigits: 1 })} KiB`;
}
