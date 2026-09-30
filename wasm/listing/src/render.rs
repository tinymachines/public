//! The listing rendered for reading: the address and the bytes each line
//! occupies beside the text, derived from the model, never stored in it.

use crate::asm;
use crate::model::{Item, Kind, Listing};
use crate::text::instr_text;

pub fn render(l: &Listing) -> Result<String, asm::AsmError> {
    let rom = asm::assemble(l)?;
    let (_, at) = asm::addresses(l)?;
    let mut out = String::new();
    let mut bank = 0usize;
    let mut off = 0usize;
    let mut first = true;
    for (i, item) in l.items.iter().enumerate() {
        while bank + 1 < l.banks.len() && l.banks[bank + 1].first <= i {
            bank += 1;
            off = 0;
            first = true;
        }
        if first && !l.banks.is_empty() && l.banks[bank].first == i {
            let b = &l.banks[bank];
            out.push_str(&format!("\n{} bank {}{}, {} bytes\n\n", match b.kind { Kind::Prg => "PRG", Kind::Chr => "CHR" }, b.index, if b.kind == Kind::Prg { format!(" at ${:04X}", b.org) } else { String::new() }, b.len));
            first = false;
        }
        let b = &l.banks[bank];
        let src = match b.kind {
            Kind::Prg => &rom.prg,
            Kind::Chr => &rom.chr,
        };
        let n = item.len();
        let bytes = &src[b.offset + off..b.offset + off + n];
        let hex = bytes.iter().map(|x| format!("{x:02X}")).collect::<Vec<_>>().join(" ");
        let addr = if b.kind == Kind::Prg { format!("${:04X}", at[i]) } else { format!("{:05X}", b.offset + off) };
        let text = match item {
            Item::Label(name) => format!("{name}:"),
            Item::Directive { name, rest } => format!(";; @{name} {rest}").trim_end().to_string(),
            Item::Prose(t) => format!(";; {t}"),
            Item::Note(t) => format!("; {t}"),
            Item::Instr { op, operand, comment } => with_comment(&format!("    {}", instr_text(*op, operand)), comment),
            Item::Bytes { bytes, comment } => with_comment(&format!("    .byte {}", bytes.iter().map(|x| format!("${x:02X}")).collect::<Vec<_>>().join(",")), comment),
            Item::Word { value, label, comment } => with_comment(&format!("    .word {}", label.clone().unwrap_or_else(|| format!("${value:04X}"))), comment),
        };
        if n == 0 {
            if matches!(item, Item::Label(_)) {
                out.push('\n');
            }
            out.push_str(&format!("{:<6} {:<48}{text}\n", "", ""));
        } else {
            out.push_str(&format!("{addr:<6} {hex:<48}{text}\n"));
        }
        off += n;
    }
    Ok(out)
}

fn with_comment(s: &str, c: &Option<String>) -> String {
    match c {
        Some(c) => format!("{s:<32}; {c}"),
        None => s.to_string(),
    }
}
