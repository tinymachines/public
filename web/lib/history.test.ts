import { describe, expect, test } from "bun:test";
import { F_HELD, F_READ, F_SYNC, readHistory } from "./history";

// Records as nes-console writes them (record.rs).
const cycle = (ab: number, db: number, flags: number) => [ab & 0xff, ab >> 8, db, flags, 0, 0, 0, 0];
const regs = (a: number, x: number, y: number, s: number, p: number) => [a, x, y, 0x40, s, p, 0, 0];

describe("readHistory", () => {
  test("an instruction is its fetch, its operand, its registers, and what it touched", () => {
    // LDA $0200 (AD 00 02) reading 7, then STA $0300 (8D 00 03) writing 7.
    const bytes = new Uint8Array([
      ...cycle(0x8000, 0xad, F_READ | F_SYNC), ...regs(1, 2, 3, 0xfd, 0x24),
      ...cycle(0x8001, 0x00, F_READ), ...cycle(0x8002, 0x02, F_READ), ...cycle(0x0200, 0x07, F_READ),
      ...cycle(0x8003, 0x8d, F_READ | F_SYNC), ...regs(7, 2, 3, 0xfd, 0x24),
      ...cycle(0x8004, 0x00, F_READ), ...cycle(0x8005, 0x03, F_READ), ...cycle(0x0300, 0x07, 0),
    ]);
    const h = readHistory(bytes);
    expect(h.length).toBe(2);
    expect(h[0]).toEqual({ pc: 0x8000, opcode: 0xad, operand: [0x00, 0x02], regs: { a: 1, x: 2, y: 3, s: 0xfd, p: 0x24 }, touched: [{ addr: 0x0200, value: 7, write: false }] });
    expect(h[1].touched).toEqual([{ addr: 0x0300, value: 7, write: true }]);
    expect(h[1].regs?.a).toBe(7);
  });
  test("a history that begins mid-instruction starts at the first fetch", () => {
    const bytes = new Uint8Array([...cycle(0x0200, 0x07, F_READ), ...regs(9, 9, 9, 9, 9), ...cycle(0x8003, 0xea, F_READ | F_SYNC)]);
    const h = readHistory(bytes);
    expect(h.map((s) => s.pc)).toEqual([0x8003]);
    expect(h[0].regs).toBeNull();
  });
  test("held cycles (a DMA) are not the instruction's reads", () => {
    const bytes = new Uint8Array([...cycle(0x8000, 0xea, F_READ | F_SYNC), ...cycle(0x0201, 0x55, F_READ | F_HELD), ...cycle(0x8001, 0xea, F_READ)]);
    const h = readHistory(bytes);
    expect(h[0].touched).toEqual([]);
    expect(h[0].operand).toEqual([0xea]);
  });
  test("input and picture records are passed over", () => {
    const bytes = new Uint8Array([...cycle(0x8000, 0xea, F_READ | F_SYNC), 1, 0, 0, 0x80, 0, 0, 0, 0, 5, 5, 5, 0xc0, 1, 0, 0, 0]);
    expect(readHistory(bytes).length).toBe(1);
  });
});
