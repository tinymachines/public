//! A lesson's cartridge from its parts: the program and the tiles as the
//! listing's text, and the board's few facts. The one place the parts
//! become a whole listing (the header, the program, $FF to the vectors,
//! the three vectors nmi, reset and irq, the tiles, $00 to the end of the
//! tiles) and that listing a cartridge: lessons/build.py calls it at the
//! command line, the desk calls it in the page, so a lesson built in
//! either is the same bytes.

use crate::{asm, ines, model::Item, text};

/// The board's facts, as lessons/<name>/lesson.json gives them.
pub struct Board<'a> {
    pub mirroring: &'a str,
    pub prg: usize,
    pub org: &'a str,
    pub chr: usize,
}

pub struct Built {
    /// The whole listing, stamped with the cartridge's digest.
    pub src: String,
    /// The cartridge, as an iNES file.
    pub image: Vec<u8>,
    pub sha256: String,
    /// Bytes of program and the instructions among them.
    pub code_bytes: usize,
    pub instructions: usize,
}

fn head(b: &Board, sha: &str) -> String {
    format!(
        ";; @listing 0\n;; @rom sha256={sha} mapper=0 mirroring={} prg={} chr={}\n;; @bank prg 0 org={} size={} fixed\n",
        b.mirroring, b.prg, b.chr, b.org, b.prg
    )
}

/// The program and the tiles, measured by the assembler's own count of
/// what each line occupies; refused when they do not fit, by name.
fn measure(prg: &str, chr: &str, b: &Board) -> Result<(usize, usize, usize), String> {
    let count = |part: &str, what: &str| -> Result<Vec<Item>, String> {
        let src = format!("{}{part}", head(b, "0"));
        text::parse(&src).map(|l| l.items).map_err(|e| format!("the {what}: {e}"))
    };
    let p = count(prg, "program")?;
    let used: usize = p.iter().map(Item::len).sum();
    let instructions = p.iter().filter(|i| matches!(i, Item::Instr { .. })).count();
    let tiles: usize = count(chr, "tiles")?.iter().map(Item::len).sum();
    if used > b.prg - 6 || tiles > b.chr {
        return Err(format!("{used} bytes of program and {tiles} of tiles do not fit"));
    }
    Ok((used, instructions, tiles))
}

pub fn build(prg: &str, chr: &str, b: &Board) -> Result<Built, String> {
    let (used, instructions, tiles) = measure(prg, chr, b)?;
    let body = format!(
        "{prg}{}    .word nmi\n    .word reset\n    .word irq\n;; @bank chr 0 size={}\n{chr}{}",
        "    .byte $FF\n".repeat(b.prg - 6 - used),
        b.chr,
        "    .byte $00\n".repeat(b.chr - tiles)
    );
    let unstamped = format!("{}{body}", head(b, "0"));
    let l = text::parse(&unstamped).map_err(|e| e.to_string())?;
    let image = ines::image(&asm::assemble(&l).map_err(|e| e.to_string())?);
    let sha256 = ines::parse(&image)?.sha256;
    // The header names the cartridge it assembles to.
    let src = format!("{}{body}", head(b, &sha256));
    crate::check(&src, &image)?;
    Ok(Built { src, image, sha256, code_bytes: used, instructions })
}
