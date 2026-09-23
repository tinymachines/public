import { describe, expect, test } from "bun:test";
import { latest } from "./latest";

describe("the newest value, a few times a second", () => {
  test("a stream of pushes publishes at the interval, the newest each time", async () => {
    const seen: number[] = [];
    const b = latest<number>(40, (v) => seen.push(v));
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 200) {
      b.push(i++);
      await new Promise((r) => setTimeout(r, 2));
    }
    await new Promise((r) => setTimeout(r, 60));
    expect(i, "the pushes came far faster than the interval").toBeGreaterThan(30);
    expect(seen.length, "published about five times in 200ms, not once a push").toBeLessThanOrEqual(7);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[seen.length - 1], "the last one published is the newest").toBe(i - 1);
    for (let k = 1; k < seen.length; k++) expect(seen[k]).toBeGreaterThan(seen[k - 1]);
  });

  test("now publishes at once and drops what was pending", async () => {
    const seen: number[] = [];
    const b = latest<number>(50, (v) => seen.push(v));
    b.push(1);
    b.push(2);
    b.now(9);
    expect(seen).toEqual([9]);
    await new Promise((r) => setTimeout(r, 80));
    expect(seen, "the pending 2 was dropped by now").toEqual([9]);
    expect(b.count()).toBe(1);
  });
});
