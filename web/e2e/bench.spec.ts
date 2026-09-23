import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * The bench's drawing packages: exactly what the bench's manifests name,
 * and nothing superseded. On 2026-09-23 fourteen earlier revisions of
 * TM-NESB-001 were being served beside the current one, each looking as
 * authoritative as the right one, because the pull copied whatever the
 * package directories held and the bench's build had kept every revision
 * since A. The manifests are the one copy of which file is current
 * (web/scripts/pull-nesdocs.mjs reads them); this holds the served set to
 * them. Skipped by name where the bench checkout is not beside this one.
 */

const BENCH = path.join(__dirname, "..", "..", "..", "nes-bench", "docs");
const MANIFESTS = ["package.json", "package-v2b.json", "package-pad-ble.json"];

test("the bench serves the manifests' packages and none of the superseded revisions", async ({ request }) => {
  test.skip(!fs.existsSync(path.join(BENCH, "package.json")), "no nes-bench checkout beside this one");
  const current = MANIFESTS.map((m) => {
    const j = JSON.parse(fs.readFileSync(path.join(BENCH, m), "utf8")) as { docno: string; rev: string };
    return { docno: j.docno, rev: j.rev, file: `nes-bench-${j.docno}-rev${j.rev}.pdf` };
  });
  expect(current.length).toBe(3);
  for (const c of current) {
    const r = await request.get(`/nes/bench/${c.file}`);
    expect(r.status(), `${c.file} is served`).toBe(200);
    expect(r.headers()["content-type"] ?? "").toContain("pdf");
    // Every earlier revision letter of the same drawing is withdrawn.
    for (let code = "A".charCodeAt(0); code < c.rev.charCodeAt(0); code++) {
      const old = `nes-bench-${c.docno}-rev${String.fromCharCode(code)}.pdf`;
      const o = await request.get(`/nes/bench/${old}`);
      expect(o.status(), `${old} is superseded and must not be served`).toBe(404);
    }
  }
});
