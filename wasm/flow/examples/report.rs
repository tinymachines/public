//! The report for a trace file, natively: `report TRACE PRG_LEN OUT.json`.
//! A trace comes from the console's replay (nes `record-replay` example);
//! it is the run of a cartridge, so it stays where the ROM does.
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let prg: u32 = a[2].parse().expect("PRG_LEN");
    let mut f = flow::Flow::new(prg);
    let t = std::time::Instant::now();
    let bytes = std::fs::read(&a[1]).expect("the trace");
    for chunk in bytes.chunks(1 << 20) {
        f.feed(chunk);
    }
    let json = f.report();
    std::fs::write(&a[3], &json).unwrap();
    eprintln!("{} MB of trace in {:.2} s; report {} KB", bytes.len() / 1_000_000, t.elapsed().as_secs_f64(), json.len() / 1000);
}
