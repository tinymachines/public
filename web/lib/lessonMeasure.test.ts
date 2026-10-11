import { describe, expect, test } from "bun:test";
import { cells, jumpMeasures, padOf, parseScript, runMeasures, sweeps, type JumpPlan, type RunPlan } from "./lessonMeasure";

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
