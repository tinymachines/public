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
 * The jump and run lessons are measured here so far. Every lesson has its
 * own way of being measured, and each one is added with that check or not
 * at all.
 */

import type { JumpMeasures, OneJump, RunMeasures } from "./lessons";

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

/** What the run lesson's measurement reads, from its lesson.json. */
export interface RunPlan {
  kind: "run";
  script: string;
  frames: number;
  /** Each jump's press and release: the first from a walk, the second from a run. */
  presses: [number, number][];
  walk_from: number;
  memory: { air: string; y: string; speed_x: [string, string]; speed_down: [string, string] };
}

export type Plan = JumpPlan | RunPlan;

/** The pad byte held during each frame of a script. */
export function padOf(script: [number, number][], frames: number): Uint8Array {
  const pad = new Uint8Array(frames);
  let next = 0, now = 0;
  for (let f = 0; f < frames; f++) {
    while (next < script.length && script[next][0] <= f) now = script[next++][1];
    pad[f] = now;
  }
  return pad;
}

const SWEEPS = 40, SWEEP_FRAMES = 200, SWEEP_FROM = 20;

/**
 * The run lesson's forty short runs (board-lessons.py's run_measures):
 * run right from frame 20, press A after k more frames and hold it for
 * 20, so each jump leaves the ground a little faster than the last.
 */
export function sweeps(): { script: [number, number][]; frames: number; from: number }[] {
  return Array.from({ length: SWEEPS }, (_, k) => ({
    script: [[SWEEP_FROM, 0x82], [SWEEP_FROM + k, 0x83], [SWEEP_FROM + 20 + k, 0x82]] as [number, number][],
    frames: SWEEP_FRAMES,
    // Nothing is read after the first frame in the air at or past the press, so a run may stop there.
    from: SWEEP_FROM + k,
  }));
}

const signed = (v: number) => (v < 128 ? v : v - 256);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** One jump from a press (board-lessons.py's jump_of): its first speed, the pull with A held and after, and how far it rose. */
function jumpOf(cell: (f: number, a: number) => number, press: number, until: number, m: { air: number; y: number; vlo: number; vhi: number }, held: (f: number) => boolean): OneJump {
  const V = (f: number) => signed(cell(f, m.vhi)) * 256 + cell(f, m.vlo);
  const flight: number[] = [];
  for (let f = press; f < until; f++) {
    if (cell(f, m.air)) flight.push(f);
    else if (flight.length) break;
  }
  if (!flight.length) throw new Error(`the jump pressed at frame ${press} never left the ground`);
  const t0 = flight[0];
  const withA: number[] = [], without: number[] = [];
  for (let f = t0 + 1; f <= flight[flight.length - 1]; f++) {
    if (V(f) > V(f - 1)) (held(f) && V(f - 1) < 0 ? withA : without).push(V(f) - V(f - 1));
  }
  const pull = withA.length ? Math.min(...withA) : null;
  // The pull seen most often once A is up; a landing's jump back to rest is not one.
  let released: number | null = null;
  if (without.some((d) => d < 1024)) {
    const count = new Map<number, number>();
    for (const d of without) count.set(d, (count.get(d) ?? 0) + 1);
    released = [...count.keys()].sort((a, b) => a - b).reduce((best, d) => (count.get(d)! > count.get(best)! ? d : best));
  }
  return { first: round2(V(t0) / 256 - (pull ?? 0) / 256), held: pull, released, rose: cell(t0 - 1, m.y) - Math.min(...flight.map((f) => cell(f, m.y))) };
}

/**
 * The run lesson's numbers (board-lessons.py's run_measures): the top
 * speed walking and running, how long running takes to reach its top, the
 * jump from each, and from the forty short runs the fastest speed that
 * still gets the light jump and the slowest that gets the strong one.
 * `main` is the lesson's own script; `swept` is the forty runs in order,
 * each at least as far as its first frame in the air (a cell past a run's
 * end reads as not there, so a run that stopped short of that is refused).
 */
export function runMeasures(main: (f: number, a: number) => number, swept: ((f: number, a: number) => number)[], plan: RunPlan): RunMeasures {
  const m = { air: addr(plan.memory.air), y: addr(plan.memory.y), vlo: addr(plan.memory.speed_down[0]), vhi: addr(plan.memory.speed_down[1]) };
  const [lo, hi] = plan.memory.speed_x.map(addr);
  const sx = (f: number) => (main(f, hi) * 256 + main(f, lo)) / 256;
  const top = (from: number, to: number) => {
    let best = -Infinity, at = from;
    for (let f = from; f < to; f++) if (sx(f) > best) [best, at] = [sx(f), f];
    return [best, at];
  };
  const pad = padOf(parseScript(plan.script), plan.frames);
  let runFrom = -1;
  for (let f = 1; f < plan.frames && runFrom < 0; f++) if (pad[f] & 0x02 && !(pad[f - 1] & 0x02)) runFrom = f;
  if (runFrom < 0) throw new Error("the lesson's script never presses B");
  const [walkTop] = top(plan.walk_from, plan.walk_from + 100);
  const [runTop, runAt] = top(runFrom, runFrom + 120);
  const jumps = plan.presses.map(([p]) => jumpOf(main, p, p + 120, m, (f) => (pad[f] & 0x01) !== 0));
  const light: number[] = [], strong: number[] = [];
  swept.forEach((c, k) => {
    let t0 = -1;
    for (let f = SWEEP_FROM + k; f < SWEEP_FRAMES && t0 < 0; f++) if (c(f, m.air)) t0 = f;
    if (t0 < 0) throw new Error(`running for ${k} frames and pressing A, the square never left the ground`);
    // In sixteenths of a pixel a frame, as Mario keeps it.
    const speed = round2(((c(t0 - 1, hi) * 256 + c(t0 - 1, lo)) * 16) / 256);
    (c(t0, m.vhi) === 0xfb ? strong : light).push(speed);
  });
  // The record tells the two jumps apart by the strong one's first speed, 5 pixels a frame.
  if (!light.length) throw new Error("every jump started at 5 pixels a frame, the strong jump's speed, however slowly the square was moving, so there is no speed where the jump changes");
  if (!strong.length) throw new Error("no jump started at 5 pixels a frame, the strong jump's speed, however fast the square was running, so there is no speed where the jump changes");
  return { walk_top: walkTop, run_top: runTop, run_after: runAt - runFrom, walk_jump: jumps[0], run_jump: jumps[1], light_max: Math.max(...light), strong_min: Math.min(...strong) };
}
