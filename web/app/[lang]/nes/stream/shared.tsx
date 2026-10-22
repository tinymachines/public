"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * What the stream desk (/nes/stream) and the stream monitor (/nes/stream/{id})
 * share: the shapes the API returns, the one way of calling it, two
 * formatters, and the sign-in form. One copy, read by both, on the house
 * rule: a shape typed twice drifts the first time the API grows a field.
 *
 * The key is held in a useState by whichever page signed in, and nowhere
 * else: this site's CSP carries 'unsafe-inline', so nothing credential-shaped
 * is kept where a script on the origin could read it. Moving from the desk to
 * a monitor asks for the key again, on purpose.
 */

// ---------------------------------------------------------------------------
// The shapes the API returns, kept to what the two pages read.
// ---------------------------------------------------------------------------

export interface Game {
  id: string;
  bytes: number;
  sha256: string;
}

export interface Outputs {
  file: boolean;
  /** True when the service names a stream home nginx serves at /nes/live/: the monitor's live picture. */
  hls: boolean;
  rtmp: boolean;
  youtube: boolean;
  runner: boolean;
}

export type Output = "file" | "rtmp" | "youtube" | "hls";
export type State = "running" | "done" | "failed" | "stopped" | "lost";

export interface Run {
  id: string;
  game: string;
  output: Output;
  seconds: number;
  pace: boolean;
  state: State;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  frames_sent: number;
  frames_wanted: number;
  elapsed_s: number;
  worst_lag_ms: number | null;
  frames_late: number | null;
  ffmpeg_ok: boolean | null;
  /** Cost per frame in ms, from the line the tool prints once after its frame loop ends; null while running and on a run whose log has no such line. */
  ms_console: number | null;
  ms_encode: number | null;
  ms_gpu: number | null;
  ms_readback: number | null;
  ms_convert: number | null;
  ms_handoff: number | null;
  file_ready: boolean;
  markers: number;
  /** The live playlist's site path for an hls run, once the API has it (the monitor's M2); absent or null otherwise. */
  picture?: string | null;
}

export interface Marker {
  frame: number;
  at: string;
  text: string;
}

/** GET /v1/admin/whoami: what the key is and whether it can act. */
export interface WhoAmI {
  can_administer: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function explain(status: number, body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          const item = d as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
          return field ? `${String(field)}: ${item.msg ?? "invalid"}` : String(item.msg ?? "invalid");
        })
        .join("; ");
    }
  }
  return `The API answered ${status} and said nothing more.`;
}

/** A call to the control plane. With a key, as a bearer; with null, on the
 *  browser's own cookie, which is the account service's passkey session
 *  (api/kitaccounts.py) and goes along with a same-origin fetch by itself. */
export async function call<T>(key: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, explain(res.status, parsed));
  return parsed as T;
}

export function stamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(11, 19)}Z`;
}

export function seconds(n: number): string {
  const m = Math.floor(n / 60);
  const s = Math.round(n - m * 60);
  return m ? `${m} min ${s} s` : `${s} s`;
}

// ---------------------------------------------------------------------------
// Sign in. Two ways, and the page asks first which applies (GET
// /v1/stream/me) rather than guessing from a failure:
//
// - A tinymachines.ai passkey, the sign-in every app on the kit has. The
//   button sends the reader to the accounts site's hand-off page, which runs
//   the ceremony and comes straight back here with the cookie set. A signed-in
//   person who is not yet an operator sees that said, with the one-time field
//   where an admin key makes them one.
// - A key, proved against /v1/stream/me, which also says what it can do.
//
// Nothing here knows the accounts site's address: it comes from the API's
// answer, which read it from the service.
// ---------------------------------------------------------------------------

export interface Me {
  via: "key" | "passkey" | null;
  handle: string | null;
  account_id: string | null;
  operator: boolean;
  can_read: boolean;
  can_administer: boolean;
  sign_in: { home: string; site: string } | null;
  why: string | null;
}

/** What the desk or the monitor is open as. */
export interface Session {
  /** The bearer key, or null for a passkey session (the cookie goes by itself). */
  key: string | null;
  via: "key" | "passkey";
  label: string;
  can_administer: boolean;
}

export function SignIn({
  intro,
  button,
  testId,
  onSession,
}: {
  intro: ReactNode;
  button: string;
  testId: string;
  onSession: (s: Session) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [asked, setAsked] = useState(false);
  const [here, setHere] = useState("");

  // Who am I already, by the cookie? An operator goes straight in.
  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const m = await call<Me>(null, "GET", "/v1/stream/me");
        if (gone) return;
        setMe(m);
        if (m.via === "passkey" && m.operator) onSession({ key: null, via: "passkey", label: m.handle ?? "", can_administer: true });
      } catch (err) {
        if (!gone) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!gone) {
          setAsked(true);
          // The page's own address, for the hand-off's way back; read here,
          // after the first answer, so the server's render and the browser's
          // first paint agree.
          setHere(window.location.href);
        }
      }
    })();
    return () => {
      gone = true;
    };
  }, [onSession]);

  const withKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const key = value.trim();
    try {
      if (me?.via === "passkey" && me.account_id && !me.operator) {
        // The one-time use of the admin key: make this account an operator,
        // then open on the passkey alone.
        await call(key, "POST", "/v1/admin/operators", { account_id: me.account_id, handle: me.handle ?? "", note: "added from the desk" });
        const m = await call<Me>(null, "GET", "/v1/stream/me");
        setMe(m);
        if (m.operator) onSession({ key: null, via: "passkey", label: m.handle ?? "", can_administer: true });
        else setError(m.why ?? "The operator was added, but the session does not read as one yet. Reload.");
      } else {
        const m = await call<Me>(key, "GET", "/v1/stream/me");
        onSession({ key, via: "key", label: m.handle ?? "a key", can_administer: m.can_administer });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await call(null, "POST", "/v1/stream/sign-out");
      setMe(await call<Me>(null, "GET", "/v1/stream/me"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const signedIn = me?.via === "passkey";
  const passkeyHref = me?.sign_in && here ? `${me.sign_in.home}/?${new URLSearchParams({ site: me.sign_in.site, next: here })}` : null;

  return (
    <div className="prose" data-testid={testId}>
      {intro}
      {signedIn ? (
        <p data-testid="stream-signed-in">
          Signed in as <span className="data">{me?.handle}</span> with a passkey, not yet an operator of the desk. An
          admin key makes this account one, once; after that the passkey alone opens it.
        </p>
      ) : (
        <p>
          <a
            className="btn btn-primary"
            data-testid="stream-passkey"
            href={passkeyHref ?? "#"}
            aria-disabled={passkeyHref ? undefined : true}
            onClick={(e) => {
              if (!passkeyHref) e.preventDefault();
            }}
          >
            Sign in with a passkey
          </a>{" "}
          <span className="hint">
            {asked && me && !me.sign_in
              ? "The account service did not answer, so a passkey cannot sign in right now. A key still can."
              : "The same tinymachines.ai passkey as every other app. Or a key, below."}
          </span>
        </p>
      )}
      <form onSubmit={(e) => void withKey(e)}>
        <div className={error ? "field bad" : "field"}>
          <label htmlFor="stream-key">{signedIn ? "Admin key, once" : "Key"}</label>
          <input
            id="stream-key"
            className="input data"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby="stream-key-hint"
          />
          <span className="hint" id="stream-key-hint">
            {signedIn
              ? "Used for this one call and forgotten."
              : "Any live key reads; starting, stopping and marking take an admin key or an operator's passkey. Held in this tab only."}
          </span>
        </div>
        {error ? (
          <p className="notice fail" role="alert">
            {error}
          </p>
        ) : null}
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <button className="btn btn-primary" type="submit" disabled={busy || !value.trim()}>
            {signedIn ? "Make me an operator" : button}
          </button>
          {signedIn ? (
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void signOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
