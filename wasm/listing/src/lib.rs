//! The listing: an NES cartridge as assemblable text with markup in its
//! comments (FORMAT.md), the static walk that writes a first one from a
//! ROM, the parser that loads one, the assembler that turns it back into
//! the ROM (the check), the rendering with addresses and bytes, the
//! shape (everything but the bytes), and the matchers that name what a
//! run saw. `flow` lends its opcode table.

pub mod asm;
pub mod disasm;
pub mod ines;
pub mod matchers;
pub mod model;
pub mod render;
pub mod run;
pub mod shape;
pub mod text;

/// A ROM to its first listing, as text.
pub fn from_rom(bytes: &[u8]) -> Result<String, String> {
    let rom = ines::parse(bytes)?;
    Ok(text::write(&disasm::listing(&rom)))
}

/// A ROM and one or more flow reports of it running (a recorded run, a
/// crawl), to a listing with the runs laid over the walk as one.
pub fn from_rom_and_runs(bytes: &[u8], reports: &[String]) -> Result<String, String> {
    let rom = ines::parse(bytes)?;
    let mut run = run::Run::default();
    for r in reports {
        run.merge(run::Run::from_report(r, rom.prg.len())?);
    }
    Ok(text::write(&disasm::listing_with(&rom, Some(&run))))
}

pub fn from_rom_and_run(bytes: &[u8], report: &str) -> Result<String, String> {
    from_rom_and_runs(bytes, &[report.to_string()])
}

/// Does the listing assemble to exactly this ROM? The error names the
/// first byte that differs, or why it could not assemble at all.
pub fn check(src: &str, rom_bytes: &[u8]) -> Result<(), String> {
    let l = text::parse(src).map_err(|e| e.to_string())?;
    let rom = ines::parse(rom_bytes)?;
    let built = asm::assemble(&l).map_err(|e| e.to_string())?;
    if l.header.sha256 != rom.sha256 {
        return Err(format!("the listing is of {} and the ROM is {}", &l.header.sha256[..12], &rom.sha256[..12]));
    }
    for (name, a, b) in [("PRG", &built.prg, &rom.prg), ("CHR", &built.chr, &rom.chr)] {
        if a.len() != b.len() {
            return Err(format!("{name} assembles to {} bytes, the ROM has {}", a.len(), b.len()));
        }
        if let Some(k) = a.iter().zip(b).position(|(x, y)| x != y) {
            return Err(format!("{name} differs first at offset {k:#06x}: the listing gives {:02X}, the ROM has {:02X}", a[k], b[k]));
        }
    }
    Ok(())
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub fn listing_from_rom(bytes: &[u8]) -> Result<String, String> {
        super::from_rom(bytes)
    }

    #[wasm_bindgen]
    pub fn listing_render(src: &str) -> Result<String, String> {
        let l = super::text::parse(src).map_err(|e| e.to_string())?;
        super::render::render(&l).map_err(|e| e.to_string())
    }

    #[wasm_bindgen]
    pub fn listing_check(src: &str, rom: &[u8]) -> Result<(), String> {
        super::check(src, rom)
    }
}
