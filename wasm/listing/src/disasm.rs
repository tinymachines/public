//! A ROM taken apart without running it: the banks the board gives it,
//! and in each bank the code the vectors reach by following control flow
//! (fall-through, branches, JSR, JMP), everything else as bytes. A jump
//! through a table is not followed, so what only a table reaches is
//! listed as data until a trace of the game running says otherwise; the
//! file says which entries the walk started from.

use std::collections::BTreeMap;

use flow::ops::{self, Mode};

use crate::ines::Rom;
use crate::model::{Bank, Header, Item, Kind, Listing, Operand};

/// How the board lays its PRG out, as far as a static listing can say:
/// each bank's usual origin, its offset and length in the PRG, and
/// whether the board keeps it fixed. A switched bank is shown at the
/// origin the board gives it most of the time; the file says which.
///
/// - NROM (0) and CNROM (3): one bank, 32 KiB at $8000 or 16 KiB at
///   $C000 (a 16 KiB PRG is mirrored, and the vectors are read there).
/// - GxROM (66): 32 KiB banks, each at $8000.
/// - MMC1 (1) and UxROM (2): 16 KiB banks at $8000, the last fixed at
///   $C000.
/// - MMC3 (4): 8 KiB banks at $8000, the last 16 KiB fixed at $C000.
/// - MMC2 (9): 8 KiB banks at $8000, the last 24 KiB fixed at $A000.
pub fn prg_banks(rom: &Rom) -> Vec<Layout> {
    let total = rom.prg.len();
    let mut out = Vec::new();
    let mut push = |org: u16, offset: usize, len: usize, fixed: bool| out.push(Layout { org, offset, len, fixed });
    match rom.mapper {
        0 | 3 => {
            if total <= 16384 {
                push(0xC000, 0, total, true);
            } else {
                push(0x8000, 0, total.min(32768), true);
            }
        }
        66 => {
            for i in 0..total / 32768 {
                push(0x8000, i * 32768, 32768, false);
            }
        }
        1 | 2 => {
            let n = total / 16384;
            for i in 0..n {
                push(if i + 1 == n { 0xC000 } else { 0x8000 }, i * 16384, 16384, i + 1 == n);
            }
        }
        4 => {
            let switched = total.saturating_sub(16384) / 8192;
            for i in 0..switched {
                push(0x8000, i * 8192, 8192, false);
            }
            push(0xC000, switched * 8192, total - switched * 8192, true);
        }
        9 => {
            let switched = total.saturating_sub(24576) / 8192;
            for i in 0..switched {
                push(0x8000, i * 8192, 8192, false);
            }
            push(0xA000, switched * 8192, total - switched * 8192, true);
        }
        _ => push(0x8000, 0, total.min(32768), true),
    }
    out
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Layout {
    pub org: u16,
    pub offset: usize,
    pub len: usize,
    pub fixed: bool,
}

struct Walk<'a> {
    bytes: &'a [u8],
    org: u16,
    /// Per byte: 0 free, 1 an opcode, 2 inside an instruction.
    claim: Vec<u8>,
    targets: BTreeMap<u16, &'static str>,
    entries: Vec<(u16, &'static str)>,
}

impl<'a> Walk<'a> {
    fn addr(&self, a: u16) -> Option<usize> {
        let a = a as usize;
        let o = self.org as usize;
        if a >= o && a < o + self.bytes.len() {
            Some(a - o)
        } else {
            None
        }
    }

    fn follow(&mut self, start: u16) {
        let mut work = vec![start];
        while let Some(a) = work.pop() {
            let Some(mut i) = self.addr(a) else { continue };
            loop {
                if self.claim[i] != 0 {
                    break;
                }
                let op = self.bytes[i];
                let n = ops::len(op) as usize;
                if i + n > self.bytes.len() || !ops::documented(op) || (1..n).any(|k| self.claim[i + k] != 0) {
                    break;
                }
                self.claim[i] = 1;
                for k in 1..n {
                    self.claim[i + k] = 2;
                }
                let at = self.org.wrapping_add(i as u16);
                let b1 = self.bytes.get(i + 1).copied().unwrap_or(0);
                let b2 = self.bytes.get(i + 2).copied().unwrap_or(0);
                let w = u16::from_le_bytes([b1, b2]);
                match op {
                    ops::JSR => {
                        self.targets.entry(w).or_insert("routine");
                        work.push(w);
                    }
                    ops::JMP_ABS => {
                        self.targets.entry(w).or_insert("at");
                        work.push(w);
                        break;
                    }
                    ops::JMP_IND | ops::RTS | ops::RTI | ops::BRK => break,
                    _ if ops::is_branch(op) => {
                        let t = at.wrapping_add(2).wrapping_add(b1 as i8 as u16);
                        self.targets.entry(t).or_insert("at");
                        work.push(t);
                    }
                    _ => {}
                }
                i += n;
                if i >= self.bytes.len() {
                    break;
                }
            }
        }
    }
}

pub fn listing(rom: &Rom) -> Listing {
    let header = Header {
        sha256: rom.sha256.clone(),
        mapper: rom.mapper,
        mirroring: rom.mirroring.word().to_string(),
        prg: rom.prg.len(),
        chr: rom.chr.len(),
    };
    let mut banks = Vec::new();
    let mut items = Vec::new();
    let prg = prg_banks(rom);
    let n_prg = prg.len();
    for (index, Layout { org, offset, len, fixed }) in prg.into_iter().enumerate() {
        banks.push(Bank { kind: Kind::Prg, index, org, offset, len, fixed, first: items.len() });
        let bytes = &rom.prg[offset..offset + len];
        let mut walk = Walk { bytes, org, claim: vec![0; len], targets: BTreeMap::new(), entries: Vec::new() };
        // The vectors, when this bank holds them.
        let has_vectors = org as usize + len == 0x10000;
        let vec_at = len.saturating_sub(6);
        // Inside the vector table itself there is no line to hang a label
        // on (the words are written two bytes at a time), so a target
        // there is neither an entry nor a label; its operand stays numeric.
        let in_table = |a: u16| has_vectors && (a as usize) >= org as usize + vec_at;
        if has_vectors {
            for (k, name) in [(0xFFFA, "nmi"), (0xFFFC, "reset"), (0xFFFE, "irq")] {
                let i = k - org as usize;
                let v = u16::from_le_bytes([bytes[i], bytes[i + 1]]);
                if walk.addr(v).is_some() && !in_table(v) {
                    walk.entries.push((v, name));
                }
            }
        }
        for (v, name) in walk.entries.clone() {
            walk.targets.insert(v, name);
            walk.follow(v);
        }
        // The vectors are words, never code.
        let mut label_names: BTreeMap<u16, String> = BTreeMap::new();
        for (&t, &kind) in &walk.targets {
            let Some(i) = walk.addr(t) else { continue };
            if walk.claim[i] == 2 || in_table(t) {
                continue; // inside an instruction: no line to hang a label on
            }
            let name = if kind == "at" { format!("at_{t:04X}") } else if kind == "routine" { format!("routine_{t:04X}") } else { kind.to_string() };
            // Labels are one namespace for the whole file, so on a board
            // with more than one PRG bank each carries its bank's number.
            label_names.insert(t, if n_prg > 1 { format!("b{index}_{name}") } else { name });
        }
        items.push(Item::Directive {
            name: "walk".into(),
            rest: if walk.entries.is_empty() {
                "from nothing: no vector lands in this bank, so a run of the game is the only way to tell its code from its data".to_string()
            } else {
                format!("from {}", walk.entries.iter().map(|(v, n)| format!("{n}=${v:04X}")).collect::<Vec<_>>().join(" "))
            },
        });
        let mut i = 0;
        let mut run: Vec<u8> = Vec::new();
        let flush = |run: &mut Vec<u8>, items: &mut Vec<Item>| {
            for chunk in run.chunks(16) {
                items.push(Item::Bytes { bytes: chunk.to_vec(), comment: None });
            }
            run.clear();
        };
        while i < len {
            let at = org.wrapping_add(i as u16);
            if let Some(name) = label_names.get(&at) {
                flush(&mut run, &mut items);
                if let Some(kind) = walk.targets.get(&at) {
                    if *kind != "at" {
                        items.push(Item::Directive { name: "routine".into(), rest: format!("{name} kind={} by=walk", if *kind == "routine" { "call" } else { kind }) });
                    }
                }
                items.push(Item::Label(name.clone()));
            }
            if has_vectors && i >= vec_at {
                flush(&mut run, &mut items);
                if i == vec_at {
                    items.push(Item::Directive { name: "vectors".into(), rest: String::new() });
                }
                let v = u16::from_le_bytes([bytes[i], bytes[i + 1]]);
                let label = label_names.get(&v).cloned();
                items.push(Item::Word { value: v, label, comment: Some(["nmi", "reset", "irq"][(i - vec_at) / 2].into()) });
                i += 2;
                continue;
            }
            if walk.claim[i] == 1 {
                flush(&mut run, &mut items);
                let op = bytes[i];
                let n = ops::len(op) as usize;
                let b1 = bytes.get(i + 1).copied().unwrap_or(0);
                let b2 = bytes.get(i + 2).copied().unwrap_or(0);
                let mode = ops::mode(op);
                // BRK is two bytes and the second is whatever follows it;
                // the listing carries it as BRK's operand.
                let mode = if op == ops::BRK { Mode::Imm } else { mode };
                let value = match mode {
                    Mode::Imp | Mode::Acc => 0,
                    Mode::Rel => at.wrapping_add(2).wrapping_add(b1 as i8 as u16),
                    Mode::Abs | Mode::Abx | Mode::Aby | Mode::Ind => u16::from_le_bytes([b1, b2]),
                    _ => b1 as u16,
                };
                let label = match mode {
                    Mode::Abs | Mode::Rel if op == ops::JSR || op == ops::JMP_ABS || ops::is_branch(op) => label_names.get(&value).cloned(),
                    _ => None,
                };
                items.push(Item::Instr { op, operand: Operand { mode, value, label }, comment: None });
                i += n;
            } else {
                run.push(bytes[i]);
                i += 1;
                if run.len() == 16 {
                    flush(&mut run, &mut items);
                }
            }
        }
        flush(&mut run, &mut items);
    }
    if !rom.chr.is_empty() {
        let n = rom.chr.len() / 8192;
        for index in 0..n {
            banks.push(Bank { kind: Kind::Chr, index, org: 0, offset: index * 8192, len: 8192, fixed: false, first: items.len() });
            for tile in rom.chr[index * 8192..(index + 1) * 8192].chunks(16) {
                items.push(Item::Bytes { bytes: tile.to_vec(), comment: None });
            }
        }
    }
    Listing { header, banks, items }
}
