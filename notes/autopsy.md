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
   2683 instructions of the multicart, the run makes it 9041. `@table`
   came with the matchers (step 3), for a jump engine's tables; `@var`
   is the RAM block after the banks, one line per byte one routine
   writes and another reads, with who did what how often (740 bytes on
   the multicart's fifty-one reports). Not yet: the desk loading it
   (the wasm face exists, no page calls it, and the crate is not
   boarded into a bundle).
2. **The crawl.** *Built 2026-09-29, first cut: the console repo's
   `examples/crawl`.* From a saved moment past the title, fifteen pad
   bytes held for twenty frames each and one long wait; new opcode
   sites first, then new RAM values written (progress shows in RAM
   before it shows as code), deeper chains first; loops dropped; all
   cores. Output in the flow report's shape, so `listing from ROM
   run.json crawl.json` folds it with a recorded run. First result:
   1600 steps in 555 s reach 5055 sites of the Super Mario Bros. bank,
   every one the dissection's run reached and 1504 more; the bank goes
   from 23 to 33 percent executed. Second result: the fifty paths the
   crawl kept, each traced and reported and all folded onto the
   listing with the crawl's coverage (`wasm/listing/tools/paths.py`),
   name 245 routines by how they were entered (198 called, 44 through
   a dispatch table, 2 NMI, 1 reset) against 191 from the recorded run
   alone; two of them begin inside another instruction (the `BIT`
   skip), which the listing marks rather than labels. A sharper
   novelty (a new RAM value worth less the more values its address has
   shown, since the frame counter and the random byte take a new value
   every step) was tried over the same 1600 steps and found less code,
   5306 sites against 5462, so it stays as a switch and the plain
   count is the rule. Not yet: longer runs on the Pi.
3. **The matchers.** *Built 2026-09-29 and 30, thirteen rules by the
   evening of the 30th and fifteen on 2026-10-01 (the count below is
   the first cut's): ten rules
   in `wasm/listing` (`FORMAT.md`, "What the matchers write"), each a
   rule over what the run saw, never over what the bytes look like,
   each writing `@is pattern ... by=match` with its evidence.* On the
   multicart's recorded run they name the poll (three of them: the
   game's, which reads each port eight times per entry, and the
   menu's), the jump engine (eleven tables, 1921 dispatches in 660
   frames; twelve tables across the crawl's fifty paths), the idle
   spin (4588 turns a frame) and the NMI handler as the game loop, the
   VRAM drain and the sound driver, the sprite-0 split (the NMI
   handler again: a hundred status reads a frame in the picture, then
   the scroll), the bank switch (the multicart's stub; the menu's own
   runs from RAM, where a listing of the ROM cannot mark it), two
   palette writers and sixteen sprite writers, the busiest writing the
   sprite page 16317 times in 260 frames. For the last three the flow
   report grew: per routine, where the beam was for each hardware
   access (in the picture or in the blank), where in VRAM each `$2007`
   write landed (the address latch followed through `$2006`), and the
   writes into the page the sprite DMA takes. The jump engine's tables
   became the first `@table`: the walk no longer falls through a
   dispatching `JSR`, and the words after it are `.word` lines as far
   as the run saw entries taken, 102 words in eleven tables, each
   taken entry saying how often. The test is a ROM of our own, written
   as a listing and assembled in the test, with a made-up run over it.
   Still to write: the random byte, the object slots, the collision
   test and the scroll need the reads per instruction; the report
   grows to carry them. Then the ones the crawl's coverage makes
   findable. Each new pattern is an encyclopedia entry, shape only,
   and a runnable example of ours when we have one.
4. **The symbol file and the desk.** Labels and comments kept beside the
   blocks; the Code, History, Flow, Memory, Sprites and Nametables
   windows printing them; the half-cycle view under an instruction; the
   heatmaps.
5. **The other nineteen.** *First survey 2026-09-30, early: the
   pipeline (`tools/autopsy.py`: crawl, every kept path traced and
   folded, the listing, the model) over every dump on the shelf, at
   400 crawl steps from power-on with no way in, on impera overnight;
   `tools/union.py` over the nineteen models.* Shape only; the listings
   stay where the dumps are.

   | game | board | PRG executed | routines (run) | tables | arrays | variables | patterns |
   |---|---|---|---|---|---|---|---|
   | Battle Chess (USA) | 1 | 9181 of 262144 (4%) | 186 | 1 | 99 | 714 | 27 |
   | Blades of Steel (USA) | 2 | 31083 of 131072 (24%) | 453 | 30 | 159 | 790 | 52 |
   | Blaster Master (USA) | 1 | 13581 of 131072 (10%) | 280 | 1 | 69 | 821 | 22 |
   | Defender II (USA) | 0 | 9444 of 16384 (58%) | 136 | 0 | 29 | 547 | 30 |
   | Double Dribble (USA) (Rev 1) | 2 | 31512 of 131072 (24%) | 279 | 8 | 82 | 649 | 37 |
   | Fester's Quest (USA) | 1 | 13207 of 131072 (10%) | 82 | 2 | 49 | 390 | 21 |
   | Goonies II, The (USA) | 2 | 17460 of 131072 (13%) | 342 | 18 | 62 | 854 | 43 |
   | Legend of Zelda, The (USA) (Rev 1) | 1 | 14209 of 131072 (11%) | 304 | 16 | 64 | 1373 | 51 |
   | Metroid (USA) | 1 | 15464 of 131072 (12%) | 458 | 13 | 96 | 1248 | 50 |
   | Mike Tyson's Punch-Out!! (Japan, USA) (En) | 9 | 25519 of 131072 (19%) | 319 | 10 | 72 | 498 | 68 |
   | Ninja Gaiden (USA) | 1 | 12425 of 131072 (9%) | 177 | 8 | 83 | 599 | 47 |
   | Paperboy (USA) | 3 | 9018 of 32768 (28%) | 198 | 0 | 52 | 762 | 24 |
   | Q-bert (USA) | 3 | 8718 of 32768 (27%) | 227 | 19 | 73 | 567 | 22 |
   | Super Mario Bros. + Duck Hunt (USA) | 66 | 18801 of 65536 (29%) | 360 | 17 | 136 | 918 | 64 |
   | Super Mario Bros. 2 (USA) (Rev 1) | 4 | 19286 of 131072 (15%) | 253 | 13 | 105 | 1634 | 36 |
   | Super Mario Bros. 3 (USA) (Rev 1) | 4 | 26553 of 262144 (10%) | 264 | 23 | 148 | 1127 | 68 |
   | Teenage Mutant Ninja Turtles (USA) | 1 | 17970 of 131072 (14%) | 372 | 19 | 75 | 785 | 58 |
   | Tetris (USA) | 1 | 6318 of 32768 (19%) | 121 | 5 | 47 | 449 | 27 |
   | Zelda II - The Adventure of Link (USA) | 1 | 12967 of 131072 (10%) | 246 | 16 | 96 | 1470 | 48 |

   (Both tables are the fifth count's, 6400 steps a game; see the
   end of this step.) What a cold crawl reaches is still small (4 to
   29 percent of a game of 32K or more, 58 percent of the one 16K
   game), so the routine counts are a floor. The patterns, across the
   nineteen:

   | pattern | games | marks |
   |---|---|---|
   | bank-switch | 18 of 19 | 178 |
   | counting-spin | 4 of 19 | 4 |
   | frame-wait | 13 of 19 | 49 |
   | game-loop-in-nmi | 8 of 19 | 8 |
   | handler-in-memory | 4 of 19 | 7 |
   | idle-spin | 4 of 19 | 4 |
   | jump-engine | 16 of 19 | 29 |
   | pad-poll | 19 of 19 | 40 |
   | palette-writer | 19 of 19 | 31 |
   | position-compare | 14 of 19 | 91 |
   | random-byte | 12 of 19 | 18 |
   | scroll-writer | 19 of 19 | 21 |
   | sound-driver | 19 of 19 | 19 |
   | sprite-0-split | 11 of 19 | 16 |
   | sprite-writer | 19 of 19 | 261 |
   | vram-drain | 19 of 19 | 19 |

   Read with care: the sound driver, the VRAM drain, the palette
   writers and the sprite writers are found in every game because the
   rules pick "the routine that did the most of it", which always
   exists; the poll in every game after the rule became eight port
   reads a frame (one game's poll is entered twice a frame and reads
   four times each); the bank switch in every game but the one NROM
   cartridge, which is the answer the board says it should be; the
   jump engine in fifteen and the split in six.

   *Corrected 2026-09-30, evening, counted a third time on
   2026-10-01 and a fourth that night (further down): the figures in
   the next paragraphs are each count's own, the tables the fifth's.* The first had the random byte in three games, the scroll
   writer in nine and the game loop inside the interrupt in none, and
   this note blamed the last on a rule "written for one run". That was
   wrong. A crawl's own record, laid over the reports for its
   coverage, added its frames to the run's total though it names no
   routine, so every rule that asks "ran in at least half the frames"
   was asking it of twice the frames anyone watched. With the watched
   frames kept apart the loop inside the interrupt is in all four
   games that have an idle spin, the random byte in eight, the scroll
   writer in all nineteen.

   The thirteenth rule, written the same evening, is the wait for the
   frame: a loop that only loads, tests and branches on fixed bytes of
   RAM, which nothing but an interrupt can let out, marked when the
   NMI handler or a routine it calls wrote the byte. Eleven games, 26
   marks: one wait in Fester's Quest, Punch-Out, Blaster Master and
   Zelda II, two or three in the Marios, Metroid, Tetris and Ninja
   Gaiden, eight in Battle Chess on four bytes the handler writes. With the four that spin,
   fourteen of the nineteen had their frame's rhythm named that
   night. (The count of 26 was that night's; the rule has since
   widened, below.)

   *The third count, 2026-10-01.* The five left over were looked at
   and none waits the way this note guessed. The four Konami games
   (Blades of Steel, Double Dribble, The Goonies II, Teenage Mutant
   Ninja Turtles) idle in an endless loop that does arithmetic on one
   byte of RAM and jumps back, with the game in the NMI handler: the
   counting spin, `counting-spin`, four games, and with it the game
   loop inside the interrupt is in eight. Defender II waits on a flag
   with a call inside the loop, so the wait for the frame now takes a
   `JSR` when nothing the callee reached wrote the flag: twelve games,
   37 marks. All nineteen have their frame's rhythm named.

   The comparison of two positions is found, by following values
   (`wasm/flow`, "Where a value came from"): each byte and register
   carries the cells its value was made from, the report says which
   cells reached a sprite's Y or X byte and where two of them met,
   and `position-compare` marks the routine. Eight games, 18
   routines. On the multicart's recorded run it is one routine with
   three such instructions, one byte against the next, both reaching
   sprite X bytes. Four things had to be ruled out before the result
   was clean, each a decoy in the test now: the stack as a source, a
   value made from more than four cells, the camera (it reaches every
   sprite with the position, so two cells that ever fed one sprite
   byte together are not two objects), and scratch (a temporary
   holding a constant; a cell counts only if it carries a value from
   one frame into the next). What the rule cannot say is what the
   comparison is for: Blades of Steel's and Double Dribble's compare
   ten or more Y positions pairwise, which reads like a sort by depth,
   not a collision.

   The cells it lists are the first sight of each game's object
   table, and the same day's last two steps follow them there. An
   `@array` says how many compared positions it holds (the tightest
   array around each, so the loop that clears a page holds none):
   eight games, 24 arrays. And `@objects` lists what travels with
   them: an array that at least two routines indexed across the same
   range as a position array. Six games, ten tables, 98 arrays; the
   largest is Teenage Mutant Ninja Turtles', 25 arrays of sixteen
   slots, and Blades of Steel's has 23 of twelve. Paperboy's four
   arrays of 25 sit 25 bytes apart, which nobody told the rule to
   look for. What each companion holds (a speed, a state, a kind) is
   the next question, and following values answers the first part:
   the flow counts what was added into a byte that kept its own value
   (`moves`), and `@objects` lists the companions added into a
   position array (`adds=`). The first count had five such arrays
   in four of the ten tables, fewer than there are speeds, for a
   reason: a game that keeps a fraction beside each position adds the
   speed to the fraction and only the carry reaches the position, and
   a carry had no cell to have come from. So the carry is followed
   one step (an add of a constant right after an add takes the first
   add's cells in), and the count is nine arrays in the same four
   tables; Teenage Mutant Ninja Turtles' table went from one to four.

   The other half is what chose. The flow keeps what `A` was made
   from at every `JSR`, and when the call turns out to be a jump
   engine's the table says which byte chose the way (`@table ...
   on=`): 77 of the 92 tables, in twelve of the thirteen games that
   have one. Scratch is left out as it is for positions, which took
   a byte or two out of four games' lists (81 tables had a chooser
   before, four of them only scratch) and left two games whose mode
   really does live at the bottom of the zero page. In
   `@objects`, `chooses=` are the companions a byte of which chose a
   jump: three tables have one, an object's state or kind. So an
   object table now reads as positions, what moves them, what picks
   their code, and the rest.

   *The fourth count, 2026-10-01, night: 1600 steps a game.* The
   longer crawl was the first thing tried and the first thing to
   fail: at 1600 steps one game's crawl took 52 GB and the kernel
   killed it. A saved state carries the console's finished frames
   and the crawl never dropped them, so every moment held every
   picture since power-on. Cleared before a state is taken (nes
   `ae9f7d5`), the same crawl peaks at 271 MB with the same sites,
   and 1600 steps take four minutes a game where 400 had taken two.
   The traces of the deeper paths go through a named pipe, never the
   disk. Across the nineteen: 255,740 bytes executed where it was
   170,400, 4109 routines where it was 2933, 691 marks where it was
   557. Blades of Steel went from 9 to 22 percent, Double Dribble 12
   to 22, Q-bert 13 to 24, Paperboy 15 to 25, Metroid 5 to 11 with
   420 routines where it had 193; the games stuck on a screen moved a
   point or none. The position comparison is in thirteen games, 72
   routines; the object tables are 25 in twelve games, 259 arrays, 19
   of them added into positions and 17 choosing a jump.

   Three things about tables came with it. A bank is put where the
   run saw its code: the listing had assumed the window the board
   usually maps a bank at, Super Mario Bros. 3 maps them at $A000 and
   $C000, and at $8000 not one absolute address inside them resolved
   and none of its engine's tables was found; placed, it has 23. A
   table of addresses a `JMP (ind)` of its own went through is found
   by where the pointer's two bytes were loaded from and written as
   `@table pointers`: 20 of the 185 tables, in nine games. And a jump
   through a pointer copied out of RAM is the sixteenth pattern,
   `handler-in-memory` (three games, five routines): each thing keeps
   the address of its own code. 135 of the 185 tables say what chose.

   *The fifth count, 2026-10-01, late: 6400 steps a game, and three plain
   scripts.* Three things were tried on the crawl itself. Several
   moments at a time (BATCH, nes `442f043`): one moment's sixteen
   actions left most of the cores waiting on its one long wait, and
   eight at a time the same 1600 steps took 170 s where they had
   taken 432; the fold is in moment then action order now, so a crawl
   is the same crawl on any machine, which it was not. A step kept
   for ending on a picture not seen before (PICTURE, nes `b7e9ccd`):
   on two games that had run their frontier dry it found one to four
   percent more for the rest of the budget, so it is a switch and
   off. And three plain scripts of 5400 frames laid beside each
   game's crawl as extra paths (touch nothing, so the game's own
   demonstration plays; Start once and wait; tap through the menus
   and hold Right): alone they reach 8.7 percent more sites than the
   1600-step crawls, half again as much for The Goonies II, a quarter
   for Blaster Master.

   At 6400 steps the two games that had sat on a screen moved most:
   The Legend of Zelda from 98 routines to 304 and Zelda II from 85 to
   246, each from about 4 percent of its program to about 10. Several
   others ran the frontier dry before the budget, which more steps
   will not mend. And one went backwards: Paperboy's deeper crawl
   stopped at 848 steps having reached a quarter of what its
   1600-step crawl had, because what a step is kept for depends on
   what has been seen, so the order moments are taken in changes
   where the crawl can go. A count must not lose what an earlier one
   found, so for the seven games where the shallower crawl had sites
   the deeper lacked, its paths and coverage are folded in (their
   `steps` reads 8000). Across the nineteen: 312,716 bytes
   executed where it was 255,740, 5057 routines where it was 4109,
   795 marks where it was 691, 219 tables (172 saying what chose),
   31 object tables in 13 games.

   Two more things are written now. A routine or a loop a rule named
   is called by what it is in the listing (`poll_8E5C`,
   `engine_8E04`, `drain_`, `sound_`, `compare_`, `wait_`, `spin_`):
   the label step of this note's first paragraph, begun. And the flow
   counts the bytes an `INC` or a `DEC` steps in place (`steps`), so
   `@objects` lists the companions with a byte only ever stepped
   down, a countdown: 42 arrays in 17 of the 31 tables. An object
   table now reads as positions, what moves them (22 arrays), what
   picks their code (23), what counts down, and the rest.

   One rule is shown up by the longer runs: `random-byte` asks that
   the routine ran in half the frames, which is a fact about the mix
   of menus and play in the run, not about the routine: between
   counts one game lost its mark and one gained one, and two others
   went from three to two and from one to two. The flow already
   knows the better question (does the byte carry its value from one
   frame into the next), and the rule should ask that; it needs the
   reports re-made, so it waits for the next count.

   *The same count re-made, 2026-10-02, for that rule.* Asking only
   whether the byte is carried was too loose: 48 marks in sixteen
   games where there had been 18 in twelve. Three more things were
   wrong, each a decoy in the test now. A temporary is "carried" in
   any one path that happens to read it first, so a byte is state
   when most of the reports say so. A pad poll has the same shape (it
   shifts the buttons into a byte and EORs it with the last reading),
   so the routine must not read the pad, and it must look at one of
   the bytes it stirs besides shifting it (the feedback). And code
   that several routines jump into ran in each of them, which gave
   one game seven routines for one byte: the tightest routine a
   stirring instruction ran in keeps the mark. Twenty marks in
   fourteen games, and where a game's generator is known (the one
   Nintendo used across several of these) the bytes named are its
   bytes. Everything else in the count is unchanged: 797 marks.

   Still to come: the rest of an object table (a companion compared
   with a constant and then cleared reads like a timer or a health);
   a table of low bytes and one of high (found as chosen, not written
   as a table); a way in per game for the ones that sit on a screen,
   which is where the next points of coverage are. That table of
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
