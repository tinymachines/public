"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/lang";
import { localize } from "@/lib/lang";
import { call, seconds, stamp, SignIn } from "./shared";
import type { Game, Marker, Output, Outputs, Run } from "./shared";

/**
 * The stream desk: sign in with a dev key, start a family cartridge through
 * the stream chain, watch it, stop it, mark it.
 *
 * Everything here is a view of api/stream.py and nothing is decided in the
 * page: which games exist, which outputs are configured, whether a second
 * run may start, what a run's frame count is. The page asks, every two
 * seconds while a run is running, and draws what it is told. A start that
 * the API refuses (409: one at a time, or the output's key is not there)
 * is shown as the API's own sentence.
 *
 * The key lives in a useState and nowhere else, as on /admin and for the
 * reason written there: this site's CSP carries 'unsafe-inline', so nothing
 * credential-shaped is kept where a script on the origin could read it. A
 * reload asks again.
 *
 * Everything drawn is from the kit (style/components.css): .ledger, .field,
 * .input, .btn, .tag, .notice, .rail, .kv, .chip. No colour is chosen here.
 *
 * The shapes, the call and the sign-in form are in shared.tsx, read by this
 * desk and by the monitor at /nes/stream/{id}, which a run's id opens.
 */

// ---------------------------------------------------------------------------
// The desk
// ---------------------------------------------------------------------------

export function StreamDesk({ lang }: { lang: Lang }) {
  const [key, setKey] = useState<string | null>(null);
  if (!key) {
    return (
      <SignIn
        testId="stream-desk"
        button="Open the desk"
        onKey={(k) => setKey(k)}
        intro={
          <p>
            The stream desk starts one of the family&rsquo;s own cartridges through the console&rsquo;s
            stream chain: the model, the composite signal, the CRT stage on the GPU, ffmpeg. To a file
            on the box, or to a live ingest whose key the service holds. One run at a time, and only
            the cartridges this site already serves.
          </p>
        }
      />
    );
  }
  return <Desk lang={lang} apiKey={key} onSignOut={() => setKey(null)} />;
}

function Desk({ lang, apiKey, onSignOut }: { lang: Lang; apiKey: string; onSignOut: () => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [outputs, setOutputs] = useState<Outputs | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [game, setGame] = useState("");
  const [output, setOutput] = useState<Output>("file");
  const [secs, setSecs] = useState(60);
  const [pace, setPace] = useState(false);
  const [script, setScript] = useState("");

  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await call<{ runs: Run[] }>(apiKey, "GET", "/v1/stream/runs");
      setRuns(r.runs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [apiKey]);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const [g, o] = await Promise.all([
          call<{ games: Game[] }>(apiKey, "GET", "/v1/stream/games"),
          call<Outputs>(apiKey, "GET", "/v1/stream/outputs"),
        ]);
        if (gone) return;
        setGames(g.games);
        setOutputs(o);
        setGame((cur) => cur || g.games[0]?.id || "");
      } catch (err) {
        if (!gone) setError(err instanceof Error ? err.message : String(err));
      }
      await refresh();
    })();
    return () => {
      gone = true;
    };
  }, [apiKey, refresh]);

  // Poll while something runs; stop when nothing does.
  const running = runs.some((r) => r.state === "running");
  useEffect(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    if (running) timer.current = window.setInterval(() => void refresh(), 2000);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [running, refresh]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const run = await call<Run>(apiKey, "POST", "/v1/stream/runs", { game, output, seconds: secs, pace, script });
      setOpen(run.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id: string) => {
    setBusy(true);
    try {
      await call<Run>(apiKey, "POST", `/v1/stream/runs/${id}/stop`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="prose" data-testid="stream-desk">
      <aside className="rail" style={{ marginBottom: "2rem" }}>
        <dl className="kv">
          <dt>Tool</dt>
          <dd>{outputs ? <span className={outputs.runner ? "tag live" : "tag"}>{outputs.runner ? "built" : "not built"}</span> : "…"}</dd>
          <dt>Outputs</dt>
          <dd>
            {outputs ? (
              <>
                <span className="tag live">file</span> <span className={outputs.rtmp ? "tag live" : "tag"}>rtmp</span>{" "}
                <span className={outputs.youtube ? "tag live" : "tag"}>youtube</span>
              </>
            ) : (
              "…"
            )}
          </dd>
          <dt>Games</dt>
          <dd>{games.map((g) => g.id).join(", ") || "none served"}</dd>
        </dl>
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <button className="btn btn-ghost" type="button" onClick={onSignOut}>
            Forget the key
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>
      </aside>

      {error ? (
        <p className="notice fail" role="alert">
          {error}
        </p>
      ) : null}

      <h2>Start a run</h2>
      <form onSubmit={(e) => void start(e)}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="stream-game">Game</label>
            <select id="stream-game" className="input" value={game} onChange={(e) => setGame(e.target.value)}>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id} ({g.bytes} bytes)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="stream-output">Output</label>
            <select id="stream-output" className="input" value={output} onChange={(e) => setOutput(e.target.value as Output)}>
              <option value="file">file (an MP4 on the box)</option>
              <option value="rtmp" disabled={!outputs?.rtmp}>
                rtmp {outputs?.rtmp ? "" : "(no key in the service)"}
              </option>
              <option value="youtube" disabled={!outputs?.youtube}>
                youtube {outputs?.youtube ? "" : "(no key in the service)"}
              </option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="stream-seconds">Console seconds</label>
            <input
              id="stream-seconds"
              className="input data"
              type="number"
              min={1}
              max={7200}
              value={secs}
              onChange={(e) => setSecs(Number(e.target.value))}
            />
            <span className="hint">{seconds(secs)} of play; a live run takes that long on the clock.</span>
          </div>
          <div className="field">
            <label htmlFor="stream-pace">
              <input id="stream-pace" type="checkbox" checked={pace} onChange={(e) => setPace(e.target.checked)} /> Pace a file run to the
              wall clock
            </label>
            <span className="hint">Measures lag the way a live run would, and is no faster to a file.</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="stream-script">Bench script (optional)</label>
          <textarea
            id="stream-script"
            className="input data"
            rows={4}
            spellCheck={false}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={"WAIT 2 S\nSET 08\nWAIT 1 S\nSET 00"}
          />
          <span className="hint">The planner&rsquo;s lines: WAIT s S, RESET, SET hh, AT n hh. Empty plays from power-on with no presses.</span>
        </div>
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <button className="btn btn-primary" type="submit" disabled={busy || !game || !outputs?.runner || running}>
            {running ? "A run is running" : "Start"}
          </button>
        </div>
      </form>

      <h2>Runs</h2>
      {runs.length === 0 ? (
        <p className="quiet">No runs yet.</p>
      ) : (
        <div className="tablewrap" style={{ overflowX: "auto" }}>
          <table className="ledger">
            <thead>
              <tr>
                <th>Run</th>
                <th>Game</th>
                <th>Out</th>
                <th>State</th>
                <th>Frames</th>
                <th>Elapsed</th>
                <th>Lag</th>
                <th>Started</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} data-run={r.id} data-state={r.state}>
                  <td>
                    <Link href={localize(lang, `/nes/stream/${r.id}`)} className="data" title="Open this run's monitor">
                      {r.id}
                    </Link>{" "}
                    <button type="button" className="chip" aria-pressed={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                      log
                    </button>
                  </td>
                  <td>{r.game}</td>
                  <td>{r.output}</td>
                  <td>
                    <span className={r.state === "running" || r.state === "done" ? "tag live" : "tag"}>{r.state}</span>
                  </td>
                  <td className="data">
                    {r.frames_sent} / {r.frames_wanted}
                  </td>
                  <td className="data">{seconds(r.elapsed_s)}</td>
                  <td className="data">{r.worst_lag_ms === null ? "" : `${r.worst_lag_ms} ms, ${r.frames_late} late`}</td>
                  <td className="data">{stamp(r.started_at)}</td>
                  <td>
                    {r.state === "running" ? (
                      <button type="button" className="btn btn-ghost" onClick={() => void stop(r.id)} disabled={busy}>
                        Stop
                      </button>
                    ) : r.file_ready ? (
                      <a href={`/api/v1/stream/runs/${r.id}/file`} onClick={(e) => e.preventDefault()} title="Fetch with the key: GET /api/v1/stream/runs/{id}/file">
                        file ready
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? <RunDetail apiKey={apiKey} run={runs.find((r) => r.id === open) ?? null} onChange={refresh} /> : null}
    </div>
  );
}

function RunDetail({ apiKey, run, onChange }: { apiKey: string; run: Run | null; onChange: () => Promise<void> }) {
  const [lines, setLines] = useState<string[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = run?.id ?? null;
  const state = run?.state ?? null;
  const frames = run?.frames_sent ?? 0;

  useEffect(() => {
    if (!id) return;
    let gone = false;
    (async () => {
      try {
        const [l, m] = await Promise.all([
          call<{ lines: string[] }>(apiKey, "GET", `/v1/stream/runs/${id}/log`),
          call<{ markers: Marker[] }>(apiKey, "GET", `/v1/stream/runs/${id}/markers`),
        ]);
        if (gone) return;
        setLines(l.lines);
        setMarkers(m.markers);
        setError(null);
      } catch (err) {
        if (!gone) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      gone = true;
    };
    // Re-read whenever the run's state or frame count moves, which is what
    // the poll changes.
  }, [apiKey, id, state, frames]);

  if (!run) return null;

  const mark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const m = await call<Marker>(apiKey, "POST", `/v1/stream/runs/${run.id}/markers`, { text: text.trim() });
      setMarkers((cur) => [...cur, m]);
      setText("");
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section data-testid="run-detail">
      <h3>
        Run {run.id}: {run.game} to {run.output}, {run.state}
        {run.exit_code !== null ? `, exit ${run.exit_code}` : ""}
        {run.ffmpeg_ok === null ? "" : run.ffmpeg_ok ? ", ffmpeg ok" : ", ffmpeg failed"}
      </h3>
      {error ? (
        <p className="notice fail" role="alert">
          {error}
        </p>
      ) : null}
      <form onSubmit={(e) => void mark(e)} className="toolbar">
        <input
          className="input"
          type="text"
          placeholder="Mark this moment"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Marker text"
        />
        <button className="btn" type="submit" disabled={!text.trim()}>
          Mark at frame {run.frames_sent}
        </button>
      </form>
      {markers.length ? (
        <ul>
          {markers.map((m, i) => (
            <li key={i}>
              <span className="data">{m.frame}</span> {m.text} <span className="quiet">{stamp(m.at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <pre className="data" style={{ maxHeight: "20rem", overflow: "auto" }}>
        {lines.length ? lines.join("\n") : "No log yet."}
      </pre>
    </section>
  );
}
