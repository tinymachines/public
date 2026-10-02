//! The flow tools on a trace written by hand, so every rule has a case
//! whose answer is known: a main loop idling on itself, an NMI handler
//! that polls the pad into RAM, a jump engine that pulls its return
//! address and dispatches through a table, a wait on $2002, a mode that
//! changes at a known frame, and a routine that runs only while A is held.
//!
//! The records are the console's (`nes-console/src/record.rs`); the
//! cycles here are fewer than the part's (one per access), which the
//! tools do not depend on.

use serde_json::Value;

struct T {
    out: Vec<u8>,
    s: u8,
}

impl T {
    fn cycle(&mut self, ab: u16, db: u8, read: bool, sync: bool) {
        let prg: u32 = if read && ab >= 0x8000 { (ab as u32 - 0x8000) + 1 } else { 0 };
        let flags = (read as u8) | ((sync as u8) << 1);
        let [a0, a1] = ab.to_le_bytes();
        let [p0, p1, p2, p3] = prg.to_le_bytes();
        self.out.extend_from_slice(&[a0, a1, db, flags, p0, p1, p2, p3]);
    }

    /// One instruction: the opcode fetch, the registers, the operand
    /// fetches, then its accesses (address, data, read).
    fn ins(&mut self, at: u16, bytes: &[u8], acc: &[(u16, u8, bool)]) {
        self.ins_at_line(at, bytes, acc, 20);
    }

    /// The same, with the beam at a given line when the opcode was fetched.
    fn ins_at_line(&mut self, at: u16, bytes: &[u8], acc: &[(u16, u8, bool)], line: u16) {
        self.cycle(at, bytes[0], true, true);
        let [l0, l1] = line.to_le_bytes();
        self.out.extend_from_slice(&[0, 0, 0, 0x40, self.s, 0x24, l0, l1]);
        for (i, &b) in bytes.iter().enumerate().skip(1) {
            self.cycle(at + i as u16, b, true, false);
        }
        for &(a, d, r) in acc {
            self.cycle(a, d, r, false);
        }
    }

    /// A cycle with the CPU held (the sprite DMA): flag 16.
    fn held(&mut self, ab: u16, db: u8, read: bool) {
        let [a0, a1] = ab.to_le_bytes();
        self.out.extend_from_slice(&[a0, a1, db, (read as u8) | 16, 0, 0, 0, 0]);
    }

    fn jsr(&mut self, at: u16, to: u16) {
        let s = self.s as u16;
        self.ins(at, &[0x20, to as u8, (to >> 8) as u8], &[(0x100 | s, 0, false), (0x100 | (s - 1), 0, false)]);
        self.s -= 2;
    }

    fn rts(&mut self, at: u16) {
        let s = self.s as u16;
        self.ins(at, &[0x60], &[(0x100 | (s + 1), 0, true), (0x100 | (s + 2), 0, true)]);
        self.s += 2;
    }

    fn pha(&mut self, at: u16, v: u8) {
        let s = self.s as u16;
        self.ins(at, &[0x48], &[(0x100 | s, v, false)]);
        self.s -= 1;
    }

    fn pla(&mut self, at: u16) {
        let s = self.s as u16;
        self.ins(at, &[0x68], &[(0x100 | (s + 1), 0, true)]);
        self.s += 1;
    }

    /// The NMI taken where the next instruction would have been fetched.
    fn nmi(&mut self, at: u16, op: u8) {
        let s = self.s as u16;
        self.cycle(at, op, true, true);
        self.out.extend_from_slice(&[0, 0, 0, 0x40, self.s, 0x24, 241, 0]);
        for i in 0..3 {
            self.cycle(0x100 | (s - i), 0, false, false);
        }
        self.cycle(0xfffa, 0x00, true, false);
        self.cycle(0xfffb, 0x81, true, false);
        self.s -= 3;
    }

    fn rti(&mut self, at: u16) {
        self.ins(at, &[0x40], &[]);
        self.s += 3;
    }

    fn frame(&mut self, i: u32) {
        let [f0, f1, f2, f3] = i.to_le_bytes();
        self.out.extend_from_slice(&[0, 0, 0, 0xc0, f0, f1, f2, f3]);
    }

    fn pad(&mut self, v: u8) {
        self.out.extend_from_slice(&[v, 0, 0, 0x80, 0, 0, 0, 0]);
    }
}

const FRAMES: u32 = 60;
const MODE_SWITCH: u32 = 30;

fn trace() -> Vec<u8> {
    let mut t = T { out: Vec::new(), s: 0xfd };
    // Reset: a JMP to itself at $8010.
    t.ins(0x8000, &[0x78], &[]);
    let mut pad = 0u8;
    for f in 0..FRAMES {
        let want = if (40..50).contains(&f) { 1 } else { 0 };
        if want != pad {
            pad = want;
            t.pad(pad);
        }
        for _ in 0..5 {
            t.ins(0x8010, &[0x4c, 0x10, 0x80], &[]);
        }
        t.nmi(0x8010, 0x4c);
        // The handler at $8100: the pad, the mode, the variable.
        t.jsr(0x8100, 0x8200);
        t.ins(0x8200, &[0xad, 0x16, 0x40], &[(0x4016, 0x41 | pad, true)]);
        t.ins(0x8203, &[0x85, 0x10], &[(0x0010, pad, false)]);
        t.rts(0x8205);
        // The mode at $30 goes to A with a scratch byte at $31 (written
        // just before, so it carries nothing), doubled, and the engine
        // is called.
        t.jsr(0x8103, 0x8175);
        t.ins(0x8175, &[0xa9, 0x00], &[]);
        t.ins(0x8177, &[0x85, 0x31], &[(0x0031, 0, false)]);
        t.ins(0x8179, &[0xa5, 0x30], &[(0x0030, 0, true)]);
        t.ins(0x817b, &[0x05, 0x31], &[(0x0031, 0, true)]);
        t.ins(0x817d, &[0x0a], &[]);
        t.ins(0x817e, &[0xea], &[]);
        t.ins(0x817f, &[0xea], &[]);
        t.jsr(0x8180, 0x8300);
        // The engine: pull the return address, jump through the table.
        t.pla(0x8300);
        t.pla(0x8301);
        let to: u16 = if f < MODE_SWITCH { 0x8400 } else { 0x8500 };
        t.ins(0x8302, &[0x6c, 0x20, 0x00], &[(0x0020, to as u8, true), (0x0021, (to >> 8) as u8, true)]);
        if to == 0x8400 {
            for _ in 0..3 {
                t.ins(0x8400, &[0xad, 0x02, 0x20], &[(0x2002, 0x00, true)]);
                t.ins(0x8403, &[0x10, 0xfb], &[]);
            }
            t.ins(0x8400, &[0xad, 0x02, 0x20], &[(0x2002, 0x80, true)]);
            t.ins(0x8403, &[0x10, 0xfb], &[]);
            t.rts(0x8405);
        } else {
            t.ins(0x8500, &[0xe6, 0x11], &[(0x0011, 1, true), (0x0011, 2, false)]);
            t.rts(0x8502);
        }
        // Back in the handler at $8106.
        t.ins(0x8106, &[0xa5, 0x10], &[(0x0010, pad, true)]);
        if pad & 1 != 0 {
            t.jsr(0x8108, 0x8600);
            t.ins(0x8600, &[0xe6, 0x12], &[(0x0012, 1, true), (0x0012, 2, false)]);
            t.rts(0x8602);
        }
        t.rti(0x810b);
        t.frame(f);
    }
    t.ins(0x8010, &[0x4c, 0x10, 0x80], &[]);
    t.out
}

fn report(chunk: usize) -> Value {
    let mut f = flow::Flow::new(0x8000);
    for c in trace().chunks(chunk) {
        f.feed(c);
    }
    serde_json::from_str(&f.report()).unwrap()
}

fn routine<'a>(r: &'a Value, entry: &str, addr: u16) -> &'a Value {
    r["routines"].as_array().unwrap().iter().find(|x| x["entry"] == entry && x["addr"] == addr).unwrap_or_else(|| panic!("no {entry} routine at ${addr:04X}"))
}

#[test]
fn the_routines_are_found_by_how_they_are_entered() {
    let r = report(1 << 16);
    let nmi = routine(&r, "nmi", 0x8100);
    assert_eq!(nmi["entered"], FRAMES as u64);
    let pad = routine(&r, "call", 0x8200);
    assert_eq!(pad["tags"], serde_json::json!(["pad"]));
    assert_eq!(pad["callers"][0][0], nmi["id"], "called from the handler");
    assert_eq!(pad["callers"][0][1], 0x8100);
    // The interrupted fetch at $8010 did not run: five JMPs a frame, and
    // the one after the last frame.
    let idle = r["sites"].as_array().unwrap().iter().find(|s| s["addr"] == 0x8010).unwrap();
    assert_eq!(idle["count"], 5 * FRAMES as u64 + 1);
}

#[test]
fn a_jump_engine_dispatches_from_the_call_that_reached_it() {
    let r = report(1 << 16);
    let d = r["dispatch"].as_array().unwrap();
    assert_eq!(d.len(), 1, "{d:?}");
    assert_eq!(d[0]["addr"], 0x8180, "keyed by the JSR that reached the engine, not the engine's JMP");
    // What chose: A at the call was made from the byte at $30, every
    // time. The scratch byte that went in with it is not a chooser.
    assert_eq!(d[0]["on"], serde_json::json!([[0x30, FRAMES]]));
    let wait = routine(&r, "dispatch", 0x8400)["id"].as_u64().unwrap();
    let work = routine(&r, "dispatch", 0x8500)["id"].as_u64().unwrap();
    assert_eq!(d[0]["timeline"], serde_json::json!([[0, MODE_SWITCH - 1, wait], [MODE_SWITCH, FRAMES - 1, work]]));
    // Both pulls are the engine's: its frame is left at the second, when
    // its way back is gone, not at the first.
    let engine = routine(&r, "call", 0x8300)["id"].clone();
    for at in [0x8300, 0x8301] {
        let site = r["sites"].as_array().unwrap().iter().find(|s| s["addr"] == at).unwrap();
        assert_eq!(site["routine"], engine, "${at:04X}");
    }
    // The target's RTS returns to the handler: its $8106 runs in the NMI.
    let handler = routine(&r, "nmi", 0x8100);
    let at_8106 = r["sites"].as_array().unwrap().iter().find(|s| s["addr"] == 0x8106).unwrap();
    assert_eq!(at_8106["routine"], handler["id"]);
}

#[test]
fn loops_say_whether_they_idle_wait_or_work() {
    let r = report(1 << 16);
    let loops = r["loops"].as_array().unwrap();
    let idle = loops.iter().find(|l| l["head_addr"] == 0x8010).unwrap();
    assert_eq!(idle["kind"], "idle");
    let wait = loops.iter().find(|l| l["head_addr"] == 0x8400).unwrap();
    assert_eq!(wait["kind"], "wait");
    assert_eq!(wait["on"], 0x2002);
    assert_eq!(wait["iterations"], 3 * MODE_SWITCH as u64);
    assert_eq!(wait["entries"], MODE_SWITCH as u64);
}

#[test]
fn a_variable_is_ram_one_routine_writes_and_another_reads() {
    let r = report(1 << 16);
    let v = r["variables"].as_array().unwrap().iter().find(|v| v["addr"] == 0x10).expect("$0010 is shared");
    let pad = routine(&r, "call", 0x8200)["id"].clone();
    let nmi = routine(&r, "nmi", 0x8100)["id"].clone();
    assert_eq!(v["writers"][0][0], pad);
    assert_eq!(v["readers"][0][0], nmi);
    // $0011 is read and written by one routine only: not shared.
    assert!(!r["variables"].as_array().unwrap().iter().any(|v| v["addr"] == 0x11));
}

#[test]
fn the_pad_is_followed_to_the_code_it_runs() {
    let r = report(1 << 16);
    let a = r["input"].as_array().unwrap().iter().find(|b| b["button"] == "A").expect("A was held");
    assert_eq!(a["held"], 10);
    let only = routine(&r, "call", 0x8600)["id"].clone();
    assert_eq!(a["while_held"][0][0], only);
}

#[test]
fn the_modes_part_where_the_run_changed() {
    let r = report(1 << 16);
    let segs = r["modes"]["segments"].as_array().unwrap();
    assert!(segs.iter().any(|s| s[0] == MODE_SWITCH), "a cut at the switch: {segs:?}");
    let before = segs.iter().find(|s| s[0] == 0).unwrap()[2].clone();
    let after = segs.iter().find(|s| s[0] == MODE_SWITCH).unwrap()[2].clone();
    assert_ne!(before, after);
}

#[test]
fn hardware_accesses_say_whether_the_picture_was_drawing() {
    let mut t = T { out: Vec::new(), s: 0xfd };
    t.ins(0x8000, &[0x78], &[]);
    t.ins_at_line(0x8001, &[0x8d, 0x05, 0x20], &[(0x2005, 0, false)], 30);
    t.ins_at_line(0x8004, &[0x8d, 0x05, 0x20], &[(0x2005, 0, false)], 250);
    t.ins_at_line(0x8007, &[0xad, 0x02, 0x20], &[(0x2002, 0x40, true)], 100);
    t.ins_at_line(0x800a, &[0x8d, 0x00, 0x80], &[(0x8000, 1, false)], 245);
    // The palette, through the address latch: $2006 twice, $2007 twice;
    // then the sprite page named to $4014, and one write into it.
    t.ins(0x800d, &[0xad, 0x02, 0x20], &[(0x2002, 0x00, true)]);
    t.ins(0x8010, &[0x8d, 0x06, 0x20], &[(0x2006, 0x3f, false)]);
    t.ins(0x8013, &[0x8d, 0x06, 0x20], &[(0x2006, 0x00, false)]);
    t.ins(0x8016, &[0x8d, 0x07, 0x20], &[(0x2007, 0x0f, false)]);
    t.ins(0x8019, &[0x8d, 0x07, 0x20], &[(0x2007, 0x30, false)]);
    // The DMA halts the CPU on its own write of $4014, so that cycle is
    // held; the DMA's cycles follow with the pins where they were.
    t.ins(0x801c, &[0x8d, 0x14, 0x40], &[]);
    t.held(0x4014, 0x02, false);
    t.held(0x0200, 0x10, true);
    t.held(0x2004, 0x10, false);
    t.held(0x4014, 0x02, false);
    t.ins(0x801f, &[0x8d, 0x00, 0x02], &[(0x0200, 0x10, false)]);
    // An indexed read reaching eight slots, and a rotate on a RAM byte.
    t.ins(0x8022, &[0xbd, 0x00, 0x03], &[(0x0300, 1, true)]);
    t.ins(0x8022, &[0xbd, 0x00, 0x03], &[(0x0307, 1, true)]);
    t.ins(0x8025, &[0x66, 0x10], &[(0x0010, 0x81, true), (0x0010, 0x81, false), (0x0010, 0x40, false)]);
    t.ins(0x8027, &[0x4c, 0x27, 0x80], &[]);
    let mut f = flow::Flow::new(0x8000);
    f.feed(&t.out);
    let r: Value = serde_json::from_str(&f.report()).unwrap();
    let reset = routine(&r, "reset", 0x8000);
    assert_eq!(reset["in_frame"], serde_json::json!([[0x2002, 2, 0], [0x2005, 1, 1], [0x2006, 2, 0], [0x2007, 2, 0], [0x4014, 1, 0], [0x8000, 0, 1]]), "{}", reset["in_frame"]);
    assert_eq!(reset["vram"], serde_json::json!([["palette", 2]]), "{}", reset["vram"]);
    assert_eq!(r["oam_page"], 2);
    assert_eq!(reset["oam_writes"], 1);
    assert!(!reset["mem"].as_array().unwrap().iter().any(|m| m[0] == 0x2004), "the DMA's own cycles are not the game's");
    let site = |key: u32| r["sites"].as_array().unwrap().iter().find(|s| s["key"] == key).unwrap().clone();
    assert_eq!(site(0x22)["span"], serde_json::json!([0x0300, 0x0307]));
    assert_eq!(site(0x22)["reads"], serde_json::json!([[0x0300, 1], [0x0307, 1]]));
    assert_eq!(site(0x25)["reads"], serde_json::json!([[0x0010, 1]]));
    assert_eq!(site(0x25)["writes"], serde_json::json!([[0x0010, 2]]));
}

#[test]
fn values_are_followed_to_where_two_objects_meet() {
    let mut t = T { out: Vec::new(), s: 0xfd };
    t.ins(0x8000, &[0x78], &[]);
    // The sprite page is named to $4014.
    t.ins(0x8001, &[0x8d, 0x14, 0x40], &[]);
    t.held(0x4014, 0x02, false);
    // Two objects' X positions at $86 and $87 go to two sprites' X
    // bytes, each less the camera at $40, the second by way of the stack.
    t.ins(0x8004, &[0xa5, 0x86], &[(0x0086, 0x30, true)]);
    t.ins(0x8006, &[0xe5, 0x40], &[(0x0040, 0x01, true)]);
    t.ins(0x8008, &[0x8d, 0x03, 0x02], &[(0x0203, 0x2f, false)]);
    t.ins(0x800b, &[0xa5, 0x87], &[(0x0087, 0x50, true)]);
    t.ins(0x800d, &[0xe5, 0x40], &[(0x0040, 0x01, true)]);
    t.ins(0x800f, &[0x48], &[(0x01fd, 0x4f, false)]);
    t.ins(0x8010, &[0x68], &[(0x01fd, 0x4f, true)]);
    t.ins(0x8011, &[0x8d, 0x07, 0x02], &[(0x0207, 0x4f, false)]);
    // A third byte, $50, goes only to a sprite's tile: it feeds no position.
    t.ins(0x8014, &[0xa5, 0x50], &[(0x0050, 0x07, true)]);
    t.ins(0x8016, &[0x8d, 0x01, 0x02], &[(0x0201, 0x07, false)]);
    // One routine stages the two positions in temporaries...
    t.jsr(0x8019, 0x8100);
    t.ins(0x8100, &[0xa5, 0x86], &[(0x0086, 0x30, true)]);
    t.ins(0x8102, &[0x85, 0x00], &[(0x0000, 0x30, false)]);
    t.ins(0x8104, &[0xb5, 0x86], &[(0x0086, 0x30, true), (0x0087, 0x50, true)]);
    t.ins(0x8106, &[0x85, 0x01], &[(0x0001, 0x50, false)]);
    t.rts(0x8108);
    // ...and another subtracts one from the other: where they meet.
    t.jsr(0x801c, 0x8200);
    t.ins(0x8200, &[0xa5, 0x00], &[(0x0000, 0x30, true)]);
    t.ins(0x8202, &[0x38], &[]);
    t.ins(0x8203, &[0xe5, 0x01], &[(0x0001, 0x50, true)]);
    // Not meetings: a compare with a constant, with a byte that feeds no
    // position, with the same object, with a temporary a constant has
    // since been stored over, with the camera (which reached the same
    // sprite byte the position did), and with a constant that went by
    // way of the stack.
    t.ins(0x8205, &[0xc9, 0x10], &[]);
    t.ins(0x8207, &[0xa5, 0x86], &[(0x0086, 0x30, true)]);
    t.ins(0x8209, &[0xc5, 0x50], &[(0x0050, 0x07, true)]);
    t.ins(0x820b, &[0xc5, 0x86], &[(0x0086, 0x30, true)]);
    t.ins(0x820d, &[0xa9, 0x05], &[]);
    t.ins(0x820f, &[0x85, 0x01], &[(0x0001, 0x05, false)]);
    t.ins(0x8211, &[0xa5, 0x86], &[(0x0086, 0x30, true)]);
    t.ins(0x8213, &[0xc5, 0x01], &[(0x0001, 0x05, true)]);
    t.ins(0x8215, &[0xc5, 0x40], &[(0x0040, 0x01, true)]);
    t.ins(0x8217, &[0xa9, 0x09], &[]);
    t.ins(0x8219, &[0x48], &[(0x01fb, 0x09, false)]);
    t.ins(0x821a, &[0x68], &[(0x01fb, 0x09, true)]);
    t.ins(0x821b, &[0x8d, 0x0b, 0x02], &[(0x020b, 0x09, false)]);
    t.ins(0x821e, &[0xc5, 0x86], &[(0x0086, 0x30, true)]);
    // A speed at $57, itself made of four bytes, moves the position:
    // the position stays its own, and the four reach no sprite.
    t.ins(0x8220, &[0xa5, 0x60], &[(0x0060, 1, true)]);
    t.ins(0x8222, &[0x65, 0x61], &[(0x0061, 1, true)]);
    t.ins(0x8224, &[0x65, 0x62], &[(0x0062, 1, true)]);
    t.ins(0x8226, &[0x65, 0x63], &[(0x0063, 1, true)]);
    t.ins(0x8228, &[0x65, 0x86], &[(0x0086, 0x30, true)]);
    t.ins(0x822a, &[0x85, 0x86], &[(0x0086, 0x34, false)]);
    t.ins(0x822c, &[0xa5, 0x86], &[(0x0086, 0x34, true)]);
    t.ins(0x822e, &[0x8d, 0x0f, 0x02], &[(0x020f, 0x34, false)]);
    // And a speed of one byte, $64, moves the other: the same.
    t.ins(0x8231, &[0xa5, 0x87], &[(0x0087, 0x50, true)]);
    t.ins(0x8233, &[0x65, 0x64], &[(0x0064, 1, true)]);
    t.ins(0x8235, &[0x85, 0x87], &[(0x0087, 0x51, false)]);
    t.ins(0x8237, &[0xa5, 0x87], &[(0x0087, 0x51, true)]);
    t.ins(0x8239, &[0x8d, 0x13, 0x02], &[(0x0213, 0x51, false)]);
    // Scratch: $03 holds a constant, reaches a sprite's X and is
    // compared with a position. It was written before it was read, so
    // it carries nothing from frame to frame and is nobody's position.
    t.ins(0x823c, &[0xa9, 0x10], &[]);
    t.ins(0x823e, &[0x85, 0x03], &[(0x0003, 0x10, false)]);
    t.ins(0x8240, &[0xa5, 0x03], &[(0x0003, 0x10, true)]);
    t.ins(0x8242, &[0x8d, 0x17, 0x02], &[(0x0217, 0x10, false)]);
    t.ins(0x8245, &[0xa5, 0x86], &[(0x0086, 0x34, true)]);
    t.ins(0x8247, &[0xc5, 0x03], &[(0x0003, 0x10, true)]);
    // A fraction at $70 takes a speed at $71, and the carry goes on
    // into the position at $88 by an add of nothing: both moved it.
    t.ins(0x8249, &[0xa5, 0x70], &[(0x0070, 0xf0, true)]);
    t.ins(0x824b, &[0x65, 0x71], &[(0x0071, 0x20, true)]);
    t.ins(0x824d, &[0x85, 0x70], &[(0x0070, 0x10, false)]);
    t.ins(0x824f, &[0xa5, 0x88], &[(0x0088, 0x40, true)]);
    t.ins(0x8251, &[0x69, 0x00], &[]);
    t.ins(0x8253, &[0x85, 0x88], &[(0x0088, 0x41, false)]);
    // The same with the carry cleared in between: the add of nothing
    // adds nothing, and the position at $89 was moved by no one.
    t.ins(0x8255, &[0xa5, 0x72], &[(0x0072, 0xf0, true)]);
    t.ins(0x8257, &[0x65, 0x73], &[(0x0073, 0x20, true)]);
    t.ins(0x8259, &[0x85, 0x72], &[(0x0072, 0x10, false)]);
    t.ins(0x825b, &[0x18], &[]);
    t.ins(0x825c, &[0xa5, 0x89], &[(0x0089, 0x40, true)]);
    t.ins(0x825e, &[0x69, 0x00], &[]);
    t.ins(0x8260, &[0x85, 0x89], &[(0x0089, 0x40, false)]);
    // A byte counted down in place twice, one counted up once, and one
    // that goes both ways.
    t.ins(0x8262, &[0xc6, 0x66], &[(0x0066, 9, true), (0x0066, 8, false)]);
    t.ins(0x8264, &[0xc6, 0x66], &[(0x0066, 8, true), (0x0066, 7, false)]);
    t.ins(0x8266, &[0xe6, 0x67], &[(0x0067, 0, true), (0x0067, 1, false)]);
    t.ins(0x8268, &[0xe6, 0x68], &[(0x0068, 0, true), (0x0068, 1, false)]);
    t.ins(0x826a, &[0xc6, 0x68], &[(0x0068, 1, true), (0x0068, 0, false)]);
    t.rts(0x826c);
    t.ins(0x801f, &[0x4c, 0x1f, 0x80], &[]);
    let mut f = flow::Flow::new(0x8000);
    f.feed(&t.out);
    let r: Value = serde_json::from_str(&f.report()).unwrap();
    assert_eq!(r["oam_page"], 2);
    // The bytes that reached a sprite's Y or X: [cell, into Y, into X].
    // The camera reaches both sprites' X with the positions; the stack
    // and the speeds' bytes reach none.
    assert_eq!(r["sprite_feeds"], serde_json::json!([[0x40, 0, 2], [0x86, 0, 2], [0x87, 0, 2]]), "{}", r["sprite_feeds"]);
    // One meeting: the SBC at $8203, of $86 with $87, on X, in the
    // routine at $8200.
    let meets = r["meets"].as_array().unwrap();
    assert_eq!(meets.len(), 1, "{meets:?}");
    assert_eq!(meets[0]["key"], 0x0203);
    assert_eq!(meets[0]["addr"], 0x8203);
    assert_eq!(meets[0]["routine"], routine(&r, "call", 0x8200)["id"]);
    assert_eq!(meets[0]["pairs"], serde_json::json!([[0x86, 0x87, 1, "x"]]));
    // What was added into a byte that kept its own value: the one-byte
    // speed into $87. The four-byte speed into $86 is nobody's (more
    // than four cells), and says nothing.
    // The cells that carry a value from frame to frame: the positions
    // are among them, the scratch byte is not.
    let carried: Vec<u64> = r["carried"].as_array().unwrap().iter().map(|c| c.as_u64().unwrap()).collect();
    assert!(carried.contains(&0x86) && carried.contains(&0x87) && carried.contains(&0x40), "{carried:x?}");
    assert!(!carried.contains(&0x03) && !carried.contains(&0x00), "{carried:x?}");
    // The bytes stepped in place: [cell, times up, times down].
    assert_eq!(r["steps"], serde_json::json!([[0x66, 0, 2], [0x67, 1, 0], [0x68, 1, 1]]), "{}", r["steps"]);
    // And the carry out of a fraction, with the speed that made it.
    assert_eq!(r["moves"], serde_json::json!([[0x70, 0x71, 1], [0x72, 0x73, 1], [0x87, 0x64, 1], [0x88, 0x70, 1], [0x88, 0x71, 1]]), "{}", r["moves"]);
}

#[test]
fn a_pointer_table_is_found_by_where_the_pointer_was_loaded() {
    let mut t = T { out: Vec::new(), s: 0xfd };
    t.ins(0x8000, &[0x78], &[]);
    // The mode at $40 indexes a table of addresses in the ROM at $9000;
    // the word goes to $20/$21 and the game jumps through it.
    t.ins(0x8001, &[0xa6, 0x40], &[(0x0040, 2, true)]);
    t.ins(0x8003, &[0xbd, 0x00, 0x90], &[(0x9002, 0x00, true)]);
    t.ins(0x8006, &[0x85, 0x20], &[(0x0020, 0x00, false)]);
    t.ins(0x8008, &[0xbd, 0x01, 0x90], &[(0x9003, 0x84, true)]);
    t.ins(0x800b, &[0x85, 0x21], &[(0x0021, 0x84, false)]);
    t.ins(0x800d, &[0x6c, 0x20, 0x00], &[(0x0020, 0x00, true), (0x0021, 0x84, true)]);
    // There: a pointer whose two bytes come from two tables (low bytes
    // in one, high in another) names no word, and one copied from RAM
    // names none either.
    t.ins(0x8400, &[0xbd, 0x00, 0x91], &[(0x9102, 0x00, true)]);
    t.ins(0x8403, &[0x85, 0x22], &[(0x0022, 0x00, false)]);
    t.ins(0x8405, &[0xbd, 0x00, 0x92], &[(0x9202, 0x85, true)]);
    t.ins(0x8408, &[0x85, 0x23], &[(0x0023, 0x85, false)]);
    t.ins(0x840a, &[0x6c, 0x22, 0x00], &[(0x0022, 0x00, true), (0x0023, 0x85, true)]);
    t.ins(0x8500, &[0xa5, 0x50], &[(0x0050, 0x00, true)]);
    t.ins(0x8502, &[0x85, 0x24], &[(0x0024, 0x00, false)]);
    t.ins(0x8504, &[0xa5, 0x51], &[(0x0051, 0x86, true)]);
    t.ins(0x8506, &[0x85, 0x25], &[(0x0025, 0x86, false)]);
    t.ins(0x8508, &[0x6c, 0x24, 0x00], &[(0x0024, 0x00, true), (0x0025, 0x86, true)]);
    t.ins(0x8600, &[0x4c, 0x00, 0x86], &[]);
    let mut f = flow::Flow::new(0x8000);
    f.feed(&t.out);
    let r: Value = serde_json::from_str(&f.report()).unwrap();
    let at = |addr: u16| r["dispatch"].as_array().unwrap().iter().find(|d| d["addr"] == addr).unwrap_or_else(|| panic!("no dispatch at ${addr:04X}")).clone();
    // The word at PRG offset $1002, once, chosen by the byte at $40.
    assert_eq!(at(0x800d)["words"], serde_json::json!([[0x1002, 1]]));
    assert_eq!(at(0x800d)["on"], serde_json::json!([[0x40, 1]]));
    assert_eq!(at(0x840a)["words"], serde_json::json!([]));
    assert_eq!(at(0x8508)["words"], serde_json::json!([]));
    // The pointer copied from RAM was chosen by the bytes it was copied
    // from (a handler's address kept in memory); the one put together
    // from two tables of the ROM, by the index into them.
    assert_eq!(at(0x8508)["on"], serde_json::json!([[0x50, 1], [0x51, 1]]));
    assert_eq!(at(0x840a)["on"], serde_json::json!([[0x40, 1]]));
    // And only the first of those is a copy: `from` says so.
    assert_eq!(at(0x8508)["from"], serde_json::json!([[0x50, 1], [0x51, 1]]));
    assert_eq!(at(0x840a)["from"], serde_json::json!([]));
    assert_eq!(at(0x800d)["from"], serde_json::json!([]));
    // The pointer put together from two tables says which two bytes it
    // took: the low one at PRG $1102 and the high one at $1202. The
    // others took no such pair, and none of the three was a return.
    assert_eq!(at(0x840a)["halves"], serde_json::json!([[0x1102, 0x1202, 1]]));
    assert_eq!(at(0x800d)["halves"], serde_json::json!([]));
    assert_eq!(at(0x8508)["halves"], serde_json::json!([]));
    for a in [0x800d, 0x840a, 0x8508] {
        assert_eq!(at(a)["ret"], false, "${a:04X}");
    }
}

#[test]
fn a_return_to_a_pushed_address_is_a_jump_through_a_table() {
    let mut t = T { out: Vec::new(), s: 0xfd };
    t.ins(0x8000, &[0x78], &[]);
    // A routine that pushes an address from a table of words and
    // returns to it: the word at $9002 holds $83FF, one less than where
    // the return lands. The mode at $40 picks the word.
    t.jsr(0x8001, 0x8100);
    t.ins(0x8100, &[0xa6, 0x40], &[(0x0040, 2, true)]);
    t.ins(0x8102, &[0xbd, 0x01, 0x90], &[(0x9003, 0x83, true)]);
    t.pha(0x8105, 0x83);
    t.ins(0x8106, &[0xbd, 0x00, 0x90], &[(0x9002, 0xff, true)]);
    t.pha(0x8109, 0xff);
    t.rts(0x810a);
    // Where it lands is a routine of its own, and its RTS goes back to
    // whoever called the one that pushed.
    t.ins(0x8400, &[0xe6, 0x11], &[(0x0011, 1, true), (0x0011, 2, false)]);
    t.rts(0x8402);
    // The same from a table of high bytes at $9200 and one of low bytes
    // at $9100.
    t.jsr(0x8004, 0x8200);
    t.ins(0x8200, &[0xa6, 0x40], &[(0x0040, 2, true)]);
    t.ins(0x8202, &[0xbd, 0x00, 0x92], &[(0x9202, 0x84, true)]);
    t.pha(0x8205, 0x84);
    t.ins(0x8206, &[0xbd, 0x00, 0x91], &[(0x9102, 0xff, true)]);
    t.pha(0x8209, 0xff);
    t.rts(0x820a);
    t.rts(0x8500);
    // Not one: a byte pushed and pulled, then a call whose own return
    // address lands on the byte the PHA wrote. That RTS goes back where
    // it was called from.
    t.ins(0x8007, &[0xa9, 0x01], &[]);
    t.pha(0x8009, 0x01);
    t.pla(0x800a);
    t.pha(0x800b, 0x01);
    t.pha(0x800c, 0x01);
    t.pla(0x800d);
    t.pla(0x800e);
    t.jsr(0x800f, 0x8600);
    t.rts(0x8600);
    // Not one either: a call made by hand. Where to come back to is
    // pushed, the routine is jumped to, and its RTS lands right after
    // that JMP.
    t.ins(0x8012, &[0xa9, 0x80], &[]);
    t.pha(0x8014, 0x80);
    t.ins(0x8015, &[0xa9, 0x1a], &[]);
    t.pha(0x8017, 0x1a);
    t.ins(0x8018, &[0x4c, 0x00, 0x87], &[]);
    t.ins(0x8700, &[0xea], &[]);
    t.rts(0x8701);
    // Nor this: a routine that takes its own return address off the
    // stack, keeps it in memory, puts it back and returns. That is the
    // call at $801B coming back, as a task switcher does it.
    t.jsr(0x801b, 0x8800);
    t.pla(0x8800);
    t.ins(0x8801, &[0x85, 0x60], &[(0x0060, 0x1d, false)]);
    t.pla(0x8803);
    t.ins(0x8804, &[0x85, 0x61], &[(0x0061, 0x80, false)]);
    t.ins(0x8806, &[0xa5, 0x61], &[(0x0061, 0x80, true)]);
    t.pha(0x8808, 0x80);
    t.ins(0x8809, &[0xa5, 0x60], &[(0x0060, 0x1d, true)]);
    t.pha(0x880b, 0x1d);
    t.rts(0x880c);
    // But a table's entry may sit right after a call too. The routine
    // at $83F0 ends in a call at $83FD and falls into $8400; taken
    // through the table once more after that call has run, it is still
    // the table's.
    t.jsr(0x801e, 0x83f0);
    t.ins(0x83f0, &[0xea], &[]);
    t.jsr(0x83fd, 0x8600);
    t.rts(0x8600);
    t.ins(0x8400, &[0xe6, 0x11], &[(0x0011, 2, true), (0x0011, 3, false)]);
    t.rts(0x8402);
    t.jsr(0x8021, 0x8100);
    t.ins(0x8100, &[0xa6, 0x40], &[(0x0040, 2, true)]);
    t.ins(0x8102, &[0xbd, 0x01, 0x90], &[(0x9003, 0x83, true)]);
    t.pha(0x8105, 0x83);
    t.ins(0x8106, &[0xbd, 0x00, 0x90], &[(0x9002, 0xff, true)]);
    t.pha(0x8109, 0xff);
    t.rts(0x810a);
    t.ins(0x8400, &[0xe6, 0x11], &[(0x0011, 3, true), (0x0011, 4, false)]);
    t.rts(0x8402);
    t.ins(0x8024, &[0x4c, 0x24, 0x80], &[]);
    let mut f = flow::Flow::new(0x8000);
    f.feed(&t.out);
    let r: Value = serde_json::from_str(&f.report()).unwrap();
    let all = r["dispatch"].as_array().unwrap();
    let at = |addr: u16| all.iter().find(|d| d["addr"] == addr).unwrap_or_else(|| panic!("no dispatch at ${addr:04X}")).clone();
    // Two returns were jumps, and only two: the calls' own were not.
    assert_eq!(all.len(), 2, "{all:?}");
    // The word at PRG $1002, chosen by the byte at $40, taken by a
    // return: twice, the second time after a call had run just before
    // where it lands.
    assert_eq!(at(0x810a)["words"], serde_json::json!([[0x1002, 2]]));
    assert_eq!(at(0x810a)["on"], serde_json::json!([[0x40, 2]]));
    assert_eq!(at(0x810a)["ret"], true);
    assert_eq!(at(0x810a)["halves"], serde_json::json!([]));
    // The two tables: the low byte at PRG $1102, the high at $1202.
    assert_eq!(at(0x820a)["words"], serde_json::json!([]));
    assert_eq!(at(0x820a)["halves"], serde_json::json!([[0x1102, 0x1202, 1]]));
    assert_eq!(at(0x820a)["on"], serde_json::json!([[0x40, 1]]));
    assert_eq!(at(0x820a)["ret"], true);
    // Where each landed is a routine entered through a table, once, and
    // the routines that pushed were entered by their calls.
    for (a, n) in [(0x8400, 2), (0x8500, 1)] {
        assert_eq!(routine(&r, "dispatch", a)["entered"], n, "${a:04X}");
    }
    for (a, n) in [(0x8100, 2), (0x8200, 1), (0x8600, 2), (0x8800, 1), (0x83f0, 1)] {
        assert_eq!(routine(&r, "call", a)["entered"], n, "${a:04X}");
    }
    // The call stack came through whole: the loop at the end runs in
    // the routine the reset entered, not in something left open.
    let reset = routine(&r, "reset", 0x8000);
    assert!(r["sites"].as_array().unwrap().iter().any(|s| s["addr"] == 0x8024 && s["routine"] == reset["id"]), "the last instruction is not the reset routine's");
}

#[test]
fn chunks_that_split_records_change_nothing() {
    assert_eq!(report(3), report(1 << 16));
}
