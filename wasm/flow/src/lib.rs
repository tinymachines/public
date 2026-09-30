//! The flow tools: what a game's code did, read from the trace of one run.
//!
//! The console (`tinymachines/nes`, `nes-console/src/record.rs`) replays a
//! recording and writes its trace: one record per CPU cycle, the registers
//! at every opcode fetch, the pad, the pictures. This crate reads that
//! trace once, a chunk at a time, and keeps:
//!
//! - **sites**: every instruction executed, keyed by where it sits in the
//!   PRG ROM (so one address on a banked board is as many sites as the
//!   banks it ran from), with its count, cycles and first and last frame;
//! - **routines**: the places code is entered, by a JSR, an interrupt, or
//!   a jump through a table (`JMP (ind)`), each with the instructions that
//!   ran in it, its callers, its cycles, and what it read and wrote;
//! - **frames**: per picture, the routines that ran, the cycles spent
//!   idle, where the NMI handler began and ended, and the pad.
//!
//! and from those, at the end: loops (idle, waiting on something, doing
//! work), the RAM the routines share (variables), which routines follow
//! the pad, the tables the game dispatches through and which way each
//! went frame by frame, and the stretches of the run that look alike
//! (modes: a title, a menu, play).
//!
//! **How the call stack is followed.** A frame is pushed when a routine is
//! entered and lives while its way back is still on the stack: the two
//! bytes a JSR pushed, or the three an interrupt did. The first
//! instruction to see the stack pointer past them has left it, however
//! they were taken off. That survives the tricks a game plays with its
//! stack: a jump engine that pulls its own return address and jumps
//! through a table leaves its frame at the second pull, and the table's
//! target is a frame of its own that the caller's RTS ends. A return that goes somewhere other than
//! where it was called from (the "RTS trick", pushing an address and
//! returning to it) is followed as a return and NOT seen as a dispatch;
//! that is a gap, said here and in the page.
//!
//! No die data is embedded here, so this crate is MIT, like halfphi.

pub mod ops;

use serde::Serialize;
use std::collections::{HashMap, HashSet};

// The trace's records, as `nes-console/src/record.rs` writes them.
const KIND_CYCLE: u8 = 0x00;
const KIND_REGS: u8 = 0x40;
const KIND_INPUT: u8 = 0x80;
const F_READ: u8 = 1;
const F_SYNC: u8 = 2;
const F_HELD: u8 = 16;

/// Code in RAM has no place in the ROM: it is keyed by its address.
const RAM_KEY: u32 = 0x8000_0000;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Entry {
    Reset,
    Nmi,
    Irq,
    Brk,
    Call,
    Dispatch,
}

#[derive(Default)]
struct Site {
    addr: u16,
    op: u8,
    b1: u8,
    b2: u8,
    count: u64,
    cycles: u64,
    first: u32,
    last: u32,
    /// The routine it first ran in.
    routine: u32,
    data_reads: u64,
    data_writes: u64,
    /// The addresses it read outside the ROM, most first (a few).
    reads: Vec<(u16, u32)>,
    /// The addresses it wrote below the ROM, most first (a few).
    writes: Vec<(u16, u32)>,
    /// The lowest and highest address below the ROM it read or wrote
    /// (the stack aside): an indexed instruction's reach.
    span: Option<(u16, u16)>,
}

struct Routine {
    key: u32,
    addr: u16,
    entry: Entry,
    entered: u64,
    excl: u64,
    incl: u64,
    frames_run: u32,
    last_frame: u32,
    line_min: u16,
    line_max: u16,
    callers: HashMap<(u32, u16), u64>,
    body: HashSet<u32>,
    /// Reads and writes by address, outside the ROM; a write to the ROM's
    /// window is a mapper register and is kept here too.
    mem: HashMap<u16, (u32, u32)>,
    rom_reads: u64,
    /// The hardware it touched, by where the beam was: PPU registers
    /// and the sprite DMA (reads and writes alike), and the mapper (any
    /// write into the ROM's window, as $8000): accesses while the
    /// picture was drawing (lines 0 to 239) and in the blank.
    in_frame: HashMap<u16, (u32, u32)>,
    /// Writes of $2007 by the VRAM region the PPU's address was in:
    /// pattern, name (a table each), palette.
    vram: HashMap<&'static str, u32>,
    /// Writes into each page of RAM ($0000 to $07FF), to know the ones
    /// into the page the sprite DMA takes.
    ram_pages: [u32; 8],
}

struct Frame {
    routine: u32,
    /// The frame has been left once S reaches this: S on entry plus the
    /// bytes its way back takes (two for a call or a dispatch, which
    /// returns through its caller's; three for an interrupt).
    s_gone: i32,
    /// The JSR that made it (key, address), for a call.
    site: Option<(u32, u16)>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Pending {
    None,
    Call(u32, u16),
    Interrupt(Entry),
    Dispatch(u32, u16),
}

struct Cur {
    key: u32,
    addr: u16,
    op: u8,
    frame: u32,
    s: Option<u8>,
    line: u16,
    cycles: u32,
    held: u32,
    vector: Option<u16>,
    b1: Option<u8>,
    b2: Option<u8>,
    routine: u32,
    /// Its data accesses so far (address, read), folded into the site
    /// when it finishes: the site does not exist until then, so an
    /// instruction's first run would otherwise leave nothing there.
    accesses: Vec<(u16, bool)>,
}

#[derive(Default, Clone)]
struct FrameStat {
    cycles: u32,
    idle: u32,
    nmi_line: Option<u16>,
    rti_line: Option<u16>,
    pad: u8,
    routines: Vec<u32>,
}

struct Dispatch {
    key: u32,
    addr: u16,
    depth_min: u32,
    targets: HashMap<u32, u64>,
    /// (first frame, last frame, target routine), one row per change.
    timeline: Vec<(u32, u32, u32)>,
}

pub struct Flow {
    prg_len: u32,
    rest: Vec<u8>,
    cur: Option<Cur>,
    pending: Pending,
    sites: HashMap<u32, Site>,
    routines: Vec<Routine>,
    by_entry: HashMap<(u32, Entry), u32>,
    stack: Vec<Frame>,
    frame: u32,
    frames: Vec<FrameStat>,
    pads: [u8; 2],
    pad2_used: bool,
    /// Taken transfers that were not a fall-through: (from, to) -> count.
    edges: HashMap<(u32, u32), u64>,
    dispatch: HashMap<u32, Dispatch>,
    /// The call site of a frame just left without its RTS (a jump engine
    /// pulling its return address), and the instruction count then: the
    /// JMP (ind) that follows is that call's dispatch.
    orphan: Option<(u32, u16, u64)>,
    instructions: u64,
    cycles: u64,
    held: u64,
    records: u64,
    /// The PPU's address latch as the game drives it: the write toggle
    /// ($2005 and $2006 share it, a read of $2002 clears it), the high
    /// byte waiting for its low one, the address, and the step a $2007
    /// access adds (1 or 32, from $2000 bit 2).
    ppu_toggle: bool,
    ppu_hi: u8,
    vram_addr: u16,
    vram_step: u16,
    /// Pages named by writes of $4014, by count.
    oam_pages: [u32; 256],
}

impl Flow {
    pub fn new(prg_len: u32) -> Flow {
        Flow {
            prg_len,
            rest: Vec::new(),
            cur: None,
            pending: Pending::None,
            sites: HashMap::new(),
            routines: Vec::new(),
            by_entry: HashMap::new(),
            stack: Vec::new(),
            frame: 0,
            frames: vec![FrameStat::default()],
            pads: [0; 2],
            pad2_used: false,
            edges: HashMap::new(),
            dispatch: HashMap::new(),
            orphan: None,
            instructions: 0,
            cycles: 0,
            held: 0,
            records: 0,
            ppu_toggle: false,
            ppu_hi: 0,
            vram_addr: 0,
            vram_step: 1,
            oam_pages: [0; 256],
        }
    }

    /// A chunk of the trace, in order. Chunks may split a record.
    pub fn feed(&mut self, bytes: &[u8]) {
        let mut buf = std::mem::take(&mut self.rest);
        buf.extend_from_slice(bytes);
        let whole = buf.len() / 8 * 8;
        for r in buf[..whole].chunks_exact(8) {
            self.record(r);
        }
        self.rest = buf[whole..].to_vec();
    }

    fn record(&mut self, r: &[u8]) {
        self.records += 1;
        let kind = r[3] & 0xc0;
        if kind == KIND_CYCLE {
            let flags = r[3] & 0x3f;
            let ab = u16::from_le_bytes([r[0], r[1]]);
            let db = r[2];
            let prg = u32::from_le_bytes([r[4], r[5], r[6], r[7]]);
            self.cycles += 1;
            if let Some(f) = self.frames.get_mut(self.frame as usize) {
                f.cycles += 1;
            }
            if flags & F_HELD != 0 {
                self.held += 1;
                let first = self.cur.as_ref().is_some_and(|c| c.held == 0);
                if let Some(c) = self.cur.as_mut() {
                    c.held += 1;
                }
                // The CPU's own write of $4014 is the cycle the DMA halts
                // it on: the one held cycle that is the game's and not
                // the DMA's, which then holds the pins where they were.
                if first && flags & F_READ == 0 && ab == 0x4014 {
                    self.access(ab, db, false);
                    if let Some(c) = self.cur.as_mut() {
                        c.cycles -= 1;
                    }
                }
                return;
            }
            if flags & F_SYNC != 0 {
                let key = if prg != 0 { prg - 1 } else { RAM_KEY | ab as u32 };
                self.begin(key, ab, db);
                return;
            }
            self.access(ab, db, flags & F_READ != 0);
        } else if kind == KIND_REGS {
            let s = r[4];
            let line = u16::from_le_bytes([r[6], r[7]]);
            self.regs(s, line);
        } else if kind == KIND_INPUT {
            let (value, port) = (r[0], r[1]);
            if port < 2 {
                self.pads[port as usize] = value;
                if port == 1 && value != 0 {
                    self.pad2_used = true;
                }
            }
        } else {
            // A picture completed: the next frame begins.
            self.frame += 1;
            self.frames.push(FrameStat { pad: self.pads[0], ..Default::default() });
        }
    }

    fn access(&mut self, ab: u16, db: u8, read: bool) {
        let Some(c) = self.cur.as_mut() else { return };
        c.cycles += 1;
        if read {
            if ab >= 0xfffa {
                c.vector.get_or_insert(ab & 0xfffe);
            }
            let off = ab.wrapping_sub(c.addr);
            if off == 1 && c.b1.is_none() {
                c.b1 = Some(db);
                return;
            }
            if off == 2 && c.b2.is_none() && ops::len(c.op) == 3 {
                c.b2 = Some(db);
                return;
            }
        }
        let routine = c.routine;
        let line = c.line;
        // Where the access lands, as a reader of the game thinks of it.
        let (addr, keep) = match ab {
            0x0000..=0x1fff => (ab & 0x07ff, true),
            0x2000..=0x3fff => (0x2000 | (ab & 7), true),
            0x4000..=0x401f => (ab, true),
            0x6000..=0x7fff => (ab, true),
            0x8000..=0xffff => (ab, !read),
            _ => (ab, true),
        };
        // The PPU's address, followed so a write of $2007 lands somewhere.
        let vram_region = match (addr, read) {
            (0x2000, false) => {
                self.vram_step = if db & 4 != 0 { 32 } else { 1 };
                None
            }
            (0x2002, true) => {
                self.ppu_toggle = false;
                None
            }
            (0x2005, false) => {
                self.ppu_toggle = !self.ppu_toggle;
                None
            }
            (0x2006, false) => {
                if self.ppu_toggle {
                    self.vram_addr = u16::from_le_bytes([db, self.ppu_hi]) & 0x3fff;
                } else {
                    self.ppu_hi = db;
                }
                self.ppu_toggle = !self.ppu_toggle;
                None
            }
            (0x2007, _) => {
                let a = self.vram_addr;
                self.vram_addr = (a + self.vram_step) & 0x3fff;
                (!read).then(|| match a {
                    0x3f00..=0x3fff => "palette",
                    0x2c00..=0x3eff => "name 3",
                    0x2800..=0x2bff => "name 2",
                    0x2400..=0x27ff => "name 1",
                    0x2000..=0x23ff => "name 0",
                    _ => "pattern",
                })
            }
            (0x4014, false) => {
                self.oam_pages[db as usize] += 1;
                None
            }
            _ => None,
        };
        if routine != u32::MAX {
            let rt = &mut self.routines[routine as usize];
            if let Some(region) = vram_region {
                *rt.vram.entry(region).or_insert(0) += 1;
            }
            if !read && addr < 0x0800 {
                rt.ram_pages[(addr >> 8) as usize] += 1;
            }
            if keep {
                let e = rt.mem.entry(addr).or_insert((0, 0));
                if read {
                    e.0 += 1;
                } else {
                    e.1 += 1;
                }
            } else {
                rt.rom_reads += 1;
            }
            let hardware = (0x2000..=0x2007).contains(&addr) || addr == 0x4014;
            if hardware || (!read && ab >= 0x8000) {
                let e = rt.in_frame.entry(if ab >= 0x8000 { 0x8000 } else { addr }).or_insert((0, 0));
                if line < 240 {
                    e.0 += 1;
                } else {
                    e.1 += 1;
                }
            }
        }
        if let Some(c) = self.cur.as_mut() {
            let counted = keep && addr < 0x8000 && !(0x0100..0x0200).contains(&addr);
            c.accesses.push((if counted { addr } else { 0xffff }, read));
        }
    }

    fn begin(&mut self, key: u32, addr: u16, op: u8) {
        if let Some(prev) = self.cur.take() {
            self.finish_instruction(prev, key);
        }
        self.cur = Some(Cur { key, addr, op, frame: self.frame, s: None, line: 0, cycles: 1, held: 0, vector: None, b1: None, b2: None, routine: u32::MAX, accesses: Vec::new() });
    }

    fn routine_for(&mut self, key: u32, addr: u16, entry: Entry) -> u32 {
        if let Some(&i) = self.by_entry.get(&(key, entry)) {
            return i;
        }
        let i = self.routines.len() as u32;
        self.routines.push(Routine {
            key,
            addr,
            entry,
            entered: 0,
            excl: 0,
            incl: 0,
            frames_run: 0,
            last_frame: u32::MAX,
            line_min: u16::MAX,
            line_max: 0,
            callers: HashMap::new(),
            body: HashSet::new(),
            mem: HashMap::new(),
            rom_reads: 0,
            in_frame: HashMap::new(),
            vram: HashMap::new(),
            ram_pages: [0; 8],
        });
        self.by_entry.insert((key, entry), i);
        i
    }

    /// The registers entering the current instruction: the stack is
    /// followed here, where S is known.
    fn regs(&mut self, s: u8, line: u16) {
        let Some(c) = self.cur.as_mut() else { return };
        c.s = Some(s);
        c.line = line;
        let (key, addr) = (c.key, c.addr);
        // Frames the stack pointer has left.
        while self.stack.last().is_some_and(|top| (s as i32) >= top.s_gone) {
            self.stack.pop();
        }
        let caller = self.stack.last().map(|f| f.routine);
        let entered = match self.pending {
            Pending::None => None,
            Pending::Call(site, at) => Some((Entry::Call, Some((site, at)))),
            Pending::Interrupt(e) => Some((e, None)),
            Pending::Dispatch(site, at) => Some((Entry::Dispatch, Some((site, at)))),
        };
        let pending = std::mem::replace(&mut self.pending, Pending::None);
        if let Some((entry, from)) = entered {
            if entry == Entry::Reset {
                self.stack.clear();
            }
            let r = self.routine_for(key, addr, entry);
            let depth = self.stack.len() as u32;
            let rt = &mut self.routines[r as usize];
            rt.entered += 1;
            if let (Some(cr), Some((_, at))) = (caller, from) {
                *rt.callers.entry((cr, at)).or_insert(0) += 1;
            }
            let back = match entry {
                Entry::Reset => 0x200,
                Entry::Nmi | Entry::Irq | Entry::Brk => 3,
                Entry::Call | Entry::Dispatch => 2,
            };
            let site = if entry == Entry::Call { from } else { None };
            self.stack.push(Frame { routine: r, s_gone: if entry == Entry::Reset { back } else { s as i32 + back }, site });
            if let Pending::Dispatch(site, at) = pending {
                let frame = self.frame;
                let d = self.dispatch.entry(site).or_insert(Dispatch { key: site, addr: at, depth_min: depth, targets: HashMap::new(), timeline: Vec::new() });
                d.depth_min = d.depth_min.min(depth);
                *d.targets.entry(r).or_insert(0) += 1;
                match d.timeline.last_mut() {
                    Some(t) if t.2 == r => t.1 = frame,
                    _ => d.timeline.push((frame, frame, r)),
                }
            }
            if entry == Entry::Nmi {
                let f = &mut self.frames[self.frame as usize];
                f.nmi_line.get_or_insert(line);
            }
        }
        if self.stack.is_empty() {
            // The trace began inside something, or after a reset nobody
            // saw: what runs is its own root.
            let r = self.routine_for(key, addr, Entry::Reset);
            self.routines[r as usize].entered += 1;
            self.stack.push(Frame { routine: r, s_gone: 0x200, site: None });
        }
        let top = self.stack.last().unwrap().routine;
        let rt = &mut self.routines[top as usize];
        rt.line_min = rt.line_min.min(line);
        rt.line_max = rt.line_max.max(line);
        if let Some(c) = self.cur.as_mut() {
            c.routine = top;
        }
    }

    fn finish_instruction(&mut self, c: Cur, next: u32) {
        // An interrupt's entry fetches an opcode and throws it away: the
        // vector read says so, and the instruction did not run.
        let interrupt = c.vector.filter(|_| c.op != ops::BRK || c.vector == Some(0xfffa)).map(|v| match v {
            0xfffa => Entry::Nmi,
            0xfffc => Entry::Reset,
            _ => {
                if c.op == ops::BRK {
                    Entry::Brk
                } else {
                    Entry::Irq
                }
            }
        });
        let fallthrough = c.key.wrapping_add(ops::len(c.op) as u32);
        let cycles = c.cycles as u64 + c.held as u64;
        let fr = c.frame as usize;
        if interrupt.is_none() || interrupt == Some(Entry::Brk) {
            self.instructions += 1;
            let frame = c.frame;
            let routine = c.routine;
            let site = self.sites.entry(c.key).or_insert_with(|| Site { addr: c.addr, op: c.op, first: frame, routine, ..Default::default() });
            site.count += 1;
            site.cycles += cycles;
            site.last = frame;
            for &(addr, read) in &c.accesses {
                if read {
                    site.data_reads += 1;
                } else {
                    site.data_writes += 1;
                }
                if addr == 0xffff {
                    continue; // the stack, or the ROM
                }
                site.span = Some(site.span.map_or((addr, addr), |(lo, hi)| (lo.min(addr), hi.max(addr))));
                let list = if read { &mut site.reads } else { &mut site.writes };
                if let Some(e) = list.iter_mut().find(|e| e.0 == addr) {
                    e.1 += 1;
                } else if list.len() < 4 {
                    list.push((addr, 1));
                }
            }
            if let Some(b) = c.b1 {
                site.b1 = b;
            }
            if let Some(b) = c.b2 {
                site.b2 = b;
            }
            if next == c.key && (ops::is_branch(c.op) || c.op == ops::JMP_ABS) {
                if let Some(f) = self.frames.get_mut(fr) {
                    f.idle += cycles as u32;
                }
            }
            if next != fallthrough && (ops::is_branch(c.op) || c.op == ops::JMP_ABS) {
                *self.edges.entry((c.key, next)).or_insert(0) += 1;
            }
        }
        if c.routine != u32::MAX {
            let rt = &mut self.routines[c.routine as usize];
            rt.excl += cycles;
            rt.body.insert(c.key);
            if rt.last_frame != c.frame {
                rt.last_frame = c.frame;
                rt.frames_run += 1;
                if let Some(f) = self.frames.get_mut(fr) {
                    f.routines.push(c.routine);
                }
            }
            let mut seen: Vec<u32> = Vec::with_capacity(self.stack.len());
            for f in &self.stack {
                if !seen.contains(&f.routine) {
                    seen.push(f.routine);
                    self.routines[f.routine as usize].incl += cycles;
                }
            }
        }
        if c.op == ops::RTI && interrupt.is_none() {
            if let Some(top) = self.stack.last() {
                if self.routines[top.routine as usize].entry == Entry::Nmi {
                    if let Some(f) = self.frames.get_mut(fr) {
                        f.rti_line = Some(c.line);
                    }
                }
            }
        }
        // A frame left by a pull rather than its RTS is a jump engine's:
        // remember its call site for the JMP (ind) that follows.
        if matches!(ops::name(c.op), "PLA" | "PLP") {
            if let (Some(s), Some(top)) = (c.s, self.stack.last()) {
                if (s as i32) + 1 >= top.s_gone {
                    if let Some((site, at)) = top.site {
                        self.orphan = Some((site, at, self.instructions));
                    }
                }
            }
        }
        self.pending = if let Some(e) = interrupt {
            Pending::Interrupt(e)
        } else if c.op == ops::JSR {
            Pending::Call(c.key, c.addr)
        } else if c.op == ops::JMP_IND {
            match self.orphan.take() {
                Some((site, at, n)) if self.instructions - n < 64 => Pending::Dispatch(site, at),
                _ => Pending::Dispatch(c.key, c.addr),
            }
        } else {
            Pending::None
        };
    }

    /// Everything the run says, as JSON.
    pub fn report(&mut self) -> String {
        if let Some(c) = self.cur.take() {
            self.finish_instruction(c, u32::MAX);
        }
        serde_json::to_string(&self.build()).unwrap()
    }

    fn build(&self) -> Report {
        let frames = self.frames.len() as u32;
        // Sites, in ROM order, with the routine each first ran in.
        let mut keys: Vec<&u32> = self.sites.keys().collect();
        keys.sort();
        let sites: Vec<SiteOut> = keys
            .iter()
            .map(|k| {
                let s = &self.sites[k];
                SiteOut {
                    key: **k,
                    addr: s.addr,
                    op: s.op,
                    text: ops::text(s.op, s.addr, s.b1, s.b2),
                    documented: ops::documented(s.op),
                    count: s.count,
                    cycles: s.cycles,
                    first: s.first,
                    last: s.last,
                    routine: s.routine,
                    reads: s.reads.clone(),
                    writes: s.writes.clone(),
                    span: s.span,
                }
            })
            .collect();

        // The page the sprite DMA took most often, when it took one; only

        // the pages of RAM count, since the DMA can only see them here.

        // The page the sprite DMA took most often, when it took one; only
        // the pages of RAM count, since that is all the DMA can see here.
        let oam_page: Option<u8> = (0..8u8).filter(|&p| self.oam_pages[p as usize] > 0).max_by_key(|&p| self.oam_pages[p as usize]);
        let routines: Vec<RoutineOut> = self
            .routines
            .iter()
            .enumerate()
            .map(|(i, r)| {
                let mut callers: Vec<_> = r.callers.iter().map(|((cr, at), n)| (*cr, *at, *n)).collect();
                callers.sort_by(|a, b| b.2.cmp(&a.2).then(a.0.cmp(&b.0)).then(a.1.cmp(&b.1)));
                let mut body: Vec<u32> = r.body.iter().copied().collect();
                body.sort();
                RoutineOut {
                    id: i as u32,
                    key: r.key,
                    addr: r.addr,
                    entry: r.entry,
                    entered: r.entered,
                    excl: r.excl,
                    incl: r.incl,
                    frames: r.frames_run,
                    lines: if r.line_min == u16::MAX { None } else { Some((r.line_min, r.line_max)) },
                    callers,
                    body,
                    tags: tags(r),
                    rom_reads: r.rom_reads,
                    mem: {
                        let mut m: Vec<(u16, u32, u32)> = r.mem.iter().map(|(&a, &(rd, wr))| (a, rd, wr)).collect();
                        m.sort_by(|a, b| (b.1 + b.2).cmp(&(a.1 + a.2)).then(a.0.cmp(&b.0)));
                        m.truncate(64);
                        m
                    },
                    in_frame: {
                        let mut v: Vec<(u16, u32, u32)> = r.in_frame.iter().map(|(&a, &(p, b))| (a, p, b)).collect();
                        v.sort();
                        v
                    },
                    vram: {
                        let mut v: Vec<(&'static str, u32)> = r.vram.iter().map(|(&k, &n)| (k, n)).collect();
                        v.sort();
                        v
                    },
                    oam_writes: oam_page.map_or(0, |p| r.ram_pages[p as usize]),
                }
            })
            .collect();

        let loops = self.loops();
        let variables = self.variables();
        let modes = self.modes();
        let input = self.input();
        let mut dispatch: Vec<DispatchOut> = self
            .dispatch
            .values()
            .map(|d| {
                let mut targets: Vec<_> = d.targets.iter().map(|(r, n)| (*r, *n)).collect();
                targets.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
                DispatchOut { key: d.key, addr: d.addr, depth: d.depth_min, targets, timeline: d.timeline.clone() }
            })
            .collect();
        dispatch.sort_by_key(|d| (d.depth, d.addr));

        Report {
            version: 1,
            prg_len: self.prg_len,
            frames,
            cycles: self.cycles,
            held: self.held,
            instructions: self.instructions,
            records: self.records,
            pad2: self.pad2_used,
            sites,
            routines,
            loops,
            variables,
            oam_page,
            dispatch,
            modes,
            input,
            timeline: TimelineOut {
                cycles: self.frames.iter().map(|f| f.cycles).collect(),
                idle: self.frames.iter().map(|f| f.idle).collect(),
                nmi: self.frames.iter().map(|f| f.nmi_line.map_or(-1, |l| l as i32)).collect(),
                rti: self.frames.iter().map(|f| f.rti_line.map_or(-1, |l| l as i32)).collect(),
                pad: self.frames.iter().map(|f| f.pad).collect(),
            },
        }
    }

    fn loops(&self) -> Vec<LoopOut> {
        let mut out = Vec::new();
        for (&(from, to), &n) in &self.edges {
            if to > from || (from ^ to) & RAM_KEY != 0 || from - to > 1024 {
                continue;
            }
            let (Some(head), Some(tail)) = (self.sites.get(&to), self.sites.get(&from)) else { continue };
            let entries = head.count.saturating_sub(n);
            let body: Vec<&Site> = (to..=from).filter_map(|k| self.sites.get(&k)).collect();
            let writes: u64 = body.iter().map(|s| s.data_writes).sum();
            let mut reads: HashMap<u16, u64> = HashMap::new();
            for s in &body {
                for &(a, c) in &s.reads {
                    *reads.entry(a).or_insert(0) += c as u64;
                }
            }
            let on = reads.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0))).map(|(a, _)| *a);
            let kind = if from == to {
                "idle"
            } else if writes == 0 && on.is_some() && from - to <= 32 {
                "wait"
            } else {
                "work"
            };
            out.push(LoopOut {
                head: to,
                tail: from,
                head_addr: head.addr,
                tail_addr: tail.addr,
                kind,
                iterations: n,
                entries,
                on: if kind == "wait" { on } else { None },
                cycles: body.iter().map(|s| s.cycles).sum(),
                routine: head.routine,
            });
        }
        out.sort_by(|a, b| b.cycles.cmp(&a.cycles).then(a.head.cmp(&b.head)).then(a.tail.cmp(&b.tail)));
        out
    }

    fn variables(&self) -> Vec<VarOut> {
        let mut by: HashMap<u16, (Vec<(u32, u32)>, Vec<(u32, u32)>)> = HashMap::new();
        for (i, r) in self.routines.iter().enumerate() {
            for (&a, &(rd, wr)) in &r.mem {
                if !(a < 0x0100 || (0x0200..0x0800).contains(&a) || (0x6000..0x8000).contains(&a)) {
                    continue;
                }
                let e = by.entry(a).or_default();
                if wr > 0 {
                    e.0.push((i as u32, wr));
                }
                if rd > 0 {
                    e.1.push((i as u32, rd));
                }
            }
        }
        let mut out: Vec<VarOut> = by
            .into_iter()
            .filter(|(_, (w, r))| !w.is_empty() && r.iter().any(|(ri, _)| w.iter().all(|(wi, _)| wi != ri)))
            .map(|(addr, (mut writers, mut readers))| {
                writers.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
                readers.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
                let total = writers.iter().chain(readers.iter()).map(|x| x.1 as u64).sum();
                VarOut { addr, writers, readers, total }
            })
            .collect();
        out.sort_by(|a, b| b.total.cmp(&a.total).then(a.addr.cmp(&b.addr)));
        out.truncate(512);
        out
    }

    /// Frames' routine sets, less the routines nearly every frame runs.
    fn frame_sets(&self) -> Vec<HashSet<u32>> {
        let n = self.frames.len().max(1) as f64;
        let common: HashSet<u32> = self.routines.iter().enumerate().filter(|(_, r)| r.frames_run as f64 >= 0.95 * n).map(|(i, _)| i as u32).collect();
        self.frames.iter().map(|f| f.routines.iter().copied().filter(|r| !common.contains(r)).collect()).collect()
    }

    fn modes(&self) -> ModesOut {
        const W: usize = 15;
        let sets = self.frame_sets();
        let n = sets.len();
        let union = |a: usize, b: usize| -> HashSet<u32> { sets[a.min(n)..b.min(n)].iter().flatten().copied().collect() };
        let jac = |x: &HashSet<u32>, y: &HashSet<u32>| -> f64 {
            let u = x.union(y).count();
            if u == 0 {
                1.0
            } else {
                x.intersection(y).count() as f64 / u as f64
            }
        };
        // Change points: where the routines of the window before and the
        // window after have little in common, at the least of them.
        let score: Vec<f64> = (0..n).map(|f| if f < W || f + W > n { 1.0 } else { jac(&union(f - W, f), &union(f, f + W)) }).collect();
        let mut cuts = vec![0usize];
        let mut f = W;
        while f + W <= n {
            if score[f] < 0.5 {
                let end = (f + W).min(n);
                let best = (f..end).min_by(|a, b| score[*a].partial_cmp(&score[*b]).unwrap()).unwrap();
                if best - cuts.last().unwrap() >= W {
                    cuts.push(best);
                }
                f = best + W;
            } else {
                f += 1;
            }
        }
        cuts.push(n);
        // Segments that look alike are one mode.
        let mut modes: Vec<(HashSet<u32>, Vec<usize>)> = Vec::new();
        let mut segments = Vec::new();
        for w in cuts.windows(2) {
            let (a, b) = (w[0], w[1]);
            if a >= b {
                continue;
            }
            let u = union(a, b);
            let m = match modes.iter().position(|(mu, _)| jac(mu, &u) >= 0.7) {
                Some(i) => i,
                None => {
                    modes.push((u.clone(), Vec::new()));
                    modes.len() - 1
                }
            };
            modes[m].1.push(segments.len());
            segments.push((a as u32, (b - 1) as u32, m as u32));
        }
        // A mode's own routines: in half its frames or more, and in few
        // frames outside it.
        let modes_out = modes
            .iter()
            .enumerate()
            .map(|(mi, _)| {
                let inside: Vec<usize> = segments.iter().filter(|s| s.2 == mi as u32).flat_map(|s| s.0 as usize..=s.1 as usize).collect();
                let outside = n - inside.len();
                let mut count_in: HashMap<u32, usize> = HashMap::new();
                for &f in &inside {
                    for &r in &sets[f] {
                        *count_in.entry(r).or_insert(0) += 1;
                    }
                }
                let mut own: Vec<(u32, f32)> = count_in
                    .into_iter()
                    .filter_map(|(r, c)| {
                        let total = self.routines[r as usize].frames_run as usize;
                        let out = total.saturating_sub(c);
                        let pin = c as f32 / inside.len().max(1) as f32;
                        let pout = if outside == 0 { 0.0 } else { out as f32 / outside as f32 };
                        (pin >= 0.5 && pout <= 0.1).then_some((r, pin))
                    })
                    .collect();
                own.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap().then(a.0.cmp(&b.0)));
                own.truncate(12);
                ModeOut { id: mi as u32, frames: inside.len() as u32, own: own.into_iter().map(|x| x.0).collect() }
            })
            .collect();
        ModesOut { segments, modes: modes_out }
    }

    fn input(&self) -> Vec<ButtonOut> {
        const NAMES: [&str; 8] = ["A", "B", "Select", "Start", "Up", "Down", "Left", "Right"];
        let n = self.frames.len();
        let ran: Vec<HashSet<u32>> = self.frames.iter().map(|f| f.routines.iter().copied().collect()).collect();
        let mut out = Vec::new();
        for (b, name) in NAMES.iter().enumerate() {
            let held: Vec<bool> = self.frames.iter().map(|f| f.pad >> b & 1 != 0).collect();
            let nh = held.iter().filter(|h| **h).count();
            if nh < 3 || nh == n {
                continue;
            }
            let onsets: Vec<usize> = (1..n).filter(|&f| held[f] && !held[f - 1]).collect();
            let mut while_held = Vec::new();
            let mut after_press = Vec::new();
            for (i, r) in self.routines.iter().enumerate() {
                let i = i as u32;
                let with = (0..n).filter(|&f| held[f] && ran[f].contains(&i)).count();
                let without = (0..n).filter(|&f| !held[f] && ran[f].contains(&i)).count();
                let p1 = with as f32 / nh as f32;
                let p0 = without as f32 / (n - nh) as f32;
                if p1 >= 0.6 && p0 <= 0.1 {
                    while_held.push((i, p1, p0));
                }
                if !onsets.is_empty() {
                    let hit = onsets.iter().filter(|&&o| (o..(o + 4).min(n)).any(|f| ran[f].contains(&i))).count();
                    let q1 = hit as f32 / onsets.len() as f32;
                    let p = r.frames_run as f32 / n as f32;
                    let q0 = 1.0 - (1.0 - p).powi(4);
                    if q1 >= 0.6 && q0 <= 0.2 {
                        after_press.push((i, q1, q0));
                    }
                }
            }
            while_held.sort_by(|a, b| (b.1 - b.2).partial_cmp(&(a.1 - a.2)).unwrap().then(a.0.cmp(&b.0)));
            after_press.sort_by(|a, b| (b.1 - b.2).partial_cmp(&(a.1 - a.2)).unwrap().then(a.0.cmp(&b.0)));
            while_held.truncate(8);
            after_press.truncate(8);
            out.push(ButtonOut { button: name, held: nh as u32, presses: onsets.len() as u32, while_held, after_press });
        }
        out
    }
}

/// What a routine touches, in words: the hardware it drives.
fn tags(r: &Routine) -> Vec<&'static str> {
    let mut t = Vec::new();
    let has = |f: &dyn Fn(u16, u32, u32) -> bool| r.mem.iter().any(|(&a, &(rd, wr))| f(a, rd, wr));
    if has(&|a, rd, _| (a == 0x4016 || a == 0x4017) && rd > 0) {
        t.push("pad");
    }
    if has(&|a, _, wr| (0x4000..=0x4013).contains(&a) && wr > 0 || a == 0x4015 && wr > 0) {
        t.push("sound");
    }
    if has(&|a, _, wr| a == 0x4014 && wr > 0) {
        t.push("sprite-dma");
    }
    if has(&|a, _, wr| a == 0x2007 && wr > 0) {
        t.push("vram");
    }
    if has(&|a, _, wr| a == 0x2005 && wr > 0) {
        t.push("scroll");
    }
    if has(&|a, _, wr| (a == 0x2000 || a == 0x2001) && wr > 0) {
        t.push("ppu-control");
    }
    if has(&|a, rd, _| a == 0x2002 && rd > 0) {
        t.push("ppu-status");
    }
    if has(&|a, _, wr| a >= 0x8000 && wr > 0) {
        t.push("mapper");
    }
    if has(&|a, _, _| (0x6000..0x8000).contains(&a)) {
        t.push("cart-ram");
    }
    t
}

#[derive(Serialize)]
struct Report {
    version: u32,
    prg_len: u32,
    frames: u32,
    cycles: u64,
    held: u64,
    instructions: u64,
    records: u64,
    pad2: bool,
    sites: Vec<SiteOut>,
    routines: Vec<RoutineOut>,
    loops: Vec<LoopOut>,
    variables: Vec<VarOut>,
    /// The RAM page the sprite DMA took most often, when it took one.
    oam_page: Option<u8>,
    dispatch: Vec<DispatchOut>,
    modes: ModesOut,
    input: Vec<ButtonOut>,
    timeline: TimelineOut,
}

#[derive(Serialize)]
struct SiteOut {
    key: u32,
    addr: u16,
    op: u8,
    text: String,
    documented: bool,
    count: u64,
    cycles: u64,
    first: u32,
    last: u32,
    routine: u32,
    /// The addresses it read and wrote below the ROM (the stack aside),
    /// with counts, up to four each; and the lowest and highest of them.
    reads: Vec<(u16, u32)>,
    writes: Vec<(u16, u32)>,
    span: Option<(u16, u16)>,
}

#[derive(Serialize)]
struct RoutineOut {
    id: u32,
    key: u32,
    addr: u16,
    entry: Entry,
    entered: u64,
    excl: u64,
    incl: u64,
    frames: u32,
    lines: Option<(u16, u16)>,
    callers: Vec<(u32, u16, u64)>,
    body: Vec<u32>,
    tags: Vec<&'static str>,
    rom_reads: u64,
    /// What it read and wrote outside the ROM (and the mapper registers
    /// it wrote in the ROM's window): address, reads, writes; the 64 it
    /// touched most.
    mem: Vec<(u16, u32, u32)>,
    /// The hardware it touched by where the beam was: address, accesses
    /// while the picture was drawing, accesses in the blank. PPU
    /// registers, $4014, and the mapper as $8000.
    in_frame: Vec<(u16, u32, u32)>,
    /// Writes of $2007 by VRAM region: pattern, name 0 to 3, palette.
    vram: Vec<(&'static str, u32)>,
    /// Writes into the page the sprite DMA takes (the report's oam_page).
    oam_writes: u32,
}

#[derive(Serialize)]
struct LoopOut {
    head: u32,
    tail: u32,
    head_addr: u16,
    tail_addr: u16,
    kind: &'static str,
    iterations: u64,
    entries: u64,
    on: Option<u16>,
    cycles: u64,
    routine: u32,
}

#[derive(Serialize)]
struct VarOut {
    addr: u16,
    writers: Vec<(u32, u32)>,
    readers: Vec<(u32, u32)>,
    total: u64,
}

#[derive(Serialize)]
struct DispatchOut {
    key: u32,
    addr: u16,
    depth: u32,
    targets: Vec<(u32, u64)>,
    timeline: Vec<(u32, u32, u32)>,
}

#[derive(Serialize)]
struct ModesOut {
    segments: Vec<(u32, u32, u32)>,
    modes: Vec<ModeOut>,
}

#[derive(Serialize)]
struct ModeOut {
    id: u32,
    frames: u32,
    own: Vec<u32>,
}

#[derive(Serialize)]
struct ButtonOut {
    button: &'static str,
    held: u32,
    presses: u32,
    while_held: Vec<(u32, f32, f32)>,
    after_press: Vec<(u32, f32, f32)>,
}

#[derive(Serialize)]
struct TimelineOut {
    cycles: Vec<u32>,
    idle: Vec<u32>,
    nmi: Vec<i32>,
    rti: Vec<i32>,
    pad: Vec<u8>,
}

#[cfg(target_arch = "wasm32")]
mod bridge {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub struct FlowTool {
        f: super::Flow,
    }

    #[wasm_bindgen]
    impl FlowTool {
        #[wasm_bindgen(constructor)]
        pub fn new(prg_len: u32) -> FlowTool {
            FlowTool { f: super::Flow::new(prg_len) }
        }

        pub fn feed(&mut self, bytes: &[u8]) {
            self.f.feed(bytes);
        }

        pub fn report(&mut self) -> String {
            self.f.report()
        }
    }
}
