/**
 * The registry's shapes, as the 6502 service actually answers them.
 *
 * Written from service/registry.py's own `builder`, `builders`, `rom_brief`
 * and `art_of`, and then checked against the running service rather than
 * against the source: the deployed process is older than main, and the
 * difference is the whole reason the pages below ask for nothing that is not
 * answering today. See docs and PROJECTS.md.
 *
 * Types only, plus two pure functions. Nothing here fetches, because nothing
 * here runs on the server: the registry is live data on another origin, and a
 * page that rendered it server-side would put another service in the render
 * path of this one. The pages prerender their frame and their prose and ask
 * for the data in the browser, which is also why every field below is
 * `| null`-honest rather than assumed.
 */

/**
 * One image: a grid of 8x8 four-colour tiles, `w` by `h` of them, row major.
 *
 * `chr` inline, or `url` when the listing was asked for `art=none`. The
 * dimensions are there either way, which is what lets a box be laid out
 * before the bytes arrive.
 */
export interface Art {
  w: number;
  h: number;
  chr?: string;
  url?: string;
}

/** What the service re-measured when the cartridge was published. */
export interface Measured {
  booted: boolean;
  frames_requested: number;
  frames_completed: number;
  half_cycles: number[];
  frame_cost: number | null;
  screen_changed: boolean;
  tiles_used: number[];
  status: number | null;
  score: number | null;
  notes: string[];
}

export interface Rom {
  slug: string;
  handle: string;
  title: string;
  blurb: string;
  rom_size: number;
  tiles: number;
  frame_cost: number | null;
  sha256: string;
  bytes: number;
  measured: Measured;
  cover: Art | null;
  created: string;
  updated: string;
  cart_url: string;
  play_url: string;
}

export interface BuilderBrief {
  handle: string;
  name: string;
  bio: string;
  roms: number;
  updated: string;
  avatar: Art | null;
}

export interface Builder {
  handle: string;
  name: string;
  bio: string;
  links: { label: string; url: string }[];
  avatar: Art | null;
  created: string;
  updated: string;
  roms: Rom[];
}

export interface Index {
  count: number;
  roms: number;
  builders: BuilderBrief[];
  latest: Rom[];
  limits: Record<string, number>;
}

/** Hex to bytes. The service sends CHR as lowercase hex, one byte per pair. */
export function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/**
 * A date, as far as a reader needs it.
 *
 * The stored form is ISO 8601 in UTC and it is exact; a page listing what
 * somebody published wants the day. Rendered from the string rather than
 * through a locale, because a locale differs between the server that
 * prerendered the frame and the browser that filled it in, and React calls
 * that a hydration mismatch.
 */
export function day(iso: string): string {
  return iso.slice(0, 10);
}
