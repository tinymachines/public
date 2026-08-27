"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";

/**
 * The board: the snapshot /api/v1/visitors serves, drawn.
 *
 * Fetched on the client rather than at build, for the same reason the
 * version footer is: the page is prerendered and long-cached, and a number
 * baked in at build time is wrong by the next timer tick. Every figure here
 * is the snapshot's; nothing is derived on the page beyond a sum for a bar's
 * scale, and the time it was measured is printed beside the totals so a
 * reader knows what "last thirty days" means.
 *
 * Three states, all drawn: loading, the API's own refusal ("not measured
 * yet", a 404 until the first snapshot exists), and the board. A log that
 * does not exist yet is a row that says so, not a row of zeros.
 */

interface Day { d: string; reads: number; bots: number }
interface Site {
  key: string; host: string;
  source: { stem: string; present: boolean; rows: number; files: number };
  reads: number; bot_hits: number; self_hits: number; prefetches: number; redirects: number; errors: number;
  unique_nets: number; by_lang: Record<string, number>; by_day: Day[]; by_hour_utc: number[];
  top_paths: { path: string; hits: number }[]; referrers: { ref: string; hits: number }[];
  statuses: Record<string, number>;
}
interface Snapshot {
  generated: string; window_days: number; took_ms: number; privacy: string; self_nets: number;
  sites: Site[];
  totals: { reads: number; bot_hits: number; unique_nets: number; sources_present: number };
}

const L = {
  en: {
    loading: "reading the snapshot",
    none: "Not measured yet: no snapshot has been written. The collector runs every ten minutes once its timer is installed.",
    failed: "The API did not answer.",
    measured: "measured", window: "days", took: "ms to read the logs",
    reads: "reads", nets: "networks", bots: "bot hits",
    site: "site", log: "log", absent: "no log yet", pages: "pages", prefetches: "prefetches", errors: "4xx / 5xx", redirects: "3xx",
    byDay: "Reads by day, every site", topPaths: "Most-read documents", referrers: "Off-site referrers", noRefs: "none in the window",
    ja: "of them under /ja", hours: "By hour (UTC)",
  },
  ja: {
    loading: "スナップショットを読み込み中",
    none: "まだ計測していない: スナップショットが書かれていない。タイマーを入れれば収集は 10 分ごとに走る。",
    failed: "API が応答しなかった。",
    measured: "計測", window: "日間", took: "ms でログを読了",
    reads: "読まれた文書", nets: "ネットワーク", bots: "bot のヒット",
    site: "サイト", log: "ログ", absent: "ログはまだない", pages: "ページ", prefetches: "プリフェッチ", errors: "4xx / 5xx", redirects: "3xx",
    byDay: "日ごとの読了数、全サイト", topPaths: "よく読まれた文書", referrers: "外部からの参照元", noRefs: "期間内になし",
    ja: "うち /ja 配下", hours: "時間帯別 (UTC)",
  },
} as const;

const n = (x: number) => x.toLocaleString("en-US");

export function VisitorsBoard({ lang }: { lang: Lang }) {
  const S = L[lang];
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [state, setState] = useState<"loading" | "none" | "failed" | "ok">("loading");

  useEffect(() => {
    const stop = new AbortController();
    fetch("/api/v1/visitors", { signal: stop.signal, cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) { setState("none"); return; }
        if (!r.ok) { setState("failed"); return; }
        setSnap((await r.json()) as Snapshot);
        setState("ok");
      })
      .catch(() => { if (!stop.signal.aborted) setState("failed"); });
    return () => stop.abort();
  }, []);

  if (state === "loading") return <p className="quiet vis-state">{S.loading}</p>;
  if (state === "none") return <p className="vis-state vis-refusal">{S.none}</p>;
  if (state === "failed" || !snap) return <p className="vis-state vis-refusal">{S.failed}</p>;

  // Days across every site, merged, so the bars are one calendar.
  const days = new Map<string, { reads: number; bots: number }>();
  for (const s of snap.sites) for (const d of s.by_day) {
    const c = days.get(d.d) ?? { reads: 0, bots: 0 };
    c.reads += d.reads; c.bots += d.bots; days.set(d.d, c);
  }
  const dayRows = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const dayMax = Math.max(1, ...dayRows.map(([, c]) => c.reads));
  const hours = Array.from({ length: 24 }, (_, h) => snap.sites.reduce((a, s) => a + (s.by_hour_utc[h] ?? 0), 0));
  const hourMax = Math.max(1, ...hours);
  const paths = new Map<string, number>();
  for (const s of snap.sites) for (const p of s.top_paths) paths.set(`${s.host}${p.path}`, (paths.get(`${s.host}${p.path}`) ?? 0) + p.hits);
  const topPaths = [...paths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const pathMax = Math.max(1, ...topPaths.map(([, h]) => h));
  const refs = new Map<string, number>();
  for (const s of snap.sites) for (const r of s.referrers) refs.set(r.ref, (refs.get(r.ref) ?? 0) + r.hits);
  const topRefs = [...refs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const jaReads = snap.sites.reduce((a, s) => a + (s.by_lang.ja ?? 0), 0);
  const when = new Date(snap.generated);

  return (
    <div className="vis-board">
      {/* The totals, and beside them the fact that makes them numbers rather
          than claims: when they were measured and over how long. */}
      <div className="vis-totals">
        <div><b>{n(snap.totals.reads)}</b><span>{S.reads}</span></div>
        <div><b>{n(snap.totals.unique_nets)}</b><span>{S.nets}</span></div>
        <div><b>{n(snap.totals.bot_hits)}</b><span>{S.bots}</span></div>
        <div className="vis-when">
          <span>{S.measured} <time dateTime={snap.generated}>{when.toISOString().slice(0, 16).replace("T", " ")} UTC</time></span>
          <span>{snap.window_days} {S.window} · {n(snap.took_ms)} {S.took}</span>
          <span>{n(jaReads)} {S.ja}</span>
        </div>
      </div>

      <div className="ledger vis-sites">
        <div className="scroller" tabIndex={0} role="region" aria-label="reads per site">
          <table>
            <thead>
              <tr>
                <th>{S.site}</th><th className="num">{S.reads}</th><th className="num">{S.nets}</th><th className="num">{S.bots}</th>
                <th className="num">{S.prefetches}</th><th className="num">{S.redirects}</th><th className="num">{S.errors}</th><th>{S.log}</th>
              </tr>
            </thead>
            <tbody>
              {snap.sites.map((s) => (
                <tr key={s.key} className={s.source.present ? "" : "vis-absent"}>
                  <td className="name">{s.host}</td>
                  {s.source.present ? (
                    <>
                      <td className="num">{n(s.reads)}</td><td className="num">{n(s.unique_nets)}</td><td className="num">{n(s.bot_hits)}</td>
                      <td className="num">{n(s.prefetches)}</td><td className="num">{n(s.redirects)}</td><td className="num">{n(s.errors)}</td>
                      <td><code>{s.source.stem}</code> · {n(s.source.rows)} rows, {s.source.files} files</td>
                    </>
                  ) : (
                    <td colSpan={7}><span className="tag warn">{S.absent}</span> <code>{s.source.stem}</code></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2>{S.byDay}</h2>
      <div className="vis-days" role="img" aria-label={S.byDay}>
        {dayRows.map(([d, c]) => (
          <div key={d} className="vis-day" title={`${d}: ${n(c.reads)} ${S.reads}, ${n(c.bots)} ${S.bots}`}>
            <i style={{ height: `${Math.round((100 * c.reads) / dayMax)}%` }} />
            <span>{d.slice(8)}</span>
          </div>
        ))}
      </div>

      <h2>{S.hours}</h2>
      <div className="vis-days vis-hours" role="img" aria-label={S.hours}>
        {hours.map((h, i) => (
          <div key={i} className="vis-day" title={`${String(i).padStart(2, "0")}:00 UTC: ${n(h)}`}>
            <i style={{ height: `${Math.round((100 * h) / hourMax)}%` }} />
            <span>{i % 6 === 0 ? String(i).padStart(2, "0") : ""}</span>
          </div>
        ))}
      </div>

      <h2>{S.topPaths}</h2>
      <ol className="vis-bars">
        {topPaths.map(([p, h]) => (
          <li key={p}>
            <span className="vis-bar-lbl"><code>{p}</code></span>
            <span className="vis-bar-track"><i style={{ width: `${Math.round((100 * h) / pathMax)}%` }} /></span>
            <span className="vis-bar-n">{n(h)}</span>
          </li>
        ))}
      </ol>

      <h2>{S.referrers}</h2>
      {topRefs.length === 0 ? <p className="quiet">{S.noRefs}</p> : (
        <ol className="vis-bars">
          {topRefs.map(([r, h]) => (
            <li key={r}>
              <span className="vis-bar-lbl"><code>{r.replace(/^https?:\/\//, "")}</code></span>
              <span className="vis-bar-track"><i style={{ width: `${Math.round((100 * h) / Math.max(1, topRefs[0][1]))}%` }} /></span>
              <span className="vis-bar-n">{n(h)}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="quiet vis-privacy">{snap.privacy}</p>
    </div>
  );
}
