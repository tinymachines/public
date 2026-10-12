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
 * The jump, run, stomp, walkers, camera and platforms lessons are measured
 * here so far. Every lesson has its own way of being measured, and each
 * one is added with that check or not at all.
 */

import type { CameraMeasures, JumpMeasures, OneJump, PlatformsMeasures, RunMeasures, StompMeasures, Touch, WalkersMeasures } from "./lessons";

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
 * The console's write logs, by the file storyboard writes each to: what a
 * program wrote to the picture chip's memory (vram: `frame address count
 * step`), the scroll (`frame line x y`), the sound chip (apu: `frame
 * register value`) and the cartridge's own range (mapper: `frame address
 * value`). The measuring worker hands them back as that text when asked.
 */
export type LogKind = "vram" | "scroll" | "apu" | "mapper";
export const LOG_KINDS: LogKind[] = ["vram", "scroll", "apu", "mapper"];

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

export type Plan = JumpPlan | RunPlan | StompPlan | WalkersPlan | CameraPlan | PlatformsPlan;

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

/** What the stomp lesson's measurement reads, from its lesson.json. */
export interface StompPlan {
  kind: "stomp";
  script: string;
  frames: number;
  walk_from: number;
  memory: { x: string; y: string; speed_down: [string, string]; walker_x: string; walker_y: string; walker_state: string; hits: string; stomps: string };
}

/** Python's round(): a half goes to the even neighbour. The record was rounded that way. */
function roundEven(v: number): number {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/**
 * The stomp lesson's numbers (board-lessons.py's stomp_measures): the
 * walker's speed, then for the first stomp and the first hit where the
 * two were the frame before, the square's speed down before and after,
 * and the walker's state either side; and how long a stomped walker stays
 * flat. A run with no stomp or no hit in it is refused with the reason.
 * What our autopsy says of the routine is not measured here.
 */
export function stompMeasures(cell: (f: number, a: number) => number, plan: StompPlan): Omit<StompMeasures, "compare"> {
  const m = plan.memory, from = plan.walk_from, frames = plan.frames;
  const [vlo, vhi] = m.speed_down.map(addr), wx = addr(m.walker_x), st = (f: number) => cell(f, addr(m.walker_state));
  const px = (f: number) => cell(f, addr(m.x)), py = (f: number) => cell(f, addr(m.y));
  const pv = (f: number) => round2(signed(cell(f, vhi)) + cell(f, vlo) / 256);
  const ex = (f: number) => cell(f, wx) + cell(f, wx + 1) / 256, ey = (f: number) => cell(f, addr(m.walker_y));
  let steps = 0, walked = 0;
  for (let f = from; f < frames; f++) {
    if (st(f) === 0 && st(f - 1) === 0 && ex(f) < ex(f - 1)) {
      steps++;
      walked += ex(f - 1) - ex(f);
    }
  }
  if (!steps) throw new Error("the walker never walked");
  const first = (a: number, start: number) => {
    for (let f = start; f < frames; f++) if (cell(f, a) !== cell(f - 1, a)) return f;
    return -1;
  };
  const stomp = first(addr(m.stomps), from), hit = first(addr(m.hits), from);
  if (stomp < 0) throw new Error("the square never stomped the walker");
  if (hit < 0) throw new Error("the walker never hit the square");
  let back = -1;
  for (let f = stomp; f < frames && back < 0; f++) if (st(f) === 0) back = f;
  if (back < 0) throw new Error(`the walker stomped at frame ${stomp} was still flat when the run ended`);
  const touch = (f: number): Touch => ({ frame: f, dx: roundEven(ex(f - 1) - px(f - 1)), dy: ey(f - 1) - py(f - 1), fall: pv(f - 1), after: pv(f), state: [st(f - 1), st(f)] });
  return { walk: round2(walked / steps), stomp: { ...touch(stomp), flat: back - stomp }, hit: touch(hit) };
}

/** What the walkers lesson's measurement reads, from its lesson.json: each walker's x and its step (1 right, $FF left). */
export interface WalkersPlan {
  kind: "walkers";
  script: string;
  frames: number;
  memory: { x: string[]; step: string[] };
}

/** The value seen most often; on a tie the smallest, as the record's set-and-max came out. */
function mode(v: number[]): number | null {
  if (!v.length) return null;
  const count = new Map<number, number>();
  for (const d of v) count.set(d, (count.get(d) ?? 0) + 1);
  return [...count.keys()].sort((a, b) => a - b).reduce((best, d) => (count.get(d)! > count.get(best)! ? d : best));
}

const WALKERS_FROM = 10;

/**
 * The walkers lesson's numbers (board-lessons.py's walker_measures): a
 * turn is a frame a walker's direction differs from the frame before; two
 * turning on one frame within 24 pixels of each other met, and any other
 * turn was at a wall. Then the first walker's pace (pixels a move, frames
 * between moves, over stretches with no turn), at each wall whether the
 * frame before shows the walker a pixel further on than it settles, and
 * at each meeting how far the two overlap (16 less the distance between).
 * A run with no meeting or no turn at a wall is refused with the reason.
 */
export function walkersMeasures(cell: (f: number, a: number) => number, plan: WalkersPlan): WalkersMeasures {
  const xs = plan.memory.x.map(addr), steps = plan.memory.step.map(addr);
  const x = (i: number, f: number) => cell(f, xs[i]);
  const right = (i: number, f: number) => cell(f, steps[i]) === 1;
  const n = plan.frames;
  const at = new Map<number, number[]>();
  for (let i = 0; i < xs.length; i++) {
    for (let f = WALKERS_FROM + 1; f < n; f++) if (right(i, f) !== right(i, f - 1)) at.set(f, [...(at.get(f) ?? []), i]);
  }
  // Two that turn on one frame within 24 pixels of each other met; turns at
  // two walls on one frame are two turns at walls.
  const near = (f: number, ii: number[]) => ii.length === 2 && Math.abs(x(ii[0], f) - x(ii[1], f)) < 24;
  const meets: [number, number[]][] = [], walls: [number, number][] = [];
  for (const [f, ii] of at) {
    if (near(f, ii)) meets.push([f, [...ii].sort()]);
    else for (const i of ii) walls.push([f, i]);
  }
  if (!meets.length || !walls.length) throw new Error(`the run shows ${meets.length} meetings and ${walls.length} turns at walls; it needs both`);
  const inside = new Set<boolean>();
  for (const [f, i] of walls) inside.add(x(i, f - 1) - x(i, f) === (right(i, f - 1) ? 1 : -1));
  const overlap = [...new Set(meets.map(([f, [a, b]]) => 16 - Math.abs(x(a, f) - x(b, f))))].sort((a, b) => a - b);
  // Pace: moves of the first walker where neither it nor the frame before turned.
  const turned = new Set(at.keys());
  const moves: number[] = [];
  for (let f = WALKERS_FROM + 2; f < n; f++) if (!turned.has(f) && x(0, f) !== x(0, f - 1)) moves.push(f);
  const gaps: number[] = [];
  for (let k = 1; k < moves.length; k++) {
    const [a, b] = [moves[k - 1], moves[k]];
    if (![...turned].some((t) => a <= t && t <= b)) gaps.push(b - a);
  }
  return {
    pixels: mode(moves.map((f) => Math.abs(x(0, f) - x(0, f - 1)))),
    every: mode(gaps),
    wall_turns: walls.length,
    inside: [...inside].sort((a, b) => Number(a) - Number(b)),
    meetings: meets.length,
    overlap,
  };
}

/** What the camera lesson's measurement reads, from its lesson.json: the square's x in the level and the camera's, each low byte then high. */
export interface CameraPlan {
  kind: "camera";
  script: string;
  frames: number;
  walk_from: number;
  memory: { x: [string, string]; camera: [string, string] };
}

/**
 * The camera lesson's numbers (board-lessons.py's camera_measures): the
 * square's place on the screen is its x less the camera's. From walk_from:
 * where on the screen the square was when the camera first moved right;
 * the place it held the square at while it took every pixel the square
 * moved; how many frames it moved right by less than the square did; whether
 * it ever moved left, and the place it held the square at then; and, after
 * the square first turned back, where on the screen the square was when the
 * camera next moved right. A camera that never moves right is refused.
 */
export function cameraMeasures(cell: (f: number, a: number) => number, plan: CameraPlan): CameraMeasures {
  const [xl, xh] = plan.memory.x.map(addr), [cl, ch] = plan.memory.camera.map(addr);
  const px = (f: number) => cell(f, xh) * 256 + cell(f, xl), cam = (f: number) => cell(f, ch) * 256 + cell(f, cl);
  const sx = (f: number) => px(f) - cam(f), dp = (f: number) => px(f) - px(f - 1), dc = (f: number) => cam(f) - cam(f - 1);
  const frames: number[] = [];
  for (let f = plan.walk_from + 1; f < plan.frames; f++) frames.push(f);
  const right = frames.filter((f) => dc(f) > 0);
  if (!right.length) throw new Error("the camera never moved right");
  const first = right[0];
  const left = frames.filter((f) => dc(f) < 0);
  const turned = frames.find((f) => dp(f) < 0);
  const again = turned === undefined ? undefined : frames.find((f) => f > turned && dp(f) > 0);
  const restart = again === undefined ? undefined : right.find((f) => f > again);
  return {
    starts_at: sx(first - 1),
    holds_at: mode(right.filter((f) => dc(f) === dp(f)).map(sx)),
    eased: right.filter((f) => dc(f) < dp(f)).length,
    back: left.length > 0,
    back_at: left.length ? mode(left.filter((f) => dc(f) === dp(f)).map(sx)) : null,
    restarts_at: restart === undefined ? null : sx(restart - 1),
  };
}

/** What the platforms lesson's measurement reads, from its lesson.json: the square's x and y, the lift's x and top, and the cell that is 1 while the square stands on it. */
export interface PlatformsPlan {
  kind: "platforms";
  script: string;
  frames: number;
  walk_from: number;
  memory: { x: string; y: string; lift_x: string; lift_top: string; on: string };
}

/**
 * The platforms lesson's numbers (board-lessons.py's platforms_measures):
 * which way the lift moves (across, or up and down, whichever it moves
 * more), its step and the frames between steps, how far it travels; the
 * frames the square stood on it; of the frames the lift stepped while the
 * square stood on it with nothing pressed its way for sixty frames before,
 * how many moved the square by the lift's own step on that same frame; and
 * whether the square's height above the lift held steady. The pad is the
 * script's byte each frame, as the record's run kept it. A lift that never
 * moves, or a square that never stands on it, is refused with the reason.
 */
export function platformsMeasures(cell: (f: number, a: number) => number, plan: PlatformsPlan): PlatformsMeasures {
  const m = plan.memory;
  const px = (f: number) => cell(f, addr(m.x)), py = (f: number) => cell(f, addr(m.y));
  const lx = (f: number) => cell(f, addr(m.lift_x)), ly = (f: number) => cell(f, addr(m.lift_top));
  const on = (f: number) => cell(f, addr(m.on)) === 1;
  const frames: number[] = [];
  for (let f = plan.walk_from + 1; f < plan.frames; f++) frames.push(f);
  const dx = (f: number) => lx(f) - lx(f - 1), dy = (f: number) => ly(f) - ly(f - 1);
  const across = frames.filter((f) => dx(f)).length >= frames.filter((f) => dy(f)).length;
  const d = across ? dx : dy;
  const pd = across ? (f: number) => px(f) - px(f - 1) : (f: number) => py(f) - py(f - 1);
  const at = across ? lx : ly;
  const moves = frames.filter((f) => d(f));
  if (!moves.length) throw new Error("the lift never moved");
  // The pad along the lift's way (Right and Left across, Up and Down up and
  // down, in the script's order): a frame something was pressed that way is
  // not a frame the lift alone moved the square.
  const pad = padOf(parseScript(plan.script), plan.frames);
  const along = across ? 0xc0 : 0x30;
  const standing = frames.filter((f) => on(f) && on(f - 1));
  if (!standing.length) throw new Error("the square never stood on the lift");
  const quiet = (f: number) => {
    for (let g = Math.max(0, f - 60); g <= f; g++) if (pad[g] & along) return false;
    return true;
  };
  const stepped = standing.filter((f) => d(f) && quiet(f));
  const gaps = new Set(standing.map((f) => ly(f) - py(f)));
  const places = frames.map(at);
  return {
    axis: across ? "across" : "down",
    step: mode(moves.map((f) => Math.abs(d(f)))),
    every: mode(moves.slice(1).map((f, k) => f - moves[k])),
    travel: Math.max(...places) - Math.min(...places),
    standing: standing.length,
    stepped: stepped.length,
    same: stepped.filter((f) => pd(f) === d(f)).length,
    steady: gaps.size === 1,
  };
}
