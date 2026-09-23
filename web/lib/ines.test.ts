import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { applyRanges, ipsOf, parseInes, rangesOf } from "./ines";

describe("the iNES reader and the patch", () => {
  test("the site's own cartridges parse to where their CHR is", () => {
    for (const name of ["cal.nes", "bars.nes"]) {
      const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "public", "nes", name)));
      const h = parseInes(bytes);
      expect(h.mapper).toBe(0);
      expect(h.prg).toBe(32768);
      expect(h.chr).toBe(8192);
      expect(h.chrAt).toBe(16 + 32768);
      expect(bytes.length).toBe(h.chrAt + h.chr);
    }
  });

  test("a file that is not an image, or shorter than its header claims, is refused with the reason", () => {
    expect(() => parseInes(new Uint8Array(8))).toThrow("no NES header");
    const short = new Uint8Array(16 + 100);
    short.set([0x4e, 0x45, 0x53, 0x1a, 2, 1, 0, 0]);
    expect(() => parseInes(short)).toThrow("its header claims");
  });

  test("a trainer and the DiskDude junk are read the shelf's way", () => {
    const b = new Uint8Array(16 + 512 + 16384);
    b.set([0x4e, 0x45, 0x53, 0x1a, 1, 0, 0x14, 0xf0, 0, 0, 0, 0, 0x44, 0x69, 0x73, 0x6b]);
    const h = parseInes(b);
    expect(h.trainer).toBe(512);
    expect(h.prgAt).toBe(528);
    expect(h.chr).toBe(0);
    expect(h.mapper, "the upper nibble is junk when bytes 12 to 15 are").toBe(1);
  });

  test("no change is an empty patch, and one tile is one record at the tile's offset", () => {
    const base = new Uint8Array(1024).map((_, i) => i & 0xff);
    expect(rangesOf(base, base)).toEqual([]);
    expect(Array.from(ipsOf([]))).toEqual([0x50, 0x41, 0x54, 0x43, 0x48, 0x45, 0x4f, 0x46]);
    const now = base.slice();
    // A tile's low plane byte 0 and high plane byte 7: fifteen bytes apart, one record.
    now[0x120] ^= 0x80;
    now[0x12f] ^= 0x01;
    const ranges = rangesOf(base, now);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].at).toBe(0x120);
    expect(ranges[0].bytes.length).toBe(16);
    const ips = ipsOf(ranges);
    expect(String.fromCharCode(...ips.subarray(0, 5))).toBe("PATCH");
    expect(Array.from(ips.subarray(5, 10))).toEqual([0x00, 0x01, 0x20, 0x00, 0x10]);
    expect(String.fromCharCode(...ips.subarray(ips.length - 3))).toBe("EOF");
    expect(ips.length).toBe(5 + 5 + 16 + 3);
    expect(applyRanges(base, ranges)).toEqual(now);
  });

  test("two edits far apart are two records; a run past a record's size is split", () => {
    const base = new Uint8Array(70000);
    const now = base.slice();
    now[10] = 1;
    now[60000] = 1;
    expect(rangesOf(base, now)).toHaveLength(2);
    const long = base.slice().fill(7);
    const r = rangesOf(base, long);
    expect(r).toHaveLength(1);
    const ips = ipsOf(r);
    // Two records: 65535 and 4465 bytes.
    expect(ips.length).toBe(5 + 5 + 65535 + 5 + 4465 + 3);
  });
});
