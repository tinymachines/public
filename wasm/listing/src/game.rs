//! The game model in its first form: what a listing's marks say about
//! the game, as JSON, with nothing of the ROM's bytes in it. Routines
//! with how they were entered and which patterns they are, the jump
//! engines' tables, the loops a rule named, the arrays and the shared
//! bytes of RAM, and the coverage. The listing is the one copy of every fact here; this is a
//! reading of it for the union across games and for a page.

use serde_json::{json, Map, Value};

use crate::asm;
use crate::model::{Item, Kind, Listing};

/// `key=value` words of a mark's rest, and the words that are not.
fn fields(rest: &str) -> (Vec<String>, Map<String, Value>) {
    let mut words = Vec::new();
    let mut kv = Map::new();
    for w in rest.split_whitespace() {
        match w.split_once('=') {
            Some((k, v)) => {
                let v = v.parse::<u64>().map(Value::from).unwrap_or_else(|_| Value::from(v));
                kv.insert(k.to_string(), v);
            }
            None => words.push(w.to_string()),
        }
    }
    (words, kv)
}

pub fn game(l: &Listing) -> Result<Value, String> {
    let (_, at) = asm::addresses(l).map_err(|e| e.to_string())?;
    let mut routines = Vec::new();
    let mut tables = Vec::new();
    let mut loops = Vec::new();
    let mut arrays = Vec::new();
    let mut objects = Vec::new();
    let mut variables = Vec::new();
    let mut banks = Vec::new();
    let mut run = Value::Null;
    let mut patterns: Map<String, Value> = Map::new();
    let mut pending_is: Vec<Value> = Vec::new();
    let mut pending_routine: Option<Value> = None;
    let mut table: Option<(Value, usize, Vec<Value>)> = None;
    let mut bank = 0usize;
    for (i, item) in l.items.iter().enumerate() {
        while bank + 1 < l.banks.len() && l.banks[bank + 1].first <= i {
            bank += 1;
        }
        let bank_name = l.banks.get(bank).map(|b| format!("{}{}", if b.kind == Kind::Prg { "prg" } else { "chr" }, b.index)).unwrap_or_default();
        match item {
            Item::Directive { name, rest } => {
                let (words, kv) = fields(rest);
                match name.as_str() {
                    "is" => {
                        let pattern = words.first().cloned().unwrap_or_default();
                        *patterns.entry(pattern.clone()).or_insert(json!(0)) = json!(patterns.get(&pattern).and_then(Value::as_u64).unwrap_or(0) + 1);
                        pending_is.push(json!({"pattern": pattern, "evidence": kv}));
                    }
                    "routine" => {
                        let mut r = json!({"name": words.first().cloned().unwrap_or_default(), "bank": bank_name, "addr": at[i]});
                        for (k, v) in kv {
                            r[k] = v;
                        }
                        r["is"] = Value::Array(std::mem::take(&mut pending_is));
                        if r.get("inside").is_some() {
                            routines.push(r); // no label follows
                        } else {
                            pending_routine = Some(r);
                        }
                    }
                    "table" => table = Some((json!({"bank": bank_name, "addr": at[i], "kind": words.first().cloned().unwrap_or_default(), "entries": kv.get("entries").cloned().unwrap_or(json!(0)), "seen": kv.get("seen").cloned().unwrap_or(json!(0)), "on": kv.get("on").and_then(Value::as_str).map(|s| s.split(',').map(Value::from).collect::<Vec<_>>()).unwrap_or_default()}), kv.get("entries").and_then(Value::as_u64).unwrap_or(0) as usize, Vec::new())),
                    "array" => {
                        let mut a = json!({"base": words.first().cloned().unwrap_or_default(), "slots": kv.get("slots").cloned().unwrap_or(json!(0)), "sites": kv.get("sites").cloned().unwrap_or(json!(0))});
                        for k in ["x", "y"] {
                            if let Some(v) = kv.get(k) {
                                a[k] = v.clone();
                            }
                        }
                        arrays.push(a);
                    }
                    "objects" => {
                        let list = |k: &str| -> Vec<Value> { kv.get(k).and_then(Value::as_str).map(|s| s.split(',').map(Value::from).collect()).unwrap_or_default() };
                        objects.push(json!({"slots": kv.get("slots").cloned().unwrap_or(json!(0)), "arrays": kv.get("arrays").cloned().unwrap_or(json!(0)), "routines": kv.get("routines").cloned().unwrap_or(json!(0)), "x": list("x"), "y": list("y"), "with": list("with"), "adds": list("adds"), "chooses": list("chooses"), "down": list("down")}));
                    }
                    "var" => {
                        let side = |k: &str| -> Vec<Value> {
                            kv.get(k)
                                .and_then(Value::as_str)
                                .map(|s| s.split(',').filter_map(|x| x.split_once(':').map(|(n, c)| json!({"name": n, "count": c.parse::<u64>().unwrap_or(0)}))).collect())
                                .unwrap_or_default()
                        };
                        variables.push(json!({"addr": words.first().cloned().unwrap_or_default(), "writers": side("writers"), "readers": side("readers"), "total": kv.get("total").cloned().unwrap_or(json!(0))}));
                    }
                    "run" => run = Value::Object(kv),
                    "coverage" => banks.push(json!({"bank": bank_name, "executed": kv.get("executed").cloned().unwrap_or(json!(0)), "of": kv.get("of").cloned().unwrap_or(json!(0)), "sites": kv.get("sites").cloned().unwrap_or(json!(0))})),
                    _ => {}
                }
            }
            Item::Label(n) => {
                if let Some(mut r) = pending_routine.take() {
                    r["name"] = json!(n);
                    routines.push(r);
                } else if !pending_is.is_empty() {
                    // A mark on a label that is no routine's entry: a loop's head.
                    loops.push(json!({"name": n, "bank": bank_name, "addr": at[i], "is": std::mem::take(&mut pending_is)}));
                }
                pending_is.clear();
            }
            Item::Word { value, label, comment } => {
                if let Some((_, n, words)) = table.as_mut() {
                    words.push(json!({"addr": value, "label": label, "ran": comment.as_deref().and_then(|c| c.strip_prefix("ran ")).and_then(|c| c.parse::<u64>().ok())}));
                    if words.len() == *n {
                        let (mut t, _, words) = table.take().unwrap();
                        t["words"] = Value::Array(words);
                        tables.push(t);
                    }
                }
            }
            _ => {}
        }
    }
    Ok(json!({
        "sha256": l.header.sha256,
        "mapper": l.header.mapper,
        "prg": l.header.prg,
        "chr": l.header.chr,
        "run": run,
        "banks": banks,
        "patterns": patterns,
        "routines": routines,
        "tables": tables,
        "loops": loops,
        "arrays": arrays,
        "objects": objects,
        "variables": variables,
    }))
}
