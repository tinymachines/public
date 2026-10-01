//! The matchers on a cartridge of our own: a small ROM written as a
//! listing and assembled here, with a made-up run laid over it that
//! says what each routine did. The check that cannot pass on nothing:
//! every `@is` names the routine that did the thing, and the jump
//! engine's table is words as far as the run saw it taken.

use std::collections::HashMap;

use listing::model::Item;
use serde_json::Value;
use listing::{asm, ines, text};

const SOURCE: &str = "\
reset:
    SEI
    LDA #$80
    STA $2000
    STA $8000
spin:
    JMP spin
nmi:
    JSR poll
    JSR sound
    JSR drain
    JSR split
    JSR random
    JSR engine
    .word state_a
    .word state_b
    .word state_c
state_a:
    RTS
state_b:
    RTS
state_c:
    RTS
poll:
    LDA #$01
    STA $4016
    LDA #$00
    STA $4016
    LDX #$08
poll_bit:
    LDA $4016
    LSR A
    ROL $00
    DEX
    BNE poll_bit
    RTS
engine:
    PLA
    STA $02
    PLA
    STA $03
    LDY #$01
    LDA ($02),Y
    STA $04
    INY
    LDA ($02),Y
    STA $05
    JMP ($0004)
split:
    BIT $2002
    BVC split
    LDA #$00
    STA $2005
    STA $2005
    RTS
random:
    LDX #$00
    LDA $0200,X
    EOR $11
    LSR A
    ROR $10
    ROR $11
    RTS
wait:
    LDA $20
    BEQ wait
    RTS
scan:
    LDA $0300,X
    BEQ scan
    RTS
delay:
    LDA $20
    DEX
    BNE delay
    RTS
other:
    LDA $21
    BEQ other
    RTS
hop:
    JMP wait
    LDA $20
    BEQ hop
    RTS
count:
    LDA $30
    ADC $37
    STA $30
    JMP count
count_port:
    LDA $2002
    STA $36
    JMP count_port
count_out:
    INC $31
    BEQ count_left
    JMP count_out
count_left:
    RTS
count_two:
    INC $32
    INC $33
    JMP count_two
count_down:
    INC $35
    BNE count_down
    RTS
chore_wait:
    JSR chore
    LDA $20
    BEQ chore_wait
    RTS
chore:
    INC $34
    RTS
self_wait:
    JSR setter
    LDA $20
    BEQ self_wait
    RTS
setter:
    STA $20
    RTS
hit:
    LDA $00
    CMP $01
    SBC $01
    LDA $86,X
    LDA $80,X
    LDA $90,X
    LDA $A0,X
    LDA $B0,X
    RTS
shift:
    LDA $86,X
    LDA $90,X
    LDA $A0,X
    RTS
sound:
    LDA #$0F
    STA $4015
    RTS
drain:
    LDA #$20
    STA $2006
    LDA #$00
    STA $2006
    STA $2007
    RTS
irq:
    RTI
";

/// Our ROM as an iNES image, and where its labels landed.
fn our_rom() -> (Vec<u8>, HashMap<String, u16>) {
    let head = ";; @listing 0\n;; @rom sha256=0 mapper=0 mirroring=horizontal prg=32768 chr=0\n;; @bank prg 0 org=$8000 size=32768 fixed\n";
    let mut src = format!("{head}{SOURCE}");
    let used: usize = text::parse(&src).unwrap_or_else(|e| panic!("{e}")).items.iter().map(|i| i.len()).sum();
    for _ in 0..(32768 - 6 - used) {
        src.push_str("    .byte $FF\n");
    }
    src.push_str("    .word nmi\n    .word reset\n    .word irq\n");
    let l = text::parse(&src).unwrap_or_else(|e| panic!("{e}"));
    let rom = asm::assemble(&l).unwrap_or_else(|e| panic!("{e}"));
    (ines::image(&rom), asm::addresses(&l).unwrap().0)
}

/// `n` instructions from an offset, as sites that ran `count` times.
fn seq(prg: &[u8], mut at: usize, n: usize, count: u64) -> Vec<serde_json::Value> {
    let mut v = Vec::new();
    for _ in 0..n {
        v.push(serde_json::json!({"key": at, "addr": 0x8000 + at, "count": count}));
        at += flow::ops::len(prg[at]) as usize;
    }
    v
}

#[test]
fn the_matchers_name_what_the_run_saw() {
    let (image, labels) = our_rom();
    let prg = &image[16..];
    let at = |n: &str| labels[n] as usize - 0x8000;
    let body = |n: &str, k: usize| -> Vec<usize> { seq(prg, at(n), k, 0).iter().map(|s| s["key"].as_u64().unwrap() as usize).collect() };
    let routine = |id: u64, n: &str, entry: &str, entered: u64, frames: u32, mem: serde_json::Value, in_frame: serde_json::Value| {
        let (vram, oam) = match n {
            "drain" => (serde_json::json!([["name 0", 8], ["palette", 2]]), 0),
            "poll" => (serde_json::json!([]), 40),
            _ => (serde_json::json!([]), 0),
        };
        let n_body = match n { "reset" => 4, "nmi" => 6, "poll" => 11, "engine" => 11, "sound" => 3, "drain" => 6, "split" => 6, "random" => 7, "wait" | "scan" | "other" => 3, "delay" | "hop" | "count" | "shift" => 4, "hit" => 9, "count_out" | "count_two" | "count_port" | "chore_wait" | "self_wait" => 3, "chore" | "setter" | "count_down" => 2, _ => 1 };
        // The NMI handler (routine 1) calls these six.
        // And each of the two waits with a call in it calls its own.
        let callers = match n {
            "poll" | "sound" | "drain" | "split" | "random" | "engine" => serde_json::json!([[1, labels["nmi"], entered]]),
            "chore" => serde_json::json!([[19, labels["chore_wait"], entered]]),
            "setter" => serde_json::json!([[21, labels["self_wait"], entered]]),
            _ => serde_json::json!([]),
        };
        serde_json::json!({"id": id, "key": at(n), "addr": labels[n], "entry": entry, "entered": entered, "frames": frames, "mem": mem, "in_frame": in_frame, "vram": vram, "oam_writes": oam, "body": body(n, n_body), "callers": callers})
    };
    let mut sites = Vec::new();
    for (n, k, count) in [("reset", 4, 1), ("spin", 1, 50000), ("nmi", 6, 10), ("poll", 11, 10), ("engine", 11, 10), ("state_a", 1, 7), ("state_c", 1, 3), ("sound", 3, 10), ("drain", 6, 10), ("split", 6, 10), ("random", 7, 10), ("wait", 3, 10), ("scan", 3, 10), ("delay", 4, 10), ("other", 3, 10), ("hop", 3, 10), ("count", 4, 40000), ("count_out", 3, 500), ("count_two", 3, 500), ("chore_wait", 3, 500), ("chore", 2, 500), ("self_wait", 3, 500), ("setter", 2, 500), ("hit", 9, 10), ("shift", 4, 10), ("count_down", 2, 2560), ("count_port", 3, 500)] {
        sites.extend(seq(prg, at(n), k, count));
    }
    // What the random routine's instructions touched: the indexed read
    // reaching eight slots, the EOR, and the two rotates on their bytes.
    let mut touch = |key: usize, reads: serde_json::Value, writes: serde_json::Value, span: serde_json::Value| {
        let s = sites.iter_mut().find(|s| s["key"] == key).unwrap();
        s["reads"] = reads;
        s["writes"] = writes;
        s["span"] = span;
    };
    touch(at("wait"), serde_json::json!([[0x20, 30000]]), serde_json::json!([]), serde_json::json!([0x20, 0x20]));
    touch(at("scan"), serde_json::json!([[0x0300, 100], [0x0301, 100]]), serde_json::json!([]), serde_json::json!([0x0300, 0x0327]));
    touch(at("delay"), serde_json::json!([[0x20, 2550]]), serde_json::json!([]), serde_json::json!([0x20, 0x20]));
    touch(at("hop") + 3, serde_json::json!([[0x20, 100]]), serde_json::json!([]), serde_json::json!([0x20, 0x20]));
    touch(at("other"), serde_json::json!([[0x21, 30000]]), serde_json::json!([]), serde_json::json!([0x21, 0x21]));
    touch(at("count"), serde_json::json!([[0x30, 40000]]), serde_json::json!([]), serde_json::json!([0x30, 0x30]));
    touch(at("count") + 2, serde_json::json!([[0x37, 40000]]), serde_json::json!([]), serde_json::json!([0x37, 0x37]));
    touch(at("count_port"), serde_json::json!([[0x2002, 500]]), serde_json::json!([]), serde_json::json!([0x2002, 0x2002]));
    touch(at("count_port") + 3, serde_json::json!([]), serde_json::json!([[0x36, 500]]), serde_json::json!([0x36, 0x36]));
    touch(at("count") + 4, serde_json::json!([]), serde_json::json!([[0x30, 40000]]), serde_json::json!([0x30, 0x30]));
    touch(at("count_out"), serde_json::json!([[0x31, 500]]), serde_json::json!([[0x31, 500]]), serde_json::json!([0x31, 0x31]));
    touch(at("count_two"), serde_json::json!([[0x32, 500]]), serde_json::json!([[0x32, 500]]), serde_json::json!([0x32, 0x32]));
    touch(at("count_two") + 2, serde_json::json!([[0x33, 500]]), serde_json::json!([[0x33, 500]]), serde_json::json!([0x33, 0x33]));
    touch(at("count_down"), serde_json::json!([[0x35, 2560]]), serde_json::json!([[0x35, 2560]]), serde_json::json!([0x35, 0x35]));
    touch(at("chore_wait") + 3, serde_json::json!([[0x20, 500]]), serde_json::json!([]), serde_json::json!([0x20, 0x20]));
    touch(at("self_wait") + 3, serde_json::json!([[0x20, 500]]), serde_json::json!([]), serde_json::json!([0x20, 0x20]));
    // Two indexed reads over the X positions the routine compared: one
    // from the first of them across six bytes, one from lower across
    // sixteen. The tighter array is the one that holds them.
    touch(at("hit") + 6, serde_json::json!([[0x86, 5], [0x8b, 5]]), serde_json::json!([]), serde_json::json!([0x86, 0x8b]));
    touch(at("hit") + 8, serde_json::json!([[0x80, 5], [0x8f, 5]]), serde_json::json!([]), serde_json::json!([0x80, 0x8f]));
    // What travels with the positions: $90 is indexed across the same
    // six by both routines that index $86. $A0 is across six in one
    // and four in the other, and $B0 is in one routine only: neither
    // travels with them on this evidence.
    touch(at("hit") + 10, serde_json::json!([[0x90, 5], [0x95, 5]]), serde_json::json!([]), serde_json::json!([0x90, 0x95]));
    touch(at("hit") + 12, serde_json::json!([[0xa0, 5], [0xa5, 5]]), serde_json::json!([]), serde_json::json!([0xa0, 0xa5]));
    touch(at("hit") + 14, serde_json::json!([[0xb0, 5], [0xb5, 5]]), serde_json::json!([]), serde_json::json!([0xb0, 0xb5]));
    touch(at("shift"), serde_json::json!([[0x86, 5], [0x8b, 5]]), serde_json::json!([]), serde_json::json!([0x86, 0x8b]));
    touch(at("shift") + 2, serde_json::json!([[0x90, 5], [0x95, 5]]), serde_json::json!([]), serde_json::json!([0x90, 0x95]));
    touch(at("shift") + 4, serde_json::json!([[0xa0, 5], [0xa3, 5]]), serde_json::json!([]), serde_json::json!([0xa0, 0xa3]));
    touch(at("random") + 2, serde_json::json!([[0x0200, 5], [0x0207, 5]]), serde_json::json!([]), serde_json::json!([0x0200, 0x0207]));
    touch(at("random") + 5, serde_json::json!([[0x11, 10]]), serde_json::json!([]), serde_json::json!([0x11, 0x11]));
    touch(at("random") + 8, serde_json::json!([[0x10, 10]]), serde_json::json!([[0x10, 20]]), serde_json::json!([0x10, 0x10]));
    touch(at("random") + 10, serde_json::json!([[0x11, 10]]), serde_json::json!([[0x11, 20]]), serde_json::json!([0x11, 0x11]));
    let jsr_engine = at("nmi") + 15;
    let report = serde_json::json!({
        "prg_len": 32768, "frames": 10, "instructions": 1000,
        "sites": sites,
        "routines": [
            routine(0, "reset", "reset", 1, 10, serde_json::json!([[0x2000, 0, 1], [0x8000, 0, 1]]), serde_json::json!([[0x2000, 0, 1], [0x8000, 0, 1]])),
            routine(1, "nmi", "nmi", 10, 10, serde_json::json!([[0x2005, 0, 10]]), serde_json::json!([[0x2005, 0, 10]])),
            routine(2, "poll", "call", 10, 10, serde_json::json!([[0x4016, 80, 20], [0, 80, 80]]), serde_json::json!([])),
            routine(3, "engine", "call", 10, 10, serde_json::json!([[2, 20, 10]]), serde_json::json!([])),
            routine(4, "state_a", "dispatch", 7, 7, serde_json::json!([]), serde_json::json!([])),
            routine(5, "state_c", "dispatch", 3, 3, serde_json::json!([]), serde_json::json!([])),
            routine(6, "sound", "call", 10, 10, serde_json::json!([[0x4015, 0, 10], [0x20, 0, 10], [0x0300, 0, 10], [0x30, 7, 0]]), serde_json::json!([])),
            routine(7, "drain", "call", 10, 10, serde_json::json!([[0x2006, 0, 20], [0x2007, 0, 10]]), serde_json::json!([[0x2006, 0, 20], [0x2007, 0, 10]])),
            routine(8, "split", "call", 10, 10, serde_json::json!([[0x2002, 200, 0], [0x2005, 0, 20]]), serde_json::json!([[0x2002, 200, 0], [0x2005, 20, 0]])),
            routine(9, "random", "call", 10, 10, serde_json::json!([[0x10, 10, 20], [0x11, 20, 20]]), serde_json::json!([])),
            routine(10, "wait", "call", 10, 10, serde_json::json!([[0x20, 30000, 0]]), serde_json::json!([])),
            routine(11, "scan", "call", 10, 10, serde_json::json!([[0x0300, 400, 0]]), serde_json::json!([])),
            routine(12, "delay", "call", 10, 10, serde_json::json!([[0x20, 2550, 0]]), serde_json::json!([])),
            routine(13, "other", "call", 10, 10, serde_json::json!([[0x21, 30000, 0]]), serde_json::json!([])),
            // The IRQ handler writes the byte `other` waits on; the NMI
            // handler does not reach it.
            routine(14, "irq", "irq", 1, 1, serde_json::json!([[0x21, 0, 1]]), serde_json::json!([])),
            routine(15, "hop", "call", 10, 10, serde_json::json!([[0x20, 100, 0]]), serde_json::json!([])),
            routine(16, "count", "call", 1, 10, serde_json::json!([[0x30, 40000, 40000]]), serde_json::json!([])),
            routine(17, "count_out", "call", 1, 10, serde_json::json!([[0x31, 500, 500]]), serde_json::json!([])),
            routine(18, "count_two", "call", 1, 10, serde_json::json!([[0x32, 500, 500], [0x33, 500, 500]]), serde_json::json!([])),
            routine(19, "chore_wait", "call", 10, 10, serde_json::json!([[0x20, 500, 0]]), serde_json::json!([])),
            routine(20, "chore", "call", 500, 10, serde_json::json!([[0x34, 500, 500]]), serde_json::json!([])),
            routine(21, "self_wait", "call", 10, 10, serde_json::json!([[0x20, 500, 0]]), serde_json::json!([])),
            routine(22, "setter", "call", 500, 10, serde_json::json!([[0x20, 0, 500]]), serde_json::json!([])),
            routine(23, "hit", "call", 10, 10, serde_json::json!([[0, 10, 0], [1, 20, 0]]), serde_json::json!([])),
            routine(24, "count_down", "call", 10, 10, serde_json::json!([[0x35, 2560, 2560]]), serde_json::json!([])),
            routine(26, "shift", "call", 10, 10, serde_json::json!([]), serde_json::json!([])),
            routine(25, "count_port", "call", 1, 10, serde_json::json!([[0x2002, 500, 0], [0x36, 0, 500]]), serde_json::json!([]))
        ],
        // Two instructions in one routine where positions met: two
        // pairs on X at the first, one of them again and a pair on Y at
        // the second.
        "meets": [
            {"key": at("hit") + 2, "addr": labels["hit"] + 2, "routine": 23, "total": 8, "distinct": 2, "pairs": [[0x86, 0x87, 5, "x"], [0x86, 0x88, 3, "x"]]},
            {"key": at("hit") + 4, "addr": labels["hit"] + 4, "routine": 23, "total": 6, "distinct": 2, "pairs": [[0x86, 0x87, 4, "x"], [0xce, 0xcf, 2, "y"]]}
        ],
        "variables": [{"addr": 0, "writers": [[2, 80]], "readers": [[3, 20]], "total": 100}],
        "loops": [
            // The wait: three thousand times round a frame on a byte that a
            // routine the NMI handler calls writes. And four that are
            // not: a scan down a table the same routine writes, a delay
            // that counts X down past the same byte, a wait on a byte
            // nothing under the handler writes, and a back edge whose
            // circuit leaves by a JMP at its head.
            // An endless loop that counts in one byte (stirring a second
            // into it), which the sound routine reads. And four that are
            // not: one with a way out, one that changes two bytes, one a
            // branch closes (a delay), one that copies the PPU's status.
            {"head": at("count_port"), "tail": at("count_port") + 5, "head_addr": labels["count_port"], "tail_addr": labels["count_port"] + 5, "kind": "work", "iterations": 500, "entries": 1, "on": null, "cycles": 0, "routine": 25},
            {"head": at("count_down"), "tail": at("count_down") + 2, "head_addr": labels["count_down"], "tail_addr": labels["count_down"] + 2, "kind": "work", "iterations": 2560, "entries": 10, "on": null, "cycles": 0, "routine": 24},
            {"head": at("count"), "tail": at("count") + 6, "head_addr": labels["count"], "tail_addr": labels["count"] + 6, "kind": "work", "iterations": 40000, "entries": 1, "on": null, "cycles": 0, "routine": 16},
            {"head": at("count_out"), "tail": at("count_out") + 4, "head_addr": labels["count_out"], "tail_addr": labels["count_out"] + 4, "kind": "work", "iterations": 500, "entries": 1, "on": null, "cycles": 0, "routine": 17},
            {"head": at("count_two"), "tail": at("count_two") + 4, "head_addr": labels["count_two"], "tail_addr": labels["count_two"] + 4, "kind": "work", "iterations": 500, "entries": 1, "on": null, "cycles": 0, "routine": 18},
            // A wait that calls a chore each turn, and one whose own
            // call writes the byte it waits on (so it lets itself out).
            {"head": at("chore_wait"), "tail": at("chore_wait") + 5, "head_addr": labels["chore_wait"], "tail_addr": labels["chore_wait"] + 5, "kind": "work", "iterations": 500, "entries": 10, "on": null, "cycles": 0, "routine": 19},
            {"head": at("self_wait"), "tail": at("self_wait") + 5, "head_addr": labels["self_wait"], "tail_addr": labels["self_wait"] + 5, "kind": "work", "iterations": 500, "entries": 10, "on": null, "cycles": 0, "routine": 21},
            {"head": at("hop"), "tail": at("hop") + 5, "head_addr": labels["hop"], "tail_addr": labels["hop"] + 5, "kind": "wait", "iterations": 100, "entries": 10, "on": 0x20, "cycles": 0, "routine": 15},
            {"head": at("wait"), "tail": at("wait") + 2, "head_addr": labels["wait"], "tail_addr": labels["wait"] + 2, "kind": "wait", "iterations": 30000, "entries": 10, "on": 0x20, "cycles": 0, "routine": 10},
            {"head": at("scan"), "tail": at("scan") + 3, "head_addr": labels["scan"], "tail_addr": labels["scan"] + 3, "kind": "wait", "iterations": 400, "entries": 10, "on": 0x0300, "cycles": 0, "routine": 11},
            {"head": at("delay"), "tail": at("delay") + 3, "head_addr": labels["delay"], "tail_addr": labels["delay"] + 3, "kind": "wait", "iterations": 2550, "entries": 10, "on": 0x20, "cycles": 0, "routine": 12},
            {"head": at("other"), "tail": at("other") + 2, "head_addr": labels["other"], "tail_addr": labels["other"] + 2, "kind": "wait", "iterations": 30000, "entries": 10, "on": 0x21, "cycles": 0, "routine": 13},
            {"head": at("spin"), "tail": at("spin"), "head_addr": labels["spin"], "tail_addr": labels["spin"], "kind": "idle", "iterations": 50000, "entries": 0, "on": null, "cycles": 0, "routine": 0}
        ],
        "dispatch": [{"key": jsr_engine, "addr": 0x8000 + jsr_engine, "depth": 2, "targets": [[4, 7], [5, 3]], "timeline": [[0, 0, 0], [1, 0, 0], [2, 0, 0]]}]
    });
    let src = listing::from_rom_and_run(&image, &report.to_string()).unwrap();
    listing::check(&src, &image).unwrap();
    let a = |n: &str| labels[n];
    assert!(src.contains(";; @is pad-poll port=$4016 reads-per-frame=8 strobes-per-frame=2 by=match\n"), "{src}");
    assert!(src.contains(&format!(";; @is jump-engine tables=1 dispatches=10 by=match\n;; @routine routine_{:04X} kind=call entered=10 by=run\n", a("engine"))), "{src}");
    assert!(src.contains(&format!(";; @is idle-spin iterations=50000 per-frame=5000 by=match\n\nat_{:04X}:\n", a("spin"))), "{src}");
    assert!(src.contains(&format!(";; @is game-loop-in-nmi frames=10 of=10 spin=${:04X} by=match\n;; @is scroll-writer writes-in-blank=10 frames=10 by=match\n;; @routine nmi kind=nmi entered=10 by=run\n", a("spin"))), "{src}");
    assert!(src.contains(&format!(";; @is sound-driver writes=10 frames=10 by=match\n;; @routine routine_{:04X} kind=call entered=10 by=run\n", a("sound"))), "{src}");
    assert!(src.contains(&format!(";; @is vram-drain writes=10 in-blank=10 in-picture=0 frames=10 by=match\n;; @routine routine_{:04X} kind=call entered=10 by=run\n", a("drain"))), "{src}");
    assert!(src.contains(&format!(";; @is sprite-0-split scroll-writes-in-picture=20 status-reads-in-picture=200 frames=10 by=match\n;; @routine routine_{:04X} kind=call entered=10 by=run\n", a("split"))), "{src}");
    assert!(src.contains(";; @is bank-switch writes=1 in-picture=0 in-blank=1 by=match\n;; @routine reset kind=reset entered=1 by=run\n"), "{src}");
    assert!(src.contains(&format!(";; @is palette-writer writes=2 frames=10 by=match\n;; @is vram-drain writes=10 in-blank=10 in-picture=0 frames=10 by=match\n;; @routine routine_{:04X}", a("drain"))), "{src}");
    assert!(src.contains(&format!(";; @is pad-poll port=$4016 reads-per-frame=8 strobes-per-frame=2 by=match\n;; @is sprite-writer oam-writes=40 frames=10 by=match\n;; @routine routine_{:04X}", a("poll"))), "{src}");
    assert!(src.contains(&format!(";; @is random-byte bytes=$0010,$0011 shifts=2 eors=1 frames=10 by=match\n;; @routine routine_{:04X} kind=call entered=10 by=run\n", a("random"))), "{src}");
    assert!(src.contains(&format!(";; @is frame-wait flag=$0020 entries=10 iterations=30000 set-in-nmi=10 of=10 by=match\n;; @routine routine_{:04X} kind=call entered=10 by=run\n", a("wait"))), "{src}");
    assert!(src.contains(";; @is counting-spin byte=$0030 iterations=40000 per-frame=4000 read-elsewhere=7 by=match\n"), "{src}");
    assert!(src.contains(&format!(";; @is frame-wait flag=$0020 entries=10 iterations=500 calls=1 set-in-nmi=10 of=10 by=match\n;; @routine routine_{:04X} kind=call entered=10 by=run\n", a("chore_wait"))), "{src}");
    assert!(src.contains(&format!(";; @is position-compare sites=2 pairs=3 cells=5 meets=14 x=$0086,$0087,$0088 y=$00CE,$00CF by=match\n;; @routine routine_{:04X} kind=call entered=10 by=run\n", a("hit"))), "{src}");
    assert_eq!(src.matches(";; @is ").count(), 16, "one mark per pattern and the second wait, nothing else matched");
    // With no idle spin, the counting spin is what makes the NMI handler the game.
    let mut no_idle = report.clone();
    no_idle["loops"].as_array_mut().unwrap().retain(|l| l["kind"] != "idle");
    let quiet = listing::from_rom_and_run(&image, &no_idle.to_string()).unwrap();
    assert!(!quiet.contains("idle-spin"));
    assert!(quiet.contains(&format!(";; @is game-loop-in-nmi frames=10 of=10 spin=${:04X} by=match\n", a("count"))), "{quiet}");
    assert!(src.contains(&format!(";; @ram variables=1 arrays=7 by=run\n;; @array $0080 slots=16 sites=1 by=run\n;; @array $0086 slots=6 sites=2 x=3 by=run\n;; @array $0090 slots=6 sites=2 by=run\n;; @array $00A0 slots=6 sites=2 by=run\n;; @array $00B0 slots=6 sites=1 by=run\n;; @array $0200 slots=8 sites=1 by=run\n;; @array $0300 slots=40 sites=1 by=run\n;; @objects slots=6 arrays=2 routines=2 x=$0086 with=$0090 by=run\n;; @var $0000 writers=routine_{:04X}:80 readers=routine_{:04X}:20 total=100 by=run\n", a("poll"), a("engine"))), "{src}");
    // The table: three words, the middle one never taken (so numeric),
    // the two the run took saying how often.
    assert!(src.contains(";; @table dispatch entries=3 seen=2 by=run\n"), "{src}");
    let lines: Vec<&str> = src.lines().collect();
    let t = lines.iter().position(|l| l.starts_with(";; @table")).unwrap();
    assert!(lines[t + 1].starts_with(&format!("    .word dispatch_{:04X}", a("state_a"))) && lines[t + 1].ends_with("; ran 7"), "{}", lines[t + 1]);
    assert_eq!(lines[t + 2].trim(), format!(".word ${:04X}", a("state_b")));
    assert!(lines[t + 3].starts_with(&format!("    .word dispatch_{:04X}", a("state_c"))) && lines[t + 3].ends_with("; ran 3"), "{}", lines[t + 3]);
    // A crawl's record laid over the same run adds coverage and frames
    // nobody watched routines in. The rules that ask "in half the
    // frames" ask it of the frames that were watched, so every mark
    // stands as it did; only the run's own totals grow.
    let crawl = serde_json::json!({"prg_len": 32768, "frames": 90, "instructions": 9000, "sites": seq(prg, at("reset"), 4, 1)});
    let both = listing::from_rom_and_runs(&image, &[crawl.to_string(), report.to_string()]).unwrap();
    assert!(both.contains(";; @run frames=100 "), "{both}");
    let marks = |t: &str| -> Vec<String> { t.lines().filter(|l| l.starts_with(";; @is ")).map(str::to_string).collect() };
    assert_eq!(marks(&both), marks(&src));
    // The model reads the same marks back: every routine the run
    // entered with its patterns, the table with its words, the RAM.
    let g = listing::game::game(&text::parse(&src).unwrap()).unwrap();
    assert_eq!(g["routines"].as_array().unwrap().iter().filter(|r| r["by"] == "run").count(), 27, "{g}");
    let poll = g["routines"].as_array().unwrap().iter().find(|r| r["name"] == format!("routine_{:04X}", a("poll"))).unwrap();
    assert_eq!(poll["kind"], "call");
    assert_eq!(poll["entered"], 10);
    assert_eq!(poll["is"][0]["pattern"], "pad-poll");
    assert_eq!(poll["is"][0]["evidence"]["reads-per-frame"], 8);
    assert_eq!(g["patterns"].as_object().unwrap().len(), 15);
    assert_eq!(g["patterns"]["sprite-writer"], 1);
    // A mark on a loop's head that is no routine's entry is kept with
    // its evidence, as a loop.
    assert_eq!(g["loops"].as_array().unwrap().len(), 1, "{g}");
    assert_eq!(g["loops"][0]["addr"], a("spin"));
    assert_eq!(g["loops"][0]["is"][0]["pattern"], "idle-spin");
    assert_eq!(g["loops"][0]["is"][0]["evidence"]["per-frame"], 5000);
    let wait = g["routines"].as_array().unwrap().iter().find(|r| r["name"] == format!("routine_{:04X}", a("wait"))).unwrap();
    assert_eq!(wait["is"][0]["pattern"], "frame-wait");
    assert_eq!(wait["is"][0]["evidence"]["flag"], "$0020");
    assert_eq!(g["tables"][0]["entries"], 3);
    assert_eq!(g["tables"][0]["words"][0]["ran"], 7);
    assert_eq!(g["tables"][0]["words"][1]["ran"], Value::Null);
    assert_eq!(g["arrays"][5]["slots"], 8);
    assert_eq!(g["objects"], serde_json::json!([{"slots": 6, "arrays": 2, "routines": 2, "x": ["$0086"], "y": [], "with": ["$0090"]}]));
    assert_eq!(g["arrays"][1]["x"], 3);
    assert_eq!(g["arrays"][0]["x"], serde_json::Value::Null);
    assert_eq!(g["variables"][0]["writers"][0]["count"], 80);
    assert_eq!(g["banks"][0]["of"], 32768);
    assert_eq!(g["run"]["frames"], 10);
    // And the walk did not fall through the JSR into the table: nothing
    // between that JSR and the first entry is an instruction.
    let l = text::parse(&src).unwrap();
    let engine = format!("routine_{:04X}", a("engine"));
    let jsr = l.items.iter().position(|i| matches!(i, Item::Instr { op: 0x20, operand, .. } if operand.label.as_deref() == Some(engine.as_str()))).unwrap();
    let first = l.items.iter().position(|i| matches!(i, Item::Label(n) if n.starts_with("dispatch_"))).unwrap();
    assert!(jsr < first);
    assert!(!l.items[jsr + 1..first].iter().any(|i| matches!(i, Item::Instr { .. })), "the walk decoded the table as code");
}
