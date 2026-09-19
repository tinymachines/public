//! The chip after its reset, recorded: the standard world's warm-up and
//! register program run here, natively, and the electrical state (every
//! node's level and pulls, every transistor's conduction) and the
//! harness's half-step count are written to OUT_DIR/warm.bin. The page
//! then starts where the drawing starts instead of spending most of a
//! minute on the reset gate. The state is derived from NC-SA die data
//! and lives only in the build output. tests/warm.rs holds the restored
//! chip to a freshly warmed one, dot for dot.

use std::path::PathBuf;

use halfphi::BitSet;

fn put_bits(out: &mut Vec<u8>, b: &BitSet) {
    out.extend_from_slice(&(b.len() as u32).to_le_bytes());
    let mut byte = 0u8;
    for i in 0..b.len() {
        if b.get(i) {
            byte |= 1 << (i & 7);
        }
        if i & 7 == 7 {
            out.push(byte);
            byte = 0;
        }
    }
    if b.len() & 7 != 0 {
        out.push(byte);
    }
}

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    let h = v2c02_dots::standard_world();
    let s = h.ppu.engine.state();
    let mut out = Vec::new();
    out.extend_from_slice(&h.half_steps.to_le_bytes());
    for b in [&s.value, &s.pullup, &s.pulldown, &s.trans_on] {
        put_bits(&mut out, b);
    }
    let dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    std::fs::write(dir.join("warm.bin"), out).unwrap();
}
