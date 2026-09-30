//! The listing at the command line.
//!
//!   listing from ROM.nes            the first listing of a ROM, to stdout
//!   listing check FILE ROM.nes      assemble FILE and hold it to ROM.nes
//!   listing render FILE             FILE with addresses and bytes beside each line
//!   listing shape FILE              FILE's marks as JSON, none of its bytes
//!   listing rom FILE OUT.nes        assemble FILE into an iNES file

use std::process::exit;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let usage = "usage: listing from ROM.nes | check FILE ROM.nes | render FILE | shape FILE | rom FILE OUT.nes";
    let read = |p: &str| std::fs::read(p).unwrap_or_else(|e| fail(&format!("{p}: {e}")));
    let text = |p: &str| String::from_utf8(read(p)).unwrap_or_else(|_| fail(&format!("{p}: not UTF-8")));
    match a.get(1).map(String::as_str) {
        Some("from") if a.len() == 3 => print!("{}", listing::from_rom(&read(&a[2])).unwrap_or_else(|e| fail(&e))),
        Some("check") if a.len() == 4 => match listing::check(&text(&a[2]), &read(&a[3])) {
            Ok(()) => println!("{} assembles to {}", a[2], a[3]),
            Err(e) => fail(&e),
        },
        Some("render") if a.len() == 3 => {
            let l = listing::text::parse(&text(&a[2])).unwrap_or_else(|e| fail(&e.to_string()));
            print!("{}", listing::render::render(&l).unwrap_or_else(|e| fail(&e.to_string())));
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
        _ => fail(usage),
    }
}

fn fail(msg: &str) -> ! {
    eprintln!("listing: {msg}");
    exit(1)
}
