//! The report for a trace file, natively: `report TRACE PRG_LEN OUT.json`.
//! A trace comes from the console's replay (nes `record-replay` example);
//! it is the run of a cartridge, so it stays where the ROM does. The
//! trace is read as it comes, a chunk at a time, so TRACE may be a pipe
//! the console is still writing into and need never be a file.
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let prg: u32 = a[2].parse().expect("PRG_LEN");
    let mut f = flow::Flow::new(prg);
    let t = std::time::Instant::now();
    let mut file = std::fs::File::open(&a[1]).expect("the trace");
    let mut chunk = vec![0u8; 1 << 20];
    let mut bytes = 0usize;
    loop {
        let n = std::io::Read::read(&mut file, &mut chunk).expect("reading the trace");
        if n == 0 {
            break;
        }
        f.feed(&chunk[..n]);
        bytes += n;
    }
    let json = f.report();
    std::fs::write(&a[3], &json).unwrap();
    eprintln!("{} MB of trace in {:.2} s; report {} KB", bytes / 1_000_000, t.elapsed().as_secs_f64(), json.len() / 1000);
}
