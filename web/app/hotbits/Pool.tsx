"use client";

import { RegistryState, useRegistry } from "../components/RegistryData";

/**
 * What the instrument has, asked of the instrument.
 *
 * Every figure on this block is read from the running TRNG when the page
 * loads. None of them is typed, and none is baked at build time: a byte pool
 * that refills at about seventy-five bytes a minute is a number that is wrong
 * within the hour, and a page that stated one from the last deploy would look
 * exactly like a page that knew.
 *
 * ## What is deliberately not shown
 *
 * `GET /stats` answers with absolute paths on the machine it runs on, a home
 * directory among them. That is that service's business and this page does not
 * republish it: the fields below are named one at a time rather than the
 * document being rendered. CLAUDE.md's rule about host-specific detail is
 * about this repository's files, and the spirit of it is that a public page
 * should not be the thing that puts a private path in front of a reader.
 * Worth telling that project about; not worth quietly mirroring.
 */

interface Stats {
  fresh_bytes: number;
  consumed_bytes: number;
  low_water_bytes: number;
  max_bytes_per_request: number;
  l1_total_bits_emitted: number;
  l1_health_ok: boolean;
  logger_service_active: boolean;
}

interface Health {
  healthy: boolean;
  pool_fresh_bytes: number;
  events_csv_fresh: boolean;
}

/** Thousands separators without a locale, which would differ per reader. */
function grouped(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function Pool({ api }: { api: string }) {
  const stats = useRegistry<Stats>(`${api}/stats`);
  const health = useRegistry<Health>(`${api}/health`);

  if (!stats.data) {
    return <RegistryState error={stats.error} what="the byte pool" />;
  }
  const s = stats.data;
  const h = health.data;

  return (
    <>
      <div className="chips">
        <span className="measured">
          <b>{grouped(s.fresh_bytes)} bytes</b> in the pool, unread, measured
          when this page loaded
        </span>
        <span className="measured">
          <b>{grouped(s.l1_total_bits_emitted)} bits</b> emitted since the
          stream was opened
        </span>
        <span className="measured">
          <b>{grouped(s.max_bytes_per_request)} bytes</b> the most one request
          may take
        </span>
        {h ? (
          <span className={h.healthy ? "tag live" : "tag warn"}>
            {h.healthy ? "healthy" : "not healthy"}
          </span>
        ) : null}
        <span className={s.logger_service_active ? "tag live" : "tag fail"}>
          {s.logger_service_active ? "logger running" : "logger stopped"}
        </span>
        <span className={s.l1_health_ok ? "tag live" : "tag fail"}>
          {s.l1_health_ok ? "health tests passing" : "health tests failing"}
        </span>
      </div>

      {/* Panel, because every one of these came off the instrument. STYLE.md
          section 1: a dark box means the value inside it was measured. */}
      <div className="panel">
        <div className="panel-bar">
          <span>the pool</span>
          <span>read live</span>
        </div>
        <div className="panel-face">
          <table className="readout">
            <tbody>
              <tr>
                <th>unread bytes</th>
                <td className="num">{grouped(s.fresh_bytes)}</td>
              </tr>
              <tr>
                <th>already handed out</th>
                <td className="num">{grouped(s.consumed_bytes)}</td>
              </tr>
              <tr>
                <th>low water mark</th>
                <td className="num">{grouped(s.low_water_bytes)}</td>
              </tr>
              <tr>
                <th>bits emitted, lifetime</th>
                <td className="num">{grouped(s.l1_total_bits_emitted)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
