import { describe, expect, test } from "bun:test";
import { aboutMeasures, cameraMeasures, cells, coinsMeasures, flickerMeasures, itemsMeasures, livesMeasures, jumpMeasures, menuMeasures, splashMeasures, padOf, parseScript, pauseMeasures, platformsMeasures, roomsMeasures, runMeasures, screensMeasures, scrollMeasures, solidMeasures, soundMeasures, statusMeasures, stompMeasures, sweeps, titleMeasures, walkersMeasures, type AboutPlan, type CameraPlan, type CoinsPlan, type FlickerPlan, type ItemsPlan, type LivesPlan, type JumpPlan, type MenuPlan, type SplashPlan, type PausePlan, type PlatformsPlan, type RoomsPlan, type RunPlan, type ScreensPlan, type ScrollPlan, type SolidPlan, type SoundPlan, type StatusPlan, type StompPlan, type TitlePlan, type WalkersPlan } from "./lessonMeasure";

const PLAN: JumpPlan = {
  kind: "jump", script: "", frames: 600, presses: [[200, 204], [300, 320]], walk_from: 60,
  memory: { air: "$03", y: "$15", speed_x: ["$12", "$13"] }, ground: 176,
};

/** A made-up run: speed climbs 10/256 a frame to 1.5; each jump is in the air for `air` frames and rises `up`. */
function run(jumps: { press: number; air: number; up: number }[]): Uint8Array {
  const ram = new Uint8Array(600 * 2048);
  for (let f = 0; f < 600; f++) {
    const s = Math.min(384, Math.max(0, f - 60) * 10);
    ram[f * 2048 + 0x12] = s & 0xff;
    ram[f * 2048 + 0x13] = s >> 8;
    ram[f * 2048 + 0x15] = 176;
    for (const j of jumps) {
      if (f > j.press && f <= j.press + j.air) {
        ram[f * 2048 + 0x03] = 1;
        ram[f * 2048 + 0x15] = 176 - Math.round(j.up * Math.sin((Math.PI * (f - j.press)) / (j.air + 1)));
      }
    }
  }
  return ram;
}

describe("lessonMeasure", () => {
  test("a script is read in frame order, and a line that is not one is ignored", () => {
    expect(parseScript("# frames 600\nAT 200 81\nAT 60 80\n\nAT 560 00\n")).toEqual([[60, 0x80], [200, 0x81], [560, 0]]);
    expect(() => parseScript("AT x 80")).toThrow("not AT <frame> <hex byte>");
  });

  test("full speed is the first frame at the top speed, and each jump is counted from its own press", () => {
    const m = jumpMeasures(cells(run([{ press: 200, air: 27, up: 34 }, { press: 300, air: 45, up: 63 }])), PLAN);
    // 384/256 = 1.5 is first reached 39 frames after walking starts (390 >= 384).
    expect(m.full_speed).toBe(1.5);
    expect(m.full_speed_after).toBe(39);
    expect(m.jumps).toEqual([{ held: 4, frames: 27, risen: 34 }, { held: 20, frames: 45, risen: 63 }]);
  });

  test("a jump that never leaves the ground, or has not landed when the next begins, is refused", () => {
    expect(() => jumpMeasures(cells(run([{ press: 300, air: 45, up: 63 }])), PLAN)).toThrow("pressed at frame 200 never left the ground");
    expect(() => jumpMeasures(cells(run([{ press: 200, air: 120, up: 34 }, { press: 300, air: 45, up: 63 }])), PLAN)).toThrow("pressed at frame 200 had not landed by frame 300");
  });
});

const RUN: RunPlan = {
  kind: "run", script: "AT 60 80\nAT 160 81\nAT 180 80\nAT 300 00\nAT 340 82\nAT 470 83\nAT 490 82\nAT 600 00\n", frames: 700,
  presses: [[160, 180], [470, 490]], walk_from: 60,
  memory: { air: "$03", y: "$15", speed_x: ["$12", "$13"], speed_down: ["$16", "$17"] },
};

/** A made-up run of `frames`: a speed for each frame, and jumps that start at `first` (256ths, upward negative) and are pulled by `held` while A is down and rising, `released` after. */
function made(frames: number, speed: (f: number) => number, pad: Uint8Array, jumps: { press: number; first: number; held: number; released: number }[]): Uint8Array {
  const ram = new Uint8Array(frames * 2048);
  const put = (f: number, a: number, v: number) => (ram[f * 2048 + a] = v & 0xff);
  let v = 0, y = 176 * 256, up = false;
  for (let f = 0; f < frames; f++) {
    const j = jumps.find((x) => x.press === f);
    // As the cartridges do, the first pull has been taken by the end of the frame the jump starts in.
    if (j && !up) [v, up] = [j.first + j.held, true];
    else if (up) {
      const now = jumps.filter((x) => x.press <= f).pop()!;
      y += v;
      v += pad[f] & 1 && v < 0 ? now.held : now.released;
      if (y >= 176 * 256) [y, v, up] = [176 * 256, 0, false];
    }
    put(f, 0x03, up ? 1 : 0);
    put(f, 0x15, y >> 8);
    put(f, 0x16, v);
    put(f, 0x17, v >> 8);
    put(f, 0x12, speed(f));
    put(f, 0x13, speed(f) >> 8);
  }
  return ram;
}

describe("the run lesson", () => {
  const pad = padOf(parseScript(RUN.script), 700);
  // Walking climbs to 1.5 from frame 60, running to 2.5 from frame 340, 16/256 a frame.
  const speed = (f: number) => (f < 60 || (f >= 300 && f < 340) || f >= 600 ? 0 : f < 300 ? Math.min(384, (f - 60) * 16) : Math.min(640, 384 + (f - 340) * 16));
  const main = () => made(700, speed, pad, [{ press: 160, first: -1024, held: 30, released: 96 }, { press: 470, first: -1280, held: 40, released: 144 }]);
  // Forty short runs: the speed grows 8/256 a frame from frame 20, and a jump at 400/256 or more is the strong one.
  const swept = (line: number) =>
    sweeps().map((s) => {
      const sp = (f: number) => Math.max(0, f - 20) * 16;
      const press = s.script[1][0];
      return cells(made(s.frames, sp, padOf(s.script, s.frames), [{ press, first: sp(press - 1) >= line ? -1280 : -1024, held: 40, released: 144 }]));
    });

  test("the pad byte holds until the script changes it", () => {
    expect([...padOf([[2, 0x80], [4, 0x81]], 6)]).toEqual([0, 0, 0x80, 0x80, 0x81, 0x81]);
    expect(sweeps().length).toBe(40);
    expect(sweeps()[3]).toEqual({ script: [[20, 0x82], [23, 0x83], [43, 0x82]], frames: 200, from: 23 });
  });

  test("tops, the two jumps and the speed where the jump changes are read off the runs", () => {
    const m = runMeasures(cells(main()), swept(400), RUN);
    expect(m.walk_top).toBe(1.5);
    expect(m.run_top).toBe(2.5);
    expect(m.run_after).toBe(16);
    expect(m.walk_jump).toMatchObject({ first: -4, held: 30, released: 96 });
    expect(m.run_jump).toMatchObject({ first: -5, held: 40, released: 144 });
    expect(m.run_jump.rose).toBeGreaterThan(m.walk_jump.rose);
    // Speeds step 16/256, one sixteenth: 384/256 is 24 sixteenths, 400/256 is 25.
    expect([m.light_max, m.strong_min]).toEqual([24, 25]);
  });

  test("a square that never jumps, or has only one jump, is refused with the reason", () => {
    const flat = cells(made(700, speed, pad, []));
    expect(() => runMeasures(flat, swept(400), RUN)).toThrow("pressed at frame 160 never left the ground");
    expect(() => runMeasures(cells(main()), swept(1e9), RUN)).toThrow("no jump started at 5 pixels a frame");
    expect(() => runMeasures(cells(main()), swept(0), RUN)).toThrow("every jump started at 5 pixels a frame");
    const still = sweeps().map((s) => cells(new Uint8Array(s.frames * 2048)));
    expect(() => runMeasures(cells(main()), still, RUN)).toThrow("the square never left the ground");
    // A run cut off before its jump reads as never leaving the ground, not as a number.
    const short = sweeps().map(() => cells(new Uint8Array(10 * 2048)));
    expect(() => runMeasures(cells(main()), short, RUN)).toThrow("the square never left the ground");
  });
});

const STOMP: StompPlan = {
  kind: "stomp", script: "", frames: 300, walk_from: 60,
  memory: { x: "$11", y: "$15", speed_down: ["$16", "$17"], walker_x: "$60", walker_y: "$64", walker_state: "$62", hits: "$65", stomps: "$66" },
};

/** A made-up meeting: a walker moving left half a pixel a frame, stomped at `stomp` (flat for `flat` frames) and hitting at `hit`; either may be left out. */
function meeting(o: { stomp?: number; flat?: number; hit?: number }): Uint8Array {
  const ram = new Uint8Array(300 * 2048);
  let wx = 200 * 256;
  for (let f = 0; f < 300; f++) {
    const at = (a: number, v: number) => (ram[f * 2048 + a] = v & 0xff);
    const flat = o.stomp !== undefined && f >= o.stomp && f < o.stomp + (o.flat ?? 0);
    if (!flat) wx -= 128;
    at(0x60, wx >> 8);
    at(0x61, wx);
    at(0x62, flat ? 4 : 0);
    at(0x64, 176);
    at(0x11, (wx >> 8) - 6);
    // Falling 4 a frame onto it the frame before the stomp, thrown up 4 after; level with it otherwise.
    at(0x15, o.stomp !== undefined && f === o.stomp - 1 ? 157 : 176);
    at(0x17, o.stomp !== undefined && f === o.stomp - 1 ? 4 : o.stomp === f ? 0xfc : 0);
    at(0x66, o.stomp !== undefined && f >= o.stomp ? 1 : 0);
    at(0x65, o.hit !== undefined && f >= o.hit ? 1 : 0);
  }
  return ram;
}

describe("the stomp lesson", () => {
  test("the walker's speed, the stomp and the hit are read off the run", () => {
    const m = stompMeasures(cells(meeting({ stomp: 141, flat: 25, hit: 194 })), STOMP);
    expect(m.walk).toBe(0.5);
    expect(m.stomp).toEqual({ frame: 141, dx: 6, dy: 19, fall: 4, after: -4, state: [0, 4], flat: 25 });
    expect(m.hit).toMatchObject({ frame: 194, dy: 0, fall: 0, after: 0, state: [0, 0] });
  });

  test("a run with no stomp, no hit, or a walker still flat at the end is refused with the reason", () => {
    expect(() => stompMeasures(cells(meeting({ hit: 194 })), STOMP)).toThrow("never stomped the walker");
    expect(() => stompMeasures(cells(meeting({ stomp: 141, flat: 25 })), STOMP)).toThrow("never hit the square");
    expect(() => stompMeasures(cells(meeting({ stomp: 141, flat: 500, hit: 100 })), STOMP)).toThrow("stomped at frame 141 was still flat when the run ended");
    expect(() => stompMeasures(cells(new Uint8Array(300 * 2048)), STOMP)).toThrow("the walker never walked");
  });
});

const WALKERS: WalkersPlan = { kind: "walkers", script: "", frames: 600, memory: { x: ["$40", "$41"], step: ["$42", "$43"] } };

/**
 * Two made-up walkers between walls at 16 and 224, each moving `pixels`
 * every `every` frames from frame 0, turning as the lesson's do: at a wall
 * the frame it would pass the wall (`inside` makes it go a pixel in first
 * and come back the frame after, as Mario's Goombas do), and both when
 * they come within 16 of each other (`meet` false lets them walk through).
 */
function walkers(o: { pixels?: number; every?: number; inside?: boolean; meet?: boolean }): Uint8Array {
  const pixels = o.pixels ?? 1, every = o.every ?? 2, meet = o.meet ?? true;
  const ram = new Uint8Array(600 * 2048);
  const x = [60, 160], back = [0, 0];
  let step = [1, -1];
  for (let f = 0; f < 600; f++) {
    if (f % every === 0) {
      for (let i = 0; i < 2; i++) {
        if (back[i]) {
          // Pushed back out of the wall and turned, the move after going in.
          x[i] += back[i];
          back[i] = 0;
          step[i] = -step[i];
          continue;
        }
        const to = x[i] + step[i] * pixels;
        if (to < 16 || to + 16 > 224) {
          if (o.inside) {
            // A move a pixel into the wall first, still facing it.
            x[i] = to < 16 ? 15 : 208 + 1;
            back[i] = to < 16 ? 1 : -1;
          } else step[i] = -step[i];
        } else x[i] = to;
      }
      if (meet && step[0] === 1 && step[1] === -1 && x[1] - x[0] <= 16) step = [-1, 1];
    }
    ram[f * 2048 + 0x40] = x[0];
    ram[f * 2048 + 0x41] = x[1];
    ram[f * 2048 + 0x42] = step[0] === 1 ? 1 : 0xff;
    ram[f * 2048 + 0x43] = step[1] === 1 ? 1 : 0xff;
  }
  return ram;
}

describe("the walkers lesson", () => {
  test("pace, turns at walls and meetings are read off the two walkers", () => {
    const m = walkersMeasures(cells(walkers({})), WALKERS);
    expect(m.pixels).toBe(1);
    expect(m.every).toBe(2);
    expect(m.inside).toEqual([false]);
    expect(m.overlap).toEqual([0]);
    expect(m.wall_turns).toBeGreaterThan(0);
    expect(m.meetings).toBeGreaterThan(0);
    // 2 pixels every 3 frames, and a frame spent inside each wall.
    const q = walkersMeasures(cells(walkers({ pixels: 2, every: 3, inside: true })), WALKERS);
    expect([q.pixels, q.every, q.inside]).toEqual([2, 3, [true]]);
  });
  test("walkers that never meet, or never reach a wall, are refused with the reason", () => {
    expect(() => walkersMeasures(cells(walkers({ meet: false })), WALKERS)).toThrow("0 meetings");
    const still = new Uint8Array(600 * 2048);
    for (let f = 0; f < 600; f++) {
      still[f * 2048 + 0x40] = 60;
      still[f * 2048 + 0x41] = 160;
      still[f * 2048 + 0x42] = 1;
      still[f * 2048 + 0x43] = 0xff;
    }
    expect(() => walkersMeasures(cells(still), WALKERS)).toThrow("0 meetings and 0 turns at walls");
  });
});

const CAMERA: CameraPlan = { kind: "camera", script: "", frames: 700, walk_from: 20, memory: { x: ["$11", "$12"], camera: ["$20", "$21"] } };

/**
 * A made-up walk: the square goes right two pixels a frame from frame 20
 * to 300, left to 500, right again. The camera eases in a pixel a frame
 * once the square is past `start` on the screen, holds it at `hold` from
 * there, and walking left (`back`) holds it at 48.
 */
function walk(o: { start?: number; hold?: number; back?: boolean; follow?: boolean }): Uint8Array {
  const start = o.start ?? 80, hold = o.hold ?? 112, back = o.back ?? true, follow = o.follow ?? true;
  const ram = new Uint8Array(700 * 2048);
  let x = 0, cam = 0;
  for (let f = 0; f < 700; f++) {
    const d = f < 20 ? 0 : f < 300 ? 2 : f < 500 ? -2 : 2;
    x += d;
    if (follow) {
      if (d > 0 && x - cam > start) {
        cam++;
        if (x - cam > hold) cam = x - hold;
      }
      if (d < 0 && back && x - cam < 48) cam = x - 48;
    }
    cam = Math.max(0, cam);
    ram[f * 2048 + 0x11] = x & 0xff;
    ram[f * 2048 + 0x12] = x >> 8;
    ram[f * 2048 + 0x20] = cam & 0xff;
    ram[f * 2048 + 0x21] = cam >> 8;
  }
  return ram;
}

describe("the camera lesson", () => {
  test("where the camera starts, holds, eases, comes back and restarts are read off the walk", () => {
    const m = cameraMeasures(cells(walk({})), CAMERA);
    expect(m).toEqual({ starts_at: 80, holds_at: 112, eased: m.eased, back: true, back_at: 48, restarts_at: m.restarts_at });
    expect(m.eased).toBeGreaterThan(0);
    // Turning back, the square walks the dead zone from 48 up before the camera moves right again.
    expect(m.restarts_at).toBe(80);
    const q = cameraMeasures(cells(walk({ start: 64, hold: 96, back: false })), CAMERA);
    expect([q.starts_at, q.holds_at, q.back, q.back_at]).toEqual([64, 96, false, null]);
  });
  test("a camera that never moves right is refused with the reason", () => {
    expect(() => cameraMeasures(cells(walk({ follow: false })), CAMERA)).toThrow("the camera never moved right");
  });
});

const PLATFORMS: PlatformsPlan = { kind: "platforms", script: "AT 30 80\nAT 62 00\nAT 190 80\n", frames: 600, walk_from: 20, memory: { x: "$11", y: "$15", lift_x: "$30", lift_top: "$33", on: "$32" } };

/**
 * A made-up ride: a lift going back and forth between x 80 and 128 by
 * `step` every `every` frames, its top at 160; the square walks right onto
 * it from frame 30, stands on it from frame 70 to 230 (16 above its top,
 * or `wobble` pixels higher on one frame), moved by the lift's step on the
 * same frame, then walks off. `moving` false leaves the lift still.
 */
function ride(o: { step?: number; every?: number; wobble?: number; moving?: boolean; stand?: boolean }): Uint8Array {
  const step = o.step ?? 1, every = o.every ?? 1, moving = o.moving ?? true, stand = o.stand ?? true;
  const ram = new Uint8Array(600 * 2048);
  let lift = 80, dir = 1, x = 20;
  for (let f = 0; f < 600; f++) {
    let d = 0;
    if (moving && f % every === 0) {
      d = dir * step;
      lift += d;
      if (lift <= 80 || lift >= 128) dir = -dir;
    }
    const on = stand && f >= 70 && f <= 230;
    if (on) x += d;
    else if (f >= 30 && f < 70) x += 1;
    else if (f >= 231) x += 1;
    ram[f * 2048 + 0x11] = x & 0xff;
    ram[f * 2048 + 0x15] = 160 - 16 - (on && o.wobble && f === 150 ? o.wobble : 0);
    ram[f * 2048 + 0x30] = lift;
    ram[f * 2048 + 0x33] = 160;
    ram[f * 2048 + 0x32] = on ? 1 : 0;
  }
  return ram;
}

describe("the platforms lesson", () => {
  test("the lift's way, step, travel and the frames it carried the square are read off the ride", () => {
    const m = platformsMeasures(cells(ride({})), PLATFORMS);
    expect(m).toEqual({ axis: "across", step: 1, every: 1, travel: 48, standing: 160, stepped: m.stepped, same: m.same, steady: true });
    // Right is held until frame 62 and again from 190; a second after the release the lift's steps count, until the press.
    expect(m.stepped).toBe(190 - 122);
    expect(m.same).toBe(m.stepped);
    const q = platformsMeasures(cells(ride({ step: 2, every: 3, wobble: 1 })), PLATFORMS);
    expect([q.step, q.every, q.steady]).toEqual([2, 3, false]);
  });
  test("a lift that never moves, or a square that never stands on it, is refused with the reason", () => {
    expect(() => platformsMeasures(cells(ride({ moving: false })), PLATFORMS)).toThrow("the lift never moved");
    expect(() => platformsMeasures(cells(ride({ stand: false })), PLATFORMS)).toThrow("never stood on the lift");
  });
});

const SCROLL: ScrollPlan = { kind: "scroll", script: "", frames: 1500, memory: { camera: ["$20", "$21"], countdown: "$23" } };

/**
 * A made-up scroll: the camera moves a pixel a frame from frame 60; every
 * 32 pixels a strip starts, its countdown running 7 frames; two columns
 * of 26 tiles are written on the strip's frames 2 and 3, landing `ahead`
 * pixels past the right edge (a column is 8 pixels, so `ahead` lands exactly
 * when the camera's pixel on that frame plus 256 plus `ahead` is a
 * multiple of 8), and seven colour choices on its frame 7.
 * `strips` false never starts one.
 */
function scroll(o: { ahead?: number; strips?: boolean }): { ram: Uint8Array; vram: string } {
  const ahead = o.ahead ?? 94, strips = o.strips ?? true;
  const ram = new Uint8Array(1500 * 2048);
  const lines: string[] = [];
  let cam = 0, countdown = 0, f0 = -1;
  for (let f = 0; f < 1500; f++) {
    if (f >= 60) cam++;
    if (countdown) countdown--;
    else if (strips && f >= 60 && cam % 32 === 0) {
      countdown = 7;
      f0 = f;
    }
    const hex = (a: number) => a.toString(16).toUpperCase().padStart(4, "0");
    if (f0 >= 0 && (f === f0 + 2 || f === f0 + 3)) {
      for (let k = 0; k < 2; k++) {
        // Both columns of a frame land at the strip's place; the first one's place is what is measured.
        const x = (cam + 256 + ahead + (f - f0 - 2) * 16 + k * 8) % 512;
        lines.push(`${f} ${hex(0x2000 | (x >= 256 ? 0x400 : 0) | ((x % 256) >> 3))} 26 32`);
      }
    }
    if (f0 >= 0 && f === f0 + 7) for (let k = 0; k < 7; k++) lines.push(`${f} ${hex(0x23c0 + k * 8)} 1 1`);
    ram[f * 2048 + 0x20] = cam & 0xff;
    ram[f * 2048 + 0x21] = cam >> 8;
    ram[f * 2048 + 0x23] = countdown;
  }
  return { ram, vram: lines.map((l) => l + "\n").join("") };
}

describe("the scroll lesson", () => {
  test("the strips, their spacing, their frames and where their columns land are read off memory and the picture-memory writes", () => {
    const { ram, vram } = scroll({});
    const m = scrollMeasures(cells(ram), vram, SCROLL);
    expect(m).toEqual({
      strips: m.strips, every_min: 32, every_max: 32, every_mean: 32, frames: ["8"], columns: ["4"], tiles: [26], colours: ["7"],
      ahead_min: 94, ahead_max: 94, column_frames: ["[2, 3]"], last_write: ["7"],
    });
    expect(m.strips).toBeGreaterThan(30);
    expect(scrollMeasures(cells(ram), scroll({ ahead: 126 }).vram, SCROLL).ahead_min).toBe(126);
  });
  test("a camera that never moves, or one that starts no strip, is refused with the reason", () => {
    const { ram, vram } = scroll({ strips: false });
    expect(() => scrollMeasures(cells(ram), vram, SCROLL)).toThrow("no strip was started");
    expect(() => scrollMeasures(cells(new Uint8Array(1500 * 2048)), "", SCROLL)).toThrow("the camera never moved");
  });
});

const ROOMS: RoomsPlan = { kind: "rooms", script: "", frames: 1300, walk_from: 360, up_from: 60, mirroring: "vertical", memory: { room: "$30", scroll: ["$36", "$37"] } };

/**
 * A made-up pair of exits: the room's number drops by 16 at frame 100
 * (a step up) and 30 rows of 32 tiles are written across from the bottom
 * row up, one every second frame from frame 102; then it drops by one at
 * frame 400 (a step left) and the picture slides `step` pixels a frame
 * for 256 pixels from frame 402, told to the chip in the blank, with a
 * column of 30 tiles written down every second frame. `leave` false
 * never changes the number.
 */
function rooms(o: { step?: number; leave?: boolean }): { ram: Uint8Array; vram: string; scroll: string } {
  const step = o.step ?? 4, leave = o.leave ?? true;
  const ram = new Uint8Array(1300 * 2048);
  const vram: string[] = [], scroll: string[] = [];
  const hex = (a: number) => a.toString(16).toUpperCase().padStart(4, "0");
  let room = 119, x = 0;
  for (let f = 0; f < 1300; f++) {
    if (leave && f === 100) room -= 16;
    if (leave && f === 400) room -= 1;
    if (leave && f >= 102 && f < 162 && f % 2 === 0) vram.push(`${f} ${hex(0x2000 + (29 - (f - 102) / 2) * 32)} 32 1`);
    if (leave && f >= 402 && f < 402 + 256 / step) {
      x = (x - step + 256) % 256;
      if (f % 2 === 0) vram.push(`${f} ${hex(0x2400 + (f - 402) / 2)} 30 32`);
    }
    scroll.push(`${f} 246 ${x} 0`);
    ram[f * 2048 + 0x30] = room;
    ram[f * 2048 + 0x36] = x;
  }
  return { ram, vram: vram.map((l) => l + "\n").join(""), scroll: scroll.map((l) => l + "\n").join("") };
}

describe("the rooms lesson", () => {
  test("the slide, what was written before and during it, and the step up are read off memory and the logs", () => {
    const { ram, vram, scroll } = rooms({});
    const m = roomsMeasures(cells(ram), vram, scroll, ROOMS);
    expect(m).toEqual({
      mirroring: { playing: "vertical", fixed: true }, before: 103, after: 102, wait: 2, slide: 64, travel: 256, step: 4,
      written_before: {}, written_during: { "30 down": 32 }, column_every: [2], columns_from: 0, columns: 32,
      up: { before: 119, after: 103, rows: 30, tiles: [32], first: 2, every: [2], upward: true, from_row: 29, to_row: 0 },
    });
    const q = roomsMeasures(cells(ram), vram, rooms({ step: 8 }).scroll, ROOMS);
    expect([q.step, q.slide, q.travel]).toEqual([8, 32, 256]);
  });
  test("a room whose number never changes is refused with the reason", () => {
    const { ram, vram, scroll } = rooms({ leave: false });
    expect(() => roomsMeasures(cells(ram), vram, scroll, ROOMS)).toThrow("never changed after frame 360");
  });
});

const SCREENS: ScreensPlan = { kind: "screens", script: "AT 120 08\nAT 124 00\nAT 330 08\nAT 334 00\nAT 500 08\nAT 504 00\n", frames: 900, memory: { screen: "$40" } };

/** A made-up run: the title until Start at 120, play (five cells of memory changing a frame) until Start at 330, a pause (nothing changing) until Start at 500, play again. `answer` false leaves the title. */
function screens(o: { answer?: boolean }): Uint8Array {
  const answer = o.answer ?? true;
  const ram = new Uint8Array(900 * 2048);
  for (let f = 0; f < 900; f++) {
    const screen = !answer ? 0 : f < 120 ? 0 : f < 330 ? 1 : f < 500 ? 2 : 1;
    ram[f * 2048 + 0x40] = screen;
    if (screen === 1) for (let k = 0; k < 5; k++) ram[f * 2048 + 0x10 + k] = f & 0xff;
    else for (let k = 0; k < 5; k++) ram[f * 2048 + 0x10 + k] = ram[(f - 1) * 2048 + 0x10 + k];
  }
  return ram;
}

describe("the screens lesson", () => {
  test("the byte's values, its changes and how still memory is while paused are read off the run and the pad", () => {
    expect(screensMeasures(cells(screens({})), SCREENS)).toEqual({ values: [0, 1, 2, 1], changes: 3, pause: { before: 5, during: 0, frames: 170 } });
  });
  test("a byte that never changes is refused with the reason", () => {
    expect(() => screensMeasures(cells(screens({ answer: false })), SCREENS)).toThrow("the screen's byte never changed");
  });
});

const STATUS: StatusPlan = { kind: "status", script: "", frames: 1500, walk_from: 60 };

/** Made-up logs: every frame the scroll set at line 31 for the level and 0,0 in the blank; the timer's three tiles at row 2, column 26, written every `every` frames from 84 (59 times by 1500 at 24). `split` false never sets the scroll while drawing. */
function status(o: { every?: number; split?: boolean; timer?: boolean }): { vram: string; scroll: string } {
  const every = o.every ?? 24, split = o.split ?? true, timer = o.timer ?? true;
  const vram: string[] = [], scroll: string[] = [];
  for (let f = 0; f < 1500; f++) {
    if (split) scroll.push(`${f} 31 ${f & 0xff} 0`);
    scroll.push(`${f} 241 0 0`);
    if (timer && f >= 84 && (f - 84) % every === 0) vram.push(`${f} 205A 3 1`);
  }
  return { vram: vram.map((l) => l + "\n").join(""), scroll: scroll.map((l) => l + "\n").join("") };
}

describe("the status lesson", () => {
  test("the split, the bar's scroll and the timer's writes are read off the logs", () => {
    const { vram, scroll } = status({});
    expect(statusMeasures(vram, scroll, STATUS)).toEqual({
      split_line: 31, split_frames: 1440, frames: 1440, bar_scroll: [0, 0], timer: { row: 2, column: 26, tiles: 3, writes: 59, every: [24] }, other_bar_writes: 0,
    });
    const q = status({ every: 12 });
    expect(statusMeasures(q.vram, q.scroll, STATUS).timer).toEqual({ row: 2, column: 26, tiles: 3, writes: 118, every: [12] });
  });
  test("a picture never split, or a bar never written, is refused with the reason", () => {
    const a = status({ split: false });
    expect(() => statusMeasures(a.vram, a.scroll, STATUS)).toThrow("never split");
    const b = status({ timer: false });
    expect(() => statusMeasures(b.vram, b.scroll, STATUS)).toThrow("nothing was written into the bar");
  });
});

const SOUND: SoundPlan = { kind: "sound", script: "AT 60 80\nAT 150 81\nAT 170 80\nAT 300 00\n", frames: 400, walk_from: 60 };

/** A made-up sound log: the tune writes the first square's four registers every 16 frames from frame 2; the jump at 150 sets the sweep (`sweep` on) on frames 150 and 153, and the tune's next note at 162 takes the channel back. */
function sound(o: { sweep?: boolean }): string {
  const sweep = o.sweep ?? true;
  const lines: string[] = [];
  for (let f = 2; f < 400; f += 16) for (const r of ["00", "01", "02", "03"]) lines.push(`${f} ${r} ${r === "01" ? 8 : 100}`);
  for (const f of [150, 153]) {
    lines.push(`${f} 00 132`);
    lines.push(`${f} 01 ${sweep ? 155 : 27}`);
    lines.push(`${f} 02 144`);
  }
  return lines.sort((a, b) => Number(a.split(" ")[0]) - Number(b.split(" ")[0])).map((l) => l + "\n").join("");
}

describe("the sound lesson", () => {
  test("the music before, the sweep settings and the music coming back are read off the sound chip's log", () => {
    // Four writes a note, notes at 98, 114, 130 and 146 in the second before 150: sixteen; the tune's next note is 162, twelve frames on.
    expect(soundMeasures(sound({}), SOUND)).toEqual({ music_before: 16, starts: 0, sweep_settings: 2, sweep_frames: [0, 3], music_back: 12 });
    expect(soundMeasures(sound({ sweep: false }), SOUND)).toEqual({ music_before: 16, sweep_settings: 0 });
  });
  test("a script that never presses A is refused", () => {
    expect(() => soundMeasures(sound({}), { ...SOUND, script: "AT 60 80\n" })).toThrow("never presses A");
  });
});

const PAUSE: PausePlan = {
  kind: "pause",
  script: "AT 100 80\nAT 150 88\nAT 156 80\nAT 165 88\nAT 171 80\nAT 180 81\nAT 190 80\nAT 220 88\nAT 226 80\nAT 320 00\n",
  frames: 330,
  walk_from: 100,
  memory: { x: "$11", wait: "$54" },
  grabs: [160, 215],
  chime: "07",
  music: ["00", "01", "02", "03"],
};

/**
 * A made-up pause: the square walks a pixel a frame from frame 100, holds
 * from the press at 150 (`late` frames after it) to the press at 220 (and
 * `late` after that); the game's count at $54 is set to `wait` on each
 * press and falls a frame at a time. The tune writes the first square's
 * four registers every 16 frames from frame 2 until the pause and again
 * from `wait` frames after the unpause; the press cuts the chip and the
 * chime's three notes land 8 frames apart on the second square. `takes`
 * off is a Start that never does anything.
 */
function pause(o: { wait?: number; late?: number; drawn?: boolean; same?: boolean; takes?: boolean }): { ram: Uint8Array; vram: string; apu: string; pictures: [Uint8Array, Uint8Array] } {
  const wait = o.wait ?? 32, late = o.late ?? 0, takes = o.takes ?? true;
  const ram = new Uint8Array(330 * 2048);
  let x = 40, count = 0;
  for (let f = 0; f < 330; f++) {
    const paused = takes && f >= 150 + late && f < 220 + late;
    if (f >= 100 && !paused) x = (x + 1) & 0xff;
    if (takes && (f === 150 || f === 220)) count = wait;
    else if (count > 0) count--;
    ram[f * 2048 + 0x11] = x;
    ram[f * 2048 + 0x54] = count;
  }
  const vram = "1 2000 960 1\n" + (o.drawn ? "170 2041 1 1\n" : "");
  const lines: string[] = [];
  const tune = (f: number) => ["00", "01", "02", "03"].forEach((r) => lines.push(`${f} ${r} 100`));
  for (let f = 2; f < 330; f += 16) if (f < 150 || !takes) tune(f);
  if (takes) {
    for (const press of [150, 220]) {
      lines.push(`${press} 15 0`, `${press} 15 3`);
      for (const k of [0, 8, 16]) lines.push(`${press + k} 07 0`);
    }
    for (let f = 220 + wait; f < 330; f += 16) tune(f);
  }
  const apu = lines.map((l) => l + "\n").join("");
  const a = Uint8Array.from([1, 2, 3, 4]), b = Uint8Array.from(o.same === false ? [1, 2, 3, 5] : [1, 2, 3, 4]);
  return { ram, vram, apu, pictures: [a, b] };
}

describe("the pause lesson", () => {
  test("the presses that took, the hold, the wait, what was drawn and the sound's shape are read off memory, the pad, the logs and two pictures", () => {
    const p = pause({});
    expect(pauseMeasures(cells(p.ram), p.vram, p.apu, p.pictures, PAUSE)).toEqual({
      ignored_after: [15], a_pressed: true, stops: 0, starts: 0, held: true, wait: 32, drawn: 0, same_picture: true, cut: true, chime_notes: 3, chime_every: [8], music_back: 32,
    });
  });
  test("a square that takes two frames to hold and to move again, a shorter wait, a write while paused and a picture that changed all show", () => {
    const p = pause({ late: 2, wait: 16, drawn: true, same: false });
    const m = pauseMeasures(cells(p.ram), p.vram, p.apu, p.pictures, PAUSE);
    // The chime's third note lands at 166, past a wait of 16; the music is back 16 frames after the unpause.
    expect(m).toMatchObject({ stops: 2, starts: 2, held: true, wait: 16, drawn: 1, same_picture: false, chime_notes: 2, chime_every: [8], music_back: 16 });
    const s = pause({ wait: 16 }).apu.replace("150 07 0\n158 07 0\n166 07 0\n", "150 07 0\n158 07 0\n");
    expect(pauseMeasures(cells(pause({ wait: 16 }).ram), "", s, p.pictures, { ...PAUSE, script: PAUSE.script.replace("AT 180 81\nAT 190 80\n", "") })).toMatchObject({ a_pressed: false, chime_notes: 2, chime_every: [8] });
  });
  test("a Start that never takes, and a picture the run did not take, are refused", () => {
    const p = pause({ takes: false });
    expect(() => pauseMeasures(cells(p.ram), p.vram, p.apu, p.pictures, PAUSE)).toThrow("0 of 3 presses of Start");
    const q = pause({});
    expect(() => pauseMeasures(cells(q.ram), q.vram, q.apu, [q.pictures[0], new Uint8Array(0)], PAUSE)).toThrow("no picture was taken at frame 215");
    expect(() => pauseMeasures(cells(q.ram), q.vram, q.apu, [undefined, q.pictures[1]], PAUSE)).toThrow("no picture was taken at frame 160");
  });
});

const TITLE: TitlePlan = { kind: "title", script: "AT 60 04\nAT 66 00\nAT 300 08\nAT 306 00\n", frames: 400, after: 0, memory: { x: "$11" } };

/**
 * A made-up title: both name tables cleared on frames 1 and 2, twenty
 * tiles a frame down a column on frames 3 to 6; Select at 60 rewrites
 * three tiles a row apart on 61; the square moves a pixel a frame from 160
 * to 249 with the scroll following, and the title is cleared and drawn
 * again from 260. `split` cuts the first clear across two frames, as the
 * log does when a clear with the picture off outlasts a blank; `clears`
 * off leaves the tables never cleared whole.
 */
function title(o: { split?: boolean; clears?: boolean }): { ram: Uint8Array; vram: string; scroll: string } {
  const ram = new Uint8Array(400 * 2048);
  let x = 40;
  const scroll: string[] = [];
  for (let f = 0; f < 400; f++) {
    if (f >= 160 && f < 250) x++;
    ram[f * 2048 + 0x11] = x;
    if (f >= 2) scroll.push(`${f} 0 ${f >= 160 && f < 260 ? f - 159 : 0} 0`);
  }
  const big = o.clears === false ? 512 : 1024;
  const lines = o.split ? ["1 2000 600 1", "2 2258 424 1", `2 2400 ${big} 1`] : [`1 2000 ${big} 1`, `2 2400 ${big} 1`];
  for (let f = 3; f <= 6; f++) lines.push(`${f} ${(0x2000 + f).toString(16).toUpperCase()} 20 32`);
  lines.push("61 2187 3 32", `260 2000 ${big} 1`, `261 2400 ${big} 1`, "262 20C0 10 1", "301 2300 5 1");
  return { ram, vram: lines.map((l) => l + "\n").join(""), scroll: scroll.map((l) => l + "\n").join("") };
}

describe("the title lesson", () => {
  test("the drawing, the cursor, the countdown, the demo and a Start on the title are read off the writes, the scroll, x and the pad", () => {
    const t = title({});
    expect(titleMeasures(cells(t.ram), t.vram, t.scroll, TITLE)).toEqual({
      title: { frames: 6, cleared: 2, tiles: 80 }, demo: { frames: 100, scrolled: true }, cursor: { tiles: 3, step: 32 }, countdown: 100, start_title: 1,
    });
  });
  test("a clear the log split where a frame began counts as one, and a Start in the demo is timed to the next write and leaves no demo that ran by itself", () => {
    const t = title({ split: true });
    expect(titleMeasures(cells(t.ram), t.vram, t.scroll, TITLE).title).toEqual({ frames: 6, cleared: 2, tiles: 80 });
    const m = titleMeasures(cells(t.ram), t.vram, t.scroll, { ...TITLE, script: "AT 60 04\nAT 66 00\nAT 200 08\nAT 206 00\n" });
    expect(m.start_demo).toBe(60);
    expect(m.demo).toBeUndefined();
    expect(m.countdown).toBe(100);
  });
  test("name tables never cleared whole are refused", () => {
    const t = title({ clears: false });
    expect(() => titleMeasures(cells(t.ram), t.vram, t.scroll, TITLE)).toThrow("no title was drawn");
  });
});

const ITEMS: ItemsPlan = { kind: "items", script: "AT 20 80\nAT 60 88\nAT 66 80\nAT 80 88\nAT 86 80\nAT 150 88\nAT 156 80\n", frames: 300, walk_from: 20 };

/** A made-up slide: Start at 60 sends the picture to 240 and up 4 a frame to 64, a row drawn every 2 frames from the bottom; Start at 150 slides it back. */
function items(o: { split?: boolean }) {
  const scroll: string[] = [], vram: string[] = ["10 2000 32 1"];
  let y = 0;
  for (let f = 0; f < 300; f++) {
    if (f === 61) y = 240;
    else if (f > 61 && f <= 105) y -= 4;
    else if (f > 150 && f <= 195) y += 4;
    else if (f === 196) y = 0;
    scroll.push(`${f} 246 0 ${y}`);
  }
  if (o.split) scroll.push("120 100 0 0");
  for (let k = 0; k < 22; k++) vram.push(`${62 + 2 * k} ${(0x2800 + (21 - k) * 32).toString(16).toUpperCase()} 32 1`);
  return { vram: vram.join("\n") + "\n", scroll: scroll.join("\n") + "\n" };
}

describe("the items lesson", () => {
  test("the slide, the Start between and the rows are read off the scroll, the writes and the pad", () => {
    const t = items({});
    expect(itemsMeasures(t.vram, t.scroll, ITEMS)).toEqual({
      step: 4, travel: 176, open_frames: 45, close_frames: 46, close_step: 4, ignored: true, split: false,
      rows: 22, bottom_up: true, every: 2, rows_closing: 0, mirroring: { fixed: true, changes: 0 },
    });
  });
  test("the scroll set while the picture draws is a split", () => {
    const t = items({ split: true });
    expect(itemsMeasures(t.vram, t.scroll, ITEMS).split).toBe(true);
  });
  test("a run without three presses of Start is refused", () => {
    const t = items({});
    expect(() => itemsMeasures(t.vram, t.scroll, { ...ITEMS, script: "AT 60 88\nAT 66 80\nAT 150 88\nAT 156 80\n" })).toThrow("2 presses of Start");
  });
});

const MENU: MenuPlan = {
  kind: "menu", frames: 300, after: 0, memory: { cell: "$40" },
  script: "AT 20 80\nAT 24 00\nAT 40 80\nAT 44 00\nAT 60 20\nAT 64 00\nAT 80 01\nAT 84 00\nAT 100 40\nAT 104 00\nAT 120 01\nAT 124 00\nAT 140 10\nAT 144 00\nAT 160 01\nAT 164 00\nAT 200 40\nAT 260 00\n",
};

/** A made-up grid 10 by 4: a press moves the cursor that frame, held it moves again after 20 and then every 6, round the grid; a click with each move, a tile the frame after each A, and a cursor sprite 16 frames on and 16 off. */
function menu(o: { front?: boolean }) {
  const pad = padOf(parseScript(MENU.script), 300), ram = new Uint8Array(300 * 2048);
  const vram: string[] = [], apu: string[] = [];
  let c = 0, wait = 0;
  for (let f = 1; f < 300; f++) {
    const d = pad[f] & 0xf0, was = pad[f - 1] & 0xf0;
    let go = false;
    if (d && !was) { go = true; wait = 20; }
    else if (d && --wait === 0) { go = true; wait = 6; }
    if (go) {
      c = d & 0x80 ? c + 1 : d & 0x40 ? c - 1 : d & 0x20 ? c + 10 : c - 10;
      c = ((c % 40) + 40) % 40;
      apu.push(`${f} 08 1`);
    }
    if (pad[f] & 0x01 && !(pad[f - 1] & 0x01)) vram.push(`${f + 1} 2050 1 1`);
    ram[f * 2048 + 0x40] = c;
    for (let i = 0; i < 64; i++) ram[f * 2048 + 0x200 + i * 4] = 0xff;
    if (!((f >> 4) & 1)) { ram[f * 2048 + 0x200] = 0x50; ram[f * 2048 + 0x202] = o.front ? 0 : 0x20; }
  }
  return { ram, vram: vram.join("\n") + "\n", apu: apu.join("\n") + "\n" };
}

describe("the menu lesson", () => {
  test("the moves, the wait and the beat, the grid's width and size, the letters, the blink and the clicks are read off memory, the writes and the pad", () => {
    const t = menu({});
    expect(menuMeasures(cells(t.ram), t.vram, t.apu, MENU)).toEqual({
      after_press: [0], wait: 20, every: 6, width: 10, wraps_to: 39, typed: [[1, 1], [1, 1], [1, 1]], behind: true, blink: [16, 16], moves: 13, clicks: 13,
    });
  });
  test("a cursor drawn in front of the letters is not behind them and has no blink to read", () => {
    const t = menu({ front: true });
    const m = menuMeasures(cells(t.ram), t.vram, t.apu, MENU);
    expect(m.behind).toBe(false);
    expect(m.blink).toEqual([0, 0]);
  });
  test("a run without the presses is refused", () => {
    const t = menu({});
    expect(() => menuMeasures(cells(t.ram), t.vram, t.apu, { ...MENU, script: "AT 20 80\nAT 24 00\nAT 80 01\nAT 84 00\n" })).toThrow("three of A, and has 1 and 1");
  });
});

const SPLASH: SplashPlan = { kind: "splash", script: "", frames: 500, after: 0 };

/** A made-up splash: a tile row at 5, a few colours rewritten every 8 frames from 10, the whole palette 5 times 4 frames apart from 410, and four drops falling 3 a frame that jump back every 8. */
function splash(o: { colours?: boolean; drawn?: boolean }) {
  const ram = new Uint8Array(500 * 2048), vram = ["5 2040 32 1"];
  if (o.colours !== false) for (let f = 10; f < 410; f += 8) vram.push(`${f} 3F05 3 1`);
  if (o.drawn) vram.push("200 2040 4 1");
  for (let k = 0; k < 5; k++) vram.push(`${410 + 4 * k} 3F00 32 1`);
  vram.sort((a, b) => Number(a.split(" ")[0]) - Number(b.split(" ")[0]));
  for (let f = 0; f < 500; f++) {
    for (let i = 0; i < 64; i++) ram[f * 2048 + 0x200 + i * 4] = 0xff;
    for (let i = 0; i < 4; i++) {
      ram[f * 2048 + 0x200 + i * 4] = 120 + 3 * (f % 8) + 24 * i;
      ram[f * 2048 + 0x203 + i * 4] = 0x7c;
    }
  }
  return { ram, vram: vram.join("\n") + "\n" };
}

describe("the splash lesson", () => {
  test("the turning colours, the fade, the tiles and the falling drops are read off the writes and the sprites", () => {
    const t = splash({});
    expect(splashMeasures(cells(t.ram), t.vram, SPLASH)).toEqual({ shown: 400, tiles: 0, turn_every: 8, turns: 50, fade_steps: 5, fade_frames: 16, fall: 3, loop: 8 });
  });
  test("a tile written while the splash shows is counted, and one drawn before it is not", () => {
    const t = splash({ drawn: true });
    expect(splashMeasures(cells(t.ram), t.vram, SPLASH).tiles).toBe(4);
  });
  test("colours that never turn are refused", () => {
    const t = splash({ colours: false });
    expect(() => splashMeasures(cells(t.ram), t.vram, SPLASH)).toThrow("no colours turned");
  });
});

const ABOUT: AboutPlan = { kind: "about", script: "", frames: 400, walk_from: 10 };

/** A made-up crawl: a row at 5 (too early), then a whole row every 16 frames from 20, the scroll a pixel down every 2 frames from 230 and round past 240, a colour write, two other tiles and a write that is not a row. */
function about(o: { rows?: boolean; split?: boolean }) {
  const vram: string[] = ["5 2000 32 1", "100 23C0 8 1", "150 2045 2 1"];
  if (o.rows !== false) for (let k = 0, f = 20; f < 400; k++, f += 16) vram.push(`${f} ${(0x2000 + (k % 30) * 32).toString(16).toUpperCase()} 32 1`);
  vram.sort((a, b) => Number(a.split(" ")[0]) - Number(b.split(" ")[0]));
  const scroll: string[] = [];
  for (let f = 0; f < 400; f++) {
    if (o.split && f === 200) scroll.push("200 100 0 0");
    scroll.push(`${f} 246 0 ${(230 + Math.max(0, Math.floor((f - 20) / 2))) % 240}`);
  }
  return { vram: vram.join("\n") + "\n", scroll: scroll.join("\n") + "\n" };
}

describe("the about lesson", () => {
  test("the crawl, the rows and every other write are read off the scroll and the writes from the first row, counted round 240", () => {
    const t = about({});
    expect(aboutMeasures(t.vram, t.scroll, ABOUT)).toEqual({ step: 1, every: 2, crawled: 189, split: false, rows: 24, row_every: 16, row_pixels: 8, colours: 8, other: 2, frames: 380 });
  });
  test("the scroll set while the picture draws is a split", () => {
    const t = about({ split: true });
    expect(aboutMeasures(t.vram, t.scroll, ABOUT).split).toBe(true);
  });
  test("a run that never writes a whole row is refused", () => {
    const t = about({ rows: false });
    expect(() => aboutMeasures(t.vram, t.scroll, ABOUT)).toThrow("no whole row of words was written");
  });
});

const SOLID: SolidPlan = { kind: "solid", script: "AT 20 80\nAT 78 81\nAT 103 80\n", frames: 300, walk_from: 20, memory: { x: "$11", y: "$15", vy: "$17", speed: "$12" } };

/** A made-up bump: from 176 the square rises 4 a frame from 79, meets the block at 84, falls 2 a frame to stand at 94; the block's two rows written at 85 and again at 97; x walks a pixel a frame to the wall at 176 (frame 196), where the speed is taken away every 7 frames. */
function solid(o: { block?: boolean; back?: boolean }) {
  const ram = new Uint8Array(300 * 2048);
  let y = 176;
  for (let f = 0; f < 300; f++) {
    const m = f * 2048;
    let vy = 0;
    if (f >= 79 && f <= 83) vy = -4;
    else if (f > 84 && y < 176) vy = 2;
    y += vy;
    ram[m + 0x15] = y;
    ram[m + 0x17] = vy & 0xff;
    ram[m + 0x11] = o.back && f === 200 ? 175 : Math.min(176, Math.max(0, f - 20));
    ram[m + 0x12] = f >= 177 && (f - 177) % 7 === 0 ? 0 : 10;
  }
  const vram = o.block === false ? "" : "85 2046 2 1\n85 2066 2 1\n97 2046 2 1\n97 2066 2 1\n";
  return { ram, vram };
}

describe("the solid lesson", () => {
  test("the bump, the fall, the block and the wall are read off memory, the writes and the pad", () => {
    const t = solid({});
    expect(solidMeasures(cells(t.ram), t.vram, SOLID)).toEqual({
      rising: 4, fall_frames: 10, block_after: 1, block_back: 12, wall_x: 176, pushed_back: false, zeroed: 15, zeroed_every: [7], pushing_frames: 103,
    });
  });
  test("a pixel lost against the wall is a push back, and the wall still holds", () => {
    const t = solid({ back: true });
    const m = solidMeasures(cells(t.ram), t.vram, SOLID);
    expect(m.pushed_back).toBe(true);
    expect(m.wall_x).toBe(176);
  });
  test("a bump that writes no block is refused", () => {
    const t = solid({ block: false });
    expect(() => solidMeasures(cells(t.ram), t.vram, SOLID)).toThrow("no block's tiles were written near the touch at frame 84");
  });
});

const FLICKER: FlickerPlan = { kind: "flicker", script: "AT 120 04\nAT 124 00\n", frames: 240 };

/** A made-up line of nine sprites, one more than the chip draws: the order kept until Select at 120, then each frame starting one sprite further on, round all nine. The first, tile 6, is the one followed. */
function flicker(o: { select?: boolean; empty?: boolean }) {
  const ram = new Uint8Array(240 * 2048);
  for (let f = 0; f < 240; f++) {
    const m = f * 2048;
    ram.fill(0xff, m + 0x200, m + 0x300);
    if (o.empty && f < 20) continue;
    const turn = f >= 120 ? (f - 120) % 9 : 0;
    for (let k = 0; k < 9; k++) {
      const s = m + 0x200 + ((k - turn + 9) % 9) * 4;
      ram.set([100, k === 0 ? 6 : 7, 0, 20 + 20 * k], s);
    }
  }
  return { ram, plan: o.select === false ? { ...FLICKER, script: "AT 120 00\n" } : FLICKER };
}

describe("the flicker lesson", () => {
  test("the line, what it leaves out and the turning order are read off sprite memory", () => {
    const t = flicker({});
    expect(flickerMeasures(cells(t.ram), t.plan)).toEqual({
      kept: { most: 9, left_out: 1, never_drawn: 1, cycle: 1, frames: 110 },
      turned: { most: 9, left_out: 1, never_drawn: 0, cycle: 9, frames: 110 },
    });
  });
  test("a run with no press of Select is refused", () => {
    const t = flicker({ select: false });
    expect(() => flickerMeasures(cells(t.ram), t.plan)).toThrow("Select was never pressed");
  });
  test("a run with nothing on the screen at frame 10 is refused", () => {
    const t = flicker({ empty: true });
    expect(() => flickerMeasures(cells(t.ram), t.plan)).toThrow("no sprite was on the screen at frame 10");
  });
});

const LIVES: LivesPlan = { kind: "lives", script: "AT 20 80\n", frames: 300, memory: { x: "$11", y: "$15", lives: "$52", round: "$50" } };

/** A made-up life lost: the square walks from 0, touches at frame 50 and hangs at 192 until 70, hops 4 a frame to 172 and falls; the life goes at 100, with the picture cleared there, and play begins again at 220 from x 0 (or 5). Every frame also writes the palette, which is not a clear. */
function lives(o: { clear?: boolean; elsewhere?: boolean }) {
  const ram = new Uint8Array(300 * 2048);
  let y = 192;
  for (let f = 0; f < 300; f++) {
    const m = f * 2048;
    const round = f < 50 || f >= 220 ? 0 : f < 71 ? 1 : f < 100 ? 2 : 3;
    if (f >= 70 && f < 75) y -= 4;
    else if (f >= 75 && f < 100) y = Math.min(255, y + 4);
    else if (f >= 220) y = 192;
    ram[m + 0x50] = round;
    ram[m + 0x52] = f < 100 ? 3 : 2;
    ram[m + 0x15] = y;
    ram[m + 0x11] = f >= 220 ? (o.elsewhere ? 5 : 0) + Math.max(0, f - 240) : Math.min(50, Math.max(0, f - 20));
  }
  let vram = "";
  for (let f = 0; f < 300; f++) vram += `${f} 3F00 1000 1\n`;
  if (o.clear !== false) vram += "100 2000 1024 1\n";
  return { ram, vram };
}

describe("the lives lesson", () => {
  test("the hang, the hop, the life, the clear and the start again are read off memory and the writes", () => {
    const t = lives({});
    expect(livesMeasures(cells(t.ram), t.vram, LIVES)).toEqual({ hang: 20, rise: 20, to_life: 50, clear_after: 0, screen: 120, from_start: true, lives: [3, 2] });
  });
  test("play that begins again somewhere else is not from the start", () => {
    const t = lives({ elsewhere: true });
    expect(livesMeasures(cells(t.ram), t.vram, LIVES).from_start).toBe(false);
  });
  test("a life taken with the picture never cleared is refused, and colours are not a clear", () => {
    const t = lives({ clear: false });
    expect(() => livesMeasures(cells(t.ram), t.vram, LIVES)).toThrow("the picture was never cleared after the life was taken at frame 100");
  });
});

const COINS: CoinsPlan = {
  kind: "coins", script: "AT 20 80\n", frames: 200, walk_from: 20,
  memory: { coins: ["$66", "$67"], score: ["$60", "$61", "$62", "$63", "$64", "$65"], coin_tiles: [8, 11], points_tiles: [42, 44] },
};

/** A made-up bump at frame 50: a coin, its picture turning every second frame through tiles 8 to 11, rises 3 a frame from y 100 for 10 frames and falls 2 a frame for 8; then the points, tile 42, float up a pixel every second frame for 40. The bar's score and coins are written on the bump, the level long before. */
function coins(o: { score?: boolean; coin?: boolean }) {
  const ram = new Uint8Array(200 * 2048);
  for (let f = 0; f < 200; f++) {
    const m = f * 2048;
    ram.fill(0xff, m + 0x200, m + 0x300);
    ram[m + 0x67] = f >= 50 ? 1 : 0;
    ram[m + 0x63] = f >= 50 && o.score !== false ? 2 : 0;
    if (f >= 50 && f < 68 && o.coin !== false) ram.set([f < 60 ? 100 - 3 * (f - 50) : 73 + 2 * (f - 59), 8 + (((f - 50) >> 1) % 4), 0, 80], m + 0x210);
    if (f >= 68 && f < 108 && o.coin !== false) ram.set([73 - ((f - 68) >> 1), 42, 0, 80], m + 0x210);
  }
  return { ram, vram: "10 2000 1024 1\n50 2042 6 1\n50 204A 3 1\n" };
}

describe("the coins lesson", () => {
  test("the bump, the bar, the coin's flight and the points are read off memory and the writes", () => {
    const t = coins({});
    expect(coinsMeasures(cells(t.ram), t.vram, COINS)).toEqual({
      score_too: true, bar_tiles: 9, coin_frames: 18, coin_rise: 27, coin_pictures: 4, picture_frames: 2, points_frames: 40, points_rise: 19,
    });
  });
  test("a coin counted with the score unchanged is told apart", () => {
    const t = coins({ score: false });
    expect(coinsMeasures(cells(t.ram), t.vram, COINS).score_too).toBe(false);
  });
  test("a bump with no coin seen is refused", () => {
    const t = coins({ coin: false });
    expect(() => coinsMeasures(cells(t.ram), t.vram, COINS)).toThrow("no coin was seen after the bump at frame 50");
  });
});
