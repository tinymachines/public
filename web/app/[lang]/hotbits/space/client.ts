/**
 * The hotbits instrument, as this site reaches it.
 *
 * The entropy-space components came from bradley.io, where they read a
 * same-origin `/api/trng/*` proxy. Here there is no proxy: the instrument is
 * `hotbits.tinymachines.ai` and it is cross-origin, which CLAUDE.md's working
 * agreement says to expect while the subdomains still stand apart from the
 * apex. It sends `Access-Control-Allow-Origin: *` for exactly this reason.
 *
 * TWO ENDPOINTS, AND THE CHOICE MATTERS.
 *
 * `/random/archive` reads the append-only archive of bytes already emitted. It
 * does NOT draw on the fresh pool, which refills at roughly 75 bytes a minute
 * and is the reason `/v1/bytes` needs a key. A page that plots a hundred
 * thousand bytes has no business spending exclusive entropy on a picture, and
 * the archive is the same physical process either way: real decay, already
 * recorded.
 *
 * `/metrics` is bookkeeping the daemon does regardless and costs the pool
 * nothing.
 *
 * Neither is polled. Both are asked once, when the page loads.
 */

const HOTBITS = "https://hotbits.tinymachines.ai";

export interface MetricRow {
  ts_iso: string;
  window_bytes: number;
  window_deltas: number;
  bias: number;
  ones_pct: number;
  ent_bpb: number;
  chi_pct: number;
  lag1_bits: number;
  mean_dt_ms: number;
  lag1_dt: number;
  pileup_pct: number;
}

/** The archive endpoint caps a single request; ask repeatedly and concatenate. */
const CHUNK = 4096;

export async function getArchiveEntropyBytes(
  total: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const out = new Uint8Array(total);
  let filled = 0;

  while (filled < total) {
    const want = Math.min(CHUNK, total - filled);
    const res = await fetch(`${HOTBITS}/random/archive?n=${want}`, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`/random/archive: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) break; // the archive gave what it had; plot that
    out.set(buf.subarray(0, Math.min(buf.length, total - filled)), filled);
    filled += buf.length;
  }

  // Short is fine and is not an error: the caller plots what arrived rather
  // than pretending to a sample size it does not have.
  return filled === total ? out : out.subarray(0, filled);
}

export interface MetricsWindow {
  since: string;
  window_seconds: number;
  n_rows: number;
  rows: MetricRow[];
}

export async function getMetricsWindow(
  since = "24h",
  signal?: AbortSignal,
): Promise<MetricsWindow> {
  const res = await fetch(`${HOTBITS}/metrics?since=${encodeURIComponent(since)}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`/metrics: ${res.status}`);
  const body = await res.json();
  // The daemon wraps the rows. An older build returned a bare array, and the
  // consumer reads `.rows`, so normalise here rather than at the call site.
  return Array.isArray(body)
    ? { since, window_seconds: 0, n_rows: body.length, rows: body }
    : body;
}
