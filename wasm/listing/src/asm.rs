//! The listing back into bytes. Two passes: the labels' addresses from
//! the lengths of everything before them, then every item encoded. The
//! result is the ROM, or the reason it is not.

use std::collections::HashMap;

use flow::ops::Mode;

use crate::ines::{Mirroring, Rom};
use crate::model::{Item, Kind, Listing};

#[derive(Debug)]
pub struct AsmError {
    pub item: usize,
    pub what: String,
}

impl std::fmt::Display for AsmError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "item {}: {}", self.item, self.what)
    }
}

/// Every label's address, and every item's address (the bank's origin
/// plus its offset within the bank).
pub fn addresses(l: &Listing) -> Result<(HashMap<String, u16>, Vec<u16>), AsmError> {
    let mut labels = HashMap::new();
    let mut at = Vec::with_capacity(l.items.len());
    let mut bank = 0usize;
    let mut pc: usize = 0;
    let mut used: usize = 0;
    for (i, item) in l.items.iter().enumerate() {
        while bank + 1 < l.banks.len() && l.banks[bank + 1].first <= i {
            bank += 1;
            pc = l.banks[bank].org as usize;
            used = 0;
        }
        if i == l.banks.get(0).map(|b| b.first).unwrap_or(usize::MAX) {
            pc = l.banks[0].org as usize;
            used = 0;
        }
        at.push(pc as u16);
        if let Item::Label(n) = item {
            if labels.insert(n.clone(), pc as u16).is_some() {
                return Err(AsmError { item: i, what: format!("label {n} defined twice") });
            }
        }
        let n = item.len();
        used += n;
        if !l.banks.is_empty() && used > l.banks[bank].len {
            return Err(AsmError { item: i, what: format!("bank {} {} overflows its {} bytes", kind_word(l.banks[bank].kind), l.banks[bank].index, l.banks[bank].len) });
        }
        pc += n;
    }
    Ok((labels, at))
}

fn kind_word(k: Kind) -> &'static str {
    match k {
        Kind::Prg => "prg",
        Kind::Chr => "chr",
    }
}

pub fn assemble(l: &Listing) -> Result<Rom, AsmError> {
    let (labels, at) = addresses(l)?;
    let mut prg = vec![0u8; l.header.prg];
    let mut chr = vec![0u8; l.header.chr];
    let mut bank = 0usize;
    let mut off = 0usize;
    let mut used_of_bank = vec![0usize; l.banks.len()];
    for (i, item) in l.items.iter().enumerate() {
        while bank + 1 < l.banks.len() && l.banks[bank + 1].first <= i {
            bank += 1;
            off = 0;
        }
        let Some(b) = l.banks.get(bank) else {
            if item.len() > 0 {
                return Err(AsmError { item: i, what: "bytes before any bank".into() });
            }
            continue;
        };
        let out = match b.kind {
            Kind::Prg => &mut prg,
            Kind::Chr => &mut chr,
        };
        let base = b.offset + off;
        let resolve = |label: &Option<String>, value: u16| -> Result<u16, AsmError> {
            match label {
                Some(n) => labels.get(n).copied().ok_or_else(|| AsmError { item: i, what: format!("no label named {n}") }),
                None => Ok(value),
            }
        };
        match item {
            Item::Instr { op, operand, .. } => {
                let v = resolve(&operand.label, operand.value)?;
                let n = flow::ops::len(*op) as usize;
                if base + n > out.len() {
                    return Err(AsmError { item: i, what: "instruction runs past the ROM".into() });
                }
                out[base] = *op;
                match operand.mode {
                    Mode::Imp | Mode::Acc => {}
                    Mode::Rel => {
                        let d = v as i32 - (at[i] as i32 + 2);
                        if !(-128..=127).contains(&d) {
                            return Err(AsmError { item: i, what: format!("branch to ${v:04X} is {d} bytes away; the reach is -128 to 127") });
                        }
                        out[base + 1] = d as i8 as u8;
                    }
                    Mode::Abs | Mode::Abx | Mode::Aby | Mode::Ind => {
                        out[base + 1..base + 3].copy_from_slice(&v.to_le_bytes());
                    }
                    _ => out[base + 1] = v as u8,
                }
            }
            Item::Bytes { bytes, .. } => {
                if base + bytes.len() > out.len() {
                    return Err(AsmError { item: i, what: "bytes run past the ROM".into() });
                }
                out[base..base + bytes.len()].copy_from_slice(bytes);
            }
            Item::Half { label, high, less, .. } => {
                let v = resolve(&Some(label.clone()), 0)?.wrapping_sub(*less);
                if base + 1 > out.len() {
                    return Err(AsmError { item: i, what: "byte runs past the ROM".into() });
                }
                out[base] = if *high { (v >> 8) as u8 } else { v as u8 };
            }
            Item::Word { value, label, less, .. } => {
                let v = resolve(label, *value)?.wrapping_sub(if label.is_some() { *less } else { 0 });
                if base + 2 > out.len() {
                    return Err(AsmError { item: i, what: "word runs past the ROM".into() });
                }
                out[base..base + 2].copy_from_slice(&v.to_le_bytes());
            }
            _ => {}
        }
        off += item.len();
        used_of_bank[bank] = off;
    }
    for (b, used) in l.banks.iter().zip(used_of_bank) {
        if used != b.len {
            return Err(AsmError { item: b.first, what: format!("bank {} {} holds {} bytes of its {}", kind_word(b.kind), b.index, used, b.len) });
        }
    }
    let mirroring = Mirroring::parse(&l.header.mirroring).ok_or_else(|| AsmError { item: 0, what: format!("mirroring {} is not horizontal, vertical or four-screen", l.header.mirroring) })?;
    Ok(Rom { sha256: l.header.sha256.clone(), mapper: l.header.mapper, mirroring, prg, chr })
}
