import { describe, expect, test } from "bun:test";
import { cells, jumpMeasures, parseScript, type JumpPlan } from "./lessonMeasure";

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
