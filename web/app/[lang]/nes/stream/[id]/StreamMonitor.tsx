"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/lang";
import { localize } from "@/lib/lang";
import { KEYS } from "@/lib/padKeys";
import { Gamepad } from "../../play/Gamepad";
import { call, seconds, stamp, SignIn } from "../shared";
import type { Marker, Run, WhoAmI } from "../shared";

/**
 * The stream monitor: one run, watched and acted on.
 *
 * Three regions and a bar, as the spec draws them: the picture (the model's,
 * live over HLS; for a run whose picture went elsewhere the region says
 * where), the part (reserved for the real console's picture, one line until
 * that lane exists), the ledger (what the API says, and the markers and
 * presses on a frame axis), and the bar (stop, reset, the pad, the marker
 * field).
 *
 * The API is the truth and this is a window. The run is read from
 * GET /v1/stream/runs/{id} on a two-second poll while it runs, as the desk
 * does, and nothing is inferred from the clock. The strip's scale is
 * frames_wanted, the run's whole length, so a marker stays where it was
 * placed as the run goes on; set from frames_sent the ticks would slide
 * left every poll, which is the sabotage the e2e test is written to catch.
 *
 * The picture's own frame is read off the playlist's media time, not its
 * date stamps: the stream's media time zero is the tool's frame 0, every
 * part is one second (the muxer cuts on a keyframe every 60 output frames),
 * and the tool feeds ffmpeg at the console's rate, which the run record
 * gives as frames_wanted over seconds. So the frame the picture shows is
 * (part index + the position inside the part) times that rate. The date
 * stamps would need the wall time of frame 0, which is ffmpeg's clock at its
 * header and is recorded nowhere; the console session measured it 3.19 s
 * after started_at on one run and 0.87 s on the GPU alone. The page checks
 * its own claim: a part in the window that is not one second long prints
 * "picture clock unsure" instead of a frame.
 *
 * A press is an event with a frame. The pad posts its register byte on
 * every change, one post in flight at a time; a change that arrives while
 * one is out replaces the pending byte, because a keyboard can change the
 * byte many times a frame and the console only needs the newest. The API
 * answers with the frame the tool says it landed on, and the strip draws
 * it there. This is control, not play, and the bar says so once.
 *
 * A dev key reads; the bar needs an admin key and says so in its hint
 * rather than letting a press fail with a 403. The key was proved against
 * /v1/admin/whoami at sign-in, which is what says which it is.
 */

const POLL_MS = 2000;
/** One part of the playlist, in seconds, as the muxer cuts it; the page's claim about the clock, checked against every part in the window. */
const PART_S = 1;

interface ControlAck {
  kind: "pad" | "reset";
  frame: number;
  landed: boolean;
}

/** A press as the API acknowledged it, drawn on the strip. */
interface Press {
  frame: number;
  bits: number;
  landed: boolean;
  kind: "pad" | "reset";
}

/** What the player knows about the picture it is showing. */
interface Clock {
  frame: number | null;
  /** The reason there is no frame, when there is none. */
  why: string | null;
}

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
  const [presses, setPresses] = useState<Press[]>([]);
  const [clock, setClock] = useState<Clock>({ frame: null, why: "no live picture" });
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

  // -------------------------------------------------------------------------
  // Controls: the pad and reset, as events with a frame.
  //
  // One post in flight; the newest byte waits in `pending` and goes out when
  // the post returns, replacing whatever waited before it. `sent` is the
  // last byte the console was given, so a change back to it sends nothing.
  // -------------------------------------------------------------------------
  const inflight = useRef(false);
  const pending = useRef<number | null>(null);
  const sent = useRef(0);
  const touch = useRef(0);
  const keys = useRef(0);
  const canControl = admin && running;
  const canControlRef = useRef(canControl);
  useEffect(() => {
    canControlRef.current = canControl;
  }, [canControl]);

  const post = useCallback(
    async (first: { kind: "pad"; player: 1; bits: number } | { kind: "reset" }) => {
      inflight.current = true;
      let body = first;
      // One flight at a time: when a post returns, the byte that waited
      // (the newest) goes out next, and so on until nothing waits.
      for (;;) {
        try {
          const ack = await call<ControlAck>(apiKey, "POST", `${path}/control`, body);
          const bits = body.kind === "pad" ? body.bits : 0;
          setPresses((cur) => [...cur, { frame: ack.frame, bits, landed: ack.landed, kind: ack.kind }]);
          if (body.kind === "reset") await refresh();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
        const next = pending.current;
        pending.current = null;
        if (next === null || next === sent.current) break;
        sent.current = next;
        body = { kind: "pad", player: 1, bits: next };
      }
      inflight.current = false;
    },
    [apiKey, path, refresh],
  );

  const publish = useCallback(() => {
    const bits = (touch.current | keys.current) & 0xff;
    if (!canControlRef.current) return;
    if (inflight.current) {
      pending.current = bits;
      return;
    }
    if (bits === sent.current) return;
    sent.current = bits;
    void post({ kind: "pad", player: 1, bits });
  }, [post]);

  const onPad = useCallback(
    (bits: number) => {
      touch.current = bits;
      publish();
    },
    [publish],
  );

  useEffect(() => {
    if (!canControl) return;
    const onKey = (e: KeyboardEvent) => {
      const bit = KEYS[e.code];
      if (bit === undefined) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const was = keys.current;
      if (e.type === "keydown") keys.current |= bit;
      else keys.current &= ~bit;
      e.preventDefault();
      if (keys.current !== was) publish();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [canControl, publish]);

  const reset = () => {
    if (!canControl || inflight.current) return;
    void post({ kind: "reset" });
  };

  const fps = run && run.seconds > 0 ? run.frames_wanted / run.seconds : null;
  const barHint = admin
    ? "Stop ends the run. Reset presses the console's reset and the run goes on. The pad and the keys (X is A, Z is B, the arrows the cross, Enter Start, right Shift Select) post the register byte as it changes. A marker is placed at the frame the console is at."
    : "This key reads the monitor. Stopping, resetting, pressing and marking need an admin key.";

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
          <Picture run={run} fps={fps} onClock={setClock} />
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
          <button className="btn" type="button" onClick={reset} disabled={!canControl} aria-describedby="monitor-bar-hint" data-testid="monitor-reset">
            Reset
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
        {admin ? (
          <div className="monitor-pad" data-testid="monitor-pad" data-live={canControl ? "1" : "0"}>
            <Gamepad onPad={onPad} labels={{ select: "Select", start: "Start" }} />
          </div>
        ) : null}
        <p className="hint" id="monitor-bar-hint">
          {barHint} The picture is seconds behind the console. To play, use{" "}
          <Link href={localize(lang, "/nes/play")}>/nes/play</Link>.
        </p>
      </section>

      <section className="monitor-ledger" aria-label="The ledger">
        {run ? <Ledger run={run} markers={markers} presses={presses} clock={clock} fps={fps} /> : error ? null : <p className="quiet">Asking the API for the run.</p>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------

function Picture({ run, fps, onClock }: { run: Run | null; fps: number | null; onClock: (c: Clock) => void }) {
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
    if (!run.picture) return <p className="quiet">{run.state === "running" ? "No live picture yet: the first part is not written." : "No live picture: this run wrote no playlist."}</p>;
    return <Player src={run.picture} ended={run.state !== "running"} fps={fps} onClock={onClock} />;
  }
  return <p className="quiet">The picture went to {run.output}; there is nothing to show here.</p>;
}

/**
 * hls.js on a muted <video>, so it autoplays, with an unmute control; the
 * sound is the console's own and worth hearing. hls.js is pinned and
 * bundled from node_modules, so it is 'self' to the CSP; it attaches
 * through MediaSource, which is the blob: in media-src. No worker: the
 * worker would be a blob: too, under worker-src, and the page has no need
 * of it for one 720p stream.
 */
function Player({ src, ended, fps, onClock }: { src: string; ended: boolean; fps: number | null; onClock: (c: Clock) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const fpsRef = useRef(fps);
  const onClockRef = useRef(onClock);
  useEffect(() => {
    fpsRef.current = fps;
    onClockRef.current = onClock;
  }, [fps, onClock]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: import("hls.js").default | null = null;
    let gone = false;
    // What the playlist last said: the playing part, and whether every part
    // in the window is one second, which is what makes media time a frame.
    let frag: { sn: number; start: number } | null = null;
    let uniform = true;
    const tell = () => {
      const rate = fpsRef.current;
      if (!frag || rate === null) return onClockRef.current({ frame: null, why: "waiting for the first part" });
      if (!uniform) return onClockRef.current({ frame: null, why: "picture clock unsure: a part is not one second" });
      const media = frag.sn * PART_S + Math.max(0, video.currentTime - frag.start);
      onClockRef.current({ frame: Math.round(media * rate), why: null });
    };
    (async () => {
      const { default: Hls } = await import("hls.js");
      if (gone) return;
      if (!Hls.isSupported()) {
        setNote("This browser cannot play the stream through MediaSource.");
        onClockRef.current({ frame: null, why: "no player" });
        return;
      }
      hls = new Hls({ enableWorker: false, lowLatencyMode: false, liveSyncDurationCount: 2, liveMaxLatencyDurationCount: 5 });
      hls.on(Hls.Events.LEVEL_UPDATED, (_e, data) => {
        uniform = data.details.fragments.every((f) => Math.abs(f.duration - PART_S) < 0.002);
        tell();
      });
      hls.on(Hls.Events.FRAG_CHANGED, (_e, data) => {
        frag = { sn: data.frag.sn, start: data.frag.start };
        tell();
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setNote(`The player stopped: ${data.details}.`);
      });
      hls.attachMedia(video);
      hls.loadSource(src);
      video.addEventListener("timeupdate", tell);
      void video.play().catch(() => {
        /* autoplay refused: the reader presses play */
      });
    })();
    return () => {
      gone = true;
      video.removeEventListener("timeupdate", tell);
      hls?.destroy();
    };
  }, [src]);

  return (
    <div className="monitor-player" data-testid="monitor-player" data-ended={ended ? "1" : "0"}>
      <video ref={videoRef} muted={muted} playsInline controls={false} aria-label="The model's picture, live" />
      <div className="monitor-player-bar">
        <button className="btn btn-ghost" type="button" onClick={() => setMuted((m) => !m)}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <span className="quiet">{note ?? (ended ? "The run has ended; this is its last picture." : "Live, seconds behind the console.")}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The ledger and the strip
// ---------------------------------------------------------------------------

function Ledger({ run, markers, presses, clock, fps }: { run: Run; markers: Marker[]; presses: Press[]; clock: Clock; fps: number | null }) {
  const wanted = Math.max(run.frames_wanted, 1);
  const at = (frame: number) => `${Math.min(100, Math.max(0, (frame / wanted) * 100))}%`;
  const lag = clock.frame === null ? null : run.frames_sent - clock.frame;
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
            <dd data-testid="monitor-picture-frame">{clock.frame === null ? clock.why ?? "no live picture" : `frame ${clock.frame}`}</dd>
          </div>
          <div>
            <dt>Picture lag</dt>
            <dd data-testid="monitor-picture-lag">{lag === null || fps === null ? "" : `${lag} frames, ${(lag / fps).toFixed(1)} s, against the console's last count`}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{stamp(run.started_at)}</dd>
          </div>
          <div>
            <dt>Markers</dt>
            <dd>{markers.length}</dd>
          </div>
          <div>
            <dt>Presses</dt>
            <dd>{presses.length}</dd>
          </div>
        </dl>
      </aside>

      <div
        className="strip"
        data-testid="monitor-strip"
        data-scale={run.frames_wanted}
        role="img"
        aria-label={`Frames 0 to ${run.frames_wanted}: the console at ${run.frames_sent}, ${markers.length} markers, ${presses.length} presses`}
      >
        <div className="strip-axis">
          <i className="strip-done" style={{ width: at(run.frames_sent) }} />
          <b className="strip-cursor" style={{ left: at(run.frames_sent) }} title={`console at frame ${run.frames_sent}`} />
          {clock.frame !== null ? <b className="strip-cursor picture" style={{ left: at(clock.frame) }} title={`picture at frame ${clock.frame}`} /> : null}
          {markers.map((m, i) => (
            <s key={`m${i}`} className="strip-mark" data-marker={m.frame} style={{ left: at(m.frame) }} title={`${m.frame}: ${m.text}`} />
          ))}
          {presses.map((p, i) => (
            <u
              key={`p${i}`}
              className={p.landed ? "strip-press" : "strip-press floor"}
              data-press={p.frame}
              style={{ left: at(p.frame) }}
              title={`${p.frame}: ${p.kind === "reset" ? "reset" : `pad ${p.bits.toString(16).padStart(2, "0")}`}${p.landed ? "" : " (a floor: the tool did not echo)"}`}
            />
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
