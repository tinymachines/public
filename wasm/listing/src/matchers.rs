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
    // The poll routine: eight reads of a pad port per entry (one per
    // button), and the strobe, when it is in the same routine.
    for r in &run.routines {
        if r.entered == 0 {
            continue;
        }
        for port in [0x4016u16, 0x4017] {
            let (rd, _) = touched(r, port);
            if rd > 0 && rd % r.entered == 0 && rd / r.entered >= 8 {
                let strobes = touched(r, 0x4016).1 / r.entered;
                out.push(Mark { offset: r.offset, rest: format!("pad-poll port=${port:04X} reads-per-entry={} strobes-per-entry={strobes} by=match", rd / r.entered) });
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
    // The idle spin: a loop of one instruction the run counted as idle,
    // and, when there is one, the NMI handler that ran the frames.
    let spins: Vec<&crate::run::Loop> = run.loops.iter().filter(|l| l.kind == "idle" && l.head == l.tail).collect();
    for l in &spins {
        out.push(Mark { offset: l.head, rest: format!("idle-spin iterations={} per-frame={} by=match", l.iterations, l.iterations / run.frames.max(1)) });
    }
    if let Some(spin) = spins.first() {
        for r in run.routines.iter().filter(|r| r.entry == "nmi" && r.frames as u64 * 2 >= run.frames) {
            out.push(Mark { offset: r.offset, rest: format!("game-loop-in-nmi frames={} of={} spin=${:04X} by=match", r.frames, run.frames, spin.head_addr) });
        }
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
        if r.frames as u64 * 2 >= run.frames {
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
