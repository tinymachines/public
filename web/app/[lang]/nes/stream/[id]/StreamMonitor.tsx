"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/lang";
import { localize } from "@/lib/lang";
import { call, seconds, stamp, SignIn } from "../shared";
import type { Marker, Run, WhoAmI } from "../shared";

/**
 * The stream monitor: one run, watched and acted on.
 *
 * Three regions and a bar, as the spec draws them: the picture (the model's,
 * live over HLS from M2; in M1 the region says what the run's output is and
 * where the picture went), the part (reserved for the real console's
 * picture, one line until that lane exists), the ledger (what the API says,
 * and the markers on a frame axis), and the bar (stop, the marker field; the
 * pad and reset arrive with the control route in M3).
 *
 * The API is the truth and this is a window. The run is read from
 * GET /v1/stream/runs/{id} on a two-second poll while it runs, as the desk
 * does, and nothing is inferred from the clock. The strip's scale is
 * frames_wanted, the run's whole length, so a marker stays where it was
 * placed as the run goes on; set from frames_sent the ticks would slide
 * left every poll, which is the sabotage the e2e test is written to catch.
 *
 * A dev key reads; the bar needs an admin key and says so in its hint
 * rather than letting a press fail with a 403. The key was proved against
 * /v1/admin/whoami at sign-in, which is what says which it is.
 */

const POLL_MS = 2000;

export function StreamMonitor({ lang, id }: { lang: Lang; id: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [who, setWho] = useState<WhoAmI | null>(null);
  if (!key || !who) {
    return (
      <SignIn
        testId="stream-monitor"
        button="Open the monitor"
        onKey={(k, w) => {
          setKey(k);
          setWho(w);
        }}
        intro={
          <p>
            The monitor shows one run of a family cartridge through the console&rsquo;s stream chain as
            it runs, and lets an operator act on it. Run <span className="data">{id}</span>. The
            desk is at <Link href={localize(lang, "/nes/stream")}>/nes/stream</Link>.
          </p>
        }
      />
    );
  }
  return <Monitor lang={lang} id={id} apiKey={key} admin={who.can_administer} onSignOut={() => setKey(null)} />;
}

function Monitor({ lang, id, apiKey, admin, onSignOut }: { lang: Lang; id: string; apiKey: string; admin: boolean; onSignOut: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const timer = useRef<number | null>(null);
  const path = `/v1/stream/runs/${encodeURIComponent(id)}`;

  const refresh = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([call<Run>(apiKey, "GET", path), call<{ markers: Marker[] }>(apiKey, "GET", `${path}/markers`)]);
      setRun(r);
      setMarkers(m.markers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [apiKey, path]);

  useEffect(() => {
    let gone = false;
    (async () => {
      if (!gone) await refresh();
    })();
    return () => {
      gone = true;
    };
  }, [refresh]);

  // Poll while the run runs; stop when it does not.
  const running = run?.state === "running";
  useEffect(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    if (running) timer.current = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [running, refresh]);

  const stop = async () => {
    setBusy(true);
    try {
      await call<Run>(apiKey, "POST", `${path}/stop`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const mark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const m = await call<Marker>(apiKey, "POST", `${path}/markers`, { text: text.trim() });
      setMarkers((cur) => [...cur, m]);
      setText("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const barHint = admin ? "Stop ends the run; a marker is placed at the frame the console is at." : "This key reads the monitor. Stopping and marking need an admin key.";

  return (
    <div className="prose monitor" data-testid="stream-monitor" data-run={run?.id ?? undefined} data-state={run?.state ?? undefined}>
      <p className="toolbar">
        <Link href={localize(lang, "/nes/stream")} className="chip">
          desk
        </Link>
        <button className="btn btn-ghost" type="button" onClick={onSignOut}>
          Forget the key
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => void refresh()} disabled={busy}>
          Refresh
        </button>
      </p>

      {error ? (
        <p className="notice fail" role="alert">
          {error}
        </p>
      ) : null}

      <div className="monitor-regions">
        <section className="monitor-picture" aria-label="The model's picture" data-testid="monitor-picture">
          <Picture run={run} />
        </section>
        <section className="monitor-part" aria-label="The real console's picture" data-testid="monitor-part">
          <p className="quiet">The real console&rsquo;s picture arrives here when the grabber lane exists.</p>
        </section>
      </div>

      <section className="monitor-bar" aria-label="The bar" data-testid="monitor-bar">
        <div className="toolbar">
          <button className="btn" type="button" onClick={() => void stop()} disabled={!admin || busy || !running} aria-describedby="monitor-bar-hint">
            Stop
          </button>
          <form onSubmit={(e) => void mark(e)} className="toolbar">
            <input
              className="input"
              type="text"
              placeholder="Mark this moment"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Marker text"
              disabled={!admin}
              aria-describedby="monitor-bar-hint"
            />
            <button className="btn" type="submit" disabled={!admin || busy || !text.trim() || !run}>
              Mark at frame {run?.frames_sent ?? 0}
            </button>
          </form>
        </div>
        <p className="hint" id="monitor-bar-hint">
          {barHint} The picture is seconds behind the console. To play, use{" "}
          <Link href={localize(lang, "/nes/play")}>/nes/play</Link>.
        </p>
      </section>

      <section className="monitor-ledger" aria-label="The ledger">
        {run ? <Ledger run={run} markers={markers} /> : error ? null : <p className="quiet">Asking the API for the run.</p>}
      </section>
    </div>
  );
}

/** The picture region in M1: where the picture went, and the file once it is there. */
function Picture({ run }: { run: Run | null }) {
  if (!run) return <p className="quiet">No run yet.</p>;
  if (run.output === "file") {
    return (
      <p className="quiet">
        No live picture: a file run.{" "}
        {run.file_ready ? (
          <a href={`/api/v1/stream/runs/${run.id}/file`} onClick={(e) => e.preventDefault()} title="Fetch with the key: GET /api/v1/stream/runs/{id}/file">
            The file is ready.
          </a>
        ) : run.state === "running" ? (
          "The file is written when the run ends."
        ) : (
          "No file was written."
        )}
      </p>
    );
  }
  if (run.output === "hls") {
    return <p className="quiet">{run.picture ? `The live playlist is at ${run.picture}; the player arrives with M2.` : "No live picture yet: the playlist is not there."}</p>;
  }
  return <p className="quiet">The picture went to {run.output}; there is nothing to show here.</p>;
}

function Ledger({ run, markers }: { run: Run; markers: Marker[] }) {
  const wanted = Math.max(run.frames_wanted, 1);
  const at = (frame: number) => `${Math.min(100, Math.max(0, (frame / wanted) * 100))}%`;
  return (
    <>
      <aside className="rail">
        <dl className="kv">
          <div>
            <dt>Run</dt>
            <dd>
              {run.id}: {run.game} to {run.output}
            </dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>
              <span className={run.state === "running" || run.state === "done" ? "tag live" : run.state === "failed" || run.state === "lost" ? "tag fail" : "tag"}>{run.state}</span>
              {run.exit_code !== null ? ` exit ${run.exit_code}` : ""}
            </dd>
          </div>
          <div>
            <dt>Frames</dt>
            <dd data-testid="monitor-frames">
              {run.frames_sent} of {run.frames_wanted}
            </dd>
          </div>
          <div>
            <dt>Console</dt>
            <dd>{seconds(run.seconds)}</dd>
          </div>
          <div>
            <dt>Wall</dt>
            <dd>{seconds(run.elapsed_s)}</dd>
          </div>
          <div>
            <dt>Lag</dt>
            <dd>{run.worst_lag_ms === null ? (run.pace ? "none yet" : "not paced") : `${run.worst_lag_ms} ms worst, ${run.frames_late} late`}</dd>
          </div>
          <div>
            <dt>ffmpeg</dt>
            <dd>{run.ffmpeg_ok === null ? (run.state === "running" ? "running" : "no verdict") : run.ffmpeg_ok ? "ok" : "failed"}</dd>
          </div>
          <div>
            <dt>Picture at</dt>
            <dd>no live picture</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{stamp(run.started_at)}</dd>
          </div>
          <div>
            <dt>Markers</dt>
            <dd>{markers.length}</dd>
          </div>
        </dl>
      </aside>

      <div className="strip" data-testid="monitor-strip" data-scale={run.frames_wanted} role="img" aria-label={`Frames 0 to ${run.frames_wanted}: the console at ${run.frames_sent}, ${markers.length} markers`}>
        <div className="strip-axis">
          <i className="strip-done" style={{ width: at(run.frames_sent) }} />
          <b className="strip-cursor" style={{ left: at(run.frames_sent) }} title={`console at frame ${run.frames_sent}`} />
          {markers.map((m, i) => (
            <s key={i} className="strip-mark" data-marker={m.frame} style={{ left: at(m.frame) }} title={`${m.frame}: ${m.text}`} />
          ))}
        </div>
        <div className="strip-ends data">
          <span>0</span>
          <span>{run.frames_wanted}</span>
        </div>
      </div>

      {markers.length ? (
        <ul className="strip-list">
          {markers.map((m, i) => (
            <li key={i}>
              <span className="data">{m.frame}</span> {m.text} <span className="quiet">{stamp(m.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="quiet">No markers yet.</p>
      )}
    </>
  );
}
