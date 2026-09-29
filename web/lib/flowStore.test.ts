import { describe, expect, test } from "bun:test";
import { framesIn, packRecording, prgLength, readBlock, unpackRecording, type RecordingMeta } from "./flowStore";

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

describe("a recording as one file", () => {
  const meta: RecordingMeta = { v: 1, id: "r", name: "g.nes", sha256: "a".repeat(64), prgLen: 0x8000, frames: 1, recordedAt: "2026-09-27T00:00:00.000Z", battery: false, patched: false };
  const log = new Uint8Array(32).fill(3);
  test("carries the state a mid-game recording starts from", () => {
    const state = new Uint8Array([9, 8, 7]);
    const u = unpackRecording(packRecording({ ...meta, fromState: true }, null, log, state));
    expect([...u.state]).toEqual([9, 8, 7]);
    expect([...u.log]).toEqual([...log]);
    expect(u.meta.fromState).toBe(true);
  });
  test("a file from before states, ending after the inputs, reads as power-on", () => {
    const full = packRecording(meta, null, log, null);
    // The old form is the new one without its last part (a length of 0).
    const old = full.slice(0, full.length - 4);
    const u = unpackRecording(old);
    expect(u.state.length).toBe(0);
    expect([...u.log]).toEqual([...log]);
  });
  test("a mid-game recording without its state is refused", () => {
    const full = packRecording({ ...meta, fromState: true }, null, log, null);
    expect(() => unpackRecording(full)).toThrow("no state");
  });
  test("a file cut inside a part is refused", () => {
    const full = packRecording(meta, null, log, new Uint8Array([1, 2, 3]));
    expect(() => unpackRecording(full.slice(0, full.length - 1))).toThrow("cut short");
  });
});

describe("a block read back from the store", () => {
  const sha = "b".repeat(64);
  const block = { v: 1, id: "2026-09-29T00-00-00-000Z-c000", sha256: sha, at: 0xc000, to: 0xc003, bytes: "A9004C00C0", label: "the loop", note: "", savedAt: "2026-09-29T00:00:00.000Z" };
  const json = (over: object) => JSON.stringify({ ...block, ...over });
  test("comes back whole when it is the block it was filed as", () => {
    expect(readBlock(json({}), sha, block.id)).toEqual(block as never);
  });
  test("is refused under another digest, another id, or a range out of order", () => {
    expect(readBlock(json({}), "c".repeat(64), block.id)).toBeNull();
    expect(readBlock(json({}), sha, "other")).toBeNull();
    expect(readBlock(json({ to: 0xbfff }), sha, block.id)).toBeNull();
    expect(readBlock(json({ at: 0x10000, to: 0x10000 }), sha, block.id)).toBeNull();
  });
  test("is refused when its bytes are not hex, its words are missing, or it is not JSON", () => {
    expect(readBlock(json({ bytes: "A9 00" }), sha, block.id)).toBeNull();
    expect(readBlock(json({ label: undefined }), sha, block.id)).toBeNull();
    expect(readBlock("{not json", sha, block.id)).toBeNull();
  });
});
