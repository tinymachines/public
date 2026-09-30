//! The matchers: one per pattern in the encyclopedia, each a rule over
//! what a run saw, each writing an `@is pattern ... by=match` mark with
//! the evidence it matched on. A matcher never reads the bytes for
//! meaning (a poll routine is one that read the pad port, not one that
//! looks like it should); it reads what the routine did. A pattern the
//! run gives no evidence for is not marked, so an `@is` is a
//! measurement, not a guess, and the rule is written next to it.

use std::collections::BTreeMap;

use flow::ops;

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
        out.push(Mark { offset, rest: format!("vram-drain writes={writes} frames={frames} by=match") });
    }
    out.sort_by(|a, b| a.offset.cmp(&b.offset).then(a.rest.cmp(&b.rest)));
    out
}
