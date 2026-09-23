import { describe, expect, test } from "bun:test";
import { CLOSE, DOWN, LEFT, OPEN, OPEN_2, press, release, RIGHT, rocker, ROLL, UP } from "./rocker";

describe("the cross as a mechanism", () => {
  test("a thumb rolled round the key reads the eight contacts in order, and nothing else", () => {
    const r = rocker();
    const seen: number[] = [];
    // Clockwise from the top, a fine sweep at the arms' radius.
    for (let deg = -90; deg < 270; deg += 2) {
      const a = (deg * Math.PI) / 180;
      const bits = press(r, 0.8 * Math.cos(a), 0.8 * Math.sin(a));
      if (seen[seen.length - 1] !== bits) seen.push(bits);
    }
    // The eight, and then the top again as the roll closes.
    expect(seen).toEqual([...ROLL, UP]);
  });

  test("opposite directions never close together, anywhere on the key", () => {
    for (let x = -1.4; x <= 1.4; x += 0.05) {
      for (let y = -1.4; y <= 1.4; y += 0.05) {
        const r = rocker();
        const bits = press(r, x, y);
        expect((bits & UP) && (bits & DOWN), `${x},${y}`).toBeFalsy();
        expect((bits & LEFT) && (bits & RIGHT), `${x},${y}`).toBeFalsy();
      }
    }
  });

  test("the fulcrum is dead, a lifted thumb releases, and past the key the pad lets go", () => {
    const r = rocker();
    expect(press(r, 0, 0)).toBe(0);
    expect(press(r, 0.1, -0.1)).toBe(0);
    expect(press(r, 0, -0.9)).toBe(UP);
    expect(release(r)).toBe(0);
    expect(press(r, 0, -0.9)).toBe(UP);
    expect(press(r, 0, -1.6)).toBe(0);
  });

  test("a contact that has closed stays closed until the tilt falls below the lower threshold", () => {
    const r = rocker();
    expect(press(r, 0, -(CLOSE + 0.02))).toBe(UP);
    expect(press(r, 0, -(OPEN + 0.02)), "still closed between the two thresholds").toBe(UP);
    expect(press(r, 0, -(OPEN - 0.02)), "open below the lower one").toBe(0);
    expect(press(r, 0, -(OPEN + 0.02)), "and not closed again until the upper one").toBe(0);
  });

  test("a diagonal needs the firmer tilt for its second contact, so a cardinal is easy to hold", () => {
    const r = rocker();
    expect(press(r, 0.35, -0.9), "a little to the right of straight up is still up").toBe(UP);
    expect(press(r, 0.5, -0.9), "further over, the corner").toBe(UP | RIGHT);
    expect(press(r, 0.4, -0.9), "the second contact lets go later than it closed").toBe(UP | RIGHT);
    expect(press(r, OPEN_2 - 0.02, -0.9)).toBe(UP);
  });
});
