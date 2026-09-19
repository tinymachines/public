//! Two things the page needs, recorded here at build time from the
//! sibling 2c02 checkout's fetched die data (NC-SA, so both live only in
//! the build output): the chip after its reset, and the die's own shapes.
//!
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

/// The die's shapes, from the same files the netlist is parsed from:
/// "DIE1", the polygon count, the die's width and height, then each
/// polygon as its node, its layer, its point count and its points. The
/// page rasterises it once and reads the chip's levels into it.
fn geometry(out: &std::path::Path) {
    let ext = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../2c02/extern/visual2c02");
    let read = |f: &str| std::fs::read_to_string(ext.join(f)).unwrap_or_else(|e| panic!("{}: {e}", ext.join(f).display()));
    let parsed = halfphi::source::parse(&halfphi::source::ChipSource {
        segdefs: &read("segdefs.js"),
        transdefs: &read("transdefs.js"),
        nodenames: &read("nodenames.js"),
        rails: halfphi::source::Rails { ground: "gnd", supply: "pwr" },
    })
    .expect("the die data parses");
    let (mut w, mut h) = (0u16, 0u16);
    for p in &parsed.polygons {
        for &(x, y) in &p.pts {
            w = w.max(x);
            h = h.max(y);
        }
    }
    let mut b = Vec::with_capacity(2 << 20);
    b.extend_from_slice(b"DIE1");
    b.extend_from_slice(&(parsed.polygons.len() as u32).to_le_bytes());
    b.extend_from_slice(&w.to_le_bytes());
    b.extend_from_slice(&h.to_le_bytes());
    for p in &parsed.polygons {
        b.extend_from_slice(&p.node.to_le_bytes());
        b.push(p.layer);
        b.extend_from_slice(&(p.pts.len() as u16).to_le_bytes());
        for &(x, y) in &p.pts {
            b.extend_from_slice(&x.to_le_bytes());
            b.extend_from_slice(&y.to_le_bytes());
        }
    }
    std::fs::write(out.join("geometry.bin"), b).unwrap();
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
    geometry(&dir);
}
