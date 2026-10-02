# The listing format

A cartridge as text: its program as assembly, its characters as bytes,
and everything we learn about it in the comments. One file is one
cartridge. Assembling the file gives the cartridge back, byte for byte,
and that is the check every tool runs before it believes a listing.

This is version 0 of the format. The first line of a file says which.

## The idea

A listing is source, not a printout. It carries no addresses and no
byte columns: every address follows from the bank's origin and the
lengths of the lines before it, so a line inserted, deleted or edited
moves everything after it the way it would in an assembler, and the
check catches any edit that changes the bytes. What a reader adds (a
name, a comment, a mark that says what a routine is) lives in comments
and changes no bytes, so it can be added freely.

Three things follow from that:

- **The bytes and the words are separable.** A listing of somebody
  else's cartridge is as private as the cartridge (`NOTICE.md`), but its
  *shape* (labels, marks, prose, comments, each anchored by bank and
  offset) carries no bytes and can be laid over the same cartridge
  again. `listing shape` writes it.
- **A tool can render what it likes.** Addresses and bytes beside each
  line (`listing render`), a routine's window, a tile drawn from its
  sixteen bytes: all derived, none stored.
- **Anything a tool learns is a mark in a comment.** A static walk, a
  run of the game, a pattern matcher and a person all write the same
  kind of line, and each says which of them wrote it.

## Lines

Every line is one of these. Indentation is what tells a label from an
instruction: labels start in column one, code and data are indented.

| line | what |
|---|---|
| `;; @name rest` | a mark: markup the tools read (below) |
| `;; text` | prose for the reader, about what follows |
| `; text` | a note on a line of its own |
| `name:` | a label; `name` is a letter or underscore, then letters, digits, underscores; one namespace for the whole file |
| `    MNEM operand   ; comment` | an instruction, one of the 151 documented ones |
| `    .byte $00,$01  ; comment` | bytes, as many as the line lists |
| `    .word $FFFC    ; comment` | a little-endian word; may name a label |
| blank | nothing |

A comment after code starts at `;` and runs to the end of the line.

### Operands

The assembler's usual forms, and hex digit count decides zero page
against absolute:

| form | mode |
|---|---|
| nothing | implied |
| `A` | accumulator |
| `#$12` | immediate |
| `$12`, `$12,X`, `$12,Y` | zero page, indexed |
| `$1234`, `$1234,X`, `$1234,Y` | absolute, indexed |
| `($12,X)`, `($12),Y` | indirect indexed |
| `($1234)` | indirect (JMP) |
| `label`, `label,X`, `label,Y`, `(label)` | absolute forms; a label is an address |

A branch takes its target, as `$1234` or a label, never a displacement;
the assembler computes the displacement and refuses one out of reach.

`BRK` is two bytes on the 6502 (it pushes the address after the next
byte), and the second byte is whatever the cartridge has there, so a
listing writes it as `BRK #$06`. A bare `BRK` assembles as `BRK #$00`.

An undocumented opcode is never written as an instruction: it appears
as `.byte`, and a tool that recognises it may say what it is in the
comment. This keeps the 151 documented opcodes the only vocabulary.

## The header

The first two lines of every file:

    ;; @listing 0
    ;; @rom sha256=<hex> mapper=<n> mirroring=<horizontal|vertical|four-screen> prg=<bytes> chr=<bytes>

The digest is the whole iNES file's, so a listing knows which cartridge
it is of, and `listing check FILE ROM.nes` refuses a mismatch by name.

## Banks

The PRG and the CHR are listed in banks, each opened by a mark:

    ;; @bank prg 0 org=$8000 size=32768 fixed
    ;; @bank prg 1 org=$8000 size=16384 switched
    ;; @bank chr 0 size=8192

Lines after a bank mark belong to it until the next one. A PRG bank's
`org` is the CPU address its first byte answers at; on a board that
switches banks it is the address the board gives that bank most of the
time, and `switched` says the game may put it elsewhere, so an address
inside a switched bank is that bank's, not the console's. The banks a
board has, as the writer lays them out:

| board | banks |
|---|---|
| NROM (0), CNROM (3) | one: 32 KiB at $8000, or 16 KiB at $C000 (mirrored) |
| GxROM (66) | 32 KiB each at $8000 |
| MMC1 (1), UxROM (2) | 16 KiB at $8000, the last fixed at $C000 |
| MMC3 (4) | 8 KiB at $8000, the last two fixed at $C000 and $E000 |
| MMC2 (9) | 8 KiB at $8000, the last 24 KiB fixed at $A000 |

That is where a bank usually is. When a run is laid over the listing,
a bank any instruction ran in is put where its instructions ran (the
origin most of them ran at): an MMC3 game may switch the $C000 window
and keep the second to last bank at $8000 instead, and one such game's
banks ran at $A000 and $C000, where no absolute address inside them
resolved while the listing had them at $8000. A bank nothing ran in
stays where the board usually puts it.

Any other board is refused by name: a guessed layout would give every
label a wrong address.

A bank's lines must add up to exactly its size. Too few or too many
bytes is an error naming the bank, not a listing that quietly shifts.

The CHR is `.byte` lines of sixteen: one tile per line, so a renderer
can draw it and a line number is a tile number.

## Marks

A mark is `;; @name` and, after it, words and `key=value` pairs. The
tools read the ones below and keep any other as it is, so a new kind of
mark costs nothing until a tool learns it. Every mark that states a
finding says who found it with `by=`: `walk` (the static walk from the
vectors), `run` (a trace of the game running), a matcher's name, or
`hand` for a person.

| mark | meaning |
|---|---|
| `@walk from reset=$8000 nmi=$8082 irq=$FFF0` | what the static walk started from in this bank; `from nothing` when no vector lands in it |
| `@routine name kind=reset\|nmi\|irq\|brk\|call\|dispatch [entered=N] by=…` | the label that follows is a routine's entry, how it is entered, and from a run how many times; with `inside=$XXXX` no label follows: the entry is a byte inside the instruction at that address (code that overlaps itself, the `BIT` skip), which a listing of lines cannot label |
| `@is pattern key=value ... by=match` | the label (or instruction) that follows is an instance of a pattern from the encyclopedia, with the evidence the matcher saw (below) |
| `@table dispatch entries=N seen=M [on=$XXXX,...] by=run` | the `.word`s that follow are a jump engine's table, `N` entries as far as the run saw them taken and `M` of them taken; a word that ran says how often. `on=` are the bytes of RAM that `A` was made from at the call (the four that chose most often, busiest first): the game's mode, or an object's state. Absent when `A` came from a constant or the ROM |
| `@table pointers entries=N seen=M [on=$XXXX,...] by=run` | the `.word`s that follow are a table of addresses a `JMP (ind)` of its own went through: found by where the pointer's two bytes were loaded from (the flow's `words`), from the lowest word the run saw taken to the highest, when the two bytes sat side by side in the ROM. `on=` is what the index that loaded the word was made from. A table of low bytes and another of high is not found this way |
| `@vectors` | the three words that follow are the NMI, reset and IRQ vectors |
| `@ram variables=N arrays=M by=run` | after the PRG banks: the RAM the routines share, one `@array` per indexed base and one `@var` per byte |
| `@array $XXXX slots=N sites=K [x=N] [y=N] by=run` | RAM an indexed instruction reached from this base across `N` bytes at most (as far as the run saw), `K` instructions indexing it: the object slots and the tables in RAM. `x=` and `y=` are how many of its bytes are positions the `position-compare` rule saw compared, by the coordinate they reached; a byte inside several arrays counts for the tightest one, so the loop that clears a page holds none |
| `@objects slots=N arrays=M routines=R [x=$XXXX,...] [y=$XXXX,...] [with=$XXXX,...] [adds=$XXXX,...] [chooses=$XXXX,...] [down=$XXXX,...] by=run` | after the `@array` lines: arrays that travel together. `x=` and `y=` are arrays that hold compared positions; `with=` are their companions, each an array that at least two routines indexed across the same range of indexes as one of the position arrays. Position arrays that are each other's companions are one table. `slots` is the longest position array's, `arrays` how many there are in all, `routines` how many index a position array. `adds=` are the companions a byte of which was added into a byte of a position array, the sum going back into the position (the flow's `moves`): what moves them, a speed in most games. `chooses=` are the companions a byte of which chose a jump engine's way (a `@table`'s `on=`): a state or a kind. `down=` are the companions with a byte a `DEC` stepped down in place and no `INC` ever stepped up: a countdown, which is what a timer is. For the rest it is what the run saw indexed together, not a claim about what each array means |
| `@var $XXXX writers=name:N,... readers=name:N,... total=N by=run` | a RAM byte one routine writes and another reads, each side's routines by label (or by address, when the routine ran from RAM) with their counts, the busiest six and `+N` more |
| `@run frames=N instructions=N executed=B of=P by=run` | after the header: a run was laid over the file; it executed `B` of the `P` PRG bytes |
| `@coverage executed=B of=L sites=N by=run` | after a bank's `@walk`: the same for this bank |
| `@ran N by=run` | the instructions from here on ran `N` times each, until the next `@ran`, `@unreached`, label or data |
| `@unreached by=run` | the instructions from here on are code the walk found and the run never executed |

Coverage is the number the autopsy is measured by: `executed` counts
the bytes of every instruction the run executed, and `of` is the whole
bank or PRG, so a game whose data is half its ROM never reads as
fully covered, which is the point. What the run did not reach is
still listed as the walk left it, and the marks say which is which.

Marks the autopsy will add as it learns them, in the same shape:
`@table` (a run of data the code indexes, its width and count),
`@var` (a RAM address, its name and width, who reads and writes it),
`@pattern` (a stretch that matches an encyclopedia entry, with the
evidence). Each is a comment, so a listing carrying marks a tool does
not yet know still assembles.

## What a run adds

`listing from ROM.nes REPORT.json ...` takes the flow report of a
trace (`wasm/flow`, from the console's replay or from the console
repo's `script-trace` example), or the coverage a crawl wrote (the
console repo's `crawl` example, the same shape with no routines), or
several of them folded into one run (counts add, routines are kept
once), and lays it over the walk. Every instruction
the run executed is code, whatever the walk thought, and the walk goes
on from each of them; the run's routines and how they were entered
become `@routine ... by=run`, and an address the walk only knew as a
branch target takes the run's name and kind; each stretch of
instructions gets its count; the header and each bank say how much was
executed. The report
must be of the same PRG size or it is refused. Code the run executed
from RAM has no place in a listing of the ROM and is left out.

After the PRG banks the run's variables are listed: every RAM byte
(zero page, `$0200` to `$07FF`, cartridge RAM) that one routine wrote
and another read, with who did what how often. That is the model's
"variables" table in its first form; a role (`@is` on a variable) comes
with the matchers that need the reads per instruction.

A `JSR` the run saw dispatch (a jump engine's call: the report keys a
dispatch at that site) is not fallen through by the walk, because what
follows is the table. The words after it are written as `.word` lines
as far as the last entry the run saw taken, each taken one saying how
often; a word past that is never taken for an entry, and the rest stays
bytes. A table whose bytes something claimed as code is left as it was.

## What the matchers write

A matcher is a rule over what the run saw, one per pattern in the
encyclopedia, and writes `@is pattern ... by=match` before the routine
(or the instruction) with the evidence in its `key=value`s. It never
reads the bytes for meaning: a poll routine is one that read the pad
port eight times, not one that looks as if it should. No evidence, no
mark.

| pattern | the rule, and the evidence written |
|---|---|
| `pad-poll` | a routine that read `$4016` or `$4017` at least eight times (one per button) for every frame it ran: `port= reads-per-frame= strobes-per-frame=` (writes of `$4016` per frame, 0 when the strobe is elsewhere). Per frame, not per entry: one game's poll is entered twice a frame and reads four times each |
| `jump-engine` | the routine the run's dispatching `JSR`s call: `tables=` how many call sites, `dispatches=` how many times it dispatched |
| `handler-in-memory` | a routine with a `JMP (ind)` whose pointer was copied out of RAM, not loaded from the ROM (the flow follows the pointer's two bytes back): each thing keeps the address of its own code and the routine runs it. `jumps=` times, `targets=` places it landed, `from=` the arrays those bytes sit in (the tightest around each), or the bytes themselves |
| `idle-spin` | a loop of one instruction the run counted as idle: `iterations= per-frame=` |
| `counting-spin` | an endless loop of several instructions: a straight line with no branch, call or return in it, closed by a `JMP` to its own head, that wrote one byte of RAM and read nothing but RAM: `byte= iterations= per-frame= read-elsewhere=` (reads of that byte by routines outside the loop: it is as good as a random number to them) |
| `game-loop-in-nmi` | when there is an idle spin or a counting spin, an NMI handler that ran in at least half the frames: `frames= of= spin=` |
| `frame-wait` | a loop the run went round whose instructions only load, test and branch, on bytes of RAM at fixed addresses, so that nothing in it can change what it tests and only an interrupt lets it out; marked when the NMI handler, or a routine the handler reached by calls, wrote the byte the loop read most: `flag=` that byte, `entries=` times the loop was entered, `iterations=` times round, `set-in-nmi=` those writes, `of=` frames. A `JSR` may sit in the loop when neither the routine it calls nor anything that one reached wrote the byte (`calls=`: a wait that does a chore each turn). A loop that indexes, counts a register down, reads the hardware, or leaves by a `JMP` anywhere but its last instruction is not one, whatever it reads |
| `position-compare` | a routine holding a compare or a subtract whose two sides were made from different bytes of RAM that each reached a sprite's Y or X byte and never the same sprite byte together (so a position against the camera is not one), and that each carry a value from one frame into the next (so a temporary holding a constant is not one). The flow follows each value from the byte it was loaded from through registers, the stack and temporaries: `sites=` such instructions in the routine, `pairs=` different pairs of bytes, `cells=` different bytes, `meets=` times, `x=` and `y=` the bytes by the coordinate they reached (twelve at most). It is the heart of a collision test, and equally of an enemy asking which side the player is on and of a game sorting its sprites by depth; the rule does not tell them apart |
| `sound-driver` | of the routines that wrote the APU (`$4000` to `$4013`, `$4015`, `$4017`), the one that wrote most among those that ran in at least half as many frames as the busiest: `writes= frames=` |
| `vram-drain` | the same over writes of `$2007`, and where the beam was for them: `in-blank= in-picture=` |
| `sprite-0-split` | a routine that read `$2002` at least eight times a frame while the picture was drawing (the wait for sprite 0's hit; a wait is many reads) and then wrote `$2005` there, at least every other frame it ran; `$2006` does not count, since a screen drawn with rendering off sets the address in the picture too: `scroll-writes-in-picture= status-reads-in-picture= frames=` |
| `bank-switch` | a routine that wrote into the ROM's window, which on a board with a register is the mapper: `writes= in-picture= in-blank=` |
| `palette-writer` | a routine that wrote `$2007` while the PPU's address was in the palette (the report follows the address latch through `$2006`): `writes= frames=` |
| `sprite-writer` | a routine that wrote into the page of RAM the sprite DMA took most often (the page named to `$4014`): `oam-writes= frames=` |
| `scroll-writer` | a routine that wrote `$2005` in the blank at least once every frame it ran: `writes-in-blank= frames=` |
| `random-byte` | a routine that rewrote a RAM byte from itself with a shift or a rotate (the instruction read and wrote the byte), with an `EOR` somewhere in the routine and a look at one of those bytes besides (the feedback: a bit of the old value decides the new). The byte carries its value from one frame into the next, by most of the reports laid over (the flow's `carried`; a multiply stirs scratch the same way). The routine does not read the pad, since a poll shifts the buttons into a byte and EORs it with the last reading. And of the routines a stirring instruction ran in (code several jump into ran in each), the tightest keeps the mark: `bytes= shifts= eors= frames=`. With reports from before the flow said which bytes are carried, the older test stands in for that part: the routine ran in at least half the frames |

The report says, per routine, how many of its accesses of each PPU
register, of `$4014` and of the mapper fell while the picture was
drawing (lines 0 to 239) and how many in the blank, where in VRAM its
`$2007` writes landed (pattern, name table 0 to 3, palette), and how
many bytes it wrote into the sprite page; and per instruction, the
addresses it read and wrote below the ROM and the lowest and highest
of them; per routine, the routines that called it; and per loop, how
often it was entered and gone round and the address it read most. That
is what the rules above and the `@array` lines read.

"The frames" in a rule are the frames somebody watched the routines
in: a flow report's. A crawl's own record laid over the same listing
adds coverage and its frames to `@run`, but it names no routine, so a
rule that asks "in at least half the frames" asks it of the watched
ones. (Counting the crawl's frames too halved every routine's share,
and for a while no game had its loop in the interrupt.)

Where a value came from is the flow's to say (`wasm/flow`, "Where a
value came from"): the report lists the bytes that reached a sprite's
position (`sprite_feeds`) and the instructions where two of them met
(`meets`). In Super Mario Bros. the two positions reach the comparison
through temporaries another routine fills, so no rule over one
routine's reads finds it; followed by value, the player's X and an
enemy's meet at three instructions of one routine. An `@array` says
how many such positions it holds, and `@objects` lists the arrays
indexed together with it: the first sight of a game's object table.
What each companion means (a speed, a state, a kind) is still to
come.

## What the static walk writes

`listing from ROM.nes` reads the three vectors of each bank that holds
them and follows control flow from there: fall-through, both sides of
a branch, `JSR` (into the routine and past it), `JMP` to an address.
It stops at `RTS`, `RTI`, `BRK`, `JMP (indirect)`, an undocumented
opcode, a byte already inside another instruction, or (with a run laid
over it) the `JSR` of a jump engine's call, whose table follows. What it reached
is code; everything else is `.byte`, honestly, until a run of the game
reaches more. So the first listing of a game is usually mostly data,
and that is correct: it says what a walk from the vectors can know.

Labels it mints: `reset`, `nmi`, `irq` for the vectors' targets,
`routine_XXXX` for a `JSR` target, `at_XXXX` for a branch or jump
target; on a board with more than one PRG bank every label carries its
bank, `b1_routine_C086`. With a run, a table's target is
`dispatch_XXXX`, and a routine or a loop a rule named is called by what
it is: `poll_`, `engine_`, `handlers_`, `split_`, `drain_`, `sound_`,
`random_`, `compare_`, `palette_`, `scroll_`, `sprites_`, `bank_`,
`wait_` and `spin_`, the first of those (in that order, the most
particular first) whose pattern marked it, so a poll that also writes
sprites is `poll_8E5C`. A vector's handler and a table's target keep
the names that say how they are entered. A person renames any of them
and the check still holds, because a name changes no bytes.

## The tools

    listing from ROM.nes           the first listing, to stdout
    listing from ROM.nes RUN.json  the same, with one or more runs laid over it
    listing check FILE ROM.nes     assemble FILE and hold it to ROM.nes, byte for byte
    listing render FILE            FILE with addresses and bytes beside each line
    listing shape FILE             FILE's marks, labels and comments as JSON, none of its bytes
    listing model FILE             the game model FILE's marks describe, as JSON: routines with
                                   their patterns, tables, arrays, object tables, variables, coverage
    listing rom FILE OUT.nes       assemble FILE into an iNES file
    tools/paths.py ROM.nes CRAWL OUT.lst
                                   trace every script a crawl kept, report each, and fold
                                   them all with the crawl's coverage into one listing
    tools/autopsy.py ROM.nes OUTDIR [--steps N]
                                   one dump end to end: crawl, paths, listing, and a
                                   summary in shape only (OUTDIR/summary.json)
    tools/union.py MODEL.json ...  one line per game and which patterns recur, from
                                   the model.json files the pipeline wrote

The same functions are exported for the page (`listing_from_rom`,
`listing_render`, `listing_check`), so the desk can load and render a
listing in the browser without the bytes leaving it.

## What is not in version 0

Expressions (`label+1`, `<label`), macros, local labels, `.org`,
segments: none. A listing is a description of bytes that exist, not a
program being written; when the studio needs an assembler for new
programs, that is a different file. Symbols for RAM (`@var`) and the
marks a run of the game adds are the next version's work, and they
arrive as marks, so files written today stay readable.
