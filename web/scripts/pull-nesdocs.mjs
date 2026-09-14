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
import matter from "gray-matter";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..", "..");
const SIBLINGS = path.join(ROOT, "..");
const OUT = path.join(ROOT, "docs", "nes");

// `slug` is the page; `description` is authored here (a card's one line);
// the title is the document's own h1 unless `title` gives one of ours.
// `group` places it in the notebook (GROUPS, below the artefacts).
// The printable artefacts the pull builds and serves from /nes/bench/.
// A document that names one of these gets a link to it under its h1,
// and the pull refuses to publish a link to a file it did not produce.
const ARTEFACTS = {
  v1b: { label: "v1b drawing package, TM-NESB-001 (PDF)", href: "/nes/bench/nes-bench-TM-NESB-001-revF.pdf" },
  v2b: { label: "v2b drawing package, TM-NESB-002 (PDF)", href: "/nes/bench/nes-bench-TM-NESB-002-revA.pdf" },
  board: { label: "v2b board, top copper (SVG)", href: "/nes/bench/fab/bench-v2b/bench-v2b-top-copper.svg" },
};

// The notebook's parts, in reading order. The arc wrote its documents in
// time order, which put the chips, the signal path, the console and the
// bench's electronics in one list; a reader looking for how to wire the
// bench had to scroll past every chip report to find it. Each document
// names its group below, the index gets a heading per group, and a
// document's `order` is its place in this reading (owner's call,
// 2026-09-14). /nes links to each heading's anchor, so renaming a heading
// breaks a door: e2e/nes-notebook.spec.ts follows every one.
const GROUPS = [
  { key: "start", heading: "Where it started", intro: "The sketch the whole console is built on, written before any of the code.", ja: { heading: "始まり", intro: "コンソール全体が拠って立つスケッチ。コードより先に書かれた。" } },
  { key: "chips", heading: "The chips", intro: "The contract every chip speaks, then the NES's two chips at their switches (the 2A03 CPU and sound, the 2C02 picture chip) and the fast versions built from them.", ja: { heading: "チップ", intro: "すべてのチップが話す規約、スイッチのレベルの NES の二つのチップ（CPU と音の 2A03、絵の 2C02）、そしてそこから組んだ高速版。" } },
  { key: "signal", heading: "The signal", intro: "The composite video between the console and the television: the specification, each milestone of ntsc-crt, and where it knowingly departs from the references.", ja: { heading: "信号", intro: "コンソールとテレビの間のコンポジット映像: 仕様、ntsc-crt の各マイルストーン、そして参照から意図して離れる箇所。" } },
  { key: "console", heading: "The console", intro: "Both chips on one board: the glue, the machine running test ROMs, then its picture, its sound and the window it plays in.", ja: { heading: "コンソール", intro: "一枚の基板に載った二つのチップ: 糊、テスト ROM を走らせる機械、そしてその絵、音、遊ぶための窓。" } },
  { key: "bench-plan", heading: "Planning the bench", intro: "The bench puts a real console and the model under the same controller presses. These were written first.", ja: { heading: "ベンチの計画", intro: "ベンチは実機と模型を同じコントローラ入力の下に置く。以下は先に書かれたもの。" } },
  { key: "bench-build", heading: "Building the bench", intro: "The bridge as drawn and as built: schematics, parts, the pin-by-pin cheat sheet and the build guide.", ja: { heading: "ベンチを組む", intro: "図面の上のブリッジと、組み上がったブリッジ: 回路図、部品、ピンごとの早見表、組み立てガイド。" } },
  { key: "bench-record", heading: "What happened at the bench", intro: "The build, step by step with its photographs, and the running report of what each tool has shown.", ja: { heading: "ベンチで起きたこと", intro: "写真つきで一歩ずつ進んだ組み立てと、各道具が示したことの経過報告。" } },
  { key: "bench-experiments", heading: "Experiments at the bench", intro: "The real console's picture against the model's, and the cartridge the model grew so both could run the same bytes.", ja: { heading: "ベンチでの実験", intro: "実機の絵と模型の絵の比較、そして両者が同じバイトを走らせるために模型が備えたカートリッジ。" } },
];

const DOCS = [
  { repo: "nes", file: "nes-end-to-end-v0_2.md", slug: "sketch", group: "start", order: 1, description: "The sketch the whole arc runs on: what functional means, the shape, the milestones N0 to N8, the scope session and the decision record." },
  { repo: "nes-bus", file: "n0-report.md", slug: "n0-report", group: "chips", order: 2, description: "N0: the contract. The pin tables, the dot frame and the cartridge edge as one dependency-free crate, held to the recorded runs." },
  { repo: "2a03", file: "a0-report.md", slug: "a0-report", group: "chips", order: 3, description: "A0: the 2A03 at the switch level, bit for bit against its reference with no list of exceptions." },
  { repo: "2a03", file: "a3-report.md", slug: "a3-report", group: "chips", order: 4, description: "A3: first sound. A program's note read off the chip's own output node, and the mixer as a labelled claim." },
  { repo: "2a03", file: "n3-plan.md", slug: "n3-plan", group: "chips", order: 5, description: "N3, written first: the fast 2A03: the 6502's fast core with the decimal adjust disconnected, the APU as measured tables." },
  { repo: "2a03", file: "n3-report.md", slug: "n3-report", group: "chips", order: 6, description: "N3: the fast 2A03 built and held at the pins, the APU's tables measured out of the chip, the stalls frame for frame." },
  { repo: "2c02", file: "p0-report.md", slug: "p0-report", group: "chips", order: 7, description: "P0: the 2C02 at the switch level, its reference replayed, the supply-gated transistors found." },
  { repo: "2c02", file: "p1-report.md", slug: "p1-report", group: "chips", order: 8, description: "P1: the PPU through its harness, the DAC held, the reset-less latches named." },
  { repo: "2c02", file: "p2-report.md", slug: "p2-report", group: "chips", order: 9, description: "P2: sprite 0, the vblank read race and OAM corruption, each pinned by a register program the reference replays blindly." },
  { repo: "2c02", file: "p3-plan.md", slug: "p3-plan", group: "chips", order: 10, description: "P3, written first: the fast PPU, a stepper whose sequencer is a table measured out of the switches." },
  { repo: "2c02", file: "p3-report.md", slug: "p3-report", group: "chips", order: 11, description: "P3: the fast PPU dot for dot with the chip on three worlds, the write path, the blank picture." },
  { repo: "ntsc-crt", file: "ntsc-crt-handoff-v0_3.md", slug: "ntsc-spec", group: "signal", title: "The NTSC signal path's specification, v0.3", order: 12, description: "The NTSC signal path's specification, v0.3, ratified: sources, the decoder's filters, the CRT stages, the capture." },
  { repo: "ntsc-crt", file: "m0-report.md", slug: "m0-report", group: "signal", order: 13, description: "M0: the grid, the residues and the data every later stage stands on." },
  { repo: "ntsc-crt", file: "m1-report.md", slug: "m1-report", group: "signal", order: 14, description: "M1: the encoders against their reference." },
  { repo: "ntsc-crt", file: "m2-report.md", slug: "m2-report", group: "signal", order: 15, description: "M2: the decoder filters, notch and combs, held to their reference and to each other." },
  { repo: "ntsc-crt", file: "m3-report.md", slug: "m3-report", group: "signal", order: 16, description: "M3: the CRT stages, every parameter authored and labelled." },
  { repo: "ntsc-crt", file: "m4-report.md", slug: "m4-report", group: "signal", order: 17, description: "M4: the capture source, the synthetic roundtrip, and the first real console records scored against the family's own synthesis." },
  { repo: "ntsc-crt", file: "m5-report.md", slug: "m5-report", group: "signal", order: 18, description: "M5: the self-counts, the divergences and the spec's ratification." },
  { repo: "ntsc-crt", file: "divergences.md", slug: "ntsc-divergences", group: "signal", order: 19, description: "Where the signal path knowingly departs from the published references, each with its reason." },
  { repo: "nes", file: "n4-report.md", slug: "n4-report", group: "console", order: 20, description: "N4: the mainboard's glue, each part held to its datasheet and labelled authored." },
  { repo: "nes", file: "n5-report.md", slug: "n5-report", group: "console", order: 21, description: "N5: the console. Both chips on one clock, the seam held to the switch-level chips, blargg's ROMs run end to end." },
  { repo: "nes", file: "n6-plan.md", slug: "n6-plan", group: "console", order: 22, description: "N6, written first: the picture through ntsc-crt, and the capture comparison with its tolerances stated." },
  { repo: "nes", file: "n6-report.md", slug: "n6-report", group: "console", order: 23, description: "N6: the picture, the blank picture measured on the PPU, the capture roundtrip's figures recorded and not fitted." },
  { repo: "nes", file: "n7-plan.md", slug: "n7-plan", group: "console", order: 24, description: "N7, written first: the sound through the board's audio stage read off the schematic." },
  { repo: "nes", file: "n7-report.md", slug: "n7-report", group: "console", order: 25, description: "N7: the sound, blargg's mixer ROMs cancelling, his real-hardware recordings beside." },
  { repo: "nes", file: "n8-plan.md", slug: "n8-plan", group: "console", order: 26, description: "N8, written first: the shell, the GPU picture, the pacing, the second target." },
  { repo: "nes", file: "n8-report.md", slug: "n8-report", group: "console", order: 27, description: "N8: the shell built and checked headlessly, the GPU picture held to the CPU chain, the wasm target measured." },
  { repo: "nes-bench", file: "bench-plan.md", slug: "bench-plan", group: "bench-plan", order: 28, description: "The bench, written first: the part and the model under one input history, a controller-port bridge, relays and the scope under one script, B0 to B3 with their checks." },
  { repo: "nes-bench", file: "wiring.md", slug: "bench-wiring", group: "bench-plan", order: 29, description: "The bridge's wiring: the register that is the pad, the level shifter, the ESP32-C6's pins, the head's relays, and the meter checks that come before power." },
  { repo: "nes-bench", file: "script.md", slug: "bench-script", group: "bench-plan", order: 30, description: "The bench script: one file's words for the head and the model, bytes by latch index, the arm, the trigger, the capture." },
  { repo: "nes-bench", file: "bench-report.md", slug: "bench-report", group: "bench-record", order: 31, description: "The bench's running report: B0 to B3 on the machine side, each tool green on a synthesis with a sabotage run that goes red; the die answered B0's DMC question first and the model changed for it." },
  { repo: "nes-bench", file: "bench-build-v1-v2.md", slug: "bench-build", group: "bench-build", title: "The bench's schematics, parts, build order and pad adapter", artefacts: ["v1b", "v2b"], order: 32, description: "The electronics review's sheets: the bridge as a schematic (v1 and v1b), the extended bridge (v2), one poll as timing lanes, and an original pad as a phone's pad; parts lists and the build order." },
  { repo: "nes-bench", file: "bench-v1b-uno.md", slug: "bench-v1b", group: "bench-build", title: "The v1b bridge on the Arduino UNO, all at 5 V", artefacts: ["v1b", "v2b", "board"], order: 33, description: "v1b, the bridge on an Arduino UNO with everything at five volts, which is the version built first: why the level shifters go away, the pin table, and the four things writing the firmware proved the plan had wrong." },
  { repo: "nes-bench", file: "build-guide.md", slug: "build-guide", group: "bench-build", artefacts: ["v1b"], order: 34, description: "The bench built in five sittings, one command each: what to wire pin by pin, what the command then measures, which photographs to take, and where each sitting stands. Generated from the tool that runs it." },
  { repo: "nes-bench", file: "as-built-v1b.md", slug: "as-built", group: "bench-build", title: "The v1b board as built, read off its photographs", order: 38, artefacts: ["v1b"], description: "The v1b board as built, read off its photographs: which block and half the chips sit in, their notch direction and columns, the rails, the UNO ribbon, and where the headers should move so the jumpers stay short. The holes themselves are on the breadboard sheet and the cheat sheet." },
  { repo: "nes-bench", section: "cart", file: "calibration-plan.md", slug: "calibration-plan", order: 2, description: "The calibration cartridge, written first: one NROM cartridge whose every screen is built to be measured off the part and the model through the same reader, under a strip that names every frame; colour, resolution, filtering and the pad's closed loop, C0 to C4." },
  { repo: "nes-bench", section: "cart", file: "build-the-cal-cart.md", slug: "build-the-cal-cart", order: 3, description: "Build the calibration cart: from the idea of a frame that names itself, through the cartridge written in code with a sixty-line assembler and the blanking budget that shaped it, to the ROM in the model, its manifest, its checksums, and the cartridge in a console." },
  { repo: "nes-bench", section: "cart", file: "calibration-screens.md", slug: "calibration-screens", order: 4, description: "The calibration cartridge's eight screens as the family's own decoder sees them, the strip that names every frame read off each, and what each screen is for; the grabber's frames of the same screens join here when the cart is in a console." },
  { repo: "nes-bench", section: "cart", file: "cart-blanks.md", slug: "cart-blanks", order: 5, description: "The blank boards and the programmer on the bench, photographed and read: which board takes the calibration ROM's two chips, what the EPROM adapter is for, and what stays unknown until the chips arrive." },
  { repo: "nes-bench", file: "cartridge.md", slug: "cartridge", group: "bench-experiments", order: 40, description: "The bench's cartridge from the reader to the model: why the reader guessed the wrong game from a 512-byte window, the SD-card refresh and the verified dump whose checksum is the reader's own, and the mapper-66 board the console's model grew so it could run the same bytes for a three-way picture comparison." },
  { repo: "nes-bench", file: "eyes-vs-scope.md", slug: "eyes-vs-scope", group: "bench-experiments", order: 39, description: "Eyes versus scope: the console's composite split to the scope and to a USB grabber on the Pi, the grabber's driver and how it came to work, and the first comparison of the grabber's picture against the family's own decode of the scope record, aligned on the console's pixel grid and scored." },
  { repo: "nes-bench", file: "cheat-sheet.md", slug: "cheat-sheet", group: "bench-build", artefacts: ["v1b"], order: 37, description: "The bench's cheat sheet: the two breakouts pin by pin (port pin, NES harness colour, breakout lead, where it goes), the head's four jumpers, and every pin of every chip with what it does on the part and what it is wired to here. Generated from the schematic, the lab log and the bring-up tool." },
  { repo: "nes-bench", file: "parts.md", slug: "parts", group: "bench-build", artefacts: ["v1b", "v2b"], order: 36, description: "The bench's bill of materials, one table per schematic sheet plus a single list of everything to gather. Generated from the same file that draws the schematics, so a part cannot be on a sheet and missing from the list." },
  { repo: "nes-bench", file: "lab-notebook.md", slug: "lab-notebook", group: "bench-record", artefacts: ["v1b"], order: 35, description: "The lab notebook: the bench being wired one step at a time, every attempt including the ones that failed, each step ending in a measurement rather than an opinion. Generated from the bring-up tool's log, never typed." },
];

// The bench's schematics, drawn by its generator and held to its wiring
// tables (tools/check-sheets.py): served beside the console's figures,
// and the build document's image links pointed at them.
const SHEETS = ["bench-v1.svg", "bench-v1b-1.svg", "bench-v1b-2.svg", "bench-v2.svg",
                "bench-v2b-1.svg", "bench-v2b-2.svg", "bench-v2b-3.svg", "bench-v2b-4.svg",
                "breadboard-v1b.svg", "wiring-v1b.svg", "wiring-v1b-build.svg", "logical-timing.svg", "pad-adapter.svg"];

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
    const local = `/docs/${d.section ?? "nes"}/${d.slug}`;
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

// Every notebook document in exactly one known group, and its order its
// place in the grouped reading, so the sidebar and the index agree.
for (const d of DOCS.filter((x) => !x.section)) {
  if (!GROUPS.some((g) => g.key === d.group)) throw new Error(`${d.slug}: no group, or an unknown one (${d.group})`);
}
DOCS.filter((x) => !x.section)
  .sort((a, b) => GROUPS.findIndex((g) => g.key === a.group) - GROUPS.findIndex((g) => g.key === b.group) || a.order - b.order)
  .forEach((d, i) => { d.order = i + 1; });

fs.mkdirSync(OUT, { recursive: true });
// A document that moved into a section leaves its old copy behind in
// docs/nes/ (the tree is generated and gitignored), and a page nobody
// lists is a page somebody eventually links to: drop what is not pulled.
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith(".md") && f !== "index.md" && !DOCS.some((d) => !d.section && `${d.slug}.md` === f)) {
    fs.rmSync(path.join(OUT, f));
    console.log(`pull-nesdocs: dropped docs/nes/${f}, no longer pulled here`);
  }
}
for (const d of DOCS) {
  const src = path.join(SIBLINGS, d.repo, "docs", d.file);
  if (!fs.existsSync(src)) {
    throw new Error(`${src} is missing: the ${d.repo} checkout must sit beside this repository with its docs`);
  }
  const raw = fs.readFileSync(src, "utf8");
  const h1 = raw.match(/^# (.+)$/m);
  if (!h1) throw new Error(`${d.repo}/docs/${d.file}: no h1 to take the title from`);
  let body = transform(d, raw);
  // A title of our own where the document's h1 opens with a repository's
  // name in lowercase ("ntsc-crt: handoff spec v0.3"), which read as a
  // file listing in a menu. The repository keeps its h1; the page shows
  // ours, so the menu, the index and the page agree.
  if (d.title) {
    body = body.replace(/^# .+$/m, `# ${d.title}`);
    h1[1] = d.title;
  }
  d.shownTitle = h1[1];
  if (d.artefacts) {
    const links = d.artefacts.map((k) => {
      const a = ARTEFACTS[k];
      if (!a) throw new Error(`${d.slug}: unknown artefact ${k}`);
      if (!fs.existsSync(path.join(ROOT, "web", "public", a.href))) {
        throw new Error(`${d.slug} links ${a.href}, which this pull did not produce`);
      }
      return `[${a.label}](${a.href})`;
    });
    // Right under the h1, where a reader on a phone at the bench sees it
    // before the prose.
    body = body.replace(/^(# .+\n)/m, `$1\n**Printable:** ${links.join("; ")}.\n`);
  }
  const source = `https://github.com/tinymachines/${d.repo}/blob/main/docs/${d.file}`;
  const front = `---\ntitle: "${h1[1].replace(/"/g, '\\"')}"\ndescription: "${d.description.replace(/"/g, '\\"')}"\norder: ${d.order}\n---\n\n`;
  const note = `\n\n*Pulled at build time from [${d.repo}/docs/${d.file}](${source}); the repository is the one copy.*\n`;
  const dir = d.section ? path.join(OUT, "..", d.section) : OUT;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${d.slug}.md`), front + body + note);
}

// One table per group, each document linked by its title rather than its
// file name: "n3-report" says where the file is, not what it is.
const cell = (t) => t.replace(/\|/g, "\\|");
const grouped = GROUPS.map((g) => {
  const rows = DOCS.filter((d) => !d.section && d.group === g.key).sort((a, b) => a.order - b.order)
    .map((d) => `| [${cell(d.shownTitle)}](/docs/nes/${d.slug}) | ${cell(d.description)} |`).join("\n");
  return `## ${g.heading}\n\n${g.intro}\n\n| | |\n|---|---|\n${rows}\n`;
}).join("\n");
fs.writeFileSync(
  path.join(OUT, "index.md"),
  `---
title: The console arc's notebook
description: "Every plan and report for the NES console, grouped by the part they are about: the chips, the signal, the console and the bench."
order: 30
---

# The console arc's notebook

We write every milestone down twice: a plan before the code, saying
what will be checked and how closely, and a report afterwards, where
every figure is a measurement with the run that printed it. Those
documents live in their own repositories. This page pulls them in each
time the site is built and sorts them by the part of the console they
are about, so they are in one place and the repositories stay the only
copy. When a report gives a number, the run printed it; when it calls
something authored, that is a choice we made and labelled as one. The
calibration cartridge has [a section of its own](/docs/cart).

${grouped}
## Printable

The bench's drawing packages, built from the committed schematics on
every deploy: ${Object.values(ARTEFACTS).map((a) => `[${a.label}](${a.href})`).join("; ")}.
`,
);
// The cart: the calibration cartridge and everything around building
// one, in a section of its own so the plan, the tutorial, the screens
// and the boards sit together (owner's call, 2026-09-13).
const cartRows = DOCS.filter((d) => d.section === "cart").sort((a, b) => a.order - b.order)
  .map((d) => `| [${cell(d.shownTitle)}](/docs/cart/${d.slug}) | ${cell(d.description)} |`).join("\n");
fs.mkdirSync(path.join(OUT, "..", "cart"), { recursive: true });
fs.writeFileSync(
  path.join(OUT, "..", "cart", "index.md"),
  `---
title: The calibration cart
description: "The calibration cartridge, from the idea of a frame that names itself to a ROM on a board in a console, with the screens it shows and the tool that reads them."
order: 31
---

# The calibration cart

One cartridge, the family's own, whose every screen is built to be
measured: off a console through the scope, the grabber and a camera, and
off the model through the same decoder, with one tool reading all of
them. This section holds the plan, the tutorial that builds the ROM and
puts it on a board, the screens as pictures, and the blank boards
waiting for their chips. The ROM and its manifest are served here too:
[cal.nes](/nes/cal.nes) and [cal.json](/nes/cal.json), the same bytes
the checksums in the tutorial name.

| | |
|---|---|
${cartRows}
`,
);
// The shelves the /nes pages show: each group with its documents' titles
// and lines, as written above. Generated beside the documents (gitignored
// with them) because the docs tree allows no frontmatter but title,
// description and order, so a document cannot carry its group itself;
// lib/nes-shelves.ts reads this and refuses a build without it.
const shelf = (d) => ({ route: `/docs/${d.section ?? "nes"}/${d.slug}`, title: d.shownTitle, description: d.description });
fs.writeFileSync(path.join(OUT, "shelves.json"), JSON.stringify({
  groups: GROUPS.map((g) => ({
    key: g.key, heading: g.heading, intro: g.intro, ja: g.ja,
    docs: DOCS.filter((d) => !d.section && d.group === g.key).sort((a, b) => a.order - b.order).map(shelf),
  })),
  cart: DOCS.filter((d) => d.section === "cart").sort((a, b) => a.order - b.order).map(shelf),
}, null, 1) + "\n");

// Every page this wrote parses as the docs tree will parse it. An unquoted
// description with a colon in it is valid-looking YAML that fails only at
// next build's page collection, minutes into a deploy (2026-09-14).
for (const dir of [OUT, path.join(OUT, "..", "cart")]) {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    try {
      matter(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`${path.relative(ROOT, path.join(dir, f))}: frontmatter does not parse: ${e.reason ?? e.message}`);
    }
  }
}
console.log(`pull-nesdocs: ${DOCS.length} documents from the sibling checkouts (${DOCS.filter((d) => d.section === "cart").length} in the cart section)`);
