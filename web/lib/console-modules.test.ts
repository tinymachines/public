import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { consoleModules, FILES, PATCHES, patch, SRC, upstreamCommit } from "./console-modules";

/**
 * The console modules come from the 6502 checkout with four patches on them.
 * These hold that the patches still find their lines upstream (the build
 * would otherwise ship a console resolving the wrong API), that a module
 * which stops matching is refused rather than shipped, and that everything
 * else crosses byte for byte.
 */

describe("the console modules, read from the 6502 tree", () => {
  const files = consoleModules();

  test("every file the console needs is read, and only those", () => {
    expect(files.map((f) => f.rel)).toEqual([...FILES]);
    for (const f of files) expect(f.bytes.length, f.rel).toBeGreaterThan(0);
  });

  test("the unpatched files are byte for byte upstream's", () => {
    for (const f of files.filter((f) => !f.patched)) {
      const up = fs.readFileSync(path.join(SRC, f.rel));
      expect(createHash("sha256").update(f.bytes).digest("hex"), f.rel).toBe(
        createHash("sha256").update(up).digest("hex"),
      );
    }
  });

  test("each patch was applied exactly once, and its replacement is present", () => {
    for (const p of PATCHES) {
      const f = files.find((f) => f.rel === p.file)!;
      const text = f.bytes.toString("utf8");
      expect(text.split(p.replace).length - 1, `${p.file}: ${p.why}`).toBe(1);
      expect(text.includes(p.find), `${p.file} still carries the upstream line`).toBe(false);
    }
  });

  test("both modules' API statement reads the page before falling back to this origin", () => {
    for (const rel of ["game.js", "registry.js"]) {
      const text = files.find((f) => f.rel === rel)!.bytes.toString("utf8");
      // The statement itself, not the file: the patch's own comment names the
      // fallback first, which is what a naive indexOf over the file tripped on.
      const m = text.match(/^(?:export )?const API = [^;]*;/m);
      expect(m, rel).not.toBeNull();
      const stmt = m![0];
      expect(stmt.startsWith(rel === "registry.js" ? "export const" : "const"), rel).toBe(true);
      expect(stmt.indexOf("[data-chip-api]"), rel).toBeGreaterThan(0);
      expect(stmt.indexOf("${location.origin}/api"), rel).toBeGreaterThan(stmt.indexOf("[data-chip-api]"));
    }
  });

  test("every generated module parses as an ES module", () => {
    // A real module parse (import.meta, export), not `new Function`, which
    // rejects module syntax. A comment between `export` and `const` is legal,
    // so this did not catch the first draft's registry.js anchor; the
    // statement test above did, and a diff of the output did first.
    const t = new Bun.Transpiler({ loader: "js" });
    for (const f of files.filter((f) => f.rel.endsWith(".js"))) {
      expect(() => t.transformSync(f.bytes.toString("utf8")), f.rel).not.toThrow();
    }
  });

  test("the upstream commit is known", () => {
    expect(upstreamCommit()).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("a module that stops matching is refused", () => {
  test("a missing anchor throws, naming the file and the reason", () => {
    expect(() => patch("game.js", "const API = somethingElse;")).toThrow(/game\.js matches the patch .* 0 times/);
  });

  test("an anchor that appears twice throws rather than patching the first", () => {
    const p = PATCHES[0];
    expect(() => patch("game.js", p.find + "\n" + p.find)).toThrow(/2 times, not once/);
  });

  test("a file with no patch passes through untouched", () => {
    expect(patch("console.js", "anything")).toBe("anything");
  });
});
