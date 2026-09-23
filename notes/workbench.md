# The game workbench: what we have, what we need

*The owner's brief, 2026-09-22: "A full game CRUD suite. Including the
sprite and palette editors. Load a game, tweak and play a game. Debug a
game. Capture and annotate code blocks. We did create a fullscreen
workbench earlier. Leverage that idea for general layout."*

Written from four read-only surveys on 2026-09-22: the NES pages and their
wasm, the API and its storage, the 6502 instruments and the site's chrome,
and the console's source repositories (`~/projects/tinymachines/nes`,
`2a03`, `2c02`, `nes-bus`, `ntsc-crt`, `nes-bench`). Everything below was
checked, not recalled. Where a figure appears it is the record's; where a
thing turned out not to be what it looked like, that is said.

**The short version.** The browser can already load a game from disk or
the shelf, run it with sound and a pad, and keep its battery RAM on the
server. Everything else the brief asks for is blocked on one fact: **the
console's wasm has eleven calls, and none of them looks inside the
machine.** No memory read, no register, no step, no reset, no save state.
The Rust console underneath has most of what a debugger needs as public
fields; the site's other half (drawing tiles, a 6502 disassembler, the
workbench frame, a CRUD shelf) exists too. What is missing is the seam
between them, plus three things nobody has built anywhere: a pixel editor,
an annotation format, and versions of a cartridge.

## The shape

One page, one engine, many views. The 6502 floor's own conclusion
(`notes/one-engine.md`) applies: a reader moving between the screen, the
sprites and the code should be looking at one running machine, not four
workers each holding their own copy of the game (which is what the play
page, the playground, the twins and the x-ray do today).

```
.workbench.has-transport
  WorkbenchBar        the bar: die tile, "NES / <cart name>", flag, menu
  SectionStrip        the panels as a strip: Screen  Sprites  Palettes  Memory  Code  Shelf
  .wb-main            the panels: side by side on a desk, one at a time on a phone
  transport (floor)   power · reset · play/pause · frame · instruction · rate · seek
  SiteFooter floor
```

- **The frame exists** and is what every 6502 instrument page is built
  from: `WorkbenchBar` (`web/app/components/SiteFrame.tsx`),
  `SectionStrip`, `FullscreenButton` with `html.has-fullscreen`, the
  floor-stacking variables `--app-head-h`, `--app-foot-h`, `--strip-h`, and
  the transport's look and its rule that a key the machine cannot honour is
  disabled, never hidden (`6502/explorer/ChipTransport.tsx`). In fullscreen
  the bar leaves, the strip docks to the top and the transport to the
  floor; the document still scrolls.
- **The NES pages do not use it yet.** `/nes/play` is a reading page with
  its own element-fullscreen on the screen and the pad; the playground is a
  long scroll of stations. Moving the play page into the frame is the first
  visible step and needs no engine work.
- **Panels at phone width** have two precedents, both upstream CSS rather
  than the kit: the explorer's tab bar below 68rem, and the games shell's
  swiped panes over `lib/shell/solve.ts`. **The kit has no tab component.**
  That is the owner's seam: a `.wb-tabs` (or the strip doing double duty)
  is a design decision, not a build one.
- **The transport's store is the 6502's** (`chip-controls.js`, upstream).
  The NES needs its own small store with the same verbs, driving the one
  console worker.

## Inventory, by what the brief asks for

Legend: **have** is on the site today; **engine** is in the Rust console
but not reachable from the browser; **need** is nowhere.

### Load a game

| | |
|---|---|
| have | from disk (`/nes/play`, the playground, twins, x-ray), from the shelf (`ShelfPicker`, `lib/shelf.ts fetchCart` with a SHA-256 check), raw PRG+CHR through the shelf (`api/carts.py with_header`) |
| have | seven boards, refused by name otherwise: NROM, MMC1, UxROM, CNROM, MMC3, MMC2, GxROM. All twenty desk dumps load; nineteen draw their title screen (`docs/nes/boards`) |
| have | iNES and NES 2.0 headers read, trainers handled, exact-length check (`api/carts.py read_header`) |
| need | nothing for the first cut. Later: a signed-out reader's game kept locally (there is no IndexedDB anywhere; a disk ROM lives in worker memory only) |
| stale | `console.worker.mjs` and `notes/nes-play.md` still say "NROM only" |

### Play

| | |
|---|---|
| have | the console at the source's rate in one worker, the picture decoded through the signal path in another (WebGPU or wasm), sound gapless through WebAudio, drift counters (`playEngine.ts`, `console.worker.mjs`, `picture.worker.mjs`) |
| have | keyboard (X A, Z B, right Shift Select, Enter Start, arrows), a multitouch pad (`Gamepad.tsx`), battery RAM written to the shelf on change, on pause, on hide, before another cart loads |
| engine | controller 2 (`set_pad(i, …)` takes a port; the wasm exposes port 0 only) |
| need | the Gamepad API (no `getGamepads` anywhere); a BLE pad needs no browser code, it is a keyboard (`docs/nes/pad-ble`) |
| fixed today | every write from beta was refused: the API's Origin rule knew only the apex, so a game saving on beta looked like one that never saved (`3d9d4ce`, needs a deploy) |

### Debug

| | |
|---|---|
| have | nothing for the NES. The x-ray records your play as a pad byte per frame and replays it twice from power-on to find the first differing frame; its own note says the instruction is not in this bundle |
| have | for the bare 6502: the explorer's trace, tracer, decode and timing pages; the Halfwave Lab's recorded run with registers, memory, stack and listing; `ProgramChip.tsx` in the playground (assemble, step, registers in fixed cells, a zero-page grid), all against the 6502 API, which has a breakpoint (`/v1/step` with `until_pc`) |
| have | **a 6502 disassembler in JavaScript**: `6502/web/disasm.js`, one table of the 151 documented opcodes, `disassemble(opcode, pc, read)`, served from the boarded worktree and already regex-read by `nes-bench/tools/xray.py`. Its inverse, `asm.js`. Neither is in this repository |
| engine | stepping by master half-step and by frame (`Console::master_half_step`, `run_master`); an instruction step is a loop until the CPU's SYNC pin |
| engine | a warm reset of the CPU (`reset_button`); power-on is a new `Console` |
| engine | CPU registers (`cpu.core.registers()`), a side-effect-free bus `peek`, work RAM, the $6000 RAM, the nametables (`cart.ciram`), CHR-RAM, the PPU's registers, `palette[32]`, `oam[256]`, line and dot (`v2c02_fast::Fast`, all public fields), the APU (`Clone + Copy`), each mapper's read-only views (`Mmc3::banks()`, `Mmc1::registers()`, …) |
| engine | a per-half-cycle CPU trace (`cpu_trace`), and the command-line tools `trace.rs` (pins, events with line and dot, PPU and mapper writes, NMI edges) and `where-it-sits.rs` (`TRAP=addr`, `BUS=a-b`, `WRITES=`: a breakpoint and a bus log, at the command line) |
| need | **wasm exports for all of the above.** `nes-wasm/src/lib.rs` is the whole seam. Reads first (no model change, unblocks every viewer), then control (reset, three step sizes, port 1), then pokes, then a breakpoint set checked inside the stepping loop and a trace ring buffer (crossing the wasm boundary per half-cycle would be too slow; the record has the bundle at about 1.26x real time under node) |
| need | the panels: registers (`.regs`, `.flags`), memory (`.dump`), a disassembly listing with the current instruction lit, a PPU readout (line, dot, registers). The kit has every block; nothing draws them for the NES |

### Sprites

| | |
|---|---|
| have | `chr.js`: `decodeCHR`, `encodeCHR`, `buildSheet`, `drawScreen`, exactly the NES 2bpp planar format, served for the 6502 registry's art; `ChrArt.tsx` draws with it; `art.js` turns an image into tiles |
| have | but with a fixed four-colour "die" palette, not NES colours |
| engine | CHR-RAM is writable and readable (`Cart::chr_ram`); CHR-ROM bytes are private fields of each nes-bus mapper and `chr_write` is ignored, so editing CHR-ROM means patching the ROM and reloading. Reading CHR through MMC2 flips its latch |
| engine | OAM (`Fast::oam`), to say which tile is which sprite on screen |
| need | **a pixel editor.** None exists anywhere (the site, the 6502 games, the playground). The tile viewer can start today from the ROM bytes alone, no engine work: decode the CHR bank, draw the sheet, paint with a palette |
| need | which palette to paint with: sprites take their colours from palette RAM at run time, so a viewer without the engine paints with a chosen palette; a viewer with the engine paints with the real one |

### Palettes

| | |
|---|---|
| have | the 64 colour codes measured through the encoder and the decoder, as RGB, a wave and a phase (`playground.worker.mjs measurePalette`, `Colours.tsx`). There is no RGB table anywhere by design: colour comes from simulating the signal |
| engine | palette RAM, `Fast::palette[32]`, initialised from the measured power-on state, not zeros |
| need | a read and a write export for palette RAM; then a palette panel is thirty-two cells each showing a measured colour, and an edit is a code, not an RGB. An edit that should survive a reset is a ROM patch (the game writes its palettes from code), which the tweak model below covers |

### Tweak

| | |
|---|---|
| have | nothing edits bytes. The shelf's PATCH changes name and note only; a duplicate SHA-256 is refused, so an edited ROM is a new, unrelated cart. The only header writer is server-side (`with_header`) |
| have | a checker for "what did my change do": the x-ray's two runs and first divergence, and the twins' differing-dots count |
| need | a patch model in the browser: byte ranges against a base cart, applied to make a new iNES image, reloaded into the engine, kept with the cart (below), exported as a file or as an IPS/BPS patch. This is site work and can start now |
| engine | live pokes (CPU RAM, palette, OAM, CHR-RAM) for trying a change before patching it; a CHR-ROM write hook in nes-bus if editing CHR-ROM without a reload matters |

### Capture and annotate code blocks

| | |
|---|---|
| have | seven code patterns and the Mario dissection as markdown with conventions (`docs/nes/encyclopedia.md`, `mario-dissection.md`, written in nes-bench from `tools/xray.py` and `tools/dissect.py`), and three build-time parsers that already understand them: `encyclopedia.ts` (entries), `xray.ts` (the x-ray grammar `h A..B INSTR at $ADDR: effects`, `signature: code at $A..$B`, the listing `ADDR MNEM operand ; comment`), `mario.ts` (the scanline table) |
| have | the nearest existing shapes: `programs.js` entries with `watch:[{addr,name}]` and `notes:{label: prose}`; `articles.json` chunk anchors; `dissect.py`'s call tree and jump-engine detection |
| have | the policy, stated in the documents: a commercial cartridge's code is shown as shape only (addresses, masked bytes); bytes appear only for ROMs whose source is ours |
| need | **a data shape.** Something like `{cart: sha256, where: {bank, offset, length} or {cpu: $A..$B}, label, tags, body (markdown), bytes_sha256}`; a capture gesture (select a range in the disassembly, or "the last N instructions" from the trace ring); the block rendered with `disasm.js`; a server store (below); export as a symbol file |
| need | the disassembly to capture from. Static disassembly of a PRG bank works from the ROM bytes today for NROM; other boards need the mapper's bank state from the engine to say which bank a CPU address is |

### Keep: the CRUD

| | |
|---|---|
| have | the private shelf (`api/carts.py`, `lib/shelf.ts`, `nes/shelf/Manager.tsx`): list, add iNES or raw, fetch, patch name and note, delete; one battery-RAM save per cart (get, put, delete); every account has 32 places, 4 MiB per cart, 32 KiB per save; bytes on disk under `$STATE/carts/<user>/<sha256>.nes`, never in the database, never served to anyone else, `private, no-store`; an admin opens or closes a shelf by `carts_max` |
| have | the pattern to follow: Pydantic models with described fields, routes with summaries, the README's route table, `test_carts.py` (a signed-in client, synthetic ROMs, ownership as 404, limits, digest rot, the cross-origin 403) |
| need | **versions of a cart.** A lineage (`parent_id` or base plus revision), a message per revision, restore. Whether a revision is a whole ROM or a patch against the base is the owner's call; patches are smaller, keep lineage obvious, and a patch carrying none of the base's bytes is the one thing that could ever be shared |
| need | **annotations**: a table keyed to a cart and a range, CRUD under `/v1/me/carts/{id}/blocks` (or similar), quotas |
| need | **save states**, and this one is blocked by the engine: nothing in the console can be snapshotted except the CPU core (`MicroCpu::snapshot`); the PPU's shifters and sprite units are private, every mapper is private with no `Clone`, the board sits in `Rc<RefCell>`. Four repositories would need snapshot and restore. The x-ray's replay-from-power-on with a recorded pad script is the substitute today, and it is a fair one for short runs |
| need | soft delete or undo (deletes are hard), a total bytes quota per account, and a written rule on visibility before anything is shareable |

## The two lines that decide the rest

**Licensing.** `NOTICE.md` covers the die data: the console wasm is built
from it, so it is served and never committed, and everything derived is
NonCommercial and ShareAlike. Nothing written says anything about sprites,
palettes or annotations lifted from a commercial ROM. The rule the shelf
already runs on (a dump is private to its owner, never in a row, never
served to anyone else) implies the same for tiles and palettes taken from
one, and for a captured block's bytes. Shape (addresses, labels, prose)
and patches that carry no base bytes are the shareable kinds; our own ROMs
(the calibration cart, the plumbing cart, the bench's) are the ones a
public example can show whole. **This should go into `NOTICE.md` before
the first sharing feature, not after.**

**The engine seam.** Every engine change goes back through the gates
(`scripts/board-nes.py --board`, then `--wasm`), and the console spans
four repositories pinned three ways (nes-bus by tag, the 6502 crates by
revision, 2a03 and 2c02 by path). Reads can be exported without touching
the model; control and pokes touch `nes-console`; a CHR-ROM write hook
touches `nes-bus`; save states touch all four. One thing to fix on the
way in: `Fast::vram_writes` is appended on every $2007 write and never
cleared in console use, a slow leak during long play and dead weight in
any state dump.

## An order that keeps every step useful on its own

1. **The frame, with the play page in it.** Bar, strip, the screen as the
   first panel, the shelf as the last, the transport with only the keys
   the engine honours today (power, play/pause, frame). Fullscreen. No
   engine work. The one-engine rule from the start: one worker, the
   panels as views.
2. **Sprites from the bytes.** The CHR sheet decoded from the loaded ROM
   with `chr.js`, painted with a chosen palette from the measured 64. Then
   the pixel editor, then the patch model: an edit becomes a byte range,
   the image is rebuilt and reloaded, the change is seen at once. This is
   the first thing a reader can *make*, and it needs nothing from the
   engine.
3. **Versions on the shelf.** Revisions (or patches) with a message and a
   restore, annotations as a table, quotas, tests in the `test_carts.py`
   shape. The NOTICE line first.
4. **Reads out of the engine.** Registers, bus peek, PPU state, palette
   RAM, OAM, nametables, CHR, mapper banks. Then the registers, memory,
   PPU and palette panels, and the sprite panel painting with the real
   palette and naming which sprite is which.
5. **Control and the code panel.** Reset, the three step sizes, controller
   2; the disassembly listing with `disasm.js` lit by the program counter;
   capture a block from a selection; annotate it; keep it.
6. **Breakpoints and the trace ring.** Inside the loop, exported as a set
   and a buffer.
7. **Save states, if still wanted.** The largest engine change, four
   repositories, and the one the replay-from-power-on substitute covers
   worst for long sessions.

## Decisions that are the owner's

- The page: a new `/nes/workbench`, or `/nes/play` growing panels. The
  brief's "leverage the workbench idea" reads as the former.
- The tab component for panels at phone width (the kit has none), and
  whether the strip is it.
- Revisions as whole ROMs or as patches against a base.
- The `NOTICE.md` rule on sprites, palettes and captured bytes from
  commercial ROMs, and whether anything is shareable in the first cut.
- Whether save states are worth four repositories, or the replay
  substitute holds for now.
- What the transport's keys are for a console (frame and instruction, or
  also scanline and half-step).

## Found on the way

- The API refused every write from beta (fixed, `3d9d4ce`, awaiting a
  deploy).
- `Fast::vram_writes` never shrinks (engine; the nes group's).
- "NROM only" survives in two comments after seven boards arrived.
- `api/README.md` still says a cartridge table would be a mistake, in a
  paragraph about registry carts written before the shelf.
- The console's own RAM at $6000 shadows MMC1's and MMC3's, an open
  question the code already names.
