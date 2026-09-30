//! What a run of the game adds to a listing: the flow report of a trace
//! (`wasm/flow`, `report`) says which PRG offsets were executed, how
//! often, and where the routines were entered. Laid over the static
//! walk it turns "what the vectors reach" into "what the game ran", and
//! the marks it writes say `by=run` so the two are never confused.

use std::collections::BTreeMap;

use serde_json::Value;

/// One executed instruction: its PRG offset, how many times, and the
/// address it ran at.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Site {
    pub count: u64,
    pub addr: u16,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Routine {
    pub offset: usize,
    pub addr: u16,
    pub entry: String,
    pub entered: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Run {
    pub frames: u64,
    pub instructions: u64,
    pub sites: BTreeMap<usize, Site>,
    pub routines: Vec<Routine>,
}

impl Run {
    /// The flow report as JSON. `prg_len` must be the listing's, or the
    /// offsets mean nothing.
    pub fn from_report(json: &str, prg_len: usize) -> Result<Run, String> {
        let v: Value = serde_json::from_str(json).map_err(|e| format!("the run report is not JSON: {e}"))?;
        let rep_len = v["prg_len"].as_u64().ok_or("the run report has no prg_len")? as usize;
        if rep_len != prg_len {
            return Err(format!("the run report is of a {rep_len}-byte PRG, this ROM's is {prg_len}"));
        }
        let mut run = Run { frames: v["frames"].as_u64().unwrap_or(0), instructions: v["instructions"].as_u64().unwrap_or(0), ..Default::default() };
        for s in v["sites"].as_array().ok_or("the run report has no sites")? {
            let key = s["key"].as_u64().ok_or("a site without a key")? as usize;
            if key >= prg_len {
                continue; // code that ran from RAM is keyed past the PRG
            }
            run.sites.insert(key, Site { count: s["count"].as_u64().unwrap_or(0), addr: s["addr"].as_u64().unwrap_or(0) as u16 });
        }
        for r in v["routines"].as_array().unwrap_or(&Vec::new()) {
            let key = r["key"].as_u64().unwrap_or(u64::MAX) as usize;
            if key >= prg_len {
                continue;
            }
            let entry = match &r["entry"] {
                Value::String(s) => s.to_ascii_lowercase(),
                other => other.to_string().to_ascii_lowercase(),
            };
            run.routines.push(Routine { offset: key, addr: r["addr"].as_u64().unwrap_or(0) as u16, entry, entered: r["entered"].as_u64().unwrap_or(0) });
        }
        Ok(run)
    }

    /// The sites that fall in one bank, keyed by offset within it.
    pub fn in_bank(&self, offset: usize, len: usize) -> BTreeMap<usize, &Site> {
        self.sites.range(offset..offset + len).map(|(k, s)| (k - offset, s)).collect()
    }
}
