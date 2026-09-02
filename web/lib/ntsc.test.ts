import { describe, expect, test } from "bun:test";
import { ntsc } from "./ntsc";

/**
 * The boarded record holds what the /ntsc page shows. These run in deploy
 * stage 1b, so a malformed or gutted data/ntsc.json stops a deploy before
 * the build renders a page with a hole where a measurement should be.
 */
describe("the boarded ntsc record", () => {
  const r = ntsc();

  test("names the commit it was measured at", () => {
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(r.repo).toBe("https://github.com/tinymachines/ntsc-crt");
    expect(r.boarded_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("carries a suite that ran and a mutation run that went red", () => {
    // Floors, not the current totals: the record follows the repository and
    // these must not need editing on every boarding. Zero on any of them
    // would mean the scanner measured nothing, which is the failure this
    // test exists to catch.
    expect(r.tests_green).toBeGreaterThan(0);
    expect(r.mutate_red).toBeGreaterThan(0);
    expect(r.claims_verified).toBeGreaterThan(0);
    expect(r.crates).toBeGreaterThan(0);
    expect(r.transcription_gate_values).toBeGreaterThan(0);
  });

  test("the rates carry the famous figure in the right slot", () => {
    // 60.0988 Hz belongs to the two-frame average, not the full frame: the
    // distinction is one of the three corrections the page is about, so the
    // record getting it backwards would put the page's own story in doubt.
    expect(r.rates.nes_pair_hz.startsWith("60.0988")).toBe(true);
    expect(r.rates.nes_full_hz.startsWith("60.09848")).toBe(true);
    expect(r.rates.broadcast_field_hz.startsWith("59.94")).toBe(true);
  });

  test("the browser throughput is a stamped measurement", () => {
    expect(r.wasm_fps.notch).toBeGreaterThan(0);
    expect(r.wasm_fps.comb3).toBeGreaterThan(0);
    expect(r.wasm_fps.stamp.length).toBeGreaterThan(10);
  });
});
