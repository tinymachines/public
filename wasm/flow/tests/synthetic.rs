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
        t.jsr(0x8103, 0x8180);
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
    t.ins(0x8022, &[0x4c, 0x22, 0x80], &[]);
    let mut f = flow::Flow::new(0x8000);
    f.feed(&t.out);
    let r: Value = serde_json::from_str(&f.report()).unwrap();
    let reset = routine(&r, "reset", 0x8000);
    assert_eq!(reset["in_frame"], serde_json::json!([[0x2002, 2, 0], [0x2005, 1, 1], [0x2006, 2, 0], [0x2007, 2, 0], [0x4014, 1, 0], [0x8000, 0, 1]]), "{}", reset["in_frame"]);
    assert_eq!(reset["vram"], serde_json::json!([["palette", 2]]), "{}", reset["vram"]);
    assert_eq!(r["oam_page"], 2);
    assert_eq!(reset["oam_writes"], 1);
    assert!(!reset["mem"].as_array().unwrap().iter().any(|m| m[0] == 0x2004), "the DMA's own cycles are not the game's");
}

#[test]
fn chunks_that_split_records_change_nothing() {
    assert_eq!(report(3), report(1 << 16));
}
