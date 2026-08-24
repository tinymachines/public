"use client";

import type { Lang } from "@/lib/lang";
import { RegistryState, useRegistry } from "@/app/components/RegistryData";

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

const L = {
  en: {
    what: "the byte pool",
    inPool: "in the pool, unread, measured when this page loaded",
    emitted: "emitted since the stream was opened",
    maxReq: "the most one request may take",
    healthy: "healthy",
    notHealthy: "not healthy",
    loggerUp: "logger running",
    loggerDown: "logger stopped",
    testsUp: "health tests passing",
    testsDown: "health tests failing",
    thePool: "the pool",
    readLive: "read live",
    unread: "unread bytes",
    consumed: "already handed out",
    lowWater: "low water mark",
    lifetime: "bits emitted, lifetime",
    bytes: "bytes",
    bits: "bits",
  },
  ja: {
    what: "バイトプール",
    inPool: "プール内の未読バイト。このページの読み込み時に実測",
    emitted: "ストリーム開始からの出力ビット",
    maxReq: "1 リクエストが取れる最大",
    healthy: "健全",
    notHealthy: "不健全",
    loggerUp: "ロガー稼働中",
    loggerDown: "ロガー停止",
    testsUp: "健全性テスト合格",
    testsDown: "健全性テスト不合格",
    thePool: "プール",
    readLive: "ライブ読み取り",
    unread: "未読バイト",
    consumed: "払い出し済み",
    lowWater: "低水位標",
    lifetime: "累計出力ビット",
    bytes: "バイト",
    bits: "ビット",
  },
} as const;

export function Pool({ api, lang = "en" }: { api: string; lang?: Lang }) {
  const T = L[lang];
  const stats = useRegistry<Stats>(`${api}/stats`);
  const health = useRegistry<Health>(`${api}/health`);

  if (!stats.data) {
    return <RegistryState error={stats.error} what={T.what} lang={lang} />;
  }
  const s = stats.data;
  const h = health.data;

  return (
    <>
      <div className="chips">
        <span className="measured">
          <b>
            {grouped(s.fresh_bytes)} {T.bytes}
          </b>{" "}
          {T.inPool}
        </span>
        <span className="measured">
          <b>
            {grouped(s.l1_total_bits_emitted)} {T.bits}
          </b>{" "}
          {T.emitted}
        </span>
        <span className="measured">
          <b>
            {grouped(s.max_bytes_per_request)} {T.bytes}
          </b>{" "}
          {T.maxReq}
        </span>
        {h ? (
          <span className={h.healthy ? "tag live" : "tag warn"}>
            {h.healthy ? T.healthy : T.notHealthy}
          </span>
        ) : null}
        <span className={s.logger_service_active ? "tag live" : "tag fail"}>
          {s.logger_service_active ? T.loggerUp : T.loggerDown}
        </span>
        <span className={s.l1_health_ok ? "tag live" : "tag fail"}>
          {s.l1_health_ok ? T.testsUp : T.testsDown}
        </span>
      </div>

      {/* Panel, because every one of these came off the instrument. STYLE.md
          section 1: a dark box means the value inside it was measured. */}
      <div className="panel">
        <div className="panel-bar">
          <span>{T.thePool}</span>
          <span>{T.readLive}</span>
        </div>
        <div className="panel-face">
          <table className="readout">
            <tbody>
              <tr>
                <th>{T.unread}</th>
                <td className="num">{grouped(s.fresh_bytes)}</td>
              </tr>
              <tr>
                <th>{T.consumed}</th>
                <td className="num">{grouped(s.consumed_bytes)}</td>
              </tr>
              <tr>
                <th>{T.lowWater}</th>
                <td className="num">{grouped(s.low_water_bytes)}</td>
              </tr>
              <tr>
                <th>{T.lifetime}</th>
                <td className="num">{grouped(s.l1_total_bits_emitted)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
