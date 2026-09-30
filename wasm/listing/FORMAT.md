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
| MMC3 (4) | 8 KiB at $8000, the last 16 KiB fixed at $C000 |
| MMC2 (9) | 8 KiB at $8000, the last 24 KiB fixed at $A000 |

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
| `@vectors` | the three words that follow are the NMI, reset and IRQ vectors |
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

## What the static walk writes

`listing from ROM.nes` reads the three vectors of each bank that holds
them and follows control flow from there: fall-through, both sides of
a branch, `JSR` (into the routine and past it), `JMP` to an address.
It stops at `RTS`, `RTI`, `BRK`, `JMP (indirect)`, an undocumented
opcode, or a byte already inside another instruction. What it reached
is code; everything else is `.byte`, honestly, until a run of the game
reaches more. So the first listing of a game is usually mostly data,
and that is correct: it says what a walk from the vectors can know.

Labels it mints: `reset`, `nmi`, `irq` for the vectors' targets,
`routine_XXXX` for a `JSR` target, `at_XXXX` for a branch or jump
target; on a board with more than one PRG bank every label carries its
bank, `b1_routine_C086`. A person renames them and the check still
holds, because a name changes no bytes.

## The tools

    listing from ROM.nes           the first listing, to stdout
    listing from ROM.nes RUN.json  the same, with one or more runs laid over it
    listing check FILE ROM.nes     assemble FILE and hold it to ROM.nes, byte for byte
    listing render FILE            FILE with addresses and bytes beside each line
    listing shape FILE             FILE's marks, labels and comments as JSON, none of its bytes
    listing rom FILE OUT.nes       assemble FILE into an iNES file
    tools/paths.py ROM.nes CRAWL OUT.lst
                                   trace every script a crawl kept, report each, and fold
                                   them all with the crawl's coverage into one listing

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
