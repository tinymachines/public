//! The 2A03's five voices for the page: the engineers' fast sound unit,
//! unchanged, driven by register writes from the page (the way a program
//! writes $4000..$4017), stepped one CPU half-cycle at a time, and heard
//! through their two DACs.
//!
//! A render hands back two things for the same stretch of time:
//! - the sound: each output sample the mean, over the half-cycles it
//!   spans, of the two pins as the board's summing node weights them
//!   (`ad1 + ad2`), with a muted voice's code held at zero before the
//!   DAC, so muting one voice changes the others exactly as the
//!   non-linear mixer says it would;
//! - each voice's output code, averaged over the same half-cycles, for
//!   the page to draw and to measure the pitch from.
//!
//! The DACs are authored from the nesdev wiki (v2a03-dac says so in its
//! own words); the codes are the fast unit's, held to the switch-level
//! chip by the engineers' gates. The half-cycles per sample come from the
//! page, which derives them from the console's own count.

use std::collections::VecDeque;

use v2a03_micro::apu::Apu;
use wasm_bindgen::prelude::*;

/// The DMC reads its samples from here: the engineers' own made-up
/// sample, the bytes their apu-codes example puts at $C000.
const SAMPLE_AT: usize = 0xc000;

#[wasm_bindgen]
pub struct Voices {
    apu: Apu,
    mem: Vec<u8>,
    writes: VecDeque<(u8, u8)>,
    /// Half-cycles owed to the next sample (the fractional part).
    carry: f64,
    codes: Vec<f32>,
}

impl Default for Voices {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl Voices {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Voices {
        let mut mem = vec![0u8; 0x10000];
        for i in 0..33u8 {
            mem[SAMPLE_AT + i as usize] = i.wrapping_mul(0x5b) ^ 0xa5;
        }
        Voices { apu: Apu::new(), mem, writes: VecDeque::new(), carry: 0.0, codes: Vec::new() }
    }

    /// A write to $4000 + reg, queued: one is presented per half-cycle.
    pub fn write(&mut self, reg: u8, value: u8) {
        self.writes.push_back((reg & 0x1f, value));
    }

    /// Render `n` samples of `per_sample` half-cycles each, with the
    /// voices whose bit is set in `mute` (bit 0 the first square) held
    /// silent at the DAC. Returns the sound; `codes` then holds the five
    /// voices' averaged codes for the same samples, voice by voice.
    pub fn render(&mut self, n: u32, per_sample: f64, mute: u8) -> Vec<f32> {
        let n = n as usize;
        let mut out = Vec::with_capacity(n);
        self.codes = vec![0.0; 5 * n];
        let mem = &self.mem;
        for s in 0..n {
            let want = per_sample + self.carry;
            let steps = want.floor() as u32;
            self.carry = want - steps as f64;
            let mut level = 0.0f64;
            let mut sums = [0u32; 5];
            for _ in 0..steps.max(1) {
                if let Some((reg, v)) = self.writes.pop_front() {
                    self.apu.write(reg, v);
                }
                self.apu.half_step(&mut |a| mem[a as usize]);
                let mut c = self.apu.codes();
                for (k, code) in c.iter().enumerate() {
                    sums[k] += *code as u32;
                }
                for (k, code) in c.iter_mut().enumerate() {
                    if mute & (1 << k) != 0 {
                        *code = 0;
                    }
                }
                level += (v2a03_dac::ad1(c[0], c[1]) + v2a03_dac::ad2(c[2], c[3], c[4])) as f64;
            }
            let m = steps.max(1) as f64;
            out.push((level / m) as f32);
            for k in 0..5 {
                self.codes[k * n + s] = (sums[k] as f64 / m) as f32;
            }
        }
        out
    }

    /// The five voices' averaged codes from the last render, voice by
    /// voice: square 1, square 2, triangle, noise, samples.
    pub fn codes(&self) -> Vec<f32> {
        self.codes.clone()
    }

    /// The status register's view: which voices are still playing.
    pub fn status(&self) -> u8 {
        self.apu.status()
    }
}
