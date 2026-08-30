import { describe, expect, test } from "bun:test";
import { engineKind, inPage, refusal, runHere, runOverApi } from "../app/[lang]/6502/games/localEngine";

/**
 * The engine seam's refusal, and who may clear it.
 *
 * The seam keeps one reason (`refusal()`) for the settings screen. It used to
 * be cleared by any frame that landed, which was right while the only refusal
 * WAS the transport's: a frame that lands proves the transport works. With two
 * in-page engines a refusal can also come from a SWITCH (rung 1 asked of a
 * release whose glue has no HybridMachine), and the very next frame landing on
 * the old engine wiped the one message the refusal exists to show (caught in
 * review, 2026-08-30). So the reason carries its source: a landing frame
 * clears only a transport refusal, and a switch refusal stays until a switch
 * lands or the API takes over.
 *
 * The worker is faked: these tests are about the seam's state machine, not
 * the chip. The fake answers `hello` per engine the way the real worker does,
 * rung 0 greeting and rung 1 refusing by name, until a test hands it a
 * different script. The module holds its state between tests, so this file
 * reads in order, as one story.
 */

type Wire = { id: number; path: string; engine: "chip" | "hybrid" };
type Outcome = { ok: true; answer: unknown } | { ok: false; error: string };

const NO_RUNG_1 = "this chip release has no rung 1 (HybridMachine); the 6502 site needs a newer release";
const FRAME: Outcome = { ok: true, answer: { machine: null, observe: { watch: {} } } };
let answer = (m: Wire): Outcome => (m.engine === "hybrid" && m.path === "hello" ? { ok: false, error: NO_RUNG_1 } : FRAME);

class FakeWorker {
  onmessage: ((e: { data: Record<string, unknown> }) => void) | null = null;
  onerror: unknown = null;
  postMessage(m: Wire) {
    queueMicrotask(() => this.onmessage?.({ data: { id: m.id, ...answer(m) } }));
  }
}
(globalThis as { Worker?: unknown }).Worker = FakeWorker;

/** One frame over the installed transport, the way console.js posts it. */
const post = () => (globalThis as { tm6502Transport?: (p: string, b: object) => Promise<unknown> }).tm6502Transport!("step", {});

describe("the refusal, and who may clear it", () => {
  test("rung 0 greets, the frames land here, nothing is refused", async () => {
    await runHere();
    expect(inPage()).toBe(true);
    expect(engineKind()).toBe("chip");
    await post();
    expect(refusal()).toBeNull();
  });

  test("a refused switch keeps its reason while frames land on the old engine", async () => {
    await expect(runHere("hybrid")).rejects.toThrow("no rung 1");
    expect(engineKind()).toBe("chip");
    expect(refusal()).toContain("HybridMachine");
    await post();
    // The frame that just landed proves rung 0 works; it says nothing about
    // the switch that was refused, so the reason must still be on the screen.
    expect(refusal()).toContain("HybridMachine");
  });

  test("a transport refusal IS cleared by the next frame that lands", async () => {
    runOverApi();
    expect(refusal()).toBeNull();
    await runHere();
    const fine = answer;
    answer = () => ({ ok: false, error: "the chip's thread hiccuped" });
    await expect(post()).rejects.toThrow("hiccuped");
    expect(refusal()).toContain("hiccuped");
    answer = fine;
    await post();
    expect(refusal()).toBeNull();
  });

  test("when the release ships rung 1, the switch lands and the reason goes", async () => {
    await expect(runHere("hybrid")).rejects.toThrow();
    expect(refusal()).not.toBeNull();
    const fine = answer;
    answer = () => FRAME;
    await runHere("hybrid");
    expect(engineKind()).toBe("hybrid");
    expect(refusal()).toBeNull();
    answer = fine;
  });

  test("handing the frames to the API clears whatever reason was standing", async () => {
    await runHere(); // back on rung 0, so the hybrid wish is a real switch again
    await expect(runHere("hybrid")).rejects.toThrow();
    expect(refusal()).not.toBeNull();
    runOverApi();
    expect(refusal()).toBeNull();
    expect(inPage()).toBe(false);
  });
});
