//! The matchers: one per pattern in the encyclopedia, each a rule over
//! what a run saw, each writing an `@is pattern ... by=match` mark with
//! the evidence it matched on. A matcher never reads the bytes for
//! meaning (a poll routine is one that read the pad port, not one that
//! looks like it should); it reads what the routine did. A pattern the
//! run gives no evidence for is not marked, so an `@is` is a
//! measurement, not a guess, and the rule is written next to it.

use std::collections::BTreeMap;

use flow::ops;
use flow::ops::Mode;

use crate::run::{Routine, Run};

/// A mark for the instruction at a PRG offset (a routine's entry, or a
/// loop's head), as the `rest` of an `@is` directive.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Mark {
    pub offset: usize,
    pub rest: String,
}

fn touched(r: &Routine, port: u16) -> (u64, u64) {
    r.mem.iter().find(|m| m.0 == port).map_or((0, 0), |m| (m.1 as u64, m.2 as u64))
}

/// Accesses of an address while the picture was drawing, and in the blank.
fn beam(r: &Routine, is: impl Fn(u16) -> bool) -> (u64, u64) {
    r.in_frame.iter().filter(|m| is(m.0)).fold((0, 0), |acc, m| (acc.0 + m.1 as u64, acc.1 + m.2 as u64))
}

/// Of the routines that wrote somewhere, the one that did it most among
/// those that ran in at least half as many frames as the busiest of
/// them: the driver, not one of its parts nor a one-time setup.
fn most(run: &Run, is: impl Fn(u16) -> bool) -> Option<(usize, u64, u32)> {
    let writers: Vec<(usize, u64, u32)> = run
        .routines
        .iter()
        .map(|r| (r.offset, r.mem.iter().filter(|m| is(m.0)).map(|m| m.2 as u64).sum::<u64>(), r.frames))
        .filter(|w| w.1 > 0)
        .collect();
    let busiest = writers.iter().map(|w| w.2).max()?;
    writers.into_iter().filter(|w| w.2 * 2 >= busiest).max_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(&a.0)))
}

pub fn find(run: &Run, prg: &[u8]) -> Vec<Mark> {
    let mut out = Vec::new();
    // The poll routine: eight reads of a pad port (one per button) for
    // every frame it ran, and the strobe, when it is in the same
    // routine. Per frame, not per entry: one game's poll is entered
    // twice a frame and reads four times each, another's polls thrice
    // over to outvote the DMC's glitch.
    for r in &run.routines {
        if r.frames == 0 {
            continue;
        }
        let frames = r.frames as u64;
        for port in [0x4016u16, 0x4017] {
            let (rd, _) = touched(r, port);
            if rd >= 8 * frames {
                let strobes = touched(r, 0x4016).1 / frames;
                out.push(Mark { offset: r.offset, rest: format!("pad-poll port=${port:04X} reads-per-frame={} strobes-per-frame={strobes} by=match", rd / frames) });
            }
        }
    }
    // The jump engine: the routine the run's dispatching JSRs call. The
    // report keys a dispatch at the JSR whose table follows it; the
    // engine is the JSR's target, the nearest routine of that address.
    let mut engines: BTreeMap<usize, (u64, u64)> = BTreeMap::new();
    for d in &run.dispatch {
        if prg.get(d.offset) != Some(&ops::JSR) || d.offset + 2 >= prg.len() {
            continue;
        }
        let target = u16::from_le_bytes([prg[d.offset + 1], prg[d.offset + 2]]);
        let Some(r) = run.routines.iter().filter(|r| r.addr == target).min_by_key(|r| r.offset.abs_diff(d.offset)) else { continue };
        let e = engines.entry(r.offset).or_insert((0, 0));
        e.0 += 1;
        e.1 += d.targets.iter().map(|t| t.2).sum::<u64>();
    }
    for (offset, (tables, dispatches)) in engines {
        out.push(Mark { offset, rest: format!("jump-engine tables={tables} dispatches={dispatches} by=match") });
    }
    // The idle spin: a loop of one instruction the run counted as idle.
    // The counting spin: an endless loop of several, a straight line
    // closed by a JMP to its head, that wrote one byte of RAM and read
    // nothing but RAM (one game stirs a second byte into the first).
    // Neither can leave but by an interrupt, so when there is one, the
    // NMI handler that ran the frames is the game.
    let spins: Vec<&crate::run::Loop> = run.loops.iter().filter(|l| l.kind == "idle" && l.head == l.tail).collect();
    for l in &spins {
        out.push(Mark { offset: l.head, rest: format!("idle-spin iterations={} per-frame={} by=match", l.iterations, l.iterations / run.watched.max(1)) });
    }
    let mut spin_at = spins.first().map(|l| l.head_addr);
    for l in run.loops.iter().filter(|l| l.head < l.tail && l.iterations > 0) {
        let closes = prg.get(l.tail) == Some(&ops::JMP_ABS) && prg.get(l.tail + 2).is_some_and(|&hi| u16::from_le_bytes([prg[l.tail + 1], hi]) == l.head_addr);
        let body: Vec<(&usize, &crate::run::Site)> = run.sites.range(l.head..=l.tail).collect();
        let straight = body.iter().all(|(&k, _)| {
            let op = prg[k];
            k == l.tail || !(ops::is_branch(op) || matches!(op, ops::JSR | ops::JMP_ABS | ops::JMP_IND | ops::RTS | ops::RTI | ops::BRK))
        });
        let mut cells: Vec<u16> = body.iter().flat_map(|(_, s)| s.writes.iter().map(|x| x.0)).collect();
        cells.sort();
        cells.dedup();
        let in_ram = body.iter().all(|(_, s)| s.span.is_none_or(|(_, hi)| hi < 0x0800));
        if !(closes && straight && in_ram && cells.len() == 1) {
            continue;
        }
        let byte = cells[0];
        let elsewhere: u64 = run.routines.iter().filter(|r| !r.body.contains(&l.head)).map(|r| touched(r, byte).0).sum();
        out.push(Mark { offset: l.head, rest: format!("counting-spin byte=${byte:04X} iterations={} per-frame={} read-elsewhere={elsewhere} by=match", l.iterations, l.iterations / run.watched.max(1)) });
        spin_at.get_or_insert(l.head_addr);
    }
    if let Some(spin) = spin_at {
        for r in run.routines.iter().filter(|r| r.entry == "nmi" && r.frames as u64 * 2 >= run.watched) {
            out.push(Mark { offset: r.offset, rest: format!("game-loop-in-nmi frames={} of={} spin=${spin:04X} by=match", r.frames, run.watched) });
        }
    }
    // The frame wait: a loop the run went round that only loads, tests
    // and branches, on bytes of RAM at fixed addresses. Nothing in such
    // a loop can change what it tests, so only an interrupt lets it out;
    // it is marked when the NMI handler, or a routine the handler
    // reached by calls, wrote the byte it read most. A JMP may only be
    // the loop's last instruction, going back to its head: one anywhere
    // else takes the circuit out of the range that was looked at. A JSR
    // may sit in it when neither the routine it calls nor anything that
    // one reached wrote the byte (a wait that does a chore each turn).
    let below = |roots: Vec<usize>| -> Vec<usize> {
        let mut set = roots;
        loop {
            let more: Vec<usize> = run.routines.iter().filter(|r| !set.contains(&r.offset) && r.callers.iter().any(|c| set.contains(c))).map(|r| r.offset).collect();
            if more.is_empty() {
                return set;
            }
            set.extend(more);
        }
    };
    let under = below(run.routines.iter().filter(|r| r.entry == "nmi").map(|r| r.offset).collect());
    let wrote = |set: &[usize], cell: u16| -> u64 { run.routines.iter().filter(|r| set.contains(&r.offset)).map(|r| touched(r, cell).1).sum() };
    for l in run.loops.iter().filter(|l| l.head < l.tail && l.iterations > 0) {
        let body: Vec<(&usize, &crate::run::Site)> = run.sites.range(l.head..=l.tail).collect();
        let mut read: BTreeMap<u16, u64> = BTreeMap::new();
        for (_, site) in &body {
            for &(a, n) in &site.reads {
                *read.entry(a).or_insert(0) += n;
            }
        }
        let Some(flag) = read.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0))).map(|(&a, _)| a).filter(|&a| a < 0x0800) else { continue };
        let mut calls = 0u64;
        let still = body.iter().all(|&(&k, site)| {
            let op = prg.get(k).copied().unwrap_or(0);
            if op == ops::JSR && k + 2 < prg.len() {
                // The routine called, the nearest of that address, and all it reached.
                let target = u16::from_le_bytes([prg[k + 1], prg[k + 2]]);
                let Some(callee) = run.routines.iter().filter(|r| r.addr == target).min_by_key(|r| r.offset.abs_diff(k)) else { return false };
                calls += 1;
                return wrote(&below(vec![callee.offset]), flag) == 0;
            }
            let tests = matches!(ops::name(op), "LDA" | "LDX" | "LDY" | "CMP" | "CPX" | "CPY" | "BIT" | "AND" | "ORA" | "NOP") || ops::is_branch(op) || (op == ops::JMP_ABS && k == l.tail);
            tests && site.writes.is_empty() && site.span.is_none_or(|(lo, hi)| lo == hi && lo < 0x0800)
        });
        if !still {
            continue;
        }
        let set = wrote(&under, flag);
        if set > 0 {
            let chores = if calls > 0 { format!(" calls={calls}") } else { String::new() };
            out.push(Mark { offset: l.head, rest: format!("frame-wait flag=${flag:04X} entries={} iterations={}{chores} set-in-nmi={set} of={} by=match", l.entries, l.iterations, run.watched) });
        }
    }
    // Where two objects are compared: a compare or a subtract whose two
    // sides were made from different bytes of RAM that each reached a
    // sprite's position and never the same sprite byte together (the
    // flow follows the values through the temporaries). By the routine
    // the instruction ran in.
    let mut compared: BTreeMap<usize, (u64, BTreeMap<(u16, u16), (u64, bool, bool)>)> = BTreeMap::new();
    for m in &run.meets {
        let e = compared.entry(m.routine).or_default();
        e.0 += 1;
        for (a, b, n, axis) in &m.pairs {
            let p = e.1.entry((*a, *b)).or_insert((0, false, false));
            p.0 += n;
            p.1 |= axis.contains('x');
            p.2 |= axis.contains('y');
        }
    }
    for (routine, (sites, pairs)) in compared {
        let cells = |pick: fn(&(u64, bool, bool)) -> bool| -> Vec<u16> {
            let mut v: Vec<u16> = pairs.iter().filter(|(_, p)| pick(p)).flat_map(|(&(a, b), _)| [a, b]).collect();
            v.sort();
            v.dedup();
            v
        };
        let (xs, ys) = (cells(|p| p.1), cells(|p| p.2));
        let list = |name: &str, v: &[u16]| if v.is_empty() { String::new() } else { format!(" {name}={}", v.iter().take(12).map(|a| format!("${a:04X}")).collect::<Vec<_>>().join(",")) };
        let mut all = xs.clone();
        all.extend(&ys);
        all.sort();
        all.dedup();
        out.push(Mark {
            offset: routine,
            rest: format!("position-compare sites={sites} pairs={} cells={} meets={}{}{} by=match", pairs.len(), all.len(), pairs.values().map(|p| p.0).sum::<u64>(), list("x", &xs), list("y", &ys)),
        });
    }
    // The sound driver and the VRAM drain: the routine that wrote the
    // APU's registers, or $2007, the most among those that ran the frames.
    if let Some((offset, writes, frames)) = most(run, |a| (0x4000..=0x4013).contains(&a) || a == 0x4015 || a == 0x4017) {
        out.push(Mark { offset, rest: format!("sound-driver writes={writes} frames={frames} by=match") });
    }
    if let Some((offset, writes, frames)) = most(run, |a| a == 0x2007) {
        let r = run.routines.iter().find(|r| r.offset == offset).unwrap();
        let (picture, blank) = beam(r, |a| a == 0x2007);
        let when = if r.in_frame.is_empty() { String::new() } else { format!(" in-blank={blank} in-picture={picture}") };
        out.push(Mark { offset, rest: format!("vram-drain writes={writes}{when} frames={frames} by=match") });
    }
    // The split: a routine that spun on the PPU's status while the
    // picture was drawing (sprite 0's hit: eight reads a frame at the
    // least, a wait is many) and then moved the scroll there, at least
    // every other frame it ran. $2006 is not the scroll here: a screen
    // drawn with rendering off sets the address in the picture too. And
    // the bank switch: any routine that wrote into the ROM's window.
    for r in &run.routines {
        let (scroll, _) = beam(r, |a| a == 0x2005);
        let (status, _) = beam(r, |a| a == 0x2002);
        if scroll > 0 && scroll * 2 >= r.frames as u64 && status >= 8 * r.frames as u64 {
            out.push(Mark { offset: r.offset, rest: format!("sprite-0-split scroll-writes-in-picture={scroll} status-reads-in-picture={status} frames={} by=match", r.frames) });
        }
        let (picture, blank) = beam(r, |a| a == 0x8000);
        if picture + blank > 0 {
            out.push(Mark { offset: r.offset, rest: format!("bank-switch writes={} in-picture={picture} in-blank={blank} by=match", picture + blank) });
        }
        // Who paints: a routine that wrote $2007 while the PPU's address
        // was in the palette, and one that wrote into the page the
        // sprite DMA takes.
        if let Some((_, n)) = r.vram.iter().find(|v| v.0 == "palette") {
            out.push(Mark { offset: r.offset, rest: format!("palette-writer writes={n} frames={} by=match", r.frames) });
        }
        if r.oam_writes > 0 {
            out.push(Mark { offset: r.offset, rest: format!("sprite-writer oam-writes={} frames={} by=match", r.oam_writes, r.frames) });
        }
        // The random byte: RAM a routine that ran the frames rewrites
        // from itself with a shift or a rotate (a read-modify-write on
        // the byte) and an EOR somewhere in the same routine.
        if r.frames as u64 * 2 >= run.watched {
            let mut bytes: Vec<u16> = Vec::new();
            let (mut shifts, mut eors) = (0u64, 0u64);
            for &k in &r.body {
                let (Some(&op), Some(site)) = (prg.get(k), run.sites.get(&k)) else { continue };
                if ops::name(op) == "EOR" {
                    eors += 1;
                }
                if matches!(ops::name(op), "ASL" | "LSR" | "ROL" | "ROR") && ops::mode(op) != Mode::Acc {
                    for &(a, _) in &site.writes {
                        if a < 0x0800 && site.reads.iter().any(|x| x.0 == a) {
                            shifts += 1;
                            if !bytes.contains(&a) {
                                bytes.push(a);
                            }
                        }
                    }
                }
            }
            if !bytes.is_empty() && eors > 0 {
                bytes.sort();
                let list: Vec<String> = bytes.iter().map(|a| format!("${a:04X}")).collect();
                out.push(Mark { offset: r.offset, rest: format!("random-byte bytes={} shifts={shifts} eors={eors} frames={} by=match", list.join(","), r.frames) });
            }
            // The scroll: $2005 written in the blank, every frame it ran.
            let (_, blank) = beam(r, |a| a == 0x2005);
            if blank >= r.frames as u64 && r.frames > 0 {
                out.push(Mark { offset: r.offset, rest: format!("scroll-writer writes-in-blank={blank} frames={} by=match", r.frames) });
            }
        }
    }
    out.sort_by(|a, b| a.offset.cmp(&b.offset).then(a.rest.cmp(&b.rest)));
    out
}

/// The position bytes the run saw compared (the cells of its meets),
/// by the coordinate they reached, and for each array how many of each
/// it holds. A byte inside several arrays counts for the tightest one
/// (the fewest slots; the lower base on a tie): a loop that clears a
/// whole page reaches everything and holds nothing.
pub fn held(run: &Run, arrays: &[(u16, usize, usize)]) -> Vec<(u32, u32)> {
    let mut cells: BTreeMap<u16, (bool, bool)> = BTreeMap::new();
    for m in &run.meets {
        for (a, b, _, axis) in &m.pairs {
            for c in [a, b] {
                let e = cells.entry(*c).or_insert((false, false));
                e.0 |= axis.contains('x');
                e.1 |= axis.contains('y');
            }
        }
    }
    let mut out = vec![(0u32, 0u32); arrays.len()];
    for (&cell, &(x, y)) in &cells {
        let tightest = arrays.iter().enumerate().filter(|(_, a)| a.0 <= cell && (cell as usize) < a.0 as usize + a.1).min_by_key(|(_, a)| (a.1, a.0));
        if let Some((i, _)) = tightest {
            out[i].0 += x as u32;
            out[i].1 += y as u32;
        }
    }
    out
}

/// The arrays: RAM an indexed instruction reached across more than one
/// byte, by base address: how many slots the run saw reached from the
/// base, and how many instructions index it.
pub fn arrays(run: &Run, prg: &[u8]) -> Vec<(u16, usize, usize)> {
    let mut by_base: BTreeMap<u16, (usize, usize)> = BTreeMap::new();
    for (&k, site) in &run.sites {
        let (Some(&op), Some((lo, hi))) = (prg.get(k), site.span) else { continue };
        let base = match ops::mode(op) {
            Mode::Zpx | Mode::Zpy => prg.get(k + 1).copied().map(u16::from),
            Mode::Abx | Mode::Aby => prg.get(k + 2).map(|&b2| u16::from_le_bytes([prg[k + 1], b2])),
            _ => None,
        };
        let Some(base) = base else { continue };
        if base >= 0x0800 || lo < base || hi <= base {
            continue;
        }
        let e = by_base.entry(base).or_insert((0, 0));
        e.0 = e.0.max((hi - base) as usize + 1);
        e.1 += 1;
    }
    by_base.into_iter().map(|(b, (slots, sites))| (b, slots, sites)).collect()
}
