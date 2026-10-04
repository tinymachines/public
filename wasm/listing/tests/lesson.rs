//! A lesson's parts to a cartridge (src/lesson.rs): the parts become a
//! listing that assembles to the cartridge it is stamped with, and parts
//! that do not fit are refused rather than cut.

use listing::lesson::{build, Board};

const PRG: &str = "reset:\n    SEI\nloop:\n    JMP loop\nnmi:\n    RTI\nirq:\n    RTI\n";
const CHR: &str = "    .byte $FF,$FF\n";

fn board() -> Board<'static> {
    Board { mirroring: "horizontal", prg: 16384, org: "$C000", chr: 8192 }
}

#[test]
fn the_parts_become_a_cartridge_the_listing_checks_against() {
    let b = build(PRG, CHR, &board()).unwrap();
    // SEI 1, JMP 3, RTI 1, RTI 1.
    assert_eq!((b.code_bytes, b.instructions), (6, 4));
    assert_eq!(b.image.len(), 16 + 16384 + 8192);
    // The vectors at the end of the program: nmi, reset, irq.
    let prg = &b.image[16..16 + 16384];
    let word = |at: usize| u16::from_le_bytes([prg[at], prg[at + 1]]);
    assert_eq!((word(16378), word(16380), word(16382)), (0xC004, 0xC000, 0xC005));
    assert!(b.src.contains(&format!("sha256={} ", b.sha256)), "the listing names its cartridge");
    listing::check(&b.src, &b.image).unwrap();
}

#[test]
fn parts_that_do_not_fit_are_refused() {
    let big = format!("{PRG}{}", "    .byte $EA\n".repeat(16384));
    let e = build(&big, CHR, &board()).err().expect("a program larger than its bank is refused");
    assert!(e.contains("do not fit"), "{e}");
}
