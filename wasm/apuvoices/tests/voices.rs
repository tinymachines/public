//! The wrapper adds nothing to the sound unit but writes, averaging and
//! a mute at the DAC, so these hold exactly those three:
//! - a square set to a period is heard at that period: rendered one
//!   half-cycle per sample, its code repeats every 32 x (period + 1)
//!   half-cycles (16 CPU cycles a step, the chip's divider);
//! - muting the only voice playing leaves exactly the sound of it never
//!   having played (the triangle rests at a non-zero step, so "silent"
//!   is a steady level, not zero);
//! - the voices that were never enabled do not move.

use apuvoices::Voices;

fn square(v: &mut Voices, period: u16) {
    v.write(0x15, 0x01); // enable square 1
    v.write(0x00, 0xbf); // duty 50%, constant volume 15
    v.write(0x01, 0x00); // no sweep
    v.write(0x02, (period & 0xff) as u8);
    v.write(0x03, (period >> 8) as u8 & 7);
}

fn rises(code: &[f32]) -> Vec<usize> {
    (1..code.len()).filter(|&i| code[i - 1] < 1.0 && code[i] >= 1.0).collect()
}

#[test]
fn a_square_repeats_at_its_period() {
    for period in [0x0fe_u16, 0x1ab, 0x07f] {
        let mut v = Voices::new();
        square(&mut v, period);
        let n = 32 * (period as u32 + 1) * 12;
        let _ = v.render(n, 1.0, 0);
        let codes = v.codes();
        let sq0 = &codes[..n as usize];
        let r = rises(sq0);
        assert!(r.len() >= 6, "period {period:#x}: only {} rises", r.len());
        let gaps: Vec<usize> = r.windows(2).skip(2).map(|w| w[1] - w[0]).collect();
        let want = 32 * (period as usize + 1);
        assert!(gaps.iter().all(|&g| g == want), "period {period:#x}: gaps {gaps:?}, want {want}");
        // The second square and the noise never played; the triangle
        // holds its resting step.
        let voice = |k: usize| &codes[k * n as usize..(k + 1) * n as usize];
        assert!(voice(1).iter().all(|&c| c == 0.0));
        assert!(voice(3).iter().all(|&c| c == 0.0));
        assert!(voice(2).iter().all(|&c| c == voice(2)[0]));
    }
}

/// The chip's own rule, which the page had to learn from a silent
/// square: while a voice's enable bit is clear its length counter is
/// held at zero, and a voice whose length counter is zero is silent. So
/// a note loaded after the page has said "nothing is playing" and before
/// the voice is enabled again is wiped, and the same writes with the
/// enable first sound. The page writes the enable register first for
/// this reason (SoundVoices.tsx).
#[test]
fn enabling_a_voice_after_its_note_wipes_the_note() {
    let spread = |s: &[f32]| s.iter().cloned().fold(f32::MIN, f32::max) - s.iter().cloned().fold(f32::MAX, f32::min);

    let mut late = Voices::new();
    late.write(0x15, 0x00); // nothing playing yet, as the page says on opening
    late.write(0x00, 0xbf);
    late.write(0x01, 0x08);
    late.write(0x02, 0xfe);
    late.write(0x03, 0x00);
    late.write(0x15, 0x01); // enabled last: the length counter was just zeroed
    let quiet = late.render(4000, 37.0, 0);

    let mut early = Voices::new();
    early.write(0x15, 0x00);
    early.write(0x15, 0x01); // enabled first
    early.write(0x00, 0xbf);
    early.write(0x01, 0x08);
    early.write(0x02, 0xfe);
    early.write(0x03, 0x00);
    let loud = early.render(4000, 37.0, 0);

    assert!(spread(&quiet) < 0.001, "the note sounded although the voice was enabled after it");
    assert!(spread(&loud) > 0.05, "the note did not sound with the voice enabled first");
}

#[test]
fn muting_the_only_voice_silences_the_sound() {
    let mut a = Voices::new();
    let mut b = Voices::new();
    let mut never = Voices::new();
    square(&mut a, 0x0fe);
    square(&mut b, 0x0fe);
    let loud = a.render(4000, 37.0, 0);
    let muted = b.render(4000, 37.0, 0b00001);
    let rest = never.render(4000, 37.0, 0);
    let spread = |s: &[f32]| s.iter().cloned().fold(f32::MIN, f32::max) - s.iter().cloned().fold(f32::MAX, f32::min);
    assert!(spread(&loud) > 0.05, "the square was never heard");
    assert_eq!(muted, rest, "muted, the square still changed the sound");
    // Muting is at the DAC only: the codes still run.
    assert_eq!(a.codes(), b.codes());
}

