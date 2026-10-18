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
 * The jump, run, stomp, walkers, camera, platforms, scroll, rooms, screens,
 * status, sound, pause and title lessons are measured here so far. Every
 * lesson has its own way of being measured, and each one is added with that
 * check or not at all. Scroll, rooms, status, sound, pause and title read
 * the write logs, and pause two pictures besides; screens takes the part of
 * its record that reads memory and the pad, not our autopsy's.
 */

import type { CameraMeasures, ItemsMeasures, JumpMeasures, OneJump, PauseMeasures, PlatformsMeasures, RoomsMeasures, RoomsUp, RunMeasures, ScreensMeasures, ScrollMeasures, SoundMeasures, StatusMeasures, StompMeasures, TitleMeasures, Touch, WalkersMeasures } from "./lessons";

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

export type Plan = JumpPlan | RunPlan | StompPlan | WalkersPlan | CameraPlan | PlatformsPlan | ScrollPlan | RoomsPlan | ScreensPlan | StatusPlan | SoundPlan | PausePlan | TitlePlan | ItemsPlan;

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

/** What the scroll lesson's measurement reads, from its lesson.json: the camera (low byte, high byte) and the strip countdown; and the vram write log. */
export interface ScrollPlan {
  kind: "scroll";
  script: string;
  frames: number;
  memory: { camera: [string, string]; countdown: string };
}

/** The vram log's lines (`frame address count step`) by frame: [address, count, step]. */
function vramWrites(text: string): Map<number, [number, number, number][]> {
  const by = new Map<number, [number, number, number][]>();
  for (const line of text.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length !== 4) continue;
    const f = Number(w[0]);
    by.set(f, [...(by.get(f) ?? []), [parseInt(w[1], 16), Number(w[2]), Number(w[3])]]);
  }
  return by;
}

/** The values seen, each as the record writes it, sorted as text: one value means every strip agreed. */
const seen = (v: (string | number)[]) => [...new Set(v.map(String))].sort();

/**
 * The scroll lesson's numbers (board-lessons.py's scroll_measures), from
 * memory (the camera and the strip countdown) and the picture-memory
 * writes: while the camera moved, each strip the countdown started, the
 * pixels between one and the next, how long a strip took, the columns and
 * colour choices written in it and on which of its frames, and how far
 * past the right edge its first column landed. A run whose camera never
 * moves, starts no strip while it does, or starts fewer than two is
 * refused with the reason.
 */
export function scrollMeasures(cell: (f: number, a: number) => number, vram: string, plan: ScrollPlan): ScrollMeasures {
  const [lo, hi] = plan.memory.camera.map(addr), cd = addr(plan.memory.countdown), frames = plan.frames;
  const cam = (f: number) => cell(f, hi) * 256 + cell(f, lo);
  const writes = vramWrites(vram);
  const moving: number[] = [];
  for (let f = 1; f < frames; f++) if (cam(f) !== cam(f - 1)) moving.push(f);
  if (!moving.length) throw new Error("the camera never moved");
  const first = moving[0], last = moving[moving.length - 1];
  // A strip started too near the end of the run to be seen through is left out.
  const starts: number[] = [];
  for (let f = first; f < Math.min(last, frames - 16); f++) if (cell(f, cd) && !cell(f - 1, cd)) starts.push(f);
  if (!starts.length) throw new Error("no strip was started while the camera moved");
  if (starts.length < 2) throw new Error("only one strip was started while the camera moved, so there is no distance between strips");
  const gaps = starts.slice(1).map((b, k) => cam(b) - cam(starts[k]));
  type Strip = { frames: number; last_write: number; columns: number; tiles: number[]; colours: number; ahead: number; column_frames: number[] };
  const strips: Strip[] = [];
  for (const f0 of starts) {
    let f1 = -1;
    for (let g = f0; g < f0 + 30 && f1 < 0; g++) if (cell(g, cd) === 0) f1 = g;
    if (f1 < 0) throw new Error(`the strip started at frame ${f0} had not ended 30 frames later`);
    // A frame past the countdown's end: a game that prepares in its main loop writes in the next blank.
    const cols: [number, [number, number, number]][] = [], attr: number[] = [];
    for (let g = f0; g < f1 + 2; g++) {
      for (const w of writes.get(g) ?? []) {
        if (w[2] === 32) cols.push([g, w]);
        if ((w[0] & 0x3ff) >= 0x3c0 && w[1] === 1) attr.push(g);
      }
    }
    if (!cols.length) continue;
    const [g, [a]] = cols[0];
    // Where the first column lands, counted from the right edge of the picture: the name tables are 512 pixels round.
    const x = (a & 0x400 ? 0x100 : 0) + (a & 0x1f) * 8;
    const ahead = ((((x - (cam(g) % 512)) % 512) + 512) % 512) - 256;
    strips.push({
      frames: f1 - f0 + 1,
      last_write: Math.max(...cols.map(([h]) => h), ...attr) - f0,
      columns: cols.length,
      tiles: [...new Set(cols.map(([, w]) => w[1]))].sort((p, q) => p - q),
      colours: attr.length,
      ahead,
      column_frames: [...new Set(cols.map(([h]) => h - f0))].sort((p, q) => p - q),
    });
  }
  if (!strips.length) throw new Error("no strip wrote a column to the picture chip");
  // A list is written the way the record writes it: Python's str of a list.
  const listed = (v: number[]) => `[${v.join(", ")}]`;
  return {
    strips: strips.length,
    every_min: Math.min(...gaps),
    every_max: Math.max(...gaps),
    every_mean: roundEven((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 10) / 10,
    frames: seen(strips.map((s) => s.frames)),
    columns: seen(strips.map((s) => s.columns)),
    tiles: [...new Set(strips.flatMap((s) => s.tiles))].sort((p, q) => p - q),
    colours: seen(strips.map((s) => s.colours)),
    ahead_min: Math.min(...strips.map((s) => s.ahead)),
    ahead_max: Math.max(...strips.map((s) => s.ahead)),
    column_frames: seen(strips.map((s) => listed(s.column_frames))),
    last_write: seen(strips.map((s) => s.last_write)),
  };
}

/** What the rooms lesson's measurement reads, from its lesson.json: the room's number and the slide's scroll (low byte first), the board's mirroring, and the vram and scroll logs. */
export interface RoomsPlan {
  kind: "rooms";
  script: string;
  frames: number;
  /** The first walk out sideways is after this frame; the first step up after `up_from`. */
  walk_from: number;
  up_from: number;
  mirroring: string;
  memory: { room: string; scroll: [string, string] };
}

/** Python's % : never negative. */
const pmod = (a: number, m: number) => ((a % m) + m) % m;

/** The first frame after `after` (and after frame 0) the room's number differs from the frame before, or a refusal. */
function roomChange(cell: (f: number, a: number) => number, room: number, frames: number, after: number): number {
  for (let f = Math.max(after, 1); f < frames; f++) if (cell(f, room) !== cell(f - 1, room)) return f;
  throw new Error(`the room's number never changed after frame ${after}`);
}

/** The first step up (board-lessons.py's rooms_up): the room's number, and the rows written across after it changed. */
function roomsUp(cell: (f: number, a: number) => number, writes: Map<number, [number, number, number][]>, room: number, frames: number, after: number): RoomsUp {
  const t = roomChange(cell, room, frames, after);
  const rows: [number, number, number][] = [];
  for (let f = t; f < Math.min(t + 120, frames); f++) for (const [a, n, st] of writes.get(f) ?? []) if (st === 1 && n >= 24 && (a & 0x3ff) < 0x3c0) rows.push([f, a, n]);
  const fs = rows.map((r) => r[0]), addrs = rows.map((r) => r[1]);
  return {
    before: cell(t - 1, room),
    after: cell(t, room),
    rows: rows.length,
    tiles: [...new Set(rows.map((r) => r[2]))].sort((p, q) => p - q),
    first: rows.length ? fs[0] - t : null,
    every: [...new Set(fs.slice(1).map((f, k) => f - fs[k]))].sort((p, q) => p - q),
    upward: addrs.slice(1).every((a, k) => a < addrs[k]),
    from_row: rows.length ? (addrs[0] & 0x3ff) >> 5 : null,
    to_row: rows.length ? (addrs[addrs.length - 1] & 0x3ff) >> 5 : null,
  };
}

/**
 * The rooms lesson's numbers (board-lessons.py's rooms_measures and
 * rooms_up): the first walk out of a room sideways after walk_from, what
 * the room's number did, how long until the picture moved, the slide as
 * the picture chip was told it (the last scroll written each frame, a
 * split's under the blank's), its travel and usual step, the runs of eight
 * or more tiles written before and during it, and the new room's columns;
 * then the first step up after up_from, the rows written across. The
 * board's mirroring is the plan's, as the record takes it: our boards are
 * soldered. A room that never changes, or a picture that never moves after
 * it does, is refused with the reason.
 */
export function roomsMeasures(cell: (f: number, a: number) => number, vram: string, scrollLog: string, plan: RoomsPlan): RoomsMeasures {
  const room = addr(plan.memory.room), scroll = addr(plan.memory.scroll[0]), frames = plan.frames;
  const writes = vramWrites(vram);
  const change = roomChange(cell, room, frames, plan.walk_from);
  const end = Math.min(change + 200, frames);
  // The slide as the picture chip was told it: the last scroll pair each frame, one written while the picture
  // was drawing (a split) over one written in the blank. Without any, memory's own reads, which can run early.
  const told = new Map<number, number>(), split = new Map<number, number>();
  for (const line of scrollLog.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length !== 4) continue;
    const [f, at, x] = w.map(Number);
    (at < 240 ? split : told).set(f, x);
  }
  for (const [f, x] of split) told.set(f, x);
  let first: number, last: number, moves: number[];
  if (told.size) {
    const xs = new Map<number, number>();
    let lastX = 0;
    for (let f = change - 5; f < end; f++) {
      lastX = told.get(f) ?? lastX;
      xs.set(f, lastX);
    }
    const moved: number[] = [];
    for (let f = change; f < Math.min(change + 199, frames); f++) if (xs.get(f) !== xs.get(f - 1)) moved.push(f);
    if (!moved.length) throw new Error(`the picture chip was never told to scroll after the room changed at frame ${change}`);
    [first, last] = [moved[0], moved[moved.length - 1]];
    moves = [];
    for (let f = first; f <= last; f++) moves.push(Math.min(pmod(xs.get(f)! - xs.get(f - 1)!, 256), pmod(xs.get(f - 1)! - xs.get(f)!, 256)));
  } else {
    const moved = new Set<number>();
    for (let f = change; f < end; f++) if (cell(f, scroll) !== cell(f - 1, scroll)) moved.add(f);
    if (!moved.size) throw new Error(`the picture never moved after the room changed at frame ${change}`);
    first = Math.min(...moved);
    last = first;
    // One frame without a move inside the slide is not its end (memory can be read before a frame's work is done); two are.
    while (moved.has(last + 1) || moved.has(last + 2)) last += moved.has(last + 1) ? 1 : 2;
    moves = [];
    for (let f = first; f <= last; f++) moves.push(Math.min(pmod(cell(f, scroll) - cell(f - 1, scroll), 256), pmod(cell(f - 1, scroll) - cell(f, scroll), 256)));
  }
  const stepped = moves.filter((m) => m);
  if (!stepped.length) throw new Error(`the picture never moved after the room changed at frame ${change}`);
  const runs = (a: number, b: number) => {
    const out: Record<string, number> = {};
    for (let f = a; f < b; f++) for (const [, n, st] of writes.get(f) ?? []) if (n >= 8) out[`${n} ${st === 32 ? "down" : "across"}`] = (out[`${n} ${st === 32 ? "down" : "across"}`] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)));
  };
  const during: number[] = [];
  for (let f = first; f < last + 2; f++) if ((writes.get(f) ?? []).some(([, n, st]) => n >= 8 && st === 32)) during.push(f);
  return {
    mirroring: { playing: plan.mirroring, fixed: true },
    before: cell(change - 1, room),
    after: cell(change, room),
    wait: first - change,
    slide: stepped.length,
    travel: moves.reduce((s, m) => s + m, 0),
    step: mode(stepped)!,
    written_before: runs(change, first),
    written_during: runs(first, last + 2),
    column_every: [...new Set(during.slice(1).map((f, k) => f - during[k]))].sort((p, q) => p - q),
    columns_from: during.length ? during[0] - first : null,
    columns: during.length,
    up: roomsUp(cell, writes, room, frames, plan.up_from),
  };
}

/** What the screens lesson's measurement reads, from its lesson.json: the byte that chooses the screen. The pad is the script's. */
export interface ScreensPlan {
  kind: "screens";
  script: string;
  frames: number;
  memory: { screen: string };
}

/** The part of the screens record the page measures: not what our autopsy says of the program. */
export type ScreensYours = Omit<ScreensMeasures, "stretches" | "met" | "engine" | "table">;

/**
 * The screens lesson's numbers that come from memory and the pad
 * (board-lessons.py's screens_measures, less the autopsy's part): the
 * values the screen's byte took and how many times it changed, and, from a
 * press of Start in play to the next, how many cells of memory changed a
 * frame before and during (the medians) and how long the pause lasted. The
 * stretches, the jump engine and the table come from our autopsy of the
 * program, which the page does not run. A byte that never changes is
 * refused with the reason.
 */
export function screensMeasures(cell: (f: number, a: number) => number, plan: ScreensPlan): ScreensYours {
  const screen = addr(plan.memory.screen), frames = plan.frames;
  const changes: number[] = [];
  for (let f = 1; f < frames; f++) if (cell(f, screen) !== cell(f - 1, screen)) changes.push(f);
  if (!changes.length) throw new Error("the screen's byte never changed");
  const values = [cell(0, screen), ...changes.map((f) => cell(f, screen))];
  // Cells changing in a frame, the stack and the sprite page left out.
  const moving = (f: number) => {
    let n = 0;
    for (let a = 0; a < 0x800; a++) if (!(a >= 0x100 && a < 0x300) && cell(f, a) !== cell(f - 1, a)) n++;
    return n;
  };
  const median = (v: number[]) => [...v].sort((p, q) => p - q)[v.length >> 1];
  // Paused: a press of Start in play, and the next press.
  const pad = padOf(parseScript(plan.script), frames);
  const presses: number[] = [];
  for (let f = 1; f < frames; f++) if (pad[f] & 0x08 && !(pad[f - 1] & 0x08)) presses.push(f);
  const play = values.length > 1 ? presses.filter((f) => cell(f - 1, screen) === values[1]) : [];
  const later = play.length ? presses.filter((f) => f > play[0]) : [];
  let pause: ScreensYours["pause"] = null;
  if (play.length && later.length) {
    const [p0, p1] = [play[0], later[0]];
    const mid: number[] = [], pre: number[] = [];
    for (let f = p0 + 5; f < p1 - 1; f++) mid.push(moving(f));
    for (let f = p0 - 20; f < p0; f++) pre.push(moving(f));
    pause = { before: median(pre), during: median(mid), frames: p1 - p0 };
  }
  return { values, changes: changes.length, pause };
}

/** What the status lesson's measurement reads, from its lesson.json: the frames measured from walk_from; and the scroll and vram logs. */
export interface StatusPlan {
  kind: "status";
  script: string;
  frames: number;
  walk_from: number;
}

/** The most counted key, the first seen on a tie, as Python's Counter.most_common gives it. */
function commonest<K>(count: Map<K, number>): [K, number] | null {
  let best: [K, number] | null = null;
  for (const [k, n] of count) if (!best || n > best[1]) best = [k, n];
  return best;
}

/**
 * The status lesson's numbers (board-lessons.py's status_measures), from
 * the logs alone between walk_from and the end: the picture line the
 * scroll is most often set at while the picture draws (the split) and on
 * how many frames, the scroll most often set in the blank (the bar's), and
 * in the bar's rows (the top four of name table 0) the write made most
 * often (the timer: where, how many tiles, how often) and every other
 * write there. A picture never split, a blank that never sets the scroll,
 * or a bar never written is refused with the reason.
 */
export function statusMeasures(vram: string, scrollLog: string, plan: StatusPlan): StatusMeasures {
  const start = plan.walk_from, end = plan.frames;
  const split = new Map<number, number>(), blank = new Map<string, number>();
  for (const line of scrollLog.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length !== 4) continue;
    const [f, at, x, y] = w.map(Number);
    if (f < start || f >= end) continue;
    if (at < 240) split.set(at, (split.get(at) ?? 0) + 1);
    else blank.set(`${x} ${y}`, (blank.get(`${x} ${y}`) ?? 0) + 1);
  }
  const bar = new Map<string, number>(), times = new Map<string, number[]>();
  for (const [f, ws] of vramWrites(vram)) {
    if (f < start || f >= end) continue;
    for (const [a, n] of ws) {
      if (a < 0x2000 || a >= 0x2080) continue;
      const k = `${a} ${n}`;
      bar.set(k, (bar.get(k) ?? 0) + 1);
      times.set(k, [...(times.get(k) ?? []), f]);
    }
  }
  const atLine = commonest(split), inBlank = commonest(blank), written = commonest(bar);
  if (!atLine) throw new Error("the picture was never split: the scroll was never set while it was drawing");
  if (!inBlank) throw new Error("the scroll was never set in the blank");
  if (!written) throw new Error("nothing was written into the bar's rows");
  const [a, n] = written[0].split(" ").map(Number), fs = times.get(written[0])!;
  return {
    split_line: atLine[0],
    split_frames: atLine[1],
    frames: end - start,
    bar_scroll: inBlank[0].split(" ").map(Number),
    timer: { row: (a & 0x3ff) >> 5, column: a & 31, tiles: n, writes: written[1], every: [...new Set(fs.slice(1).map((f, k) => f - fs[k]))].sort((p, q) => p - q) },
    other_bar_writes: [...bar.values()].reduce((s, v) => s + v, 0) - written[1],
  };
}

/** What the sound lesson's measurement reads, from its lesson.json: the first press of A after walk_from, and the sound chip's log. */
export interface SoundPlan {
  kind: "sound";
  script: string;
  frames: number;
  walk_from: number;
}

/**
 * The sound lesson's numbers (board-lessons.py's sound_measures), from the
 * log of every write to the sound chip and the pad, never the values: the
 * writes to the square channels in the second before the first press of A
 * (the music), the settings with the pitch sweep on in the second after it
 * (the jump sound), when the first comes and on which frames of the sound
 * they land, and when the music writes to the channel again. A sound that
 * never sets the sweep has those last three left out, as the record leaves
 * them. A script that never presses A is refused.
 */
export function soundMeasures(apu: string, plan: SoundPlan): SoundMeasures {
  const pad = padOf(parseScript(plan.script), plan.frames);
  let press = -1;
  for (let f = Math.max(plan.walk_from, 1); f < plan.frames && press < 0; f++) if (pad[f] & 1 && !(pad[f - 1] & 1)) press = f;
  if (press < 0) throw new Error("the lesson's script never presses A");
  const writes: [number, string, number][] = [];
  for (const line of apu.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length === 3) writes.push([Number(w[0]), w[1], Number(w[2])]);
  }
  const before = writes.filter(([f, r]) => press - 60 <= f && f < press && ["00", "01", "02", "03"].includes(r)).length;
  const sweepOn = writes.filter(([f, r, v]) => press <= f && f < press + 60 && r === "01" && v & 0x80).map(([f]) => f);
  if (!sweepOn.length) return { music_before: before, sweep_settings: 0 };
  const last = sweepOn[sweepOn.length - 1];
  const back = writes.find(([f, r, v]) => f > last && f < press + 120 && r === "01" && !(v & 0x80));
  return {
    music_before: before,
    starts: sweepOn[0] - press,
    sweep_settings: sweepOn.length,
    sweep_frames: [...new Set(sweepOn.map((f) => f - sweepOn[0]))].sort((p, q) => p - q),
    music_back: back ? back[0] - sweepOn[0] : null,
  };
}

/**
 * What the pause lesson's measurement reads, from its lesson.json: the
 * square's x and the game's own count of frames Start is still ignored,
 * the two frames whose pictures are compared, and (fixed per cartridge by
 * board-lessons.py) the register the chime's period-high goes to and the
 * music's registers.
 */
export interface PausePlan {
  kind: "pause";
  script: string;
  frames: number;
  walk_from: number;
  memory: { x: string; wait: string };
  grabs: [number, number];
  chime: string;
  music: string[];
}

/**
 * The pause lesson's numbers (board-lessons.py's pause_measures), from a
 * run that holds Right and presses Start (pause), Start again too soon, A,
 * then Start (unpause). Which presses stopped or started the world is read
 * off the square's x: a press that changes whether it is moving three
 * frames on took; exactly one pause and one unpause are required. Then how
 * long the other presses came after the pause, whether A was pressed in
 * it, the frames from each press to the square holding or moving, whether
 * it held throughout, the game's own wait, the writes to the picture chip's
 * memory while paused, whether the two pictures taken while paused are the
 * same byte for byte, and from the sound chip's log whether everything was
 * cut on the press, the chime's notes and spacing in the wait, and the
 * frames from the unpause to the music's first write. A picture the run
 * did not take is refused rather than compared empty.
 */
export function pauseMeasures(cell: (f: number, a: number) => number, vram: string, apu: string, pictures: [Uint8Array | undefined, Uint8Array | undefined], plan: PausePlan): PauseMeasures {
  const x = addr(plan.memory.x), wait = addr(plan.memory.wait), n = plan.frames;
  const pad = padOf(parseScript(plan.script), n);
  const moving = (f: number) => cell(f, x) !== cell(f - 1, x);
  const pressed = (bit: number) => (f: number) => (pad[f] & bit) !== 0 && (pad[f - 1] & bit) === 0;
  const first = (from: number, to: number, ok: (f: number) => boolean) => {
    for (let f = from; f < to; f++) if (ok(f)) return f;
    return undefined;
  };
  const starts: number[] = [];
  for (let f = Math.max(plan.walk_from, 1); f < n; f++) if (pressed(0x08)(f)) starts.push(f);
  const took = starts.filter((f) => moving(f - 1) !== moving(f + 3));
  if (took.length !== 2) throw new Error(`${took.length} of ${starts.length} presses of Start changed whether the square moved; one pause and one unpause are needed`);
  const [on, off] = took;
  const stopped = first(on, off, (f) => !moving(f));
  if (stopped === undefined) throw new Error("the square never held still between the two presses");
  const started = first(off, n, moving);
  if (started === undefined) throw new Error("the square never moved again after the unpause");
  const stops = stopped - on, restarts = started - off;
  const zero = first(on, off, (f) => cell(f, wait) === 0);
  if (zero === undefined) throw new Error("the count of frames Start is ignored never reached zero before the unpause");
  const count = zero - on;
  const [p, q] = pictures;
  if (!p?.length) throw new Error(`no picture was taken at frame ${plan.grabs[0]}`);
  if (!q?.length) throw new Error(`no picture was taken at frame ${plan.grabs[1]}`);
  let drawn = 0;
  for (const line of vram.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length === 4 && on + 1 <= Number(w[0]) && Number(w[0]) <= off) drawn++;
  }
  const writes: [number, string, number][] = [];
  for (const line of apu.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length === 3) writes.push([Number(w[0]), w[1], Number(w[2])]);
  }
  const notes = [...new Set(writes.filter(([f, r]) => r === plan.chime && on <= f && f < on + count).map(([f]) => f))].sort((a, b) => a - b);
  const back = writes.find(([f, r]) => f > off && plan.music.includes(r));
  return {
    ignored_after: starts.filter((f) => !took.includes(f) && on < f && f < off).map((f) => f - on),
    a_pressed: first(on + 1, off, pressed(0x01)) !== undefined,
    stops,
    starts: restarts,
    held: first(on + stops, off + restarts, moving) === undefined,
    wait: count,
    drawn,
    same_picture: p.length === q.length && p.every((v, i) => v === q[i]),
    cut: writes.some(([f, r, v]) => (f === on || f === on + 1) && r === "15" && v === 0),
    chime_notes: notes.length,
    chime_every: [...new Set(notes.slice(1).map((b, i) => b - notes[i]))].sort((a, b) => a - b),
    music_back: back ? back[0] - off : null,
  };
}

/** What the title lesson's measurement reads, from its lesson.json: the square's x, and the frame the reading starts from. */
export interface TitlePlan {
  kind: "title";
  script: string;
  frames: number;
  after: number;
  memory: { x: string };
}

/**
 * The title lesson's numbers (board-lessons.py's title_measures), from the
 * picture-memory writes, the scroll, the square's x and the pad. A run need
 * not hold every part, and a part it does not hold is left out, as the
 * record leaves it. The title's drawing: from the first write after a
 * clear of whole name tables to the last (gaps of up to four frames), the
 * tables cleared and the tiles written besides. The cursor: what a Select
 * writes in the four frames from it. The countdown: frames from a Select
 * to the demo, the first frame the square moves with nothing held, three
 * moves in sixteen frames at least. The demo: frames from its first move
 * to the title drawn again, with nothing pressed, and whether the scroll
 * moved meanwhile. And the frames from Start to the next write, during the
 * demo and on the title. A run of writes the log split where a frame
 * began is one run, counted at the frame it began. A run whose name tables
 * are never cleared whole has no title, and is refused.
 */
export function titleMeasures(cell: (f: number, a: number) => number, vram: string, scrollLog: string, plan: TitlePlan): TitleMeasures {
  const x = addr(plan.memory.x), n = plan.frames, after = plan.after;
  const pad = padOf(parseScript(plan.script), n);
  /** Each frame's runs of writes to the name tables, as [count, step]. */
  const nt = new Map<number, [number, number][]>();
  let last: { began: number; at: number; count: number; step: number; f: number } | null = null;
  for (const line of vram.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length !== 4) continue;
    const f = Number(w[0]), a = parseInt(w[1], 16), c = Number(w[2]), step = Number(w[3]);
    if (!(0x2000 <= a && a < 0x3000)) continue;
    if (last && step === 1 && last.step === 1 && a === last.at + last.count && f - last.f <= 1) {
      const runs = nt.get(last.began)!;
      runs[runs.length - 1] = [runs[runs.length - 1][0] + c, 1];
      last = { began: last.began, at: last.at, count: last.count + c, step: 1, f };
      continue;
    }
    if (!nt.has(f)) nt.set(f, []);
    nt.get(f)!.push([c, step]);
    last = { began: f, at: a, count: c, step, f };
  }
  const frames = [...nt.keys()];
  const press = (bit: number) => {
    const out: number[] = [];
    for (let f = Math.max(after, 1); f < n; f++) if (pad[f] & bit && !(pad[f - 1] & bit)) out.push(f);
    return out;
  };
  const selects = press(0x04), starts = press(0x08);
  const firstAfter = (from: number, strict: boolean) => {
    const later = frames.filter((g) => (strict ? g > from : g >= from));
    return later.length ? Math.min(...later) : undefined;
  };
  /** The run of frames with writes from `first`, gaps of up to 4. */
  const drawing = (first: number): [number, number] | undefined => {
    const f = firstAfter(first, false);
    if (f === undefined) return undefined;
    let end = f;
    for (;;) {
      let next: number | undefined;
      for (let g = end + 1; g < end + 5; g++) if (nt.has(g)) { next = g; break; }
      if (next === undefined) break;
      end = next;
    }
    return [f, end];
  };
  // The first move of at least three in 16 frames, with nothing held: being placed once is not a demo.
  const moved = (g: number) => cell(g, x) !== cell(g - 1, x) && !(pad[g] & 0xc3);
  const demoFrom = (f0: number) => {
    for (let f = f0 + 1; f < n - 16; f++) {
      if (!moved(f)) continue;
      let k = 0;
      for (let g = f; g < f + 16; g++) if (moved(g)) k++;
      if (k >= 3) return f;
    }
    return undefined;
  };
  const out = {} as TitleMeasures;
  // Each drawing of the title starts by clearing whole name tables.
  const clears = frames.filter((f) => f >= after && nt.get(f)!.some(([c]) => c >= 1024)).sort((a, b) => a - b);
  const titles: [number, number][] = [];
  for (const c of clears) if (!titles.length || c > titles[titles.length - 1][1]) titles.push(drawing(c)!);
  if (!titles.length) throw new Error("no title was drawn: the name tables were never cleared whole");
  const [first, end] = titles[0];
  const writes: [number, number][] = [];
  for (let f = first; f <= end; f++) writes.push(...(nt.get(f) ?? []));
  out.title = {
    frames: end - first + 1,
    cleared: Math.floor(writes.filter(([c]) => c >= 1024).reduce((s, [c]) => s + c, 0) / 1024),
    tiles: writes.filter(([c]) => c < 1024).reduce((s, [c]) => s + c, 0),
  };
  const nextTitle = (f: number) => {
    const later = titles.map(([t0]) => t0).filter((t0) => t0 > f);
    return later.length ? Math.min(...later) : n;
  };
  const pressed = (lo: number, hi: number) => [...selects, ...starts].some((q) => lo < q && q <= hi);
  const scrolls: [number, number][] = [];
  for (const line of scrollLog.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length === 4) scrolls.push([Number(w[0]), Number(w[2])]);
  }
  // A demo that ran to its end by itself: from its first move to the next drawing.
  for (const [, t1] of titles) {
    const d = demoFrom(t1), next = nextTitle(t1);
    if (d !== undefined && d < next && next < n && !pressed(d, next) && out.demo === undefined) {
      const across = scrolls.filter(([f]) => d <= f && f < next).map(([, sx]) => sx);
      out.demo = { frames: next - d, scrolled: Math.max(0, ...across) > 0 };
    }
  }
  for (const p of selects) {
    const d = demoFrom(p);
    const w: [number, number][] = [];
    for (let f = p; f < p + 4; f++) w.push(...(nt.get(f) ?? []));
    if (w.length && out.cursor === undefined) out.cursor = { tiles: w.reduce((s, [c]) => s + c, 0), step: Math.max(...w.map(([, s]) => s)) };
    // A Select with nothing pressed after it before the demo: the countdown.
    if (d !== undefined && d < nextTitle(p) && !pressed(p, d) && out.countdown === undefined) out.countdown = d - p;
  }
  // Each demo, from its first move to the next drawing of the title.
  const demos: [number, number][] = [];
  for (const [, t1] of titles) {
    const d = demoFrom(t1);
    if (d !== undefined && d < nextTitle(t1)) demos.push([d, nextTitle(t1)]);
  }
  for (const p of starts) {
    const nxt = firstAfter(p, true);
    if (nxt === undefined) continue;
    const key = demos.some(([d, e]) => d <= p && p < e) ? "start_demo" : "start_title";
    if (out[key] === undefined) out[key] = nxt - p;
  }
  return out;
}

/** What the items lesson's measurement reads, from its lesson.json: the presses of Start after walk_from. */
export interface ItemsPlan {
  kind: "items";
  script: string;
  frames: number;
  walk_from: number;
}

/**
 * The items lesson's numbers (board-lessons.py's items_measures), from a
 * run that presses Start (open), Start again while it slides, and Start
 * (close). From the scroll log, the frame's last setting (the one the
 * picture is drawn with): how many pixels a frame and how far it slides,
 * frames from each Start to the slide's end, whether the Start in between
 * changed the step, and whether the scroll was set while the picture drew
 * (a split). From the writes to the picture: the whole rows written into
 * the lower name table ($2800 to $2BBF) while it opened and while it
 * closed, whether they went from the bottom up, and how many frames apart.
 * Our board is soldered NROM, so its mirroring is fixed. A run without
 * three presses of Start, or a slide that never stops or never comes
 * back, is refused with the reason.
 */
export function itemsMeasures(vram: string, scrollLog: string, plan: ItemsPlan): ItemsMeasures {
  const n = plan.frames;
  const pad = padOf(parseScript(plan.script), n);
  const starts: number[] = [];
  for (let f = Math.max(plan.walk_from, 1); f < n; f++) if (pad[f] & 0x08 && !(pad[f - 1] & 0x08)) starts.push(f);
  if (starts.length !== 3) throw new Error(`${starts.length} presses of Start; the run opens the item screen, presses Start while it slides, and closes it, three in all`);
  const [opened, between, closed] = starts;
  const y = new Map<number, number>();
  let split = false;
  for (const line of scrollLog.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w.length !== 4) continue;
    const [f, at, , v] = w.map(Number);
    y.set(f, v);
    if (opened <= f && at < 240) split = true;
  }
  const set = [...y.keys()].sort((a, b) => a - b);
  /** The scroll the picture was drawn with on frame f: the last set on or before it. */
  const at = (f: number) => {
    let v = 0;
    for (const g of set) {
      if (g > f) break;
      v = y.get(g)!;
    }
    return v;
  };
  const held = at(closed - 1);
  let openEnd: number | undefined;
  for (let f = opened; f < closed; f++) if (at(f) === held) { openEnd = f; break; }
  if (openEnd === undefined) throw new Error("the picture never stopped sliding before the Start that closes it");
  let back: number | undefined;
  for (let f = closed; f < n; f++) if (at(f) === 0) { back = f; break; }
  if (back === undefined) throw new Error("the picture never slid back after the Start that closes it");
  const steps: number[] = [], closeSteps: number[] = [];
  for (let f = opened + 1; f <= openEnd; f++) if (at(f) !== at(f - 1) && at(f - 1) !== 0) steps.push(Math.abs(at(f) - at(f - 1)));
  for (let f = closed + 1; f < back; f++) if (at(f) !== at(f - 1)) closeSteps.push(Math.abs(at(f) - at(f - 1)));
  const step = mode(steps), closeStep = mode(closeSteps);
  if (step === null) throw new Error("the picture never slid after the Start that opens it");
  if (closeStep === null) throw new Error("the picture went back at once rather than sliding after the Start that closes it");
  const opening: [number, number][] = [];
  let closing = 0;
  for (const [f, ws] of vramWrites(vram)) {
    for (const [a, c, s] of ws) {
      if (!(0x2800 <= a && a < 0x2bc0 && c === 32 && s === 1 && a % 32 === 0)) continue;
      if (opened <= f && f <= openEnd) opening.push([f, a]);
      else if (closed <= f && f <= back) closing++;
    }
  }
  const gaps = opening.slice(1).map(([g], k) => g - opening[k][0]);
  let ignored = between < openEnd;
  for (let f = between; f <= openEnd && ignored; f++) if (![0, step].includes(at(f - 1) - at(f))) ignored = false;
  return {
    step,
    travel: 240 - held,
    open_frames: openEnd - opened,
    close_frames: back - closed,
    close_step: closeStep,
    // The Start pressed mid-slide: the slide went on up the same way.
    ignored,
    split,
    rows: opening.length,
    bottom_up: opening.slice(1).every(([, b], k) => b < opening[k][1]),
    every: mode(gaps),
    rows_closing: closing,
    mirroring: { fixed: true, changes: 0 },
  };
}
