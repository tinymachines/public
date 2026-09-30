//! The listing as text: written from the model and read back into it.
//! FORMAT.md is the standard this follows; the parser refuses a line it
//! does not understand, with its number, rather than skipping it.

use flow::ops::{self, Mode};

use crate::model::{Bank, Header, Item, Kind, Listing, Operand};

pub fn write(l: &Listing) -> String {
    let h = &l.header;
    let mut out = String::new();
    out.push_str(&format!(";; @listing 0\n;; @rom sha256={} mapper={} mirroring={} prg={} chr={}\n", h.sha256, h.mapper, h.mirroring, h.prg, h.chr));
    let mut next_bank = 0;
    for (i, item) in l.items.iter().enumerate() {
        while next_bank < l.banks.len() && l.banks[next_bank].first == i {
            let b = &l.banks[next_bank];
            out.push('\n');
            match b.kind {
                Kind::Prg => out.push_str(&format!(";; @bank prg {} org=${:04X} size={}{}\n", b.index, b.org, b.len, if b.fixed { " fixed" } else { " switched" })),
                Kind::Chr => out.push_str(&format!(";; @bank chr {} size={}\n", b.index, b.len)),
            }
            next_bank += 1;
        }
        match item {
            Item::Label(n) => {
                out.push('\n');
                out.push_str(n);
                out.push_str(":\n");
            }
            Item::Directive { name, rest } => {
                if rest.is_empty() {
                    out.push_str(&format!(";; @{name}\n"));
                } else {
                    out.push_str(&format!(";; @{name} {rest}\n"));
                }
            }
            Item::Prose(t) => out.push_str(&format!(";; {t}\n")),
            Item::Note(t) => out.push_str(&format!("; {t}\n")),
            Item::Instr { op, operand, comment } => {
                let mut s = format!("    {}", instr_text(*op, operand));
                if let Some(c) = comment {
                    s = format!("{s:<32}; {c}");
                }
                out.push_str(&s);
                out.push('\n');
            }
            Item::Bytes { bytes, comment } => {
                let mut s = format!("    .byte {}", bytes.iter().map(|b| format!("${b:02X}")).collect::<Vec<_>>().join(","));
                if let Some(c) = comment {
                    s = format!("{s:<32}; {c}");
                }
                out.push_str(&s);
                out.push('\n');
            }
            Item::Word { value, label, comment } => {
                let v = label.clone().unwrap_or_else(|| format!("${value:04X}"));
                let mut s = format!("    .word {v}");
                if let Some(c) = comment {
                    s = format!("{s:<32}; {c}");
                }
                out.push_str(&s);
                out.push('\n');
            }
        }
    }
    out
}

pub fn instr_text(op: u8, o: &Operand) -> String {
    let n = ops::name(op);
    let v = o.value;
    let lab = |o: &Operand| o.label.clone().unwrap_or_else(|| format!("${v:04X}"));
    if op == ops::BRK {
        return format!("BRK #${v:02X}");
    }
    match o.mode {
        Mode::Imp => n.to_string(),
        Mode::Acc => format!("{n} A"),
        Mode::Imm => format!("{n} #${v:02X}"),
        Mode::Zp => format!("{n} ${v:02X}"),
        Mode::Zpx => format!("{n} ${v:02X},X"),
        Mode::Zpy => format!("{n} ${v:02X},Y"),
        Mode::Izx => format!("{n} (${v:02X},X)"),
        Mode::Izy => format!("{n} (${v:02X}),Y"),
        Mode::Abs => format!("{n} {}", lab(o)),
        Mode::Abx => format!("{n} {},X", lab(o)),
        Mode::Aby => format!("{n} {},Y", lab(o)),
        Mode::Ind => format!("{n} ({})", lab(o)),
        Mode::Rel => format!("{n} {}", lab(o)),
    }
}

#[derive(Debug)]
pub struct ParseError {
    pub line: usize,
    pub what: String,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "line {}: {}", self.line, self.what)
    }
}

fn err(line: usize, what: impl Into<String>) -> ParseError {
    ParseError { line, what: what.into() }
}

fn split_comment(s: &str) -> (&str, Option<String>) {
    match s.find(';') {
        Some(k) => (s[..k].trim_end(), Some(s[k + 1..].trim().to_string())),
        None => (s.trim_end(), None),
    }
}

fn kv(rest: &str, key: &str) -> Option<String> {
    rest.split_whitespace().find_map(|t| t.strip_prefix(&format!("{key}=")).map(|v| v.to_string()))
}

fn number(s: &str, line: usize) -> Result<u16, ParseError> {
    let s = s.trim();
    if let Some(h) = s.strip_prefix('$') {
        u16::from_str_radix(h, 16).map_err(|_| err(line, format!("not a hex number: {s}")))
    } else {
        s.parse::<u16>().map_err(|_| err(line, format!("not a number: {s}")))
    }
}

fn is_label(s: &str) -> bool {
    let mut c = s.chars();
    matches!(c.next(), Some(x) if x.is_ascii_alphabetic() || x == '_') && c.all(|x| x.is_ascii_alphanumeric() || x == '_')
}

/// An address-like operand token: `$12`, `$1234` or a label. Hex digit
/// count decides zero page against absolute, as an assembler would.
enum Addr {
    Zp(u16),
    Abs(u16),
    Label(String),
}

fn addr(tok: &str, line: usize) -> Result<Addr, ParseError> {
    if let Some(h) = tok.strip_prefix('$') {
        let v = u16::from_str_radix(h, 16).map_err(|_| err(line, format!("not a hex number: {tok}")))?;
        Ok(if h.len() <= 2 { Addr::Zp(v) } else { Addr::Abs(v) })
    } else if is_label(tok) {
        Ok(Addr::Label(tok.to_string()))
    } else {
        Err(err(line, format!("not an address or a label: {tok}")))
    }
}

fn operand(mnem: &str, text: &str, line: usize) -> Result<Operand, ParseError> {
    let t = text.trim();
    let op = |mode: Mode, value: u16, label: Option<String>| Operand { mode, value, label };
    let is_branch = matches!(mnem, "BPL" | "BMI" | "BVC" | "BVS" | "BCC" | "BCS" | "BNE" | "BEQ");
    if t.is_empty() {
        return Ok(op(Mode::Imp, 0, None));
    }
    if t == "A" {
        return Ok(op(Mode::Acc, 0, None));
    }
    if let Some(imm) = t.strip_prefix('#') {
        let v = number(imm, line)?;
        if v > 0xff {
            return Err(err(line, format!("immediate does not fit a byte: {t}")));
        }
        return Ok(op(Mode::Imm, v, None));
    }
    if let Some(inner) = t.strip_prefix('(') {
        if let Some(body) = inner.strip_suffix(",X)") {
            return match addr(body, line)? {
                Addr::Zp(v) => Ok(op(Mode::Izx, v, None)),
                _ => Err(err(line, format!("(zp,X) takes a zero-page address: {t}"))),
            };
        }
        if let Some(body) = inner.strip_suffix("),Y") {
            return match addr(body, line)? {
                Addr::Zp(v) => Ok(op(Mode::Izy, v, None)),
                _ => Err(err(line, format!("(zp),Y takes a zero-page address: {t}"))),
            };
        }
        if let Some(body) = inner.strip_suffix(')') {
            return match addr(body, line)? {
                Addr::Zp(v) | Addr::Abs(v) => Ok(op(Mode::Ind, v, None)),
                Addr::Label(l) => Ok(op(Mode::Ind, 0, Some(l))),
            };
        }
        return Err(err(line, format!("unbalanced operand: {t}")));
    }
    let (body, index) = if let Some(b) = t.strip_suffix(",X") {
        (b, Some('X'))
    } else if let Some(b) = t.strip_suffix(",Y") {
        (b, Some('Y'))
    } else {
        (t, None)
    };
    let a = addr(body, line)?;
    if is_branch {
        return match (a, index) {
            (Addr::Abs(v), None) | (Addr::Zp(v), None) => Ok(op(Mode::Rel, v, None)),
            (Addr::Label(l), None) => Ok(op(Mode::Rel, 0, Some(l))),
            _ => Err(err(line, format!("a branch takes a plain target: {t}"))),
        };
    }
    Ok(match (a, index) {
        (Addr::Zp(v), None) => op(Mode::Zp, v, None),
        (Addr::Zp(v), Some('X')) => op(Mode::Zpx, v, None),
        (Addr::Zp(v), Some('Y')) => op(Mode::Zpy, v, None),
        (Addr::Abs(v), None) => op(Mode::Abs, v, None),
        (Addr::Abs(v), Some('X')) => op(Mode::Abx, v, None),
        (Addr::Abs(v), Some('Y')) => op(Mode::Aby, v, None),
        (Addr::Label(l), None) => op(Mode::Abs, 0, Some(l)),
        (Addr::Label(l), Some('X')) => op(Mode::Abx, 0, Some(l)),
        (Addr::Label(l), Some('Y')) => op(Mode::Aby, 0, Some(l)),
        _ => unreachable!(),
    })
}

/// The opcode for a mnemonic in a mode, among the documented ones. A
/// zero-page form asked of an instruction that has none (JMP $12) is
/// widened to absolute, as an assembler would.
pub fn opcode(mnem: &str, mode: Mode) -> Option<(u8, Mode)> {
    let find = |m: Mode| (0..=255u8).find(|&o| ops::documented(o) && ops::name(o) == mnem && ops::mode(o) == m).map(|o| (o, m));
    find(mode).or_else(|| match mode {
        Mode::Zp => find(Mode::Abs),
        Mode::Zpx => find(Mode::Abx),
        Mode::Zpy => find(Mode::Aby),
        _ => None,
    })
}

pub fn parse(src: &str) -> Result<Listing, ParseError> {
    let mut header: Option<Header> = None;
    let mut banks: Vec<Bank> = Vec::new();
    let mut items: Vec<Item> = Vec::new();
    let mut version_seen = false;
    for (k, raw) in src.lines().enumerate() {
        let line = k + 1;
        let s = raw.trim_end();
        if s.trim().is_empty() {
            continue;
        }
        if let Some(d) = s.strip_prefix(";;") {
            let d = d.trim();
            if let Some(rest) = d.strip_prefix('@') {
                let (name, rest) = rest.split_once(char::is_whitespace).map(|(a, b)| (a, b.trim())).unwrap_or((rest, ""));
                match name {
                    "listing" => {
                        if rest != "0" {
                            return Err(err(line, format!("listing format {rest} is not one this tool reads (it reads 0)")));
                        }
                        version_seen = true;
                    }
                    "rom" => {
                        let get = |key: &str| kv(rest, key).ok_or_else(|| err(line, format!("@rom needs {key}=")));
                        header = Some(Header {
                            sha256: get("sha256")?,
                            mapper: get("mapper")?.parse().map_err(|_| err(line, "mapper is a number"))?,
                            mirroring: get("mirroring")?,
                            prg: get("prg")?.parse().map_err(|_| err(line, "prg is a byte count"))?,
                            chr: get("chr")?.parse().map_err(|_| err(line, "chr is a byte count"))?,
                        });
                    }
                    "bank" => {
                        let mut t = rest.split_whitespace();
                        let kind = match t.next() {
                            Some("prg") => Kind::Prg,
                            Some("chr") => Kind::Chr,
                            _ => return Err(err(line, "@bank is prg or chr")),
                        };
                        let index: usize = t.next().and_then(|x| x.parse().ok()).ok_or_else(|| err(line, "@bank needs an index"))?;
                        let len: usize = kv(rest, "size").and_then(|x| x.parse().ok()).ok_or_else(|| err(line, "@bank needs size="))?;
                        let org = match kind {
                            Kind::Prg => number(&kv(rest, "org").ok_or_else(|| err(line, "a prg bank needs org="))?, line)?,
                            Kind::Chr => 0,
                        };
                        let offset = banks.iter().filter(|b| b.kind == kind).map(|b| b.len).sum();
                        let fixed = rest.split_whitespace().any(|w| w == "fixed");
                        banks.push(Bank { kind, index, org, offset, len, fixed, first: items.len() });
                    }
                    _ => items.push(Item::Directive { name: name.to_string(), rest: rest.to_string() }),
                }
            } else {
                items.push(Item::Prose(d.to_string()));
            }
            continue;
        }
        if let Some(c) = s.strip_prefix(';') {
            items.push(Item::Note(c.trim().to_string()));
            continue;
        }
        if !version_seen || header.is_none() {
            return Err(err(line, "the file must start with ;; @listing 0 and ;; @rom"));
        }
        if banks.is_empty() {
            return Err(err(line, "a line of code or data before any ;; @bank"));
        }
        if !s.starts_with(char::is_whitespace) {
            let (body, comment) = split_comment(s);
            let name = body.strip_suffix(':').ok_or_else(|| err(line, format!("a line in column one is a label ending in a colon: {body}")))?;
            if !is_label(name) {
                return Err(err(line, format!("not a label name: {name}")));
            }
            items.push(Item::Label(name.to_string()));
            if let Some(c) = comment {
                items.push(Item::Note(c));
            }
            continue;
        }
        let (body, comment) = split_comment(s.trim());
        if let Some(list) = body.strip_prefix(".byte") {
            let mut bytes = Vec::new();
            for tok in list.split(',') {
                let v = number(tok, line)?;
                if v > 0xff {
                    return Err(err(line, format!(".byte takes bytes: {tok}")));
                }
                bytes.push(v as u8);
            }
            if bytes.is_empty() {
                return Err(err(line, ".byte with nothing after it"));
            }
            items.push(Item::Bytes { bytes, comment });
            continue;
        }
        if let Some(w) = body.strip_prefix(".word") {
            let w = w.trim();
            let (value, label) = match addr(w, line)? {
                Addr::Zp(v) | Addr::Abs(v) => (v, None),
                Addr::Label(l) => (0, Some(l)),
            };
            items.push(Item::Word { value, label, comment });
            continue;
        }
        let (mnem, rest) = body.split_once(char::is_whitespace).unwrap_or((body, ""));
        let mnem = mnem.to_ascii_uppercase();
        let o = operand(&mnem, rest, line)?;
        // BRK is two bytes; its second is written as an immediate (FORMAT.md).
        let (op, mode) = if mnem == "BRK" && matches!(o.mode, Mode::Imm | Mode::Imp) {
            (ops::BRK, Mode::Imm)
        } else {
            opcode(&mnem, o.mode).ok_or_else(|| err(line, format!("{mnem} has no {} form", crate::model::mode_name(o.mode))))?
        };
        items.push(Item::Instr { op, operand: Operand { mode, ..o }, comment });
    }
    let header = header.ok_or_else(|| err(0, "no ;; @rom line"))?;
    Ok(Listing { header, banks, items })
}
