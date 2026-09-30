# The autopsy: a game taken apart, and the studio it leads to

*The owner's brief, 2026-09-29: "Take one of my NES games (Super Mario
Bros.) and give it an autopsy (not quite an x-ray). The goal: decompile,
crawl, identify, label. I am the use case: a developer interested in
learning assembly and game development, who wants to start at the
beginning. On the way we gather the requirements and skills to build a
full-featured wasm / web studio for crafting NES games. There is a large
body of prior art out there; we will use none of it, only our own. We
build the tool as a CLI when we need horsepower. The analysis artefacts
become the foundation of an NES game model; once we identify the
patterns across all the games, those patterns become a toolkit for
learning and for building. Our ability to play games and test code paths
automatically should let us not only decompile but label code and add
comments. I want to walk the half-wave for deeper introspection, and
understand the sprites, the palettes and the memory access patterns.
When the tool, the toolkits, the patterns and the techniques are found,
we advance on NES Build. Rust for the experiments; if performance is an
issue, all of it as a desktop app."*

Written from the record on 2026-09-29, checked not recalled. This is
the vision statement for the next stretch of the NES work; the desk
brief it grows out of is `notes/workbench.md`, and the desk as built is
`docs/nes/workbench.md`.

## The previous vision, and how this one continues it

There was one, in three places, and this statement amends rather than
replaces it:

- **Programme 3 of `docs/nes/exercise.md` (nes-bench, 2026-09-17):** the
  x-ray (two runs one pad byte apart, the half-cycle they diverge at,
  the routine that belongs to the action) and the encyclopedia the
  x-rays add up to, with its last sentence: *the encyclopedia is the
  basis of a tool for building NES games, where each pattern comes with
  a runnable example of our own.* That is the studio, named two weeks
  early.
- **`docs/nes/mario-dissection.md` (2026-09-18):** Super Mario Bros.
  already taken apart once, from a 660-frame record of the multicart:
  the loop inside the interrupt, the frame scanline by scanline, the
  routine tree through the jump engine, the VRAM pipeline, the pad's
  byte on its way to a jump. Its closing section, "What it seeds", is
  five patterns and one method. Seven entries stand in
  `docs/nes/encyclopedia.md`.
- **`notes/workbench.md` (2026-09-22):** the desk brief (load, play,
  debug, capture and annotate, keep), now mostly built: the desk on
  /nes/play and /nes/create with Record, Flow, Code, History, Moments,
  Sprites, Nametables, breakpoints, blocks on the shelf and in the
  browser's file store.

The x-ray answers one question about one action. The dissection
answered a dozen about one run. **The autopsy is the same method at the
scale of the whole game**: every routine, every byte of RAM, every
table, every tile and palette, reached by playing the game
automatically until nothing new is reached, with every finding labelled
and its evidence kept. The encyclopedia grows from seven entries to the
patterns of twenty games, and the game model is what the autopsies have
in common. The studio (NES Build) is built on that model, in that order,
because a build tool that teaches patterns has to have measured them
first.

## The four verbs, and where each stands

Legend as in the workbench note: **have** is built and reachable;
**engine** is in the Rust but not reachable from a page; **need** is
nowhere.

### Decompile

The hard problem of static disassembly is telling code from data, and
the trace already solves it: nes-console writes one record per CPU
cycle with the **PRG offset** of every fetch (nes-bus's `prg_offset`),
so a byte that was ever executed is known to be code, in which bank,
from which entry.

| | |
|---|---|
| have | the disassembler, `6502/web/disasm.js`, 151 documented opcodes, one table, served from the boarded worktree and read by `lib/console-modules.ts`, `Code.tsx` and `History.tsx`; `tools/xray.py` reads the same table |
| have | `wasm/flow` (this repo, Rust, 1153 lines): sites keyed by PRG offset, routines with entries by JSR, interrupt or table, callers, cycles, reads and writes; loops, variables, tables, modes, the pad's followers; on /nes/create as the Flow window |
| have | the Code window's listing around the program counter, blocks captured from a selection, kept on the shelf or in the file store |
| engine | `nes-console`'s `Trace` (record.rs): cycles, registers at each fetch, the pad, the frames; `take_trace` and `history` in the wasm |
| need | **the listing of the whole PRG**, keyed by PRG offset not CPU address (a banked board maps one address to many bytes), each byte marked code, data, table, or never reached, with its reach (which entries lead to it) and its count. The sites are already in the flow reader; what is missing is the complement: the bytes no run touched, and the data ranges the code reads (an indexed read into ROM is a table, and the flow reader sees the read) |
| need | a **symbol file**: labels and comments per PRG offset, with provenance (which pass minted it, from what evidence, or that a person did) |

### Crawl

Playing the game automatically to reach its code. The x-ray's script,
the recording and the deterministic replay, the saved moments and the
breakpoints are the parts of a crawler; nothing drives them yet.

| | |
|---|---|
| have | recording and replay from power-on or from a saved state (nes `record.rs`, `state.rs`), bit-exact, a picture digest per frame checked as it goes |
| have | `run_frames_until(pc)`, the breakpoint in the stepping loop; moments (the whole console saved) in the browser; `xray.py --script` puts a run on a pad script by latch |
| have | horsepower: the console runs at about 1.26x real time under node (`data/nes.json`), natively faster; `nes-shell` is the native console with a window; the workstation and the new ESP32 Pi both build the tree |
| need | **the crawler**: from a moment, hold each pad byte (and each edge, press and release) for a stretch of frames, replay, read the trace, and keep the moments that fetched a PRG offset no run had fetched before. Coverage-guided, breadth first, with a budget. The measure is one number, the fraction of PRG bytes ever executed, and it is the gate: an autopsy is as complete as its coverage says, and the report prints the unreached ranges rather than hiding them |
| need | the crawl as a **CLI in Rust**, in the nes repository beside `nes-shell` (the owner's call on the name; the brief leaves it as "???"). It reads a ROM and a starting recording, writes moments, traces and the coverage map under the ROM store (a commercial dump's traces stay where its bytes are, `NOTICE.md`), and can run for hours on a spare machine |
| need | a **frame oracle** for stuck states: a run whose picture digest stops changing and whose pad has no effect is a dead end (game over, a demo loop) and the crawler backs out. The record already carries the digests |

### Identify

Naming what the crawl found: this routine polls the pad, this one is
the NMI handler, this table is the state dispatch, this RAM byte is the
player's horizontal speed. The dissection did this by hand from the
tools' output; the autopsy does it by matchers, each producing a label
and the evidence for it.

| | |
|---|---|
| have | seven patterns with measured signatures (`encyclopedia.md`): the poll, the bank switch, the loop inside the interrupt, the sprite-0 split, the VRAM buffer drained in the blank, the jump engine, the state dispatch |
| have | the flow reader's classifications: idle, waiting and working loops; dispatch tables and which way each went per frame; variables as RAM one routine writes and another reads; modes as stretches that look alike; the pad's followers |
| have | `dissect.py`: the frame in scanline order (every PPU write with line and dot, the DMA, the `$2002` spins, the idle), the call tree, the RAM map, the code's pages |
| need | **matchers over the model**, one per pattern, that run without a person: the poll routine is the one that strobes `$4016` and reads it eight times; the NMI handler is the routine the vector enters; the music driver is the one that writes `$4000` to `$4015` every frame and nowhere else does; the random number is the RAM byte every frame rewrites from itself with shifts and EORs; the object slots are the RAM arrays indexed by the same register across a routine family; the collision test is the routine that reads two objects' positions and branches. Each match carries what it saw |
| need | **the game model**, a file per game: routines (entry, kind, callers, cycles, label, evidence), variables (address, width, which routines write and read, role if matched), tables (address, entries, what indexes it), states (modes and the dispatch that chooses them), sprites (which OAM slots which routine writes, from the trace's writes with their PC; which tiles those are, through the banks as they stood), palettes (which routine wrote each palette byte, when), and memory access as a heatmap per routine and per frame. Shape only; the bytes stay with the dump |
| need | across games: the same file for the twenty dumps, and a pass that finds what recurs. That union is the toolkit's table of contents |

### Label

Labels are the artefact that outlives the run. They are the reader's
comments and the matchers' names, on the same addresses, and the desk
shows them wherever that address appears.

| | |
|---|---|
| have | blocks: `{at, to, bytes, label, note}`, 64 per cartridge on the shelf, unbounded in the browser's file store, captured from the Code window, exported as JSON or markdown |
| need | **the symbol file** the listing and the windows read: a label and a comment per PRG offset (and per RAM address), each with its source (a matcher with its evidence, an x-ray, a person) and its date. A person's label wins over a matcher's and the matcher's stays visible as the reason. Kept beside the blocks (a new kind on the shelf and in the file store), exported, importable into a fresh autopsy of the same digest |
| need | the desk reading it: Code, History, Flow and the Sprites and Nametables windows print the label where they print the address; a variable's role next to its byte in Memory; the crawl's coverage as a colour on the listing |
| need | the **comment** as prose the reader writes at the instruction, which is the learning use: a developer at the beginning writes what they think a routine does, runs the x-ray or steps it, and corrects themselves. The autopsy is a notebook as much as a report |

## The half-wave, and what deeper means

The console's CPU is the die: `v6502-micro` at a pinned revision, held
to the die by the recorded bus, stepped by master half-steps of which
twelve make a CPU half-cycle (`console.rs`). The wasm already exposes
`step_half_cycles`, `step_instruction` and `step_scanline`, and the
history keeps the console's own trace. So "walk the half-wave" is not a
new engine; it is a view: the instruction in the Code window opened to
its half-cycles, each with the bus (address, data, the flags), the
registers at the fetch, and the PPU's line and dot at that moment, the
way the Halfshot page stands in a window of the bare 6502. The trace
carries every write with the PC that made it, so three deeper questions
come free once the model exists:

- **sprites**: for each OAM entry on screen, the routine that wrote it
  and the frame it was last written; for each tile, which sprites and
  which nametable cells use it, through the banks as they stood (the
  Sprites and Nametables windows already read CHR through the banks);
- **palettes**: which routine wrote each of the 32 palette bytes and
  when, against the 64 measured colours, so a palette change is traced
  to its code;
- **memory access patterns**: reads and writes per RAM byte per routine
  per frame, drawn as a heatmap; the zero page's hot bytes, the stack's
  depth over a frame, the object arrays as stripes.

## The target, and one fact about it

The shelf holds two dumps under the name. `Super Mario Bros. + Duck
Hunt (USA)` (dump 55, GxROM, 64 KiB PRG and 16 KiB CHR) is an original
cartridge, draws, and is the record the dissection was made from.
`Super Mario Bros.` (dump 54, mapper 0, 32 KiB and 8 KiB) matched
nothing in the reader's database, and on 2026-09-29 the bytes said why:
it is byte for byte bank 0 of dump 55, PRG and CHR, the reader having
identified the board as plain Super Mario Bros. and read one bank of
two. Its first nine bytes are the board's bank switch (`SEI`, a write
selecting the menu's bank, a jump to itself) standing where the game's
reset was; as an NROM image the switch has nothing to switch and the
program loops there forever, which is the "blank screen" the boards
report had. So there is no standalone cartridge to read again, the
twenty dumps are accounted for, and **the patient is the game inside
the multicart**, entered the way the menu enters it, nine bytes past
the vector. In its bank the code sits at the addresses a standalone
cartridge would put it, so nothing about the autopsy depends on which
image it runs from.

## The constraints that carry

- **Only our art.** No received disassembly, symbol list or memory map
  is read, quoted or checked against, including the one the 6502
  repository holds and deliberately never brought over
  (`PROJECTS.md`, the roadmap). Every label is minted from our own
  trace and named in our own words; where the world already has a name
  for a thing we find, we keep ours. This is the same rule the
  encyclopedia runs on, made total.
- **Shape is not bytes** (`NOTICE.md`, 2026-09-23). The autopsy of a
  commercial dump is private to its owner, as the dump is: the listing
  with bytes, the traces, the moments, the tiles. What may leave is
  shape: labels, addresses, counts, patterns, prose, the game model
  without the bytes. The toolkit's worked examples are ROMs whose source
  is ours, so the studio's lessons can show code whole.
- **A label carries its evidence.** The thing that publishes must not
  be the thing that claims: a matcher's label says what it saw, an
  x-ray's says the divergence, a person's says who and when. A label
  with no evidence is a guess and is shown as one.
- **A refusal beats a plausible answer.** Coverage is printed, not
  assumed; an unreached range is listed; a routine no matcher named is
  "unnamed", never "misc".
- **The engine seam stays the seam.** Reads and control come out of
  `nes-wasm` as they have; a crawler that needs a new export adds it
  there and boards it. The console spans four repositories pinned three
  ways; the CLI lives in the nes repository so it builds against the
  same pins.

## An order that keeps every step useful on its own

1. **The listing.** *Built 2026-09-29, first cut: `wasm/listing`, the
   flow crate's sibling, with `FORMAT.md` as the standard.* A cartridge
   as assemblable text with marks in its comments; no addresses stored,
   the check is that the file assembles back to the ROM byte for byte
   (all nineteen dumps and our six own ROMs do). `listing from` writes
   the first one by a static walk from the vectors (code is what the
   walk reaches, the rest is honest `.byte`), `check`, `render`, `shape`
   (marks without bytes) and `rom`. *Same night: a run laid over it.*
   `listing from ROM RUN.json` takes the flow report of a trace (the
   console repo's `script-trace` example writes one from a pad script,
   660 frames in 9 s) and marks every executed stretch `@ran N`, the
   walk's code the run never touched `@unreached`, the run's routines
   `@routine ... entered=N by=run`, and the coverage per bank and for
   the file. **The first coverage number:** the dissection's 660-frame
   script executes 7533 of the 32768 bytes of the Super Mario Bros.
   bank (23 percent) and 850 of the menu bank's; the walk alone knew
   2683 instructions of the multicart, the run makes it 9041. Not yet:
   `@table` and `@var`, and the desk loading it (the wasm face exists,
   no page calls it, and the crate is not boarded into a bundle).
2. **The crawl.** *Built 2026-09-29, first cut: the console repo's
   `examples/crawl`.* From a saved moment past the title, fifteen pad
   bytes held for twenty frames each and one long wait; new opcode
   sites first, then new RAM values written (progress shows in RAM
   before it shows as code), deeper chains first; loops dropped; all
   cores. Output in the flow report's shape, so `listing from ROM
   run.json crawl.json` folds it with a recorded run. First result:
   1600 steps in 555 s reach 5055 sites of the Super Mario Bros. bank,
   every one the dissection's run reached and 1504 more; the bank goes
   from 23 to 33 percent executed. Not yet: a smarter novelty (the
   frame counter and the random byte count as new values every step),
   longer runs on the Pi, and routines from the crawl's paths (run
   `script-trace` on a kept script and the flow report has them).
3. **The matchers.** The seven patterns as code over the model, each
   with its evidence; then the ones the crawl's coverage makes findable
   (the music driver, the random number, the object slots, the
   collision test, the scroll). Each new pattern is an encyclopedia
   entry, shape only, and a runnable example of ours when we have one.
4. **The symbol file and the desk.** Labels and comments kept beside the
   blocks; the Code, History, Flow, Memory, Sprites and Nametables
   windows printing them; the half-cycle view under an instruction; the
   heatmaps.
5. **The other nineteen.** The pipeline over every dump on the shelf,
   the union of the models, and the patterns that recur. That table of
   contents is the toolkit's.
6. **NES Build.** The studio: each pattern a lesson with our own ROM
   and its own autopsy showing the same shape, an assembler and a
   linker in the page (the 6502's `asm.js` is the seed), the desk's
   editors for tiles and palettes, the crawler as the test runner for a
   game being written. Its requirements are gathered on the way; this
   statement does not design it.

## Decisions that are the owner's

- The tool's name. The brief leaves it as "???" and so does this note.
- Rust from the first step (recommended: the trace is about 19 MB per
  second of play and the crawl produces hours of it; `dissect.py` was
  right for 660 frames and would not be for this), or Python
  prototypes first.
- Where the artefacts live: under the ROM store on the server, in the
  browser's file store, or both, and whether the game model is a new
  kind on the shelf beside blocks and revisions.
- The desktop app, if the page runs out of room: the desk is already a
  web app, so a shell around it (Tauri would keep the Rust and the
  pages both) is the natural shape, decided when the page is actually
  slow rather than in advance.
- Whether dump 54 is a standalone cartridge to read again or the
  multicart misread, and so whether the multicart's bank is the patient
  for good.
