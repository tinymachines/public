//! The recording is only a shortcut if it changes nothing: a chip
//! restored from build.rs's state must present the same dots, and hold
//! the same electrical state, as a chip warmed up here from power on.

use slowppu::{restored, Sampler};

#[test]
fn the_restored_chip_draws_what_a_freshly_warmed_one_draws() {
    let mut fresh = Sampler::new(v2c02_dots::standard_world());
    let mut back = Sampler::new(restored());
    assert_eq!(fresh.h.half_steps, back.h.half_steps, "the recorded half-step count");
    assert!(fresh.h.ppu.engine.state() == back.h.ppu.engine.state(), "the state as restored");

    // Three scanlines and a bit: every dot, and the state at the end.
    let mut dots = 0;
    let mut coloured = 0;
    for _ in 0..(3 * 341 * 8 + 500) {
        let (a, b) = (fresh.half_step(), back.half_step());
        match (a, b) {
            (None, None) => {}
            (Some(a), Some(b)) => {
                assert_eq!((a.vpos, a.hpos, a.colour, a.switched), (b.vpos, b.hpos, b.colour, b.switched));
                dots += 1;
                if a.colour != 0 {
                    coloured += 1;
                }
            }
            _ => panic!("one chip presented a dot and the other did not"),
        }
    }
    assert!(fresh.h.ppu.engine.state() == back.h.ppu.engine.state(), "the state after the run");
    // A comparison of nothing proves nothing: dots were presented, and
    // not all of them the zero colour.
    assert!(dots > 1000, "only {dots} dots presented");
    assert!(coloured > 0, "every dot presented colour 0");
    eprintln!("{dots} dots agree, {coloured} of them not colour 0");
}
