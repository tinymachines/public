//! What a listing holds, in memory: the ROM's facts, its banks, and one
//! item per line that means something (a label, an instruction, a run of
//! bytes, a word, a directive, prose, a note). Addresses are never stored:
//! they follow from the bank's origin and the lengths of what came before,
//! which is what lets a listing be assembled back into the ROM.

use flow::ops::Mode;
use serde::{Deserialize, Serialize};

use crate::ines::Mirroring;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Header {
    pub sha256: String,
    pub mapper: u16,
    pub mirroring: String,
    pub prg: usize,
    pub chr: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Kind {
    Prg,
    Chr,
}

/// A bank: a stretch of PRG or CHR with the CPU (or PPU) address its
/// first byte answers at. `offset` is where it starts in the ROM's PRG or
/// CHR; on a board that switches banks the origin is the one the board
/// gives it most of the time, and the file says so in the header.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bank {
    pub kind: Kind,
    pub index: usize,
    pub org: u16,
    pub offset: usize,
    pub len: usize,
    /// Whether the board keeps the bank where it is.
    pub fixed: bool,
    /// The first item of this bank in `Listing::items`.
    pub first: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Operand {
    #[serde(serialize_with = "ser_mode", deserialize_with = "de_mode")]
    pub mode: Mode,
    /// The value: an immediate, a zero-page or absolute address, or for a
    /// branch the target address (not the displacement).
    pub value: u16,
    /// A label standing for the value, when the text used one. Only in
    /// absolute and relative forms: a label is an address.
    pub label: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Item {
    Label(String),
    /// `;; @name rest`: markup the tools read.
    Directive { name: String, rest: String },
    /// `;; text`: prose for the reader, attached to what follows.
    Prose(String),
    /// `; text` on a line of its own.
    Note(String),
    Instr { op: u8, operand: Operand, comment: Option<String> },
    Bytes { bytes: Vec<u8>, comment: Option<String> },
    /// `.word $1234`, `.word name` or `.word name-1`. `less` is what is
    /// taken off the label's address: a table a return goes through holds
    /// one less than where the return lands.
    Word { value: u16, label: Option<String>, less: u16, comment: Option<String> },
    /// `.byte <name` or `.byte >name`: the low or the high byte of a
    /// label's address (less `less`), one entry of a table kept as two.
    Half { label: String, high: bool, less: u16, comment: Option<String> },
}

/// How a label is written where something is taken off it: `name`, `name-1`.
pub fn less_text(label: &str, less: u16) -> String {
    if less == 0 { label.to_string() } else { format!("{label}-{less}") }
}

impl Item {
    /// The bytes the item occupies in the ROM.
    pub fn len(&self) -> usize {
        match self {
            Item::Instr { op, .. } => flow::ops::len(*op) as usize,
            Item::Bytes { bytes, .. } => bytes.len(),
            Item::Word { .. } => 2,
            Item::Half { .. } => 1,
            _ => 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Listing {
    pub header: Header,
    pub banks: Vec<Bank>,
    pub items: Vec<Item>,
}

impl Listing {
    pub fn mirroring(&self) -> Option<Mirroring> {
        Mirroring::parse(&self.header.mirroring)
    }
    /// The bank an item index falls in.
    pub fn bank_of(&self, item: usize) -> Option<&Bank> {
        self.banks.iter().rev().find(|b| b.first <= item)
    }
}

/// Serde needs the mode by name; the flow crate's enum has no serde, so
/// the listing carries it as text at the boundary.
pub fn mode_name(m: Mode) -> &'static str {
    match m {
        Mode::Imp => "imp",
        Mode::Acc => "acc",
        Mode::Imm => "imm",
        Mode::Zp => "zp",
        Mode::Zpx => "zpx",
        Mode::Zpy => "zpy",
        Mode::Izx => "izx",
        Mode::Izy => "izy",
        Mode::Abs => "abs",
        Mode::Abx => "abx",
        Mode::Aby => "aby",
        Mode::Ind => "ind",
        Mode::Rel => "rel",
    }
}

pub fn parse_mode(s: &str) -> Option<Mode> {
    Some(match s {
        "imp" => Mode::Imp,
        "acc" => Mode::Acc,
        "imm" => Mode::Imm,
        "zp" => Mode::Zp,
        "zpx" => Mode::Zpx,
        "zpy" => Mode::Zpy,
        "izx" => Mode::Izx,
        "izy" => Mode::Izy,
        "abs" => Mode::Abs,
        "abx" => Mode::Abx,
        "aby" => Mode::Aby,
        "ind" => Mode::Ind,
        "rel" => Mode::Rel,
        _ => return None,
    })
}

fn ser_mode<S: serde::Serializer>(m: &Mode, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(mode_name(*m))
}

fn de_mode<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Mode, D::Error> {
    let s = String::deserialize(d)?;
    parse_mode(&s).ok_or_else(|| serde::de::Error::custom(format!("no addressing mode named {s}")))
}
