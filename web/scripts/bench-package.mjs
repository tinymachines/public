/**
 * A drawing package of the bench, as the roof takes it: the manifest names
 * the docno and the revision, the record beside the PDF (built.json, written
 * by the build that wrote the PDF) says what the file is and where it came
 * from, and the pull refuses on any way the two could be lying to each
 * other (2026-09-23, the bench side and this one, after fourteen superseded
 * revisions were served and a same-named stale PDF was found possible):
 *
 *   - no record beside the PDF: the file was not written by the build;
 *   - the record's file, docno or rev disagree with the manifest's;
 *   - the PDF does not hash to the record: not the file the build wrote;
 *   - the record's commit is not the checkout's head: stale against the
 *     sources (a plain equality on purpose: builds are reproducible, so
 *     every commit there rebuilds the three, and there is no source list
 *     to keep in step);
 *   - the record says the tree was dirty: the sheets came from somebody's
 *     working copy, so the commit is not a claim about them.
 *
 * nes-bench's make-package.py --check asks the same questions on its side,
 * so the first anybody hears of a stale package is there, not a red deploy.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export class NotCurrent extends Error {}

/**
 * The package a manifest names, checked against its record. `head` is the
 * bench checkout's full commit. Returns the docno, the file and where it
 * is; throws NotCurrent with the reason otherwise.
 */
export function packagePdf(bench, manifest, head) {
  const m = JSON.parse(fs.readFileSync(path.join(bench, "docs", manifest), "utf8"));
  const file = `nes-bench-${m.docno}-rev${m.rev}.pdf`;
  const dir = path.join(bench, "docs", "package", m.docno.toLowerCase());
  const pdf = path.join(dir, file);
  const where = `${manifest} (${m.docno} rev ${m.rev})`;
  if (!fs.existsSync(pdf)) throw new NotCurrent(`${where}: ${pdf} does not exist; build the package in nes-bench first.`);
  const recordPath = path.join(dir, "built.json");
  if (!fs.existsSync(recordPath)) throw new NotCurrent(`${where}: no built.json beside the PDF; the file was not written by the build (make-package.py writes one).`);
  const r = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  if (r.file !== file || r.docno !== m.docno || r.rev !== m.rev) {
    throw new NotCurrent(`${where}: built.json describes ${r.docno} rev ${r.rev} (${r.file}), not the package the manifest names.`);
  }
  const sha = createHash("sha256").update(fs.readFileSync(pdf)).digest("hex");
  if (sha !== r.sha256) throw new NotCurrent(`${where}: ${file} is not the file the record describes (${sha.slice(0, 12)} against ${String(r.sha256).slice(0, 12)}); rebuild the package.`);
  if (r.dirty === true) throw new NotCurrent(`${where}: the record says the tree was dirty when the package was built, so its commit is not a claim about the sheets; commit and rebuild it.`);
  if (typeof r.commit !== "string" || r.commit !== head) {
    throw new NotCurrent(`${where}: built at ${String(r.commit).slice(0, 7)} and the checkout is at ${String(head).slice(0, 7)}: stale against the sources, rebuild it.`);
  }
  return { docno: m.docno, rev: m.rev, file, dir, href: `/nes/bench/${file}` };
}
