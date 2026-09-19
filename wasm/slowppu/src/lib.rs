//! The slow chip for the page: the engineers' switch-level 2C02 in the
//! standard world, restored from the state build.rs recorded after the
//! reset and the register program, stepped a batch of half-steps at a
//! time; and their fast chip's frame of the same world, so the page can
//! hold one to the other dot by dot as the slow one draws.
//!
//! What a batch hands back, all read off the chip's own nodes:
//! - every dot it presented: the palette bus `pal_d0..5_out` sampled in
//!   the dot's second pclk1 half-step at the chip's own `hpos`/`vpos`
//!   counters, exactly v2c02-dots' `capture`;
//! - how many transistors changed state during each dot (the conduction
//!   bits before and after each half-step, compared);
//! - the levels of a few named nodes, for the page's lamps.
//!
//! The chip is the engineers' code, unchanged.

use halfphi::{BitSet, NodeId};
use v2c02_dots::{standard_program, vram, Taps};
use v2c02_sim::harness::Harness;
use v2c02_sim::Ppu;
use wasm_bindgen::prelude::*;

static WARM: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/warm.bin"));

/// The named nodes the page lights, in the order `lamps` returns them.
pub const LAMPS: &[&str] = &[
    "hpos0", "hpos1", "hpos2", "hpos3", "hpos4", "hpos5", "hpos6", "hpos7", "hpos8",
    "vpos0", "vpos1", "vpos2", "vpos3", "vpos4", "vpos5", "vpos6", "vpos7", "vpos8",
    "pal_d0_out", "pal_d1_out", "pal_d2_out", "pal_d3_out", "pal_d4_out", "pal_d5_out",
    "clk0", "pclk0", "pclk1", "ale", "rd",
];

fn take_bits(src: &mut &[u8], into: &mut BitSet) {
    let len = u32::from_le_bytes(src[..4].try_into().unwrap()) as usize;
    assert_eq!(len, into.len(), "the recorded state is for another netlist");
    *src = &src[4..];
    for i in 0..len {
        into.put(i, (src[i >> 3] >> (i & 7)) & 1 != 0);
    }
    *src = &src[len.div_ceil(8)..];
}

/// The chip restored to the recorded state: a chip powered on over the
/// same netlist, its electrical state replaced by the recording, and the
/// harness built over it as `standard_world` builds its own.
pub fn restored() -> Harness {
    let mut ppu = Ppu::power_on();
    let mut src = WARM;
    let half_steps = u64::from_le_bytes(src[..8].try_into().unwrap());
    src = &src[8..];
    let mut s = ppu.engine.state().clone();
    take_bits(&mut src, &mut s.value);
    take_bits(&mut src, &mut s.pullup);
    take_bits(&mut src, &mut s.pulldown);
    take_bits(&mut src, &mut s.trans_on);
    assert!(src.is_empty(), "the recorded state has bytes left over");
    ppu.engine.state_mut().copy_from(&s);
    let mut h = Harness::new(ppu, vram);
    h.half_steps = half_steps;
    h
}

/// One dot as the chip presented it.
pub struct Dot {
    pub vpos: u32,
    pub hpos: u32,
    pub colour: u32,
    pub switched: u32,
}

/// The stepping and sampling, shared by the page and the tests.
///
/// pclk1 rises twice in each dot's eight half-steps, so the sampling rule
/// (the second half-step of a pclk1 phase) fires twice per dot with the
/// same position and colour; v2c02-dots' capture writes both to one cell.
/// Here a dot is handed back once, at its first sample, and its switch
/// count covers every half-step since the previous dot.
pub struct Sampler {
    pub h: Harness,
    taps: Taps,
    seen_pclk1: bool,
    before: BitSet,
    switched: u32,
    last: Option<(u32, u32)>,
}

impl Sampler {
    pub fn new(h: Harness) -> Sampler {
        let taps = Taps::new(&h);
        let before = h.ppu.engine.state().trans_on.clone();
        Sampler { h, taps, seen_pclk1: false, before, switched: 0, last: None }
    }

    /// One half-step; the dot, when this half-step presents one.
    pub fn half_step(&mut self) -> Option<Dot> {
        self.h.half_step();
        let now = &self.h.ppu.engine.state().trans_on;
        for i in 0..now.len() {
            if now.get(i) != self.before.get(i) {
                self.switched += 1;
            }
        }
        self.before.copy_from(now);
        let p1 = self.h.ppu.engine.is_high(self.taps.pclk1);
        if p1 && self.seen_pclk1 {
            self.seen_pclk1 = false;
            let at = (self.taps.bus(&self.h, &self.taps.vpos), self.taps.bus(&self.h, &self.taps.hpos));
            if self.last == Some(at) {
                return None;
            }
            self.last = Some(at);
            let dot = Dot {
                vpos: at.0,
                hpos: at.1,
                colour: self.taps.bus(&self.h, &self.taps.pal_d),
                switched: self.switched,
            };
            self.switched = 0;
            Some(dot)
        } else {
            self.seen_pclk1 = p1;
            None
        }
    }
}

#[wasm_bindgen]
pub struct SlowChip {
    s: Sampler,
    lamps: Vec<NodeId>,
}

#[wasm_bindgen]
impl SlowChip {
    #[wasm_bindgen(constructor)]
    pub fn new() -> SlowChip {
        let h = restored();
        let nl = h.ppu.engine.netlist().clone();
        let lamps = LAMPS.iter().map(|n| nl.node(n).unwrap_or_else(|| panic!("node {n}"))).collect();
        SlowChip { s: Sampler::new(h), lamps }
    }

    /// The chip's size, from its netlist: [transistors, nodes].
    pub fn size(&self) -> Vec<u32> {
        let nl = self.s.h.ppu.engine.netlist();
        let nodes = (0..nl.node_count() as NodeId).filter(|&n| nl.exists(n)).count();
        vec![nl.transistor_count() as u32, nodes as u32]
    }

    /// Half-steps since power on, the reset included.
    pub fn half_steps(&self) -> f64 {
        self.s.h.half_steps as f64
    }

    /// Run `n` half-steps. Returns the dots presented, four numbers each:
    /// vpos, hpos, colour, and the transistors that changed state since
    /// the previous dot.
    pub fn run(&mut self, n: u32) -> Vec<u32> {
        let mut out = Vec::new();
        for _ in 0..n {
            if let Some(d) = self.s.half_step() {
                out.extend_from_slice(&[d.vpos, d.hpos, d.colour, d.switched]);
            }
        }
        out
    }

    /// Every node's level, one byte a node, for the die view.
    pub fn levels(&self) -> Vec<u8> {
        let e = &self.s.h.ppu.engine;
        let nl = e.netlist();
        (0..nl.node_count() as NodeId).map(|n| (nl.exists(n) && e.is_high(n)) as u8).collect()
    }

    /// The names the die data gives its nodes: "id name", one a line.
    pub fn node_names(&self) -> String {
        let nl = self.s.h.ppu.engine.netlist();
        let mut out = String::new();
        for (name, id) in nl.names() {
            out.push_str(&format!("{id} {name}\n"));
        }
        out
    }

    /// The named nodes' levels, in `lamp_names` order.
    pub fn lamps(&self) -> Vec<u8> {
        self.lamps.iter().map(|&n| self.s.h.ppu.engine.is_high(n) as u8).collect()
    }

    pub fn lamp_names() -> Vec<String> {
        LAMPS.iter().map(|s| s.to_string()).collect()
    }
}

impl Default for SlowChip {
    fn default() -> Self {
        Self::new()
    }
}

/// The fast chip's frame of the same world, built as the engineers' P3
/// gate builds it: the table measured out of the slow chip, the palette
/// as the slow chip holds it, the $2002 read, then the program.
/// Row-major, one colour per dot.
#[wasm_bindgen]
pub fn fast_frame() -> Vec<u8> {
    let mut f = v2c02_fast::Fast::with_table(v2c02_fast::table(), vram, v2c02_fast::palette_as_loaded());
    f.read(2);
    f.run_program(&standard_program());
    let frame = f.frame();
    let mut out = Vec::with_capacity(nes_bus::LINES * nes_bus::DOTS_PER_LINE);
    for r in 0..nes_bus::LINES {
        for d in 0..nes_bus::DOTS_PER_LINE {
            out.push(frame.at(r, d).0);
        }
    }
    out
}

/// [dots a line, lines, visible dots, visible rows], from the contract.
#[wasm_bindgen]
pub fn geometry() -> Vec<u32> {
    vec![
        nes_bus::DOTS_PER_LINE as u32,
        nes_bus::LINES as u32,
        nes_bus::ACTIVE_DOTS as u32,
        nes_bus::ACTIVE_ROWS as u32,
    ]
}
