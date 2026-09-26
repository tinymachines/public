//! The NMOS 6502's 256 opcodes: mnemonic, addressing mode, and whether
//! the part documents it. The flow tools need an instruction's length
//! (to tell a taken branch from a fall-through), its kind of control
//! transfer, and a name to print; a trace carries the opcode and the
//! operand bytes as the CPU fetched them, so nothing else is needed.
//!
//! The undocumented opcodes carry the names the nesdev wiki uses; their
//! lengths are the part's (every opcode's length follows from its column
//! and row), so a game that uses one still traces cleanly.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Imp,
    Acc,
    Imm,
    Zp,
    Zpx,
    Zpy,
    Izx,
    Izy,
    Abs,
    Abx,
    Aby,
    Ind,
    Rel,
}

impl Mode {
    pub fn len(self) -> u16 {
        match self {
            Mode::Imp | Mode::Acc => 1,
            Mode::Abs | Mode::Abx | Mode::Aby | Mode::Ind => 3,
            _ => 2,
        }
    }
}

use Mode::*;

const TABLE: [(&str, Mode); 256] = [
    ("BRK", Imp), ("ORA", Izx), ("KIL", Imp), ("SLO", Izx), ("NOP", Zp), ("ORA", Zp), ("ASL", Zp), ("SLO", Zp),
    ("PHP", Imp), ("ORA", Imm), ("ASL", Acc), ("ANC", Imm), ("NOP", Abs), ("ORA", Abs), ("ASL", Abs), ("SLO", Abs),
    ("BPL", Rel), ("ORA", Izy), ("KIL", Imp), ("SLO", Izy), ("NOP", Zpx), ("ORA", Zpx), ("ASL", Zpx), ("SLO", Zpx),
    ("CLC", Imp), ("ORA", Aby), ("NOP", Imp), ("SLO", Aby), ("NOP", Abx), ("ORA", Abx), ("ASL", Abx), ("SLO", Abx),
    ("JSR", Abs), ("AND", Izx), ("KIL", Imp), ("RLA", Izx), ("BIT", Zp), ("AND", Zp), ("ROL", Zp), ("RLA", Zp),
    ("PLP", Imp), ("AND", Imm), ("ROL", Acc), ("ANC", Imm), ("BIT", Abs), ("AND", Abs), ("ROL", Abs), ("RLA", Abs),
    ("BMI", Rel), ("AND", Izy), ("KIL", Imp), ("RLA", Izy), ("NOP", Zpx), ("AND", Zpx), ("ROL", Zpx), ("RLA", Zpx),
    ("SEC", Imp), ("AND", Aby), ("NOP", Imp), ("RLA", Aby), ("NOP", Abx), ("AND", Abx), ("ROL", Abx), ("RLA", Abx),
    ("RTI", Imp), ("EOR", Izx), ("KIL", Imp), ("SRE", Izx), ("NOP", Zp), ("EOR", Zp), ("LSR", Zp), ("SRE", Zp),
    ("PHA", Imp), ("EOR", Imm), ("LSR", Acc), ("ALR", Imm), ("JMP", Abs), ("EOR", Abs), ("LSR", Abs), ("SRE", Abs),
    ("BVC", Rel), ("EOR", Izy), ("KIL", Imp), ("SRE", Izy), ("NOP", Zpx), ("EOR", Zpx), ("LSR", Zpx), ("SRE", Zpx),
    ("CLI", Imp), ("EOR", Aby), ("NOP", Imp), ("SRE", Aby), ("NOP", Abx), ("EOR", Abx), ("LSR", Abx), ("SRE", Abx),
    ("RTS", Imp), ("ADC", Izx), ("KIL", Imp), ("RRA", Izx), ("NOP", Zp), ("ADC", Zp), ("ROR", Zp), ("RRA", Zp),
    ("PLA", Imp), ("ADC", Imm), ("ROR", Acc), ("ARR", Imm), ("JMP", Ind), ("ADC", Abs), ("ROR", Abs), ("RRA", Abs),
    ("BVS", Rel), ("ADC", Izy), ("KIL", Imp), ("RRA", Izy), ("NOP", Zpx), ("ADC", Zpx), ("ROR", Zpx), ("RRA", Zpx),
    ("SEI", Imp), ("ADC", Aby), ("NOP", Imp), ("RRA", Aby), ("NOP", Abx), ("ADC", Abx), ("ROR", Abx), ("RRA", Abx),
    ("NOP", Imm), ("STA", Izx), ("NOP", Imm), ("SAX", Izx), ("STY", Zp), ("STA", Zp), ("STX", Zp), ("SAX", Zp),
    ("DEY", Imp), ("NOP", Imm), ("TXA", Imp), ("XAA", Imm), ("STY", Abs), ("STA", Abs), ("STX", Abs), ("SAX", Abs),
    ("BCC", Rel), ("STA", Izy), ("KIL", Imp), ("AHX", Izy), ("STY", Zpx), ("STA", Zpx), ("STX", Zpy), ("SAX", Zpy),
    ("TYA", Imp), ("STA", Aby), ("TXS", Imp), ("TAS", Aby), ("SHY", Abx), ("STA", Abx), ("SHX", Aby), ("AHX", Aby),
    ("LDY", Imm), ("LDA", Izx), ("LDX", Imm), ("LAX", Izx), ("LDY", Zp), ("LDA", Zp), ("LDX", Zp), ("LAX", Zp),
    ("TAY", Imp), ("LDA", Imm), ("TAX", Imp), ("LAX", Imm), ("LDY", Abs), ("LDA", Abs), ("LDX", Abs), ("LAX", Abs),
    ("BCS", Rel), ("LDA", Izy), ("KIL", Imp), ("LAX", Izy), ("LDY", Zpx), ("LDA", Zpx), ("LDX", Zpy), ("LAX", Zpy),
    ("CLV", Imp), ("LDA", Aby), ("TSX", Imp), ("LAS", Aby), ("LDY", Abx), ("LDA", Abx), ("LDX", Aby), ("LAX", Aby),
    ("CPY", Imm), ("CMP", Izx), ("NOP", Imm), ("DCP", Izx), ("CPY", Zp), ("CMP", Zp), ("DEC", Zp), ("DCP", Zp),
    ("INY", Imp), ("CMP", Imm), ("DEX", Imp), ("AXS", Imm), ("CPY", Abs), ("CMP", Abs), ("DEC", Abs), ("DCP", Abs),
    ("BNE", Rel), ("CMP", Izy), ("KIL", Imp), ("DCP", Izy), ("NOP", Zpx), ("CMP", Zpx), ("DEC", Zpx), ("DCP", Zpx),
    ("CLD", Imp), ("CMP", Aby), ("NOP", Imp), ("DCP", Aby), ("NOP", Abx), ("CMP", Abx), ("DEC", Abx), ("DCP", Abx),
    ("CPX", Imm), ("SBC", Izx), ("NOP", Imm), ("ISC", Izx), ("CPX", Zp), ("SBC", Zp), ("INC", Zp), ("ISC", Zp),
    ("INX", Imp), ("SBC", Imm), ("NOP", Imp), ("SBC", Imm), ("CPX", Abs), ("SBC", Abs), ("INC", Abs), ("ISC", Abs),
    ("BEQ", Rel), ("SBC", Izy), ("KIL", Imp), ("ISC", Izy), ("NOP", Zpx), ("SBC", Zpx), ("INC", Zpx), ("ISC", Zpx),
    ("SED", Imp), ("SBC", Aby), ("NOP", Imp), ("ISC", Aby), ("NOP", Abx), ("SBC", Abx), ("INC", Abx), ("ISC", Abx),
];

const DOCUMENTED: [&str; 56] = [
    "ADC", "AND", "ASL", "BCC", "BCS", "BEQ", "BIT", "BMI", "BNE", "BPL", "BRK", "BVC", "BVS", "CLC", "CLD", "CLI", "CLV", "CMP", "CPX",
    "CPY", "DEC", "DEX", "DEY", "EOR", "INC", "INX", "INY", "JMP", "JSR", "LDA", "LDX", "LDY", "LSR", "NOP", "ORA", "PHA", "PHP", "PLA",
    "PLP", "ROL", "ROR", "RTI", "RTS", "SBC", "SEC", "SED", "SEI", "STA", "STX", "STY", "TAX", "TAY", "TSX", "TXA", "TXS", "TYA",
];

pub fn name(op: u8) -> &'static str {
    TABLE[op as usize].0
}

pub fn mode(op: u8) -> Mode {
    TABLE[op as usize].1
}

/// The bytes the instruction occupies. BRK is one byte that skips a
/// second (it pushes PC + 2), so two is where the next instruction is.
pub fn len(op: u8) -> u16 {
    if op == 0x00 {
        2
    } else {
        mode(op).len()
    }
}

/// Whether the part documents the opcode: 151 of them. The NOPs and the
/// SBC that the undocumented rows repeat are not.
pub fn documented(op: u8) -> bool {
    let n = name(op);
    DOCUMENTED.contains(&n) && (n != "NOP" || op == 0xea) && op != 0xeb
}

pub const JSR: u8 = 0x20;
pub const RTS: u8 = 0x60;
pub const RTI: u8 = 0x40;
pub const JMP_ABS: u8 = 0x4c;
pub const JMP_IND: u8 = 0x6c;
pub const BRK: u8 = 0x00;

pub fn is_branch(op: u8) -> bool {
    mode(op) == Rel
}

/// The instruction as text, from its opcode, its address and the operand
/// bytes the CPU fetched.
pub fn text(op: u8, at: u16, b1: u8, b2: u8) -> String {
    let w = u16::from_le_bytes([b1, b2]);
    let n = name(op);
    match mode(op) {
        Imp => n.to_string(),
        Acc => format!("{n} A"),
        Imm => format!("{n} #${b1:02X}"),
        Zp => format!("{n} ${b1:02X}"),
        Zpx => format!("{n} ${b1:02X},X"),
        Zpy => format!("{n} ${b1:02X},Y"),
        Izx => format!("{n} (${b1:02X},X)"),
        Izy => format!("{n} (${b1:02X}),Y"),
        Abs => format!("{n} ${w:04X}"),
        Abx => format!("{n} ${w:04X},X"),
        Aby => format!("{n} ${w:04X},Y"),
        Ind => format!("{n} (${w:04X})"),
        Rel => format!("{n} ${:04X}", at.wrapping_add(2).wrapping_add(b1 as i8 as u16)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_part_documents_151() {
        assert_eq!((0..=255u8).filter(|&o| documented(o)).count(), 151);
    }

    #[test]
    fn lengths_follow_the_modes() {
        assert_eq!(len(0xa9), 2);
        assert_eq!(len(0x4c), 3);
        assert_eq!(len(0x6c), 3);
        assert_eq!(len(0x60), 1);
        assert_eq!(len(0x00), 2);
        assert_eq!(text(0xd0, 0x8133, 0xf7, 0), "BNE $812C");
        assert_eq!(text(0xbd, 0x8000, 0x16, 0x40), "LDA $4016,X");
    }
}
