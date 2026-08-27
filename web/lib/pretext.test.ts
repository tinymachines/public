import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * The bundle scripts/build-pretext.mjs writes, held against the names
 * lib/vendor/pretext.d.ts declares: a rename upstream fails here, not on a
 * page. Runs the build first so the test never passes on a stale file.
 */
describe("pretext, bundled from the submodule", () => {
  test("the bundle exports what the types declare", async () => {
    const { execSync } = await import("node:child_process");
    execSync("bun scripts/build-pretext.mjs", { cwd: process.cwd(), stdio: "pipe" });
    const file = path.join(process.cwd(), "lib", "vendor", "pretext.js");
    expect(fs.statSync(file).size).toBeGreaterThan(10000);
    const mod = await import(file);
    const dts = fs.readFileSync(path.join(process.cwd(), "lib", "vendor", "pretext.d.ts"), "utf8");
    const declared = [...dts.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThanOrEqual(8);
    for (const name of declared) expect(typeof mod[name], name).toBe("function");
  });
});
