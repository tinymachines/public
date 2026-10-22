"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/lang";
import { localize } from "@/lib/lang";
import { call, seconds, stamp, SignIn } from "../shared";
import type { Run, Session, State } from "../shared";

/**
 * The run history: every run the stream desk has made, as GET /v1/stream/runs
 * tells it, and nothing else. The desk shows what runs now and sixty lines of
 * one log; this is the chain over time: which game paces worse, whether a
 * change to the console or the GPU moved the per-frame cost, which runs
 * failed.
 *
 * Four views of the one list, then the line that says where it came from:
 *
 * 1. The last run, in full.
 * 2. The ledger, every run newest first. A lost or failed run is marked, not
 *    hidden: a history that drops its failures is worth less than one that
 *    shows them.
 * 3. Cost per frame: the tool's own cost line, which it prints once when its
 *    frame loop ends, one row per run that has one. A run without one says so.
 * 4. The trend: worst lag and frames late per run in run order, one series
 *    per game. Only a paced run measures lag, so an unpaced file run has no
 *    point.
 *
 * Nothing here is decided in the page and no figure is typed: the API read
 * every number out of the run's own log on disk. The page draws what it is
 * told and says at its foot where it was told and when. Read-only; it starts
 * and stops nothing.
 *
 * The gate is the desk's (shared.tsx SignIn): an operator's passkey, or a key,
 * held in a useState and nowhere else. Everything drawn is from the kit
 * (style/components.css): .ledger, .kv, .rail, .tag, .chip, .btn, .notice,
 * .quiet, .data. The trend is inline SVG in the site's habit (currentColor,
 * classes as the seams), with no chart library.
 */

export function RunHistory({ lang }: { lang: Lang }) {
  const [session, setSession] = useState<Session | null>(null);
  if (!session) {
    return (
      <SignIn
        testId="stream-history"
        button="Open the history"
        onSession={setSession}
        intro={
          <p>
            The run history is every run the stream desk has made, newest first: how far each got, how late
            its frames ran, what each stage of the chain cost per frame, and how that moves from run to run.
            It reads; it starts and stops nothing. The desk is at{" "}
            <Link href={localize(lang, "/nes/stream")}>/nes/stream</Link>.
          </p>
        }
      />
    );
  }
  return (
    <History
      lang={lang}
      apiKey={session.key}
      onSignOut={async () => {
        if (session.via === "passkey") await call(null, "POST", "/v1/stream/sign-out").catch(() => undefined);
        setSession(null);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Words for what the API says, in one place.
// ---------------------------------------------------------------------------

/** The state as a tag: a run that ended well or is going is live; a failed one is
 *  a failure; a lost one is a warning; a stopped one is plain. */
function stateClass(s: State): string {
  if (s === "running" || s === "done") return "tag live";
  if (s === "failed") return "tag fail";
  if (s === "lost") return "tag warn";
  return "tag";
}

function verdict(r: Run): string {
  if (r.ffmpeg_ok === true) return "ok";
  if (r.ffmpeg_ok === false) return "failed";
  return r.state === "running" ? "not yet" : "no verdict";
}

/** The day and the time: a history spans days where the desk spans minutes. */
function when(iso: string | null): string {
  if (!iso) return "";
  return `${iso.slice(0, 10)} ${stamp(iso)}`;
}

const num = (n: number | null): string => (n === null ? "" : String(n));

const COST: { key: keyof Run; label: string }[] = [
  { key: "ms_console", label: "Console" },
  { key: "ms_encode", label: "Encode" },
  { key: "ms_gpu", label: "GPU" },
  { key: "ms_readback", label: "Read-back" },
  { key: "ms_convert", label: "Convert" },
  { key: "ms_handoff", label: "Hand-off" },
];

const hasCost = (r: Run) => r.ms_console !== null && r.ms_console !== undefined;

// ---------------------------------------------------------------------------
// The history
// ---------------------------------------------------------------------------

function History({ lang, apiKey, onSignOut }: { lang: Lang; apiKey: string | null; onSignOut: () => void }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await call<{ runs: Run[] }>(apiKey, "GET", "/v1/stream/runs");
      setRuns(r.runs);
      setReadAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [apiKey]);

  useEffect(() => {
    // The desk's shape: the read in an async body, so the effect itself sets
    // nothing synchronously.
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  const again = async () => {
    setBusy(true);
    await refresh();
    setBusy(false);
  };

  const last = runs?.[0] ?? null;
  const withCost = (runs ?? []).filter(hasCost);
  const withoutCost = (runs ?? []).filter((r) => !hasCost(r));

  return (
    <div className="prose history" data-testid="stream-history">
      <p className="toolbar">
        <Link href={localize(lang, "/nes/stream")} className="chip">
          desk
        </Link>
        <button className="btn btn-ghost" type="button" onClick={onSignOut}>
          Forget the key
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => void again()} disabled={busy}>
          Refresh
        </button>
      </p>

      {error ? (
        <p className="notice fail" role="alert">
          {error}
        </p>
      ) : null}

      {runs === null ? (
        error ? null : <p className="quiet">Asking the API for the runs.</p>
      ) : runs.length === 0 ? (
        <p className="quiet">No runs yet. The desk makes them.</p>
      ) : (
        <>
          {last ? <LastRun lang={lang} r={last} /> : null}

          <section aria-label="The ledger" data-testid="history-ledger">
            <h2>Every run</h2>
            <div className="tablewrap" style={{ overflowX: "auto" }}>
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Game</th>
                    <th>Out</th>
                    <th>Paced</th>
                    <th className="num">Seconds</th>
                    <th className="num">Frames</th>
                    <th className="num">Elapsed</th>
                    <th className="num">Worst lag</th>
                    <th className="num">Late</th>
                    <th>ffmpeg</th>
                    <th>State</th>
                    <th>Started</th>
                    <th className="num">Markers</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} data-run={r.id} data-state={r.state} className={r.state === "lost" || r.state === "failed" ? "history-off" : undefined}>
                      <td>
                        <Link href={localize(lang, `/nes/stream/${r.id}`)} className="data" title="Open this run's monitor">
                          {r.id}
                        </Link>
                      </td>
                      <td>{r.game}</td>
                      <td>{r.output}</td>
                      <td>{r.pace ? "yes" : "no"}</td>
                      <td className="data num">{r.seconds}</td>
                      <td className="data num">
                        {r.frames_sent} / {r.frames_wanted}
                      </td>
                      <td className="data num">{seconds(r.elapsed_s)}</td>
                      <td className="data num">{r.worst_lag_ms === null ? "" : `${r.worst_lag_ms} ms`}</td>
                      <td className="data num">{num(r.frames_late)}</td>
                      <td>{verdict(r)}</td>
                      <td>
                        <span className={stateClass(r.state)}>{r.state}</span>
                      </td>
                      <td className="data">{when(r.started_at)}</td>
                      <td className="data num">{r.markers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              A lost run is one an earlier process started and this one cannot see; a failed one is a tool that exited with an error, a refused ingest included.
              Both stay in the ledger. Only a paced run measures lag.
            </p>
          </section>

          <section aria-label="Cost per frame" data-testid="history-cost">
            <h2>Cost per frame</h2>
            <p>
              Milliseconds per frame, as the tool prints them once when its frame loop ends, averaged over the frames it finished: the console&rsquo;s
              model, ffmpeg&rsquo;s encode, and the CRT stage on the GPU, whose three parts follow it.
            </p>
            {withCost.length ? (
              <div className="tablewrap" style={{ overflowX: "auto" }}>
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Game</th>
                      <th>Out</th>
                      {COST.map((c) => (
                        <th key={c.key} className="num">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {withCost.map((r) => (
                      <tr key={r.id} data-cost={r.id}>
                        <td>
                          <Link href={localize(lang, `/nes/stream/${r.id}`)} className="data">
                            {r.id}
                          </Link>
                        </td>
                        <td>{r.game}</td>
                        <td>{r.output}</td>
                        {COST.map((c) => (
                          <td key={c.key} className="data num">
                            {num(r[c.key] as number | null)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="quiet">No run has a cost line yet.</p>
            )}
            {withoutCost.length ? (
              <p className="quiet" data-testid="history-no-cost">
                No cost line on {withoutCost.length === 1 ? "one run" : `${withoutCost.length} runs`}:{" "}
                {withoutCost.map((r, i) => (
                  <span key={r.id}>
                    {i ? ", " : ""}
                    <span className="data">{r.id}</span> ({r.state})
                  </span>
                ))}
                . A running run prints it when it ends; a run that was stopped, failed or lost never reached the end of its loop.
              </p>
            ) : null}
          </section>

          <Trend runs={runs} />

          <p className="quiet" data-testid="history-source">
            Every figure on this page is the API&rsquo;s: <span className="data">GET /api/v1/stream/runs</span> reads each run&rsquo;s own log under the
            stream home as it stands, and the page types no number of its own. Last read {readAt ? when(readAt) : "not yet"}, {runs.length}{" "}
            {runs.length === 1 ? "run" : "runs"}.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The last run
// ---------------------------------------------------------------------------

function LastRun({ lang, r }: { lang: Lang; r: Run }) {
  return (
    <section aria-label="The last run" data-testid="history-last">
      <h2>The last run</h2>
      <aside className="rail">
        <dl className="kv">
          <dt>Run</dt>
          <dd>
            <Link href={localize(lang, `/nes/stream/${r.id}`)} className="data">
              {r.id}
            </Link>
          </dd>
          <dt>Game</dt>
          <dd>{r.game}</dd>
          <dt>Output</dt>
          <dd>{r.output}</dd>
          <dt>Frames</dt>
          <dd className="data">
            {r.frames_sent} of {r.frames_wanted}
          </dd>
          <dt>Console seconds</dt>
          <dd className="data">{r.seconds} s asked</dd>
          <dt>Wall seconds</dt>
          <dd className="data">{r.elapsed_s} s</dd>
          <dt>Worst lag</dt>
          <dd className="data">{r.worst_lag_ms === null ? "not paced" : `${r.worst_lag_ms} ms`}</dd>
          <dt>Frames late</dt>
          <dd className="data">{r.frames_late === null ? "not paced" : r.frames_late}</dd>
          <dt>ffmpeg</dt>
          <dd>{verdict(r)}</dd>
          <dt>State</dt>
          <dd>
            <span className={stateClass(r.state)}>{r.state}</span>
            {r.exit_code !== null ? <span className="data"> exit {r.exit_code}</span> : null}
          </dd>
          <dt>Started</dt>
          <dd className="data">{when(r.started_at)}</dd>
          <dt>Ended</dt>
          <dd className="data">{r.ended_at ? when(r.ended_at) : "still running"}</dd>
        </dl>
      </aside>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The trend: worst lag and frames late per run, in run order, a series per game.
// ---------------------------------------------------------------------------

const W = 640;
const H = 170;
const PAD = { left: 48, right: 16, top: 12, bottom: 28 };

function Trend({ runs }: { runs: Run[] }) {
  // Oldest first, and only the runs that measured lag: a paced run.
  const ordered = [...runs].reverse().filter((r) => r.worst_lag_ms !== null);
  const games: string[] = [];
  for (const r of ordered) if (!games.includes(r.game)) games.push(r.game);

  if (ordered.length === 0) {
    return (
      <section className="trend" aria-label="The trend" data-testid="history-trend">
        <h2>The trend</h2>
        <p className="quiet">No paced run yet, so there is no lag to draw. A file run that is not paced measures none; a live run always does.</p>
      </section>
    );
  }

  return (
    <section className="trend" aria-label="The trend" data-testid="history-trend">
      <h2>The trend</h2>
      <p>
        Each paced run at its place in the order the runs were made, oldest on the left, one series per game. A run that is not paced has no point.
      </p>
      <ul className="trend-key" aria-label="Series">
        {games.map((g, i) => (
          <li key={g} className={`trend-s${i % 4}`}>
            <span className="swatch" aria-hidden="true" />
            {g}
          </li>
        ))}
      </ul>
      <Panel runs={ordered} games={games} pick={(r) => r.worst_lag_ms ?? 0} unit="ms" what="Worst lag" caption="The worst a frame was late in each run, in milliseconds." />
      <Panel runs={ordered} games={games} pick={(r) => r.frames_late ?? 0} unit="frames" what="Frames late" caption="How many frames were more than a frame late in each run." />
    </section>
  );
}

function Panel({
  runs,
  games,
  pick,
  unit,
  what,
  caption,
}: {
  runs: Run[];
  games: string[];
  pick: (r: Run) => number;
  unit: string;
  what: string;
  caption: string;
}) {
  const n = runs.length;
  const top = Math.max(1, ...runs.map(pick));
  const x = (i: number) => (n === 1 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((W - PAD.left - PAD.right) * i) / (n - 1));
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / top);
  const x0 = PAD.left;
  const x1 = W - PAD.right;
  const y0 = H - PAD.bottom;
  const mid = top / 2;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${what} per run, ${n} paced ${n === 1 ? "run" : "runs"}, up to ${top} ${unit}`}>
        <line className="grid" x1={x0} x2={x1} y1={y(mid)} y2={y(mid)} />
        <line className="grid" x1={x0} x2={x1} y1={y(top)} y2={y(top)} />
        <line className="axis" x1={x0} x2={x1} y1={y0} y2={y0} />
        <line className="axis" x1={x0} x2={x0} y1={PAD.top} y2={y0} />
        <text x={x0 - 6} y={y(top) + 4} textAnchor="end">
          {top}
        </text>
        <text x={x0 - 6} y={y(mid) + 4} textAnchor="end">
          {mid}
        </text>
        <text x={x0 - 6} y={y0 + 4} textAnchor="end">
          0
        </text>
        <text className="label" x={x0} y={H - 8} textAnchor="start">
          {runs[0].id}
        </text>
        {n > 1 ? (
          <text className="label" x={x1} y={H - 8} textAnchor="end">
            {runs[n - 1].id}
          </text>
        ) : null}
        <text className="label" x={(x0 + x1) / 2} y={H - 8} textAnchor="middle">
          {what}, {unit}
        </text>
        {games.map((g, gi) => {
          const pts = runs.map((r, i) => ({ r, i })).filter(({ r }) => r.game === g);
          return (
            <g key={g} className={`trend-s${gi % 4}`} data-series={g}>
              {pts.length > 1 ? <polyline points={pts.map(({ r, i }) => `${x(i)},${y(pick(r))}`).join(" ")} /> : null}
              {pts.map(({ r, i }) => (
                <circle key={r.id} cx={x(i)} cy={y(pick(r))} r={3.5} data-point={r.id} data-value={pick(r)}>
                  <title>{`${r.id} (${r.game}): ${pick(r)} ${unit}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
