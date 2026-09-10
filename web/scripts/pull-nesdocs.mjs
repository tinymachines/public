/* The console arc's notebook, pulled into the docs tree at build time.
 *
 * Every milestone of the family (the sketch, the chip repositories' A, P
 * and M reports, the console's N plans and reports) is a document in its
 * own repository: the plan written before the code and the report after
 * it, every figure a measurement with its run stamp. Nothing served them.
 * This pulls them into docs/nes/ the way pull-chipdocs.mjs pulls the
 * chip's analyses: read from the sibling checkouts, never retyped, and
 * gitignored (nothing generated is committed; the repositories are the
 * one copy). A missing checkout or a document that stops matching the
 * narrow transforms below THROWS, so a build cannot quietly ship a page
 * with a broken link or raw HTML.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..", "..");
const SIBLINGS = path.join(ROOT, "..");
const OUT = path.join(ROOT, "docs", "nes");

// In the arc's order. `slug` is the page; `description` is authored here
// (a card's one line), the title is the document's own h1.
const DOCS = [
  { repo: "nes", file: "nes-end-to-end-v0_2.md", slug: "sketch", order: 1, description: "The sketch the whole arc runs on: what functional means, the shape, the milestones N0 to N8, the scope session and the decision record." },
  { repo: "nes-bus", file: "n0-report.md", slug: "n0-report", order: 2, description: "N0: the contract. The pin tables, the dot frame and the cartridge edge as one dependency-free crate, held to the recorded runs." },
  { repo: "2a03", file: "a0-report.md", slug: "a0-report", order: 3, description: "A0: the 2A03 at the switch level, bit for bit against its reference with no list of exceptions." },
  { repo: "2a03", file: "a3-report.md", slug: "a3-report", order: 4, description: "A3: first sound. A program's note read off the chip's own output node, and the mixer as a labelled claim." },
  { repo: "2a03", file: "n3-plan.md", slug: "n3-plan", order: 5, description: "N3, written first: the fast 2A03: the 6502's fast core with the decimal adjust disconnected, the APU as measured tables." },
  { repo: "2a03", file: "n3-report.md", slug: "n3-report", order: 6, description: "N3: the fast 2A03 built and held at the pins, the APU's tables measured out of the chip, the stalls frame for frame." },
  { repo: "2c02", file: "p0-report.md", slug: "p0-report", order: 7, description: "P0: the 2C02 at the switch level, its reference replayed, the supply-gated transistors found." },
  { repo: "2c02", file: "p1-report.md", slug: "p1-report", order: 8, description: "P1: the PPU through its harness, the DAC held, the reset-less latches named." },
  { repo: "2c02", file: "p2-report.md", slug: "p2-report", order: 9, description: "P2: sprite 0, the vblank read race and OAM corruption, each pinned by a register program the reference replays blindly." },
  { repo: "2c02", file: "p3-plan.md", slug: "p3-plan", order: 10, description: "P3, written first: the fast PPU, a stepper whose sequencer is a table measured out of the switches." },
  { repo: "2c02", file: "p3-report.md", slug: "p3-report", order: 11, description: "P3: the fast PPU dot for dot with the chip on three worlds, the write path, the blank picture." },
  { repo: "ntsc-crt", file: "ntsc-crt-handoff-v0_3.md", slug: "ntsc-spec", order: 12, description: "The NTSC signal path's specification, v0.3, ratified: sources, the decoder's filters, the CRT stages, the capture." },
  { repo: "ntsc-crt", file: "m0-report.md", slug: "m0-report", order: 13, description: "M0: the grid, the residues and the data every later stage stands on." },
  { repo: "ntsc-crt", file: "m1-report.md", slug: "m1-report", order: 14, description: "M1: the encoders against their reference." },
  { repo: "ntsc-crt", file: "m2-report.md", slug: "m2-report", order: 15, description: "M2: the decoder filters, notch and combs, held to their reference and to each other." },
  { repo: "ntsc-crt", file: "m3-report.md", slug: "m3-report", order: 16, description: "M3: the CRT stages, every parameter authored and labelled." },
  { repo: "ntsc-crt", file: "m4-report.md", slug: "m4-report", order: 17, description: "M4: the capture source, the synthetic roundtrip, and the first real console records scored against the family's own synthesis." },
  { repo: "ntsc-crt", file: "m5-report.md", slug: "m5-report", order: 18, description: "M5: the self-counts, the divergences and the spec's ratification." },
  { repo: "ntsc-crt", file: "divergences.md", slug: "ntsc-divergences", order: 19, description: "Where the signal path knowingly departs from the published references, each with its reason." },
  { repo: "nes", file: "n4-report.md", slug: "n4-report", order: 20, description: "N4: the mainboard's glue, each part held to its datasheet and labelled authored." },
  { repo: "nes", file: "n5-report.md", slug: "n5-report", order: 21, description: "N5: the console. Both chips on one clock, the seam held to the switch-level chips, blargg's ROMs run end to end." },
  { repo: "nes", file: "n6-plan.md", slug: "n6-plan", order: 22, description: "N6, written first: the picture through ntsc-crt, and the capture comparison with its tolerances stated." },
  { repo: "nes", file: "n6-report.md", slug: "n6-report", order: 23, description: "N6: the picture, the blank picture measured on the PPU, the capture roundtrip's figures recorded and not fitted." },
  { repo: "nes", file: "n7-plan.md", slug: "n7-plan", order: 24, description: "N7, written first: the sound through the board's audio stage read off the schematic." },
  { repo: "nes", file: "n7-report.md", slug: "n7-report", order: 25, description: "N7: the sound, blargg's mixer ROMs cancelling, his real-hardware recordings beside." },
  { repo: "nes", file: "n8-plan.md", slug: "n8-plan", order: 26, description: "N8, written first: the shell, the GPU picture, the pacing, the second target." },
  { repo: "nes", file: "n8-report.md", slug: "n8-report", order: 27, description: "N8: the shell built and checked headlessly, the GPU picture held to the CPU chain, the wasm target measured." },
  { repo: "nes-bench", file: "bench-plan.md", slug: "bench-plan", order: 28, description: "The bench, written first: the part and the model under one input history, a controller-port bridge, relays and the scope under one script, B0 to B3 with their checks." },
  { repo: "nes-bench", file: "wiring.md", slug: "bench-wiring", order: 29, description: "The bridge's wiring: the register that is the pad, the level shifter, the ESP32-C6's pins, the head's relays, and the meter checks that come before power." },
  { repo: "nes-bench", file: "script.md", slug: "bench-script", order: 30, description: "The bench script: one file's words for the head and the model, bytes by latch index, the arm, the trigger, the capture." },
  { repo: "nes-bench", file: "bench-report.md", slug: "bench-report", order: 31, description: "The bench's running report: B0 to B3 on the machine side, each tool green on a synthesis with a sabotage run that goes red; the die answered B0's DMC question first and the model changed for it." },
  { repo: "nes-bench", file: "bench-build-v1-v2.md", slug: "bench-build", order: 32, description: "The electronics review's sheets: the bridge as a schematic (v1 and v1b), the extended bridge (v2), one poll as timing lanes, and an original pad as a phone's pad; parts lists and the build order." },
  { repo: "nes-bench", file: "bench-v1b-uno.md", slug: "bench-v1b", order: 33, description: "v1b, the bridge on an Arduino UNO with everything at five volts, which is the version built first: why the level shifters go away, the pin table, and the four things writing the firmware proved the plan had wrong." },
  { repo: "nes-bench", file: "build-guide.md", slug: "build-guide", order: 34, description: "The bench built in five sittings, one command each: what to wire pin by pin, what the command then measures, which photographs to take, and where each sitting stands. Generated from the tool that runs it." },
  { repo: "nes-bench", file: "cheat-sheet.md", slug: "cheat-sheet", order: 37, description: "The bench's cheat sheet: the two breakouts pin by pin (port pin, NES harness colour, breakout lead, where it goes), the head's four jumpers, and every pin of every chip with what it does on the part and what it is wired to here. Generated from the schematic, the lab log and the bring-up tool." },
  { repo: "nes-bench", file: "parts.md", slug: "parts", order: 36, description: "The bench's bill of materials, one table per schematic sheet plus a single list of everything to gather. Generated from the same file that draws the schematics, so a part cannot be on a sheet and missing from the list." },
  { repo: "nes-bench", file: "lab-notebook.md", slug: "lab-notebook", order: 35, description: "The lab notebook: the bench being wired one step at a time, every attempt including the ones that failed, each step ending in a measurement rather than an opinion. Generated from the bring-up tool's log, never typed." },
];

// The bench's schematics, drawn by its generator and held to its wiring
// tables (tools/check-sheets.py): served beside the console's figures,
// and the build document's image links pointed at them.
const SHEETS = ["bench-v1.svg", "bench-v1b-1.svg", "bench-v1b-2.svg", "bench-v2.svg",
                "bench-v2b-1.svg", "bench-v2b-2.svg", "bench-v2b-3.svg", "bench-v2b-4.svg",
                "breadboard-v1b.svg", "logical-timing.svg", "pad-adapter.svg"];

// The lab notebook's photographs. Whatever is in nes-bench/docs/lab/ is
// served from /nes/lab/; the notebook only links a picture that exists,
// so a page can never carry a broken one, and a picture pushed later
// appears as soon as the notebook is re-rendered.
const LAB = path.join(SIBLINGS, "nes-bench", "docs", "lab");

// The bench's drawing, derived from its wiring tables: refused if stale,
// then served as-is beside the console's other figures.
const BENCH = path.join(SIBLINGS, "nes-bench");
const check = spawnSync("python3", [path.join(BENCH, "tools", "draw-bench.py"), "--check"], { encoding: "utf8" });
if (check.status !== 0) {
  throw new Error(`nes-bench/docs/bench.svg is not current: ${check.stdout}${check.stderr}`);
}
const sheets = spawnSync("python3", [path.join(BENCH, "tools", "check-sheets.py")], { encoding: "utf8" });
if (sheets.status !== 0) {
  throw new Error(`nes-bench's sheets disagree with its wiring or its generator: ${sheets.stdout}${sheets.stderr}`);
}
// The schematics' own rule check. Clean as of 2026-09-09, so it can be
// a gate: a net with one end, a duplicated designator, a supply pin
// nobody mentioned. It cannot catch a connector drawn with the right
// connections and the wrong pinout, which is what check-sheets.py's
// port-pinout comparison is for.
const erc = spawnSync("python3", [path.join(BENCH, "tools", "netlist.py"), "--erc"], { encoding: "utf8" });
if (erc.status !== 0) {
  throw new Error(`nes-bench's schematics do not pass their own rule check: ${erc.stdout}${erc.stderr}`);
}
// The bring-up tool's guards, driven with scripted answers. It is
// interactive, so nothing else here would ever run its refusals, and a
// guard that has never been seen to refuse is not a guard.
const guards = spawnSync("python3", [path.join(BENCH, "tools", "check-bringup.py")], { encoding: "utf8" });
if (guards.status !== 0) {
  throw new Error(`nes-bench's bring-up guards do not hold: ${guards.stdout}${guards.stderr}`);
}
// The notebook is generated from the bring-up log. Publishing a stale one
// would put a claim on the site that its own log does not support.
for (const [tool, what] of [["lab-notebook.py", "lab notebook"], ["build-guide.py", "build guide"], ["parts.py", "parts list"], ["cheatsheet.py", "cheat sheet"]]) {
  const r = spawnSync("python3", [path.join(BENCH, "tools", tool), "--check"], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`nes-bench's ${what} is not current: ${r.stdout}${r.stderr}`);
  }
}
const benchOut = path.join(ROOT, "web", "public", "nes", "bench");
fs.mkdirSync(benchOut, { recursive: true });
fs.copyFileSync(path.join(BENCH, "docs", "bench.svg"), path.join(ROOT, "web", "public", "nes", "bench.svg"));
// A renamed sheet leaves its old self behind, and a served file nothing
// points at is a file somebody eventually links to. bench-v1b.svg
// became two sheets and both copies sat here until this existed.
const wanted = new Set([...SHEETS, ...SHEETS.map((f) => f.replace(/\.svg$/, ".png"))]);
for (const f of fs.readdirSync(benchOut)) {
  if (/\.(svg|png)$/.test(f) && !wanted.has(f)) {
    fs.rmSync(path.join(benchOut, f));
    console.log(`pull-nesdocs: dropped ${f}, no longer a sheet`);
  }
}
for (const f of SHEETS) {
  fs.copyFileSync(path.join(BENCH, "docs", f), path.join(benchOut, f));
}
// The sheets as PNGs too, for reading offline on a phone. Rendered from
// the committed SVGs on every deploy, and gitignored: a PNG is a
// photograph of a drawing, so there is no check that could tell whether
// a committed one still matched, and PNG bytes are not reproducible
// across renderer versions anyway. If no renderer is installed this is
// a warning, not a failure: the SVGs are the artefact.
const png = spawnSync("python3", [path.join(BENCH, "tools", "render-png.py"),
                                  path.join(ROOT, "web", "public", "nes", "bench")], { encoding: "utf8" });
if (png.status !== 0) {
  console.warn(`pull-nesdocs: the sheet PNGs were not rendered, serving SVGs only: ${png.stdout}${png.stderr}`);
}

// The fabrication handoff: KiCad and Protel netlists and a BOM per
// sheet, written from the committed schematics. --check first, so a
// part with no footprint stops the deploy rather than shipping a
// netlist with an empty field in it.
const fab = spawnSync("python3", [path.join(BENCH, "tools", "export-netlist.py"), "--check"], { encoding: "utf8" });
if (fab.status !== 0) {
  throw new Error(`nes-bench has a part with no footprint: ${fab.stdout}${fab.stderr}`);
}
const pcb = spawnSync("python3", [path.join(BENCH, "tools", "make-pcb.py"), "--plot"], { encoding: "utf8" });
if (pcb.status !== 0) {
  console.warn(`pull-nesdocs: the board was not rebuilt (KiCad's pcbnew may not be installed here): ${pcb.stdout}${pcb.stderr}`);
}
const fabw = spawnSync("python3", [path.join(BENCH, "tools", "export-netlist.py")], { encoding: "utf8" });
if (fabw.status !== 0) {
  throw new Error(`nes-bench's netlist export failed: ${fabw.stdout}${fabw.stderr}`);
}
{
  const fabDir = path.join(BENCH, "docs", "fab");
  const dst = path.join(ROOT, "web", "public", "nes", "bench", "fab");
  fs.mkdirSync(dst, { recursive: true });
  const copyTree = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from, { withFileTypes: true })) {
      if (f.isDirectory()) copyTree(path.join(from, f.name), path.join(to, f.name));
      else fs.copyFileSync(path.join(from, f.name), path.join(to, f.name));
    }
  };
  copyTree(fabDir, dst);
  const count = (d) => fs.readdirSync(d, { withFileTypes: true })
    .reduce((n, f) => n + (f.isDirectory() ? count(path.join(d, f.name)) : 1), 0);
  console.log(`pull-nesdocs: ${count(fabDir)} fabrication files`);
}

// The drawing package: framed sheets and one PDF, built from the same
// committed SVGs. Served, not committed, like the PNGs.
const pkg = spawnSync("python3", [path.join(BENCH, "tools", "make-package.py")], { encoding: "utf8" });
if (pkg.status !== 0) {
  console.warn(`pull-nesdocs: the drawing package was not built: ${pkg.stdout}${pkg.stderr}`);
} else {
  // One directory per package now (v1b is TM-NESB-001, v2b is -002),
  // so the PDFs are a level down. They are served flat: the file name
  // already carries the drawing number.
  const pkgDir = path.join(BENCH, "docs", "package");
  for (const d of fs.readdirSync(pkgDir, { withFileTypes: true })) {
    const dir = d.isDirectory() ? path.join(pkgDir, d.name) : pkgDir;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".pdf")) {
        fs.copyFileSync(path.join(dir, f), path.join(ROOT, "web", "public", "nes", "bench", f));
        console.log(`pull-nesdocs: ${f}`);
      }
    }
    if (!d.isDirectory()) break;
  }
}

const labOut = path.join(ROOT, "web", "public", "nes", "lab");
fs.mkdirSync(labOut, { recursive: true });
let labCount = 0;
if (fs.existsSync(LAB)) {
  for (const f of fs.readdirSync(LAB)) {
    if (/\.(jpe?g|png|webp)$/i.test(f)) {
      fs.copyFileSync(path.join(LAB, f), path.join(labOut, f));
      labCount++;
    }
  }
}

function transform(doc, md) {
  let s = md;
  // A blockquote pointer at the top of a copy (nes-bus's sketch) is not
  // the document.
  s = s.replace(/^(> .*\n)+\n/, "");
  // Cross-links between the pulled documents, however they were written
  // upstream (a bare file, docs/file, a path into a sibling repository).
  for (const d of DOCS) {
    const local = `/docs/nes/${d.slug}`;
    s = s.replace(new RegExp(`\\]\\((?:\\.\\./)*(?:[a-z0-9-]+/)?(?:docs/)?${d.file.replace(".", "\\.")}(#[^)]*)?\\)`, "g"), (_, hash) => `](${local}${hash ?? ""})`);
  }
  // The build document's sheets, served from /nes/bench/.
  for (const f of SHEETS) {
    s = s.replace(new RegExp(`\\]\\(${f.replace(".", "\\.")}\\)`, "g"), `](/nes/bench/${f})`);
  }
  // The lab notebook's photographs, served from /nes/lab/.
  s = s.replace(/\]\(lab\/([^)]+)\)/g, "](/nes/lab/$1)");
  let fenced = false;
  for (const [i, line] of s.split("\n").entries()) {
    if (/^```/.test(line)) fenced = !fenced;
    if (!fenced && /<(p|img|sub|a|div|table)\b/i.test(line)) {
      throw new Error(`${doc.repo}/docs/${doc.file}:${i + 1}: raw HTML ("${line.slice(0, 60)}"); teach pull-nesdocs.mjs the shape.`);
    }
  }
  return s;
}

fs.mkdirSync(OUT, { recursive: true });
for (const d of DOCS) {
  const src = path.join(SIBLINGS, d.repo, "docs", d.file);
  if (!fs.existsSync(src)) {
    throw new Error(`${src} is missing: the ${d.repo} checkout must sit beside this repository with its docs`);
  }
  const raw = fs.readFileSync(src, "utf8");
  const h1 = raw.match(/^# (.+)$/m);
  if (!h1) throw new Error(`${d.repo}/docs/${d.file}: no h1 to take the title from`);
  const body = transform(d, raw);
  const source = `https://github.com/tinymachines/${d.repo}/blob/main/docs/${d.file}`;
  const front = `---\ntitle: "${h1[1].replace(/"/g, '\\"')}"\ndescription: "${d.description.replace(/"/g, '\\"')}"\norder: ${d.order}\n---\n\n`;
  const note = `\n\n*Pulled at build time from [${d.repo}/docs/${d.file}](${source}); the repository is the one copy.*\n`;
  fs.writeFileSync(path.join(OUT, `${d.slug}.md`), front + body + note);
}

const rows = DOCS.map((d) => `| [${d.slug}](/docs/nes/${d.slug}) | ${d.description} |`).join("\n");
fs.writeFileSync(
  path.join(OUT, "index.md"),
  `---
title: The console arc's notebook
description: Every milestone's plan and report, from the sketch to the shell, pulled from the repositories at build time.
order: 30
---

# The console arc's notebook

The family's rule is that a milestone is a document twice: the plan,
written before the code with its checks and tolerances stated, and the
report after it, every figure a measurement with its run stamp. Those
documents live in their own repositories and this tree pulls them in at
build time, in the arc's order, so a reader has them in one place and
the repositories stay the one copy. Where a report says a number, it is
the number the run printed; where it says authored, it is a claim
labelled as one.

| | |
|---|---|
${rows}
`,
);
console.log(`pull-nesdocs: ${DOCS.length} documents from the sibling checkouts`);
