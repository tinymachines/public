import fs from "node:fs";
import path from "node:path";

/**
 * Whether this build carries the slow chip: scripts/build-slowppu.py
 * writes data/slowppu.json when it puts the bundle in web/public/nes/slow/
 * (never committed, the netlist inside is NC-SA). The station says so
 * rather than loading a worker that would find nothing. Returns the
 * 2c02 commit the bundle was built from, or null.
 */
export function slowChip(): string | null {
  const record = path.join(process.cwd(), "..", "data", "slowppu.json");
  const bundle = path.join(process.cwd(), "public", "nes", "slow", "slowppu_bg.wasm");
  if (!fs.existsSync(record) || !fs.existsSync(bundle)) return null;
  const r = JSON.parse(fs.readFileSync(record, "utf8")) as { commit?: string };
  return r.commit ?? null;
}
