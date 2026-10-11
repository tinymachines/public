/**
 * A lesson's measurements taken again, in the page, on the cartridge the
 * reader built: the same pad script the lesson was measured with, the
 * console's memory as each frame ended, and the same reading of it. Pure
 * functions, with no file system in them, so the Program window and the
 * tests run the same code.
 *
 * This is a second copy of what scripts/board-lessons.py measures, and it
 * is held to the first by a check rather than by care: the Program
 * window's browser test measures our own cartridge with this and requires
 * the numbers the record holds (e2e/program-measure.spec.ts).
 *
 * Only the jump lesson is measured here so far. Every lesson has its own
 * way of being measured, and each one is added with that check or not at
 * all.
 */

import type { JumpMeasures } from "./lessons";

/** What the jump lesson's measurement reads, from its lesson.json. */
export interface JumpPlan {
  kind: "jump";
  /** The pad script: `AT <frame> <pad byte in hex>` lines. */
  script: string;
  frames: number;
  /** Each jump's press and release, in frames. */
  presses: [number, number][];
  walk_from: number;
  memory: { air: string; y: string; speed_x: [string, string] };
  ground: number;
}

/** The script's lines as [frame, pad byte], in frame order. */
export function parseScript(text: string): [number, number][] {
  const at: [number, number][] = [];
  for (const line of text.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length === 3 && w[0] === "AT") {
      const f = Number(w[1]), pad = parseInt(w[2], 16);
      if (!Number.isInteger(f) || f < 0 || Number.isNaN(pad)) throw new Error(`the script's line "${line.trim()}" is not AT <frame> <hex byte>`);
      at.push([f, pad & 0xff]);
    }
  }
  return at.sort((a, b) => a[0] - b[0]);
}

/** A cell of memory as frame `f` ended, from a run's bytes (2048 a frame). */
export function cells(ram: Uint8Array): (f: number, a: number) => number {
  return (f, a) => ram[f * 2048 + a];
}

const addr = (a: string) => parseInt(a.slice(1), 16);

/**
 * The jump lesson's numbers (board-lessons.py's jump_measures): how many
 * frames of walking reach full speed and what it is, then for each jump
 * how long A was held, how many frames it spent in the air and how high
 * it rose. A jump that never leaves the ground or has not landed when the
 * next press comes is refused with the reason, not given a number.
 */
export function jumpMeasures(cell: (f: number, a: number) => number, plan: JumpPlan): JumpMeasures {
  const air = addr(plan.memory.air), y = addr(plan.memory.y), sx = plan.memory.speed_x.map(addr);
  const start = plan.walk_from;
  const speed = (f: number) => (cell(f, sx[1]) * 256 + cell(f, sx[0])) / 256;
  let top = -Infinity, full = start;
  for (let f = start; f < start + 400; f++) {
    if (speed(f) > top) {
      top = speed(f);
      full = f;
    }
  }
  const ends = [...plan.presses.slice(1).map((p) => p[0]), plan.frames];
  const jumps = plan.presses.map(([press, up], k) => {
    const end = ends[k];
    const upAir: number[] = [];
    for (let f = press; f < end; f++) if (cell(f, air)) upAir.push(f);
    if (!upAir.length) throw new Error(`the jump pressed at frame ${press} never left the ground`);
    if (upAir[upAir.length - 1] === end - 1) throw new Error(`the jump pressed at frame ${press} had not landed by frame ${end}`);
    return { held: up - press, frames: upAir.length, risen: plan.ground - Math.min(...upAir.map((f) => cell(f, y))) };
  });
  return { full_speed_after: full - start, full_speed: top, jumps };
}
