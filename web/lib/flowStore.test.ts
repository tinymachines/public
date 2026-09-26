import { describe, expect, test } from "bun:test";
import { framesIn, prgLength } from "./flowStore";

// The flow tools key code by its offset into the PRG, so its length must
// be the header's, in both header formats; and a recording's length is
// read off its own log, not typed.

describe("prgLength", () => {
  const header = (b4: number, b7 = 0, b9 = 0) => {
    const h = new Uint8Array(16);
    h.set([0x4e, 0x45, 0x53, 0x1a, b4, 1, 0, b7, 0, b9]);
    return h;
  };
  test("iNES counts 16 KiB units", () => {
    expect(prgLength(header(2))).toBe(0x8000);
    expect(prgLength(header(8))).toBe(0x20000);
  });
  test("NES 2.0 adds the high nibble from byte 9, and only then", () => {
    expect(prgLength(header(0x10, 0x08, 0x01))).toBe((0x100 + 0x10) * 0x4000);
    expect(prgLength(header(0x10, 0x00, 0x01))).toBe(0x10 * 0x4000);
  });
});

describe("framesIn", () => {
  const event = (kind: number) => {
    const e = new Uint8Array(16);
    e[0] = kind;
    return e;
  };
  test("counts the FRAME events and nothing else", () => {
    const log = new Uint8Array([...event(1), ...event(3), ...event(3), ...event(2), ...event(3), ...event(4)]);
    expect(framesIn(log)).toBe(3);
  });
  test("an empty log holds no pictures", () => {
    expect(framesIn(new Uint8Array(0))).toBe(0);
  });
});
