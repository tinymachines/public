//! Where a bank sits: the board says where it usually is, and a run says
//! where its code ran. On a board that can map one bank at several
//! places (MMC3 swaps which window is the switched one) the usual place
//! is a guess, and a listing at the wrong origin cannot resolve a single
//! absolute address inside the bank. A cartridge of our own, assembled
//! here: four 8 KiB banks, the first written to run at $A000.

use listing::{asm, ines, text};

fn our_rom() -> Vec<u8> {
    let mut src = String::from(";; @listing 0\n;; @rom sha256=0 mapper=4 mirroring=horizontal prg=32768 chr=0\n");
    let fill = |src: &mut String, n: usize| {
        for _ in 0..n {
            src.push_str("    .byte $FF\n");
        }
    };
    src.push_str(";; @bank prg 0 org=$A000 size=8192 switched\nhop:\n    JMP land\n    .byte $FF\nland:\n    RTS\n");
    fill(&mut src, 8192 - 5);
    src.push_str(";; @bank prg 1 org=$8000 size=8192 switched\n");
    fill(&mut src, 8192);
    src.push_str(";; @bank prg 2 org=$C000 size=8192 fixed\n");
    fill(&mut src, 8192);
    src.push_str(";; @bank prg 3 org=$E000 size=8192 fixed\nreset:\n    JMP reset\n");
    fill(&mut src, 8192 - 3 - 6);
    src.push_str("    .word reset\n    .word reset\n    .word reset\n");
    let l = text::parse(&src).unwrap_or_else(|e| panic!("{e}"));
    ines::image(&asm::assemble(&l).unwrap_or_else(|e| panic!("{e}")))
}

#[test]
fn a_run_says_where_a_bank_sat() {
    let image = our_rom();
    // Alone, the walk puts the switched banks at $8000, the board's
    // usual window, and the last two where the board fixes them.
    let alone = listing::from_rom(&image).unwrap();
    listing::check(&alone, &image).unwrap();
    for line in [";; @bank prg 0 org=$8000 size=8192", ";; @bank prg 2 org=$C000 size=8192", ";; @bank prg 3 org=$E000 size=8192"] {
        assert!(alone.contains(line), "{line}\n{}", &alone[..400]);
    }
    // A run that entered the first bank's code at $A000 moves it there,
    // and the jump inside it lands on a label instead of a number.
    let report = serde_json::json!({
        "prg_len": 32768, "frames": 1, "instructions": 3,
        "sites": [{"key": 0, "addr": 0xa000, "count": 1}, {"key": 4, "addr": 0xa004, "count": 1}, {"key": 0x6000, "addr": 0xe000, "count": 1}],
        "routines": [{"id": 0, "key": 0, "addr": 0xa000, "entry": "call", "entered": 1, "frames": 1, "mem": [], "body": [0, 4]}]
    });
    let run = listing::from_rom_and_run(&image, &report.to_string()).unwrap();
    listing::check(&run, &image).unwrap();
    assert!(run.contains(";; @bank prg 0 org=$A000 size=8192"), "{}", &run[..400]);
    assert!(run.contains(";; @bank prg 1 org=$8000 size=8192"), "a bank nothing ran in stays where the board puts it");
    let jump = run.lines().find(|l| l.trim_start().starts_with("JMP ") && !l.contains("reset")).expect("the jump");
    assert!(!jump.contains('$'), "the jump names a label: {jump}");
}
