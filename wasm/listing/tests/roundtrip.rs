//! The check that cannot pass on nothing: our own cartridge, written as
//! a listing, parsed back and assembled, is the same bytes; and a listing
//! with one byte changed is not.

use listing::{asm, disasm, ines, render, shape, text};

const TESTCART: &[u8] = include_bytes!("../../../web/e2e/fixtures/testcart.nes");

#[test]
fn testcart_round_trips() {
    let rom = ines::parse(TESTCART).unwrap();
    assert_eq!(rom.mapper, 0);
    let l = disasm::listing(&rom);
    let src = text::write(&l);
    assert!(src.starts_with(";; @listing 0\n;; @rom sha256="));
    let back = text::parse(&src).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(back.banks.len(), l.banks.len());
    let built = asm::assemble(&back).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(built.prg, rom.prg);
    assert_eq!(built.chr, rom.chr);
    assert_eq!(ines::image(&built), TESTCART);
    listing::check(&src, TESTCART).unwrap();
    // The walk found code: at least the reset routine, and a label for it.
    let n_instr = back.items.iter().filter(|i| matches!(i, listing::model::Item::Instr { .. })).count();
    assert!(n_instr > 20, "only {n_instr} instructions reached from the vectors");
    assert!(back.items.iter().any(|i| matches!(i, listing::model::Item::Label(n) if n == "reset")));
}

#[test]
fn a_changed_operand_is_caught() {
    let src = listing::from_rom(TESTCART).unwrap();
    // The first immediate in the file, bumped by one.
    let k = src.find(" #$").expect("an immediate operand");
    let mut bad = src.clone();
    let digits = &src[k + 3..k + 5];
    let v = u8::from_str_radix(digits, 16).unwrap().wrapping_add(1);
    bad.replace_range(k + 3..k + 5, &format!("{v:02X}"));
    let e = listing::check(&bad, TESTCART).unwrap_err();
    assert!(e.contains("PRG differs first at offset"), "{e}");
}

#[test]
fn a_moved_label_is_caught() {
    let src = listing::from_rom(TESTCART).unwrap();
    // An instruction inserted before a label moves every label after it,
    // and the bank then holds one byte too many.
    let k = src.find("\nreset:\n").expect("the reset label");
    let mut bad = src.clone();
    bad.insert_str(k, "\n    NOP");
    let e = listing::check(&bad, TESTCART).unwrap_err();
    assert!(e.contains("overflows") || e.contains("holds"), "{e}");
}

#[test]
fn render_and_shape_follow_the_model() {
    let src = listing::from_rom(TESTCART).unwrap();
    let l = text::parse(&src).unwrap();
    let r = render::render(&l).unwrap();
    assert!(r.contains("$FFFA"), "the vectors are rendered at their address");
    assert!(r.contains("reset:"));
    let s = shape::shape(&l);
    assert_eq!(s.sha256, l.header.sha256);
    assert!(s.marks.iter().any(|m| m.kind == "label" && m.text == "reset"));
    assert!(s.marks.iter().all(|m| !m.text.contains(".byte")), "the shape carries no bytes");
}

#[test]
fn the_parser_refuses_what_it_does_not_understand() {
    let head = ";; @listing 0\n;; @rom sha256=00 mapper=0 mirroring=vertical prg=32768 chr=0\n;; @bank prg 0 org=$8000 size=32768\n";
    for (bad, why) in [
        ("    LDA\n", "no imp form"),
        ("    BNE $9000,X\n", "a branch takes a plain target"),
        ("    .byte $100\n", ".byte takes bytes"),
        ("    FOO #$01\n", "has no imm form"),
        ("bad label:\n", "not a label name"),
        ("    STA ($1234,X)\n", "(zp,X) takes a zero-page address"),
    ] {
        let e = text::parse(&format!("{head}{bad}")).unwrap_err().to_string();
        assert!(e.contains(why), "{bad:?} gave {e:?}, wanted {why:?}");
    }
    let e = text::parse("    NOP\n").unwrap_err().to_string();
    assert!(e.contains("must start with"));
    let e = text::parse(";; @listing 7\n").unwrap_err().to_string();
    assert!(e.contains("format 7"));
}

#[test]
fn labels_resolve_and_branches_reach() {
    let src = ";; @listing 0\n;; @rom sha256=00 mapper=0 mirroring=vertical prg=16384 chr=0\n;; @bank prg 0 org=$C000 size=16384\n\
reset:\n    LDX #$00\nloop:\n    DEX\n    BNE loop\n    JMP reset\n    .byte $00\n";
    let mut full = src.to_string();
    // Fill the bank: 2+1+2+3+1 = 9 bytes so far.
    for _ in 0..(16384 - 9) / 16 {
        full.push_str("    .byte $FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF\n");
    }
    for _ in 0..(16384 - 9) % 16 {
        full.push_str("    .byte $FF\n");
    }
    let l = text::parse(&full).unwrap();
    let rom = asm::assemble(&l).unwrap();
    assert_eq!(&rom.prg[..9], &[0xA2, 0x00, 0xCA, 0xD0, 0xFD, 0x4C, 0x00, 0xC0, 0x00]);
    let far = full.replace("    BNE loop\n", "    BNE reset\n").replace("    .byte $00\n", "    .byte $00\n") ;
    let _ = far; // same reach; a genuinely far branch:
    let mut far = ";; @listing 0\n;; @rom sha256=00 mapper=0 mirroring=vertical prg=16384 chr=0\n;; @bank prg 0 org=$C000 size=16384\nstart:\n".to_string();
    for _ in 0..20 {
        far.push_str("    .byte $EA,$EA,$EA,$EA,$EA,$EA,$EA,$EA,$EA,$EA\n");
    }
    far.push_str("    BEQ start\n");
    for _ in 0..(16384 - 202) {
        far.push_str("    .byte $00\n");
    }
    let e = asm::assemble(&text::parse(&far).unwrap()).unwrap_err().to_string();
    assert!(e.contains("the reach is -128 to 127"), "{e}");
}

#[test]
fn brk_carries_its_second_byte() {
    let mut src = ";; @listing 0\n;; @rom sha256=00 mapper=0 mirroring=vertical prg=16384 chr=0\n;; @bank prg 0 org=$C000 size=16384\nreset:\n    BRK #$06\n    BRK\n".to_string();
    for _ in 0..(16384 - 4) {
        src.push_str("    .byte $FF\n");
    }
    let rom = asm::assemble(&text::parse(&src).unwrap()).unwrap();
    assert_eq!(&rom.prg[..4], &[0x00, 0x06, 0x00, 0x00]);
    // And the walk writes it that way: a ROM whose reset is BRK $06.
    let mut prg = vec![0xFFu8; 16384];
    prg[0] = 0x00;
    prg[1] = 0x06;
    prg[16384 - 4] = 0x00;
    prg[16384 - 3] = 0xC0;
    let rom = ines::Rom { sha256: "00".into(), mapper: 0, mirroring: ines::Mirroring::Vertical, prg, chr: vec![] };
    let l = disasm::listing(&rom);
    let out = text::write(&l);
    assert!(out.contains("    BRK #$06\n"), "{out}");
    assert_eq!(asm::assemble(&text::parse(&out).unwrap()).unwrap().prg, rom.prg);
}

#[test]
fn a_run_lays_its_marks_over_the_walk() {
    // A made-up report: the test cartridge's reset ran 1 time, its first
    // three instructions ran once each, and one NOP the walk never
    // reaches (the $EA fill before the vectors, offset $7FF1) ran 7 times.
    let rom = ines::parse(TESTCART).unwrap();
    let plain = disasm::listing(&rom);
    let walked: Vec<usize> = plain.items.iter().enumerate().filter(|(_, i)| matches!(i, listing::model::Item::Instr { .. })).map(|(k, _)| k).collect();
    assert!(walked.len() > 3);
    let report = serde_json::json!({
        "prg_len": 32768, "frames": 5, "instructions": 10,
        "sites": [
            {"key": 0, "addr": 0x8000, "count": 1},
            {"key": 1, "addr": 0x8001, "count": 1},
            {"key": 3, "addr": 0x8003, "count": 1},
            {"key": 0x7FF1, "addr": 0xFFF1, "count": 7},
            {"key": 70000, "addr": 0x0300, "count": 2}
        ],
        "routines": [{"key": 0, "addr": 0x8000, "entry": "reset", "entered": 1}]
    });
    let src = listing::from_rom_and_run(TESTCART, &report.to_string()).unwrap();
    listing::check(&src, TESTCART).unwrap();
    assert_eq!(rom.prg[0x7FF1], 0xEA, "the fixture's fill byte moved; pick another unreached NOP");
    assert!(src.contains(";; @run frames=5 instructions=10 executed=7 of=32768 by=run\n"), "{}", &src[..300]);
    assert!(src.contains(";; @coverage executed=7 of=32768 sites=4 by=run\n"));
    assert!(src.contains(";; @routine reset kind=reset entered=1 by=run\n"));
    assert!(src.contains(";; @ran 1 by=run\n"));
    assert!(src.contains(";; @unreached by=run\n"));
    assert!(src.contains(";; @ran 7 by=run\n"), "the instruction the run alone reached is code with its count");
    let with_run = text::parse(&src).unwrap();
    let n_run = with_run.items.iter().filter(|i| matches!(i, listing::model::Item::Instr { .. })).count();
    assert!(n_run > walked.len(), "the run adds an instruction the walk did not have");
    // A report of another PRG size is refused.
    let e = listing::from_rom_and_run(TESTCART, &serde_json::json!({"prg_len": 16384, "sites": []}).to_string()).unwrap_err();
    assert!(e.contains("16384-byte PRG"), "{e}");
}

#[test]
fn two_runs_merge_into_one_overlay() {
    let a = serde_json::json!({"prg_len": 32768, "frames": 5, "instructions": 3,
        "sites": [{"key": 0, "addr": 0x8000, "count": 1}, {"key": 0x7FF1, "addr": 0xFFF1, "count": 2}],
        "routines": [{"key": 0, "addr": 0x8000, "entry": "reset", "entered": 1}]});
    let b = serde_json::json!({"prg_len": 32768, "frames": 7, "instructions": 4,
        "sites": [{"key": 0, "addr": 0x8000, "count": 4}, {"key": 1, "addr": 0x8001, "count": 4}],
        "routines": [{"key": 0, "addr": 0x8000, "entry": "reset", "entered": 2}]});
    let src = listing::from_rom_and_runs(TESTCART, &[a.to_string(), b.to_string()]).unwrap();
    listing::check(&src, TESTCART).unwrap();
    assert!(src.contains(";; @run frames=12 instructions=7 executed=4 of=32768 by=run\n"), "{}", &src[..400]);
    assert!(src.contains(";; @routine reset kind=reset entered=3 by=run\n"));
    assert!(src.contains(";; @ran 5 by=run\n    SEI\n"), "the counts add");
    assert!(src.contains(";; @ran 2 by=run\n    NOP\n"));
}
