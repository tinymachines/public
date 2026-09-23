/**
 * The iNES image, read the way the shelf reads it (api/carts.py
 * read_header), so the page and the server agree on where the CHR is:
 * sixteen bytes of header, a trainer if the flag says so, the PRG, then
 * the CHR. A count of zero for the CHR means the board draws from CHR-RAM,
 * which the game fills at run time, and the file carries no tiles at all.
 *
 * And the patch. A sprite edit is a change to bytes of the file, kept as
 * ranges against the image the reader loaded, and an IPS file is the
 * plain way to carry such ranges: "PATCH", then records of a three-byte
 * offset, a two-byte length and the bytes, then "EOF". Every emulator and
 * patcher reads it. A patch carries the reader's new bytes and nothing of
 * the base's, which is what makes it the one artefact of an edit to a
 * game somebody else owns that could ever leave the reader's browser
 * (notes/workbench.md, the licensing line).
 */

export interface Ines {
  /** The header's PRG size, in bytes. */
  prg: number;
  /** The header's CHR size, in bytes; zero for a CHR-RAM board. */
  chr: number;
  trainer: number;
  mapper: number;
  /** Where the PRG begins in the file. */
  prgAt: number;
  /** Where the CHR begins in the file (meaningful when chr > 0). */
  chrAt: number;
}

export function parseInes(bytes: Uint8Array): Ines {
  if (bytes.length < 16 || bytes[0] !== 0x4e || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1a) {
    throw new Error("not an iNES file: no NES header");
  }
  const prg = bytes[4] * 16384;
  const chr = bytes[5] * 8192;
  const trainer = bytes[6] & 4 ? 512 : 0;
  // The old "DiskDude" junk in bytes 12 to 15 makes the upper nibble a lie;
  // the shelf masks it the same way.
  const junk = bytes[12] || bytes[13] || bytes[14] || bytes[15];
  const mapper = (bytes[6] >> 4) | (junk ? 0 : bytes[7] & 0xf0);
  const prgAt = 16 + trainer;
  const chrAt = prgAt + prg;
  if (bytes.length < chrAt + chr) {
    throw new Error(`the file is ${bytes.length} bytes; its header claims ${chrAt + chr}`);
  }
  return { prg, chr, trainer, mapper, prgAt, chrAt };
}

/** One changed range of the image: where, and the bytes that are there now. */
export interface Range {
  at: number;
  bytes: Uint8Array;
}

/**
 * The ranges where `now` differs from `base`, two images of one length.
 * Runs closer than `gap` bytes are one range, so a tile's two planes
 * (its first and last bytes fifteen apart) come out as one record rather
 * than several.
 */
export function rangesOf(base: Uint8Array, now: Uint8Array, gap = 16): Range[] {
  if (base.length !== now.length) throw new Error(`the images differ in length: ${base.length} and ${now.length}`);
  const out: Range[] = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i < now.length; i++) {
    if (base[i] === now[i]) continue;
    if (start >= 0 && i - last <= gap) {
      last = i;
      continue;
    }
    if (start >= 0) out.push({ at: start, bytes: now.slice(start, last + 1) });
    start = i;
    last = i;
  }
  if (start >= 0) out.push({ at: start, bytes: now.slice(start, last + 1) });
  return out;
}

/** The IPS file for the ranges. Records are at most 65535 bytes, so a long range is several. */
export function ipsOf(ranges: Range[]): Uint8Array {
  const parts: number[] = [0x50, 0x41, 0x54, 0x43, 0x48]; // PATCH
  for (const r of ranges) {
    for (let off = 0; off < r.bytes.length; off += 65535) {
      const chunk = r.bytes.subarray(off, Math.min(r.bytes.length, off + 65535));
      const at = r.at + off;
      if (at > 0xffffff) throw new Error("an IPS offset has three bytes; the image is too large for one");
      parts.push((at >> 16) & 0xff, (at >> 8) & 0xff, at & 0xff, (chunk.length >> 8) & 0xff, chunk.length & 0xff);
      for (const b of chunk) parts.push(b);
    }
  }
  parts.push(0x45, 0x4f, 0x46); // EOF
  return Uint8Array.from(parts);
}

/** The image with the ranges laid over it. */
export function applyRanges(base: Uint8Array, ranges: Range[]): Uint8Array {
  const out = base.slice();
  for (const r of ranges) out.set(r.bytes, r.at);
  return out;
}
