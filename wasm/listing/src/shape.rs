//! The shape of a listing: everything in it that is not the ROM's bytes,
//! anchored by bank and offset so it can be laid over the same ROM again.
//! Labels, directives, prose, notes and the comments on lines. For a
//! cartridge that is somebody else's this is the part that may leave the
//! reader's machine (NOTICE.md: shape is not bytes).

use serde::{Deserialize, Serialize};

use crate::model::{Item, Kind, Listing};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Shape {
    pub sha256: String,
    pub marks: Vec<Mark>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Mark {
    pub bank: String,
    pub offset: usize,
    pub kind: String,
    pub text: String,
}

pub fn shape(l: &Listing) -> Shape {
    let mut marks = Vec::new();
    let mut bank = 0usize;
    let mut off = 0usize;
    for (i, item) in l.items.iter().enumerate() {
        while bank + 1 < l.banks.len() && l.banks[bank + 1].first <= i {
            bank += 1;
            off = 0;
        }
        let b = l.banks.get(bank);
        let name = b.map(|b| format!("{}{}", match b.kind { Kind::Prg => "prg", Kind::Chr => "chr" }, b.index)).unwrap_or_default();
        let mut push = |kind: &str, text: String| marks.push(Mark { bank: name.clone(), offset: off, kind: kind.into(), text });
        match item {
            Item::Label(n) => push("label", n.clone()),
            Item::Directive { name, rest } => push("directive", format!("@{name} {rest}").trim_end().to_string()),
            Item::Prose(t) => push("prose", t.clone()),
            Item::Note(t) => push("note", t.clone()),
            Item::Instr { comment: Some(c), .. } | Item::Bytes { comment: Some(c), .. } | Item::Word { comment: Some(c), .. } => push("comment", c.clone()),
            _ => {}
        }
        off += item.len();
    }
    Shape { sha256: l.header.sha256.clone(), marks }
}
