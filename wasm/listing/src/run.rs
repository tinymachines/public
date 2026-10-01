//! What a run of the game adds to a listing: the flow report of a trace
//! (`wasm/flow`, `report`) says which PRG offsets were executed, how
//! often, where the routines were entered and what they touched, which
//! JSRs were a jump engine's calls and where each landed, and where the
//! loops were. Laid over the static walk it turns "what the vectors
//! reach" into "what the game ran", and the marks it writes say `by=run`
//! so the two are never confused; the matchers read it too.

use std::collections::BTreeMap;

use serde_json::Value;

/// One executed instruction: its PRG offset, how many times, and the
/// address it ran at.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Site {
    pub count: u64,
    pub addr: u16,
    /// The addresses it read and wrote below the ROM (the stack aside),
    /// with counts, a few each; and the lowest and highest of them.
    pub reads: Vec<(u16, u64)>,
    pub writes: Vec<(u16, u64)>,
    pub span: Option<(u16, u16)>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Routine {
    pub offset: usize,
    pub addr: u16,
    pub entry: String,
    pub entered: u64,
    /// The frames it ran in.
    pub frames: u32,
    /// What it read and wrote outside the ROM: address, reads, writes.
    pub mem: Vec<(u16, u32, u32)>,
    /// The hardware it touched by where the beam was: address, accesses
    /// while the picture was drawing, accesses in the blank (PPU
    /// registers, $4014, the mapper as $8000). Empty from a report
    /// written before the flow carried it.
    pub in_frame: Vec<(u16, u32, u32)>,
    /// Writes of $2007 by VRAM region (pattern, name 0 to 3, palette).
    pub vram: Vec<(String, u32)>,
    /// Writes into the page the sprite DMA takes.
    pub oam_writes: u32,
    /// The PRG offsets of the instructions it ran.
    pub body: Vec<usize>,
    /// The routines that called it, by PRG offset.
    pub callers: Vec<usize>,
}

/// A site the run saw choose its successor from a table: a jump
/// engine's `JSR` (the table follows it) or a `JMP` indirect.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Dispatch {
    pub offset: usize,
    pub addr: u16,
    /// Where it landed: the routine's PRG offset, its address, how often.
    pub targets: Vec<(usize, u16, u64)>,
    /// How many times the choice changed over the run.
    pub switches: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Loop {
    pub head: usize,
    pub tail: usize,
    pub head_addr: u16,
    pub kind: String,
    pub iterations: u64,
    /// How many times it was entered from outside itself, and, for a
    /// wait, the address its body read most: what it waited on.
    pub entries: u64,
    pub on: Option<u16>,
}

/// A RAM byte one routine writes and another reads: the report's
/// variables. Writers and readers are (PRG offset, address, count); a
/// routine that ran from RAM has an offset past the PRG and only its
/// address to be named by.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Var {
    pub addr: u16,
    pub writers: Vec<(usize, u16, u64)>,
    pub readers: Vec<(usize, u16, u64)>,
    pub total: u64,
}

/// An instruction that compared or subtracted two values made from
/// different cells of RAM that both reached a sprite's position: its
/// PRG offset, the routine it ran in, and the pairs (lower cell, higher
/// cell, how often, and the coordinate both reached: x, y or xy).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Meet {
    pub offset: usize,
    pub routine: usize,
    pub pairs: Vec<(u16, u16, u64, String)>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Run {
    pub frames: u64,
    /// The frames somebody watched the routines in: a flow report's. A
    /// crawl's record adds coverage and frames but names no routine, so
    /// "in half the frames" is asked of these, not of `frames`.
    pub watched: u64,
    pub instructions: u64,
    pub sites: BTreeMap<usize, Site>,
    pub routines: Vec<Routine>,
    pub dispatch: Vec<Dispatch>,
    pub loops: Vec<Loop>,
    pub vars: Vec<Var>,
    pub meets: Vec<Meet>,
}

fn u(v: &Value) -> u64 {
    v.as_u64().unwrap_or(0)
}

impl Run {
    /// The flow report as JSON. `prg_len` must be the listing's, or the
    /// offsets mean nothing. Anything keyed past the PRG ran from RAM
    /// and has no place in a listing of the ROM.
    pub fn from_report(json: &str, prg_len: usize) -> Result<Run, String> {
        let v: Value = serde_json::from_str(json).map_err(|e| format!("the run report is not JSON: {e}"))?;
        let rep_len = v["prg_len"].as_u64().ok_or("the run report has no prg_len")? as usize;
        if rep_len != prg_len {
            return Err(format!("the run report is of a {rep_len}-byte PRG, this ROM's is {prg_len}"));
        }
        let mut run = Run { frames: u(&v["frames"]), instructions: u(&v["instructions"]), ..Default::default() };
        for s in v["sites"].as_array().ok_or("the run report has no sites")? {
            let key = s["key"].as_u64().ok_or("a site without a key")? as usize;
            if key >= prg_len {
                continue;
            }
            let pairs = |k: &str| -> Vec<(u16, u64)> {
                s[k].as_array()
                    .unwrap_or(&Vec::new())
                    .iter()
                    .filter_map(|m| {
                        let m = m.as_array()?;
                        Some((u(m.first()?) as u16, u(m.get(1)?)))
                    })
                    .collect()
            };
            let span = s["span"].as_array().and_then(|m| Some((u(m.first()?) as u16, u(m.get(1)?) as u16)));
            run.sites.insert(key, Site { count: u(&s["count"]), addr: u(&s["addr"]) as u16, reads: pairs("reads"), writes: pairs("writes"), span });
        }
        // The report numbers its routines; dispatch targets name them so.
        let mut by_id: BTreeMap<u64, (usize, u16)> = BTreeMap::new();
        let none = Vec::new();
        for (n, r) in v["routines"].as_array().unwrap_or(&none).iter().enumerate() {
            by_id.insert(r["id"].as_u64().unwrap_or(n as u64), (r["key"].as_u64().unwrap_or(u64::MAX) as usize, u(&r["addr"]) as u16));
        }
        for r in v["routines"].as_array().unwrap_or(&none) {
            let key = r["key"].as_u64().unwrap_or(u64::MAX) as usize;
            let addr = u(&r["addr"]) as u16;
            if key >= prg_len {
                continue;
            }
            let entry = match &r["entry"] {
                Value::String(s) => s.to_ascii_lowercase(),
                other => other.to_string().to_ascii_lowercase(),
            };
            let triples = |k: &str| -> Vec<(u16, u32, u32)> {
                r[k].as_array()
                    .unwrap_or(&none)
                    .iter()
                    .filter_map(|m| {
                        let m = m.as_array()?;
                        Some((u(m.first()?) as u16, u(m.get(1)?) as u32, u(m.get(2)?) as u32))
                    })
                    .collect()
            };
            let vram = r["vram"]
                .as_array()
                .unwrap_or(&none)
                .iter()
                .filter_map(|m| {
                    let m = m.as_array()?;
                    Some((m.first()?.as_str()?.to_string(), u(m.get(1)?) as u32))
                })
                .collect();
            let body = r["body"].as_array().unwrap_or(&none).iter().map(|k| u(k) as usize).filter(|&k| k < prg_len).collect();
            let mut callers: Vec<usize> = r["callers"].as_array().unwrap_or(&none).iter().filter_map(|c| by_id.get(&u(c.as_array()?.first()?)).map(|x| x.0)).filter(|&k| k < prg_len).collect();
            callers.sort();
            callers.dedup();
            run.routines.push(Routine { offset: key, addr, entry, entered: u(&r["entered"]), frames: u(&r["frames"]) as u32, mem: triples("mem"), in_frame: triples("in_frame"), vram, oam_writes: u(&r["oam_writes"]) as u32, body, callers });
        }
        if !run.routines.is_empty() {
            run.watched = run.frames;
        }
        for d in v["dispatch"].as_array().unwrap_or(&none) {
            let key = d["key"].as_u64().unwrap_or(u64::MAX) as usize;
            if key >= prg_len {
                continue;
            }
            let targets = d["targets"]
                .as_array()
                .unwrap_or(&none)
                .iter()
                .filter_map(|t| {
                    let t = t.as_array()?;
                    let (k, a) = *by_id.get(&u(t.first()?))?;
                    (k < prg_len).then_some((k, a, u(t.get(1)?)))
                })
                .collect();
            run.dispatch.push(Dispatch { offset: key, addr: u(&d["addr"]) as u16, targets, switches: d["timeline"].as_array().map_or(0, |t| t.len() as u64) });
        }
        for l in v["loops"].as_array().unwrap_or(&none) {
            let (head, tail) = (l["head"].as_u64().unwrap_or(u64::MAX) as usize, l["tail"].as_u64().unwrap_or(u64::MAX) as usize);
            if head >= prg_len || tail >= prg_len {
                continue;
            }
            run.loops.push(Loop { head, tail, head_addr: u(&l["head_addr"]) as u16, kind: l["kind"].as_str().unwrap_or("").to_string(), iterations: u(&l["iterations"]), entries: u(&l["entries"]), on: l["on"].as_u64().map(|a| a as u16) });
        }
        for x in v["variables"].as_array().unwrap_or(&none) {
            let side = |k: &str| -> Vec<(usize, u16, u64)> {
                x[k].as_array()
                    .unwrap_or(&none)
                    .iter()
                    .filter_map(|t| {
                        let t = t.as_array()?;
                        let (k, a) = *by_id.get(&u(t.first()?))?;
                        Some((k, a, u(t.get(1)?)))
                    })
                    .collect()
            };
            run.vars.push(Var { addr: u(&x["addr"]) as u16, writers: side("writers"), readers: side("readers"), total: u(&x["total"]) });
        }
        for m in v["meets"].as_array().unwrap_or(&none) {
            let key = m["key"].as_u64().unwrap_or(u64::MAX) as usize;
            let Some(&(routine, _)) = by_id.get(&u(&m["routine"])) else { continue };
            if key >= prg_len || routine >= prg_len {
                continue;
            }
            let pairs = m["pairs"]
                .as_array()
                .unwrap_or(&none)
                .iter()
                .filter_map(|p| {
                    let p = p.as_array()?;
                    Some((u(p.first()?) as u16, u(p.get(1)?) as u16, u(p.get(2)?), p.get(3)?.as_str()?.to_string()))
                })
                .collect();
            run.meets.push(Meet { offset: key, routine, pairs });
        }
        Ok(run)
    }

    /// Another run folded in: counts add, routines the other run entered
    /// are kept once (the first seen) with their counts and memory added,
    /// dispatches and loops likewise, frames and instructions add.
    pub fn merge(&mut self, other: Run) {
        self.frames += other.frames;
        self.watched += other.watched;
        self.instructions += other.instructions;
        for (k, s) in other.sites {
            let e = self.sites.entry(k).or_insert(Site { addr: s.addr, ..Default::default() });
            e.count += s.count;
            for (into, from) in [(&mut e.reads, s.reads), (&mut e.writes, s.writes)] {
                for (a, n) in from {
                    match into.iter_mut().find(|t| t.0 == a) {
                        Some(t) => t.1 += n,
                        None => into.push((a, n)),
                    }
                }
            }
            e.span = match (e.span, s.span) {
                (Some((a, b)), Some((c, d))) => Some((a.min(c), b.max(d))),
                (x, y) => x.or(y),
            };
        }
        for r in other.routines {
            match self.routines.iter_mut().find(|x| x.offset == r.offset) {
                Some(x) => {
                    x.entered += r.entered;
                    x.frames += r.frames;
                    x.oam_writes += r.oam_writes;
                    for k in r.body {
                        if !x.body.contains(&k) {
                            x.body.push(k);
                        }
                    }
                    for k in r.callers {
                        if !x.callers.contains(&k) {
                            x.callers.push(k);
                        }
                    }
                    for (region, n) in r.vram {
                        match x.vram.iter_mut().find(|v| v.0 == region) {
                            Some(v) => v.1 += n,
                            None => x.vram.push((region, n)),
                        }
                    }
                    for (into, from) in [(&mut x.mem, r.mem), (&mut x.in_frame, r.in_frame)] {
                        for (a, p, q) in from {
                            match into.iter_mut().find(|m| m.0 == a) {
                                Some(m) => {
                                    m.1 += p;
                                    m.2 += q;
                                }
                                None => into.push((a, p, q)),
                            }
                        }
                    }
                }
                None => self.routines.push(r),
            }
        }
        for d in other.dispatch {
            match self.dispatch.iter_mut().find(|x| x.offset == d.offset) {
                Some(x) => {
                    x.switches += d.switches;
                    for (k, a, n) in d.targets {
                        match x.targets.iter_mut().find(|t| t.0 == k) {
                            Some(t) => t.2 += n,
                            None => x.targets.push((k, a, n)),
                        }
                    }
                }
                None => self.dispatch.push(d),
            }
        }
        for l in other.loops {
            match self.loops.iter_mut().find(|x| x.head == l.head && x.tail == l.tail && x.kind == l.kind) {
                Some(x) => {
                    x.iterations += l.iterations;
                    x.entries += l.entries;
                    x.on = x.on.or(l.on);
                }
                None => self.loops.push(l),
            }
        }
        for m in other.meets {
            match self.meets.iter_mut().find(|x| x.offset == m.offset) {
                Some(x) => {
                    for (a, b, n, axis) in m.pairs {
                        match x.pairs.iter_mut().find(|p| p.0 == a && p.1 == b) {
                            Some(p) => {
                                p.2 += n;
                                if p.3 != axis {
                                    p.3 = "xy".to_string();
                                }
                            }
                            None => x.pairs.push((a, b, n, axis)),
                        }
                    }
                }
                None => self.meets.push(m),
            }
        }
        let fold = |into: &mut Vec<(usize, u16, u64)>, from: Vec<(usize, u16, u64)>| {
            for (k, a, n) in from {
                match into.iter_mut().find(|t| t.0 == k) {
                    Some(t) => t.2 += n,
                    None => into.push((k, a, n)),
                }
            }
        };
        for v in other.vars {
            match self.vars.iter_mut().find(|x| x.addr == v.addr) {
                Some(x) => {
                    x.total += v.total;
                    fold(&mut x.writers, v.writers);
                    fold(&mut x.readers, v.readers);
                }
                None => self.vars.push(v),
            }
        }
    }

    /// The sites that fall in one bank, keyed by offset within it.
    pub fn in_bank(&self, offset: usize, len: usize) -> BTreeMap<usize, &Site> {
        self.sites.range(offset..offset + len).map(|(k, s)| (k - offset, s)).collect()
    }
}
