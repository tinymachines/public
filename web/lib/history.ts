/**
 * The console's trace read back as instructions: what the History window
 * on the create desk lists. The trace is nes-console's record.rs format,
 * 8-byte records: a CYCLE for every CPU cycle's bus on its phi2 (address,
 * data, flags, the PRG offset), and a REGS after each opcode fetch with the
 * registers entering that instruction. An instruction is its fetch (a
 * cycle with SYNC), the registers after it, and every cycle up to the next
 * fetch: its operand reads, then what it read and wrote.
 *
 * A history is the newest part of a longer trace, so it can begin in the
 * middle of an instruction; what comes before its first fetch is left
 * out rather than guessed at.
 */

export const F_READ = 1;
export const F_SYNC = 2;
export const F_HELD = 16;

export interface Access {
  addr: number;
  value: number;
  write: boolean;
}

export interface Step {
  /** The address the opcode was fetched from. */
  pc: number;
  opcode: number;
  /** The bytes after the opcode, as the CPU read them: its operand. */
  operand: number[];
  /** The registers entering the instruction, when the trace has them. */
  regs: { a: number; x: number; y: number; s: number; p: number } | null;
  /** Its reads and writes past the operand: the memory it touched. */
  touched: Access[];
}

export function readHistory(bytes: Uint8Array): Step[] {
  const out: Step[] = [];
  let cur: Step | null = null;
  for (let i = 0; i + 8 <= bytes.length; i += 8) {
    const kind = bytes[i + 3] >> 6;
    if (kind === 0) {
      const flags = bytes[i + 3] & 0x3f;
      const addr = bytes[i] | (bytes[i + 1] << 8);
      const value = bytes[i + 2];
      // A held cycle (DMA, RDY low) repeats a read the CPU has not done.
      if (flags & F_HELD) continue;
      if (flags & F_SYNC) {
        cur = { pc: addr, opcode: value, operand: [], regs: null, touched: [] };
        out.push(cur);
        continue;
      }
      if (!cur) continue;
      const read = (flags & F_READ) !== 0;
      // The operand: reads of the bytes straight after the opcode, while
      // nothing else has been read yet.
      const next = (cur.pc + 1 + cur.operand.length) & 0xffff;
      if (read && addr === next && cur.touched.length === 0 && cur.operand.length < 2) {
        cur.operand.push(value);
        continue;
      }
      cur.touched.push({ addr, value, write: !read });
    } else if (kind === 1 && cur && !cur.regs) {
      cur.regs = { a: bytes[i], x: bytes[i + 1], y: bytes[i + 2], s: bytes[i + 4], p: bytes[i + 5] };
    }
  }
  return out;
}
