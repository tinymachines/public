//! An iNES file taken apart: the header's few facts, the PRG and the CHR.
//! Refuses what it cannot represent rather than guessing.

use sha2::{Digest, Sha256};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rom {
    pub sha256: String,
    pub mapper: u16,
    pub mirroring: Mirroring,
    pub prg: Vec<u8>,
    pub chr: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mirroring {
    Horizontal,
    Vertical,
    FourScreen,
}

impl Mirroring {
    pub fn word(self) -> &'static str {
        match self {
            Mirroring::Horizontal => "horizontal",
            Mirroring::Vertical => "vertical",
            Mirroring::FourScreen => "four-screen",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "horizontal" => Some(Mirroring::Horizontal),
            "vertical" => Some(Mirroring::Vertical),
            "four-screen" => Some(Mirroring::FourScreen),
            _ => None,
        }
    }
}

/// The boards the console has; a listing of any other is refused by name,
/// because the bank layout below would be a guess.
pub const BOARDS: [u16; 7] = [0, 1, 2, 3, 4, 9, 66];

pub fn parse(bytes: &[u8]) -> Result<Rom, String> {
    if bytes.len() < 16 || &bytes[..4] != b"NES\x1a" {
        return Err("not an iNES file (no NES<EOF> magic)".into());
    }
    let f6 = bytes[6];
    let f7 = bytes[7];
    if f6 & 4 != 0 {
        return Err("a trainer is present; out of scope".into());
    }
    let mapper = ((f6 >> 4) | (f7 & 0xf0)) as u16;
    let mirroring = if f6 & 8 != 0 {
        Mirroring::FourScreen
    } else if f6 & 1 != 0 {
        Mirroring::Vertical
    } else {
        Mirroring::Horizontal
    };
    let prg_len = bytes[4] as usize * 16384;
    let chr_len = bytes[5] as usize * 8192;
    if bytes.len() != 16 + prg_len + chr_len {
        return Err(format!("file is {} bytes, header promises {}", bytes.len(), 16 + prg_len + chr_len));
    }
    if prg_len == 0 {
        return Err("header promises no PRG".into());
    }
    if !BOARDS.contains(&mapper) {
        return Err(format!("mapper {mapper} is out of scope; the listing knows the boards the console has: 0, 1, 2, 3, 4, 9 and 66"));
    }
    let sha256 = format!("{:x}", Sha256::digest(bytes));
    Ok(Rom { sha256, mapper, mirroring, prg: bytes[16..16 + prg_len].to_vec(), chr: bytes[16 + prg_len..].to_vec() })
}

/// The bytes back as an iNES file (a plain header, mirroring bit set).
pub fn image(rom: &Rom) -> Vec<u8> {
    let mut out = b"NES\x1a".to_vec();
    out.push((rom.prg.len() / 16384) as u8);
    out.push((rom.chr.len() / 8192) as u8);
    let mut f6 = ((rom.mapper as u8) & 0x0f) << 4;
    match rom.mirroring {
        Mirroring::Vertical => f6 |= 1,
        Mirroring::FourScreen => f6 |= 8,
        Mirroring::Horizontal => {}
    }
    out.push(f6);
    out.push((rom.mapper as u8) & 0xf0);
    out.extend_from_slice(&[0; 8]);
    out.extend_from_slice(&rom.prg);
    out.extend_from_slice(&rom.chr);
    out
}
