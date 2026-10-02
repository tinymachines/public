//! The tables a run finds that are not a jump engine's or a plain
//! pointer table: one a return goes through (the game pushes an address
//! and returns to it, so each word is one less than its target), and one
//! kept as two, the low bytes of the addresses in one run of bytes and
//! the high bytes in another. On a cartridge of our own, written with
//! the same line forms the listing writes them in.

use std::collections::HashMap;

use listing::{asm, ines, text};
use serde_json::{json, Value};

const SOURCE: &str = "\
reset:
    JMP reset
by_return:
    PHA
    PHA
    RTS
    .byte $EA
    .word state_a-1
    .word state_b-1
    .word state_c-1
by_two:
    JMP ($0006)
    .byte <state_a
    .byte <state_b
    .byte <state_c
    .byte $EA
    .byte >state_a
    .byte >state_b
    .byte >state_c
return_two:
    PHA
    PHA
    RTS
    .byte <state_a-1
    .byte <state_c-1
    .byte >state_a-1
    .byte >state_c-1
uneven:
    JMP ($0008)
    .byte <state_a
    .byte <state_c
    .byte >state_c
    .byte $00
    .byte >state_a
    .byte $00
close:
    JMP ($000A)
    .byte <state_a
    .byte <state_c
    .byte >state_c
coded:
    JMP ($000C)
over:
    JMP ($000C)
across:
    JMP ($000C)
    .byte $00
    .byte $00
kept:
    PHA
    PHA
    RTS
state_a:
    RTS
state_b:
    RTS
state_c:
    RTS
nmi:
    RTI
irq:
    RTI
";

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

#[test]
fn the_new_line_forms_assemble_to_the_bytes_they_say() {
    let (image, labels) = our_rom();
    let prg = &image[16..];
    let at = |n: &str| labels[n] as usize - 0x8000;
    let (a, c) = (labels["state_a"], labels["state_c"]);
    // A word less one, and each half of an address, with and without.
    assert_eq!(prg[at("by_return") + 4..at("by_return") + 6], (a - 1).to_le_bytes());
    assert_eq!(prg[at("by_two") + 3], a as u8);
    assert_eq!(prg[at("by_two") + 9], (c >> 8) as u8);
    assert_eq!(prg[at("return_two") + 4], (c - 1) as u8);
    assert_eq!(prg[at("return_two") + 5], ((a - 1) >> 8) as u8);
    // And the parser says what it will not take.
    let head = ";; @listing 0\n;; @rom sha256=0 mapper=0 mirroring=horizontal prg=16384 chr=0\n;; @bank prg 0 org=$C000 size=16384 fixed\n";
    for bad in ["    .byte <9lives", "    .word here-x", "    .byte >"] {
        assert!(text::parse(&format!("{head}{bad}\n")).is_err(), "{bad} was taken");
    }
}

#[test]
fn a_return_table_and_a_table_kept_as_two_are_found_and_written_with_labels() {
    let (image, labels) = our_rom();
    let at = |n: &str| labels[n] as usize - 0x8000;
    let site = |k: usize, count: u64| json!({"key": k, "addr": 0x8000 + k, "count": count});
    let routine = |id: u64, n: &str, entry: &str, entered: u64, body: Vec<usize>| json!({"id": id, "key": at(n), "addr": labels[n], "entry": entry, "entered": entered, "frames": 1, "mem": [], "body": body});
    let (br, bt, rt, un, cl) = (at("by_return"), at("by_two"), at("return_two"), at("uneven"), at("close"));
    let (coded, over, across) = (at("coded"), at("over"), at("across"));
    let report = json!({
        "prg_len": 32768, "frames": 10, "instructions": 100,
        "sites": [site(at("reset"), 50), site(br, 6), site(br + 1, 6), site(br + 2, 6), site(bt, 4), site(rt, 7), site(rt + 1, 7), site(rt + 2, 7), site(un, 2), site(cl, 2),
                  site(at("state_a"), 12), site(at("state_c"), 9)],
        "routines": [
            routine(0, "reset", "reset", 1, vec![at("reset")]),
            routine(1, "by_return", "call", 6, vec![br, br + 1, br + 2]),
            routine(2, "by_two", "call", 4, vec![bt]),
            routine(3, "return_two", "call", 7, vec![rt, rt + 1, rt + 2]),
            routine(4, "uneven", "call", 2, vec![un]),
            routine(5, "close", "call", 2, vec![cl]),
            routine(6, "state_a", "dispatch", 12, vec![at("state_a")]),
            routine(7, "state_c", "dispatch", 9, vec![at("state_c")]),
        ],
        "dispatch": [
            // A return through a table of words: the first taken four
            // times, the third twice, the second never.
            {"key": br + 2, "addr": 0x8000 + br + 2, "depth": 1, "targets": [[6, 4], [7, 2]], "timeline": [], "words": [[br + 4, 4], [br + 8, 2]], "on": [[0xc2, 6]], "halves": [], "ret": true},
            // A jump through low bytes here and high bytes four further on.
            {"key": bt, "addr": 0x8000 + bt, "depth": 1, "targets": [[6, 3], [7, 1]], "timeline": [], "words": [], "on": [[0xc3, 4]], "halves": [[bt + 3, bt + 7, 3], [bt + 5, bt + 9, 1]], "ret": false},
            // A return through two such runs, each byte one less.
            {"key": rt + 2, "addr": 0x8000 + rt + 2, "depth": 1, "targets": [[6, 2], [7, 5]], "timeline": [], "words": [], "on": [], "halves": [[rt + 3, rt + 5, 2], [rt + 4, rt + 6, 5]], "ret": true},
            // Not a table: the two pairs are not the same distance apart
            // (every byte either run would take is free).
            {"key": un, "addr": 0x8000 + un, "depth": 1, "targets": [[6, 1], [7, 1]], "timeline": [], "words": [], "on": [], "halves": [[un + 3, un + 7, 1], [un + 4, un + 5, 1]], "ret": false},
            // Nor this: two entries whose high bytes start one byte after
            // the low ones, so the runs would lie over each other.
            {"key": cl, "addr": 0x8000 + cl, "depth": 1, "targets": [[6, 1], [7, 1]], "timeline": [], "words": [], "on": [], "halves": [[cl + 3, cl + 4, 1], [cl + 4, cl + 5, 1]], "ret": false},
            // Nor these three: bytes the run executed as code, a run that
            // starts on the free byte before the return table above and
            // goes on into it, and bytes of the low run above.
            {"key": coded, "addr": 0x8000 + coded, "depth": 1, "targets": [[6, 1]], "timeline": [], "words": [], "on": [], "halves": [[at("state_a"), at("state_c"), 1]], "ret": false},
            {"key": over, "addr": 0x8000 + over, "depth": 1, "targets": [[6, 1]], "timeline": [], "words": [], "on": [], "halves": [[br + 3, across + 3, 1], [br + 4, across + 4, 1]], "ret": false},
            {"key": across, "addr": 0x8000 + across, "depth": 1, "targets": [[6, 1]], "timeline": [], "words": [], "on": [], "halves": [[bt + 5, bt + 3, 1]], "ret": false},
        ]
    });
    let src = listing::from_rom_and_run(&image, &report.to_string()).unwrap();
    // The one check: it assembles back to the cartridge.
    listing::check(&src, &image).unwrap();
    let lines: Vec<&str> = src.lines().collect();
    let (a, b, c) = (labels["state_a"], labels["state_b"], labels["state_c"]);
    let (name_a, name_c) = (format!("dispatch_{a:04X}"), format!("dispatch_{c:04X}"));
    let line = |start: &str| lines.iter().position(|l| l.starts_with(start)).unwrap_or_else(|| panic!("no line starting {start}\n{src}"));

    // The return table: each word is its label less one. The entry the
    // run never took lands on no label, so it stays a number.
    let p = line(";; @table returns");
    assert_eq!(lines[p], ";; @table returns entries=3 seen=2 on=$00C2 by=run");
    assert_eq!(lines[p - 1].trim(), ".byte $EA", "the byte before the table is not in it");
    assert!(lines[p - 2].trim_start().starts_with("RTS"), "{}", lines[p - 2]);
    assert_eq!(lines[p + 1].split_whitespace().collect::<Vec<_>>(), [".word", &format!("{name_a}-1"), ";", "ran", "4"]);
    assert_eq!(lines[p + 2].trim(), format!(".word ${:04X}", b - 1));
    assert_eq!(lines[p + 3].split_whitespace().collect::<Vec<_>>(), [".word", &format!("{name_c}-1"), ";", "ran", "2"]);

    // The table kept as two: the low bytes say where the high ones are
    // and how often each entry ran; the high bytes say where the low are.
    let low = line(&format!(";; @table low entries=3 seen=2 high=${:04X}", 0x8000 + bt + 7));
    assert_eq!(lines[low], format!(";; @table low entries=3 seen=2 high=${:04X} on=$00C3 by=run", 0x8000 + bt + 7));
    assert_eq!(lines[low + 1].split_whitespace().collect::<Vec<_>>(), [".byte", &format!("<{name_a}"), ";", "ran", "3"]);
    assert_eq!(lines[low + 2].trim(), format!(".byte ${:02X}", b as u8));
    assert_eq!(lines[low + 3].split_whitespace().collect::<Vec<_>>(), [".byte", &format!("<{name_c}"), ";", "ran", "1"]);
    assert_eq!(lines[low + 4].trim(), ".byte $EA", "the byte between the two runs belongs to neither");
    assert_eq!(lines[low + 5], format!(";; @table high entries=3 low=${:04X} by=run", 0x8000 + bt + 3));
    assert_eq!(lines[low + 6].trim(), format!(".byte >{name_a}"));
    assert_eq!(lines[low + 7].trim(), format!(".byte ${:02X}", (b >> 8) as u8));
    assert_eq!(lines[low + 8].trim(), format!(".byte >{name_c}"));

    // The same through a return: one less, in both halves.
    let low = line(&format!(";; @table low entries=2 seen=2 high=${:04X}", 0x8000 + rt + 5));
    assert_eq!(lines[low], format!(";; @table low entries=2 seen=2 high=${:04X} returns by=run", 0x8000 + rt + 5));
    assert_eq!(lines[low + 1].split_whitespace().collect::<Vec<_>>(), [".byte", &format!("<{name_a}-1"), ";", "ran", "2"]);
    assert_eq!(lines[low + 2].split_whitespace().collect::<Vec<_>>(), [".byte", &format!("<{name_c}-1"), ";", "ran", "5"]);
    assert_eq!(lines[low + 3], format!(";; @table high entries=2 low=${:04X} returns by=run", 0x8000 + rt + 3));
    assert_eq!(lines[low + 4].trim(), format!(".byte >{name_a}-1"));
    assert_eq!(lines[low + 5].trim(), format!(".byte >{name_c}-1"));

    // The two that are no table stayed bytes.
    assert_eq!(src.matches(";; @table low").count(), 2, "{src}");
    assert_eq!(src.matches(";; @table high").count(), 2);
    assert_eq!(src.matches(";; @table").count(), 5);

    // The model reads them back: a table kept as two is one table.
    let g: Value = listing::game::game(&text::parse(&src).unwrap()).unwrap();
    let kinds: Vec<&str> = g["tables"].as_array().unwrap().iter().map(|t| t["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds, ["returns", "low", "low"]);
    assert_eq!(g["tables"][0]["words"][0]["ran"], 4);
    assert_eq!(g["tables"][1]["high"], format!("${:04X}", 0x8000 + bt + 7));
    assert_eq!(g["tables"][1]["words"].as_array().unwrap().len(), 3);
    assert_eq!(g["tables"][1]["words"][0]["label"], name_a);
    assert_eq!(g["tables"][1]["words"][1]["label"], Value::Null);
    assert_eq!(g["tables"][1]["words"][2]["ran"], 1);
    assert_eq!(g["tables"][1].get("returns"), None);
    assert_eq!(g["tables"][2]["returns"], true);
    assert_eq!(g["tables"][2]["words"][1]["ran"], 5);
}

#[test]
fn two_runs_that_took_different_entries_share_the_table() {
    let (image, labels) = our_rom();
    let at = |n: &str| labels[n] as usize - 0x8000;
    let bt = at("by_two");
    let one = |halves: Value, targets: Value| {
        json!({
            "prg_len": 32768, "frames": 1, "instructions": 10,
            "sites": [{"key": bt, "addr": 0x8000 + bt, "count": 1}, {"key": at("state_a"), "addr": labels["state_a"], "count": 1}, {"key": at("state_c"), "addr": labels["state_c"], "count": 1}],
            "routines": [{"id": 0, "key": bt, "addr": 0x8000 + bt, "entry": "call", "entered": 1, "frames": 1, "mem": [], "body": [bt]},
                         {"id": 1, "key": at("state_a"), "addr": labels["state_a"], "entry": "dispatch", "entered": 1, "frames": 1, "mem": [], "body": [at("state_a")]},
                         {"id": 2, "key": at("state_c"), "addr": labels["state_c"], "entry": "dispatch", "entered": 1, "frames": 1, "mem": [], "body": [at("state_c")]}],
            "dispatch": [{"key": bt, "addr": 0x8000 + bt, "depth": 1, "targets": targets, "timeline": [], "words": [], "on": [], "halves": halves, "ret": false}]
        })
        .to_string()
    };
    // One run took the first entry, another the third: together, three entries.
    let first = one(json!([[bt + 3, bt + 7, 2]]), json!([[1, 2]]));
    let third = one(json!([[bt + 5, bt + 9, 1]]), json!([[2, 1]]));
    let alone = listing::from_rom_and_run(&image, &first).unwrap();
    assert!(alone.contains(";; @table low entries=1 seen=1"), "{alone}");
    let both = listing::from_rom_and_runs(&image, &[first.clone(), third]).unwrap();
    listing::check(&both, &image).unwrap();
    assert!(both.contains(";; @table low entries=3 seen=2"), "{both}");
}

#[test]
fn an_address_kept_in_memory_and_returned_to_is_a_handler_in_memory() {
    let (image, labels) = our_rom();
    let at = |n: &str| labels[n] as usize - 0x8000;
    let (kept, br) = (at("kept"), at("by_return"));
    let site = |k: usize, count: u64| json!({"key": k, "addr": 0x8000 + k, "count": count});
    let routine = |id: u64, n: &str, entry: &str, entered: u64, body: Vec<usize>| json!({"id": id, "key": at(n), "addr": labels[n], "entry": entry, "entered": entered, "frames": 1, "mem": [], "body": body});
    let report = json!({
        "prg_len": 32768, "frames": 10, "instructions": 100,
        "sites": [site(kept, 5), site(kept + 1, 5), site(kept + 2, 5), site(br, 6), site(br + 1, 6), site(br + 2, 6), site(at("state_a"), 11)],
        "routines": [
            routine(0, "kept", "call", 5, vec![kept, kept + 1, kept + 2]),
            routine(1, "by_return", "call", 6, vec![br, br + 1, br + 2]),
            routine(2, "state_a", "dispatch", 11, vec![at("state_a")]),
        ],
        "dispatch": [
            // The address was copied out of two bytes of memory, pushed
            // and returned to.
            {"key": kept + 2, "addr": 0x8000 + kept + 2, "depth": 1, "targets": [[2, 5]], "timeline": [], "words": [], "on": [[0xc3, 5]], "from": [[0xc3, 3], [0xc4, 2]], "halves": [], "ret": true},
            // Not one: the return that went through a table in the ROM.
            {"key": br + 2, "addr": 0x8000 + br + 2, "depth": 1, "targets": [[2, 6]], "timeline": [], "words": [[br + 4, 6]], "on": [[0xc2, 6]], "from": [], "halves": [], "ret": true},
        ]
    })
    .to_string();
    let src = listing::from_rom_and_run(&image, &report).unwrap();
    listing::check(&src, &image).unwrap();
    assert!(src.contains(&format!(";; @is handler-in-memory jumps=5 targets=1 from=$00C3,$00C4 by=match\n;; @routine handlers_{:04X} kind=call entered=5 by=run\n", labels["kept"])), "{src}");
    assert_eq!(src.matches("handler-in-memory").count(), 1);
}
