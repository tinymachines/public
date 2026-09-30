//! A ROM taken apart without running it: the banks the board gives it,
//! and in each bank the code the vectors reach by following control flow
//! (fall-through, branches, JSR, JMP), everything else as bytes. A jump
//! through a table is not followed, so what only a table reaches is
//! listed as data until a trace of the game running says otherwise; the
//! file says which entries the walk started from.

use std::collections::{BTreeMap, BTreeSet};

use flow::ops::{self, Mode};

use crate::ines::Rom;
use crate::model::{Bank, Header, Item, Kind, Listing, Operand};
use crate::run::Run;

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
    /// Per byte: this opcode's successors have been queued already.
    done: Vec<bool>,
    targets: BTreeMap<u16, &'static str>,
    entries: Vec<(u16, &'static str)>,
    /// JSRs a run showed to be a jump engine's calls: what follows each
    /// is its table, not code, so the walk does not fall through.
    no_fall: BTreeSet<u16>,
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
                // Inside another instruction, or already walked from here.
                if self.claim[i] == 2 || self.done[i] {
                    break;
                }
                let op = self.bytes[i];
                let n = ops::len(op) as usize;
                if self.claim[i] == 0 {
                    if i + n > self.bytes.len() || !ops::documented(op) || (1..n).any(|k| self.claim[i + k] != 0) {
                        break;
                    }
                    self.claim[i] = 1;
                    for k in 1..n {
                        self.claim[i + k] = 2;
                    }
                }
                self.done[i] = true;
                let at = self.org.wrapping_add(i as u16);
                let b1 = self.bytes.get(i + 1).copied().unwrap_or(0);
                let b2 = self.bytes.get(i + 2).copied().unwrap_or(0);
                let w = u16::from_le_bytes([b1, b2]);
                match op {
                    ops::JSR => {
                        self.targets.entry(w).or_insert("routine");
                        work.push(w);
                        if self.no_fall.contains(&at) {
                            break;
                        }
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
    listing_with(rom, None)
}

/// The listing with a run laid over the walk: every instruction the run
/// executed is code whatever the walk thought, its count is written as
/// `@ran` at the start of each stretch of equal counts, code the walk
/// found that the run never reached is marked `@unreached`, the run's
/// routines are `@routine ... by=run`, and each bank and the file say
/// how much of the PRG was executed.
pub fn listing_with(rom: &Rom, run: Option<&Run>) -> Listing {
    let header = Header {
        sha256: rom.sha256.clone(),
        mapper: rom.mapper,
        mirroring: rom.mirroring.word().to_string(),
        prg: rom.prg.len(),
        chr: rom.chr.len(),
    };
    let mut banks = Vec::new();
    let mut items = Vec::new();
    if let Some(r) = run {
        let executed: usize = r.sites.iter().map(|(&o, _)| ops::len(rom.prg[o]) as usize).sum();
        items.push(Item::Directive { name: "run".into(), rest: format!("frames={} instructions={} executed={executed} of={} by=run", r.frames, r.instructions, rom.prg.len()) });
    }
    let prg = prg_banks(rom);
    let n_prg = prg.len();
    // Every label by its PRG offset, for the RAM block after the banks.
    let mut names: BTreeMap<usize, String> = BTreeMap::new();
    let mut is_marks: BTreeMap<usize, Vec<String>> = BTreeMap::new();
    for m in run.map(|r| crate::matchers::find(r, &rom.prg)).unwrap_or_default() {
        is_marks.entry(m.offset).or_default().push(m.rest);
    }
    for (index, Layout { org, offset, len, fixed }) in prg.into_iter().enumerate() {
        banks.push(Bank { kind: Kind::Prg, index, org, offset, len, fixed, first: items.len() });
        let bytes = &rom.prg[offset..offset + len];
        let dispatches: Vec<&crate::run::Dispatch> = run.map(|r| r.dispatch.iter().filter(|d| d.offset >= offset && d.offset < offset + len && bytes[d.offset - offset] == ops::JSR).collect()).unwrap_or_default();
        let no_fall: BTreeSet<u16> = dispatches.iter().map(|d| org.wrapping_add((d.offset - offset) as u16)).collect();
        let mut walk = Walk { bytes, org, claim: vec![0; len], done: vec![false; len], targets: BTreeMap::new(), entries: Vec::new(), no_fall };
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
        let sites = run.map(|r| r.in_bank(offset, len)).unwrap_or_default();
        // The run's instructions are ground truth: claim them first, one
        // at a time (no following), so the walk cannot decode across them
        // differently.
        for (&o, _) in &sites {
            if walk.claim[o] == 0 {
                let op = bytes[o];
                let n = ops::len(op) as usize;
                // An undocumented opcode stays bytes even when the run
                // executed it (FORMAT.md: the 151 are the vocabulary).
                if ops::documented(op) && o + n <= len && (1..n).all(|k| walk.claim[o + k] == 0) {
                    walk.claim[o] = 1;
                    for k in 1..n {
                        walk.claim[o + k] = 2;
                    }
                }
            }
        }
        for (v, name) in walk.entries.clone() {
            walk.targets.insert(v, name);
            walk.follow(v);
        }
        // And from every run site, so what a run reached statically
        // reaches on (the targets it names get labels).
        for (&o, _) in &sites {
            walk.follow(org.wrapping_add(o as u16));
        }
        let run_routines: BTreeMap<u16, &crate::run::Routine> = run
            .map(|r| r.routines.iter().filter(|x| x.offset >= offset && x.offset < offset + len).map(|x| (org.wrapping_add((x.offset - offset) as u16), x)).collect())
            .unwrap_or_default();
        for (&a, r) in &run_routines {
            let kind: &'static str = match r.entry.as_str() {
                "reset" => "reset",
                "nmi" => "nmi",
                "irq" => "irq",
                "brk" => "brk",
                "dispatch" => "dispatch",
                _ => "routine",
            };
            // The walk may only know the address as somewhere a branch
            // lands; a run that entered it as a routine knows more.
            let e = walk.targets.entry(a).or_insert(kind);
            if *e == "at" {
                *e = kind;
            }
        }
        // The vectors are words, never code.
        let mut label_names: BTreeMap<u16, String> = BTreeMap::new();
        // One name, one address: a second `irq` (a run entered an
        // interrupt somewhere the vector does not point) carries its
        // address.
        let mut used: BTreeSet<String> = BTreeSet::new();
        for (&t, &kind) in &walk.targets {
            let Some(i) = walk.addr(t) else { continue };
            if walk.claim[i] == 2 || in_table(t) {
                continue; // inside an instruction: no line to hang a label on
            }
            let name = match kind {
                "at" => format!("at_{t:04X}"),
                "routine" => format!("routine_{t:04X}"),
                "dispatch" => format!("dispatch_{t:04X}"),
                "brk" => format!("brk_{t:04X}"),
                _ => kind.to_string(),
            };
            // Labels are one namespace for the whole file, so on a board
            // with more than one PRG bank each carries its bank's number.
            let name = if n_prg > 1 { format!("b{index}_{name}") } else { name };
            let name = if used.contains(&name) { format!("{name}_{t:04X}") } else { name };
            used.insert(name.clone());
            label_names.insert(t, name);
        }
        // A jump engine's table: the words after its JSR, as far as the
        // run saw entries taken (a stray word past the last one is never
        // mistaken for an entry), while every word is an address in this
        // bank and none of the bytes is code.
        let mut tables: BTreeMap<usize, (usize, BTreeMap<u16, u64>)> = BTreeMap::new();
        for d in &dispatches {
            let start = d.offset - offset + 3;
            let seen: BTreeMap<u16, u64> = d.targets.iter().map(|t| (t.1, t.2)).collect();
            let end = if has_vectors { vec_at } else { len };
            let mut last = None;
            for k in 0..64 {
                if start + 2 * k + 1 >= end {
                    break;
                }
                let w = u16::from_le_bytes([bytes[start + 2 * k], bytes[start + 2 * k + 1]]);
                if walk.addr(w).is_none() {
                    break;
                }
                if seen.contains_key(&w) {
                    last = Some(k);
                }
            }
            if let Some(last) = last {
                if (start..start + 2 * (last + 1)).all(|i| walk.claim[i] == 0) {
                    tables.insert(start, (last + 1, seen));
                }
            }
        }
        for (&a, name) in &label_names {
            names.insert(offset + (a.wrapping_sub(org)) as usize, name.clone());
        }
        items.push(Item::Directive {
            name: "walk".into(),
            rest: if walk.entries.is_empty() {
                "from nothing: no vector lands in this bank, so a run of the game is the only way to tell its code from its data".to_string()
            } else {
                format!("from {}", walk.entries.iter().map(|(v, n)| format!("{n}=${v:04X}")).collect::<Vec<_>>().join(" "))
            },
        });
        if run.is_some() {
            let executed: usize = sites.keys().map(|&o| ops::len(bytes[o]) as usize).sum();
            items.push(Item::Directive { name: "coverage".into(), rest: format!("executed={executed} of={len} sites={} by=run", sites.len()) });
        }
        let mut last_count: Option<u64> = None;
        let mut i = 0;
        let mut run_bytes: Vec<u8> = Vec::new();
        let flush = |run: &mut Vec<u8>, items: &mut Vec<Item>| {
            for chunk in run.chunks(16) {
                items.push(Item::Bytes { bytes: chunk.to_vec(), comment: None });
            }
            run.clear();
        };
        while i < len {
            let at = org.wrapping_add(i as u16);
            if let Some(name) = label_names.get(&at) {
                flush(&mut run_bytes, &mut items);
                last_count = None;
                for rest in is_marks.remove(&(offset + i)).unwrap_or_default() {
                    items.push(Item::Directive { name: "is".into(), rest });
                }
                if let Some(kind) = walk.targets.get(&at) {
                    if *kind != "at" {
                        let kind_word = if *kind == "routine" { "call" } else { kind };
                        match run_routines.get(&at) {
                            Some(r) => items.push(Item::Directive { name: "routine".into(), rest: format!("{name} kind={kind_word} entered={} by=run", r.entered) }),
                            None => items.push(Item::Directive { name: "routine".into(), rest: format!("{name} kind={kind_word} by=walk") }),
                        }
                    }
                }
                items.push(Item::Label(name.clone()));
            }
            if let Some((entries, seen)) = tables.get(&i) {
                flush(&mut run_bytes, &mut items);
                last_count = None;
                items.push(Item::Directive { name: "table".into(), rest: format!("dispatch entries={entries} seen={} by=run", seen.len()) });
                for k in 0..*entries {
                    let w = u16::from_le_bytes([bytes[i + 2 * k], bytes[i + 2 * k + 1]]);
                    items.push(Item::Word { value: w, label: label_names.get(&w).cloned(), comment: seen.get(&w).map(|n| format!("ran {n}")) });
                }
                i += 2 * entries;
                continue;
            }
            if has_vectors && i >= vec_at {
                flush(&mut run_bytes, &mut items);
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
                flush(&mut run_bytes, &mut items);
                if run.is_some() {
                    let count = sites.get(&i).map_or(0, |s| s.count);
                    if last_count != Some(count) {
                        if count == 0 {
                            items.push(Item::Directive { name: "unreached".into(), rest: "by=run".into() });
                        } else {
                            items.push(Item::Directive { name: "ran".into(), rest: format!("{count} by=run") });
                        }
                        last_count = Some(count);
                    }
                }
                let op = bytes[i];
                let n = ops::len(op) as usize;
                for k in 0..n {
                    for rest in is_marks.remove(&(offset + i + k)).unwrap_or_default() {
                        items.push(Item::Directive { name: "is".into(), rest });
                    }
                }
                // A routine the run entered at a byte inside this
                // instruction (code that overlaps, the BIT-skip trick) has
                // no line to hang a label on; its mark says where it hides.
                for k in 1..n {
                    let t = at.wrapping_add(k as u16);
                    if let Some(r) = run_routines.get(&t) {
                        let kind_word = match r.entry.as_str() {
                            "dispatch" => "dispatch",
                            "brk" => "brk",
                            _ => "call",
                        };
                        let name = if n_prg > 1 { format!("b{index}_routine_{t:04X}") } else { format!("routine_{t:04X}") };
                        items.push(Item::Directive { name: "routine".into(), rest: format!("{name} kind={kind_word} entered={} by=run inside=${at:04X}", r.entered) });
                    }
                }
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
                last_count = None;
                run_bytes.push(bytes[i]);
                i += 1;
                if run_bytes.len() == 16 {
                    flush(&mut run_bytes, &mut items);
                }
            }
        }
        flush(&mut run_bytes, &mut items);
    }
    // The RAM the routines share, after the code: a byte one routine
    // writes and another reads, by the report's count, each side's
    // routines by name (or by address, when it ran from RAM) with their
    // counts, the busiest first.
    if let Some(r) = run {
        let arrays = crate::matchers::arrays(r, &rom.prg);
        if !r.vars.is_empty() || !arrays.is_empty() {
            items.push(Item::Directive { name: "ram".into(), rest: format!("variables={} arrays={} by=run", r.vars.len(), arrays.len()) });
            for (base, slots, sites) in arrays {
                items.push(Item::Directive { name: "array".into(), rest: format!("${base:04X} slots={slots} sites={sites} by=run") });
            }
            let mut vars: Vec<&crate::run::Var> = r.vars.iter().collect();
            vars.sort_by_key(|v| v.addr);
            let side = |xs: &[(usize, u16, u64)]| -> String {
                let mut xs: Vec<&(usize, u16, u64)> = xs.iter().collect();
                xs.sort_by(|a, b| b.2.cmp(&a.2).then(a.0.cmp(&b.0)));
                let mut s: Vec<String> = xs.iter().take(6).map(|(k, a, n)| format!("{}:{n}", names.get(k).cloned().unwrap_or_else(|| format!("${a:04X}")))).collect();
                if xs.len() > 6 {
                    s.push(format!("+{}", xs.len() - 6));
                }
                s.join(",")
            };
            for v in vars {
                items.push(Item::Directive { name: "var".into(), rest: format!("${:04X} writers={} readers={} total={} by=run", v.addr, side(&v.writers), side(&v.readers), v.total) });
            }
        }
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
