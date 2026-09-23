import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { NotCurrent, packagePdf } from "../scripts/bench-package.mjs";

/** A bench tree with one package, its manifest and its record, built to be broken one way at a time. */
function bench(edit: (t: { dir: string; pdf: string; record: Record<string, unknown> }) => void = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
  const docs = path.join(root, "docs");
  const dir = path.join(docs, "package", "tm-nesb-009");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(docs, "package-nine.json"), JSON.stringify({ docno: "TM-NESB-009", rev: "C" }));
  const pdf = path.join(dir, "nes-bench-TM-NESB-009-revC.pdf");
  fs.writeFileSync(pdf, "%PDF-1.5 nine");
  const record: Record<string, unknown> = {
    file: "nes-bench-TM-NESB-009-revC.pdf", docno: "TM-NESB-009", rev: "C", pages: 1,
    sha256: createHash("sha256").update(fs.readFileSync(pdf)).digest("hex"),
    commit: "a".repeat(40), epoch: 1, dirty: false,
  };
  edit({ dir, pdf, record });
  fs.writeFileSync(path.join(dir, "built.json"), JSON.stringify(record));
  return root;
}

describe("a bench drawing package is current or refused", () => {
  test("a package the record vouches for, at the checkout's commit, is taken", () => {
    const p = packagePdf(bench(), "package-nine.json", "a".repeat(40));
    expect(p.href).toBe("/nes/bench/nes-bench-TM-NESB-009-revC.pdf");
    expect(p.docno).toBe("TM-NESB-009");
  });

  test("a same-named PDF that is not the file the build wrote is refused", () => {
    const root = bench(({ pdf }) => fs.appendFileSync(pdf, "\n%stale sheet"));
    expect(() => packagePdf(root, "package-nine.json", "a".repeat(40))).toThrow(/not the file the record describes/);
  });

  test("a package built at another commit is stale", () => {
    expect(() => packagePdf(bench(), "package-nine.json", "b".repeat(40))).toThrow(/stale against the sources/);
  });

  test("a package built from a dirty tree is refused", () => {
    const root = bench(({ record }) => { record.dirty = true; });
    expect(() => packagePdf(root, "package-nine.json", "a".repeat(40))).toThrow(/dirty/);
  });

  test("no record, or a record for another package, is refused", () => {
    const none = bench(({ dir }) => { /* the record is written after edit; remove it below */ });
    fs.unlinkSync(path.join(none, "docs", "package", "tm-nesb-009", "built.json"));
    expect(() => packagePdf(none, "package-nine.json", "a".repeat(40))).toThrow(/no built.json/);
    const other = bench(({ record }) => { record.rev = "B"; record.file = "nes-bench-TM-NESB-009-revB.pdf"; });
    expect(() => packagePdf(other, "package-nine.json", "a".repeat(40))).toThrow(/not the package the manifest names/);
    const missing = bench(({ pdf }) => fs.unlinkSync(pdf));
    expect(() => packagePdf(missing, "package-nine.json", "a".repeat(40))).toThrow(/does not exist/);
    expect(new NotCurrent("x")).toBeInstanceOf(Error);
  });
});
