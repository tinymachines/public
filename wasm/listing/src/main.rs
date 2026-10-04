//! The listing at the command line.
//!
//!   listing from ROM.nes [REPORT.json ...]   the first listing of a ROM, to stdout; with flow reports, the runs laid over it as one
//!   listing check FILE ROM.nes      assemble FILE and hold it to ROM.nes
//!   listing render FILE             FILE with addresses and bytes beside each line
//!   listing shape FILE              FILE's marks as JSON, none of its bytes
//!   listing model FILE              the game model FILE's marks describe, as JSON
//!   listing rom FILE OUT.nes        assemble FILE into an iNES file
//!   listing lesson PRG.s CHR.s MIRRORING PRG ORG CHR OUT.s OUT.nes
//!                                   a lesson's parts to its whole listing and cartridge; its counts as JSON

use std::process::exit;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let usage = "usage: listing from ROM.nes [REPORT.json ...] | check FILE ROM.nes | render FILE | shape FILE | model FILE | rom FILE OUT.nes | lesson PRG.s CHR.s MIRRORING PRG ORG CHR OUT.s OUT.nes";
    let read = |p: &str| std::fs::read(p).unwrap_or_else(|e| fail(&format!("{p}: {e}")));
    let text = |p: &str| String::from_utf8(read(p)).unwrap_or_else(|_| fail(&format!("{p}: not UTF-8")));
    match a.get(1).map(String::as_str) {
        Some("from") if a.len() == 3 => print!("{}", listing::from_rom(&read(&a[2])).unwrap_or_else(|e| fail(&e))),
        Some("from") if a.len() >= 4 => {
            let reports: Vec<String> = a[3..].iter().map(|p| text(p)).collect();
            print!("{}", listing::from_rom_and_runs(&read(&a[2]), &reports).unwrap_or_else(|e| fail(&e)));
        }
        Some("check") if a.len() == 4 => match listing::check(&text(&a[2]), &read(&a[3])) {
            Ok(()) => println!("{} assembles to {}", a[2], a[3]),
            Err(e) => fail(&e),
        },
        Some("render") if a.len() == 3 => {
            let l = listing::text::parse(&text(&a[2])).unwrap_or_else(|e| fail(&e.to_string()));
            print!("{}", listing::render::render(&l).unwrap_or_else(|e| fail(&e.to_string())));
        }
        Some("model") if a.len() == 3 => {
            let l = listing::text::parse(&text(&a[2])).unwrap_or_else(|e| fail(&e.to_string()));
            println!("{}", serde_json::to_string_pretty(&listing::game::game(&l).unwrap_or_else(|e| fail(&e))).unwrap());
        }
        Some("shape") if a.len() == 3 => {
            let l = listing::text::parse(&text(&a[2])).unwrap_or_else(|e| fail(&e.to_string()));
            println!("{}", serde_json::to_string_pretty(&listing::shape::shape(&l)).unwrap());
        }
        Some("rom") if a.len() == 4 => {
            let l = listing::text::parse(&text(&a[2])).unwrap_or_else(|e| fail(&e.to_string()));
            let rom = listing::asm::assemble(&l).unwrap_or_else(|e| fail(&e.to_string()));
            std::fs::write(&a[3], listing::ines::image(&rom)).unwrap_or_else(|e| fail(&format!("{}: {e}", a[3])));
            println!("wrote {} ({} PRG, {} CHR)", a[3], rom.prg.len(), rom.chr.len());
        }
        Some("lesson") if a.len() == 10 => {
            let size = |s: &str| s.parse::<usize>().unwrap_or_else(|_| fail(&format!("{s} is not a byte count")));
            let board = listing::lesson::Board { mirroring: &a[4], prg: size(&a[5]), org: &a[6], chr: size(&a[7]) };
            let b = listing::lesson::build(&text(&a[2]), &text(&a[3]), &board).unwrap_or_else(|e| fail(&e));
            std::fs::write(&a[8], &b.src).unwrap_or_else(|e| fail(&format!("{}: {e}", a[8])));
            std::fs::write(&a[9], &b.image).unwrap_or_else(|e| fail(&format!("{}: {e}", a[9])));
            println!("{}", serde_json::json!({"sha256": b.sha256, "code_bytes": b.code_bytes, "instructions": b.instructions}));
        }
        _ => fail(usage),
    }
}

fn fail(msg: &str) -> ! {
    eprintln!("listing: {msg}");
    exit(1)
}
