"use client";

import { useState } from "react";
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

export async function call<T>(key: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
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
// Sign in: a key, proved against /v1/admin/whoami, which also says what the
// key can do. Asking is the rule; a page that infers its permissions from a
// 403 shows the wrong thing whenever the failure has another cause.
// ---------------------------------------------------------------------------

export function SignIn({
  intro,
  button,
  testId,
  onKey,
}: {
  intro: ReactNode;
  button: string;
  testId: string;
  onKey: (key: string, who: WhoAmI) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const who = await call<WhoAmI>(value.trim(), "GET", "/v1/admin/whoami");
      onKey(value.trim(), who);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="prose" data-testid={testId}>
      {intro}
      <form onSubmit={(e) => void submit(e)}>
        <div className={error ? "field bad" : "field"}>
          <label htmlFor="stream-key">Dev key</label>
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
            Any live key reads; starting, stopping and marking take an admin key. Held in this tab only.
          </span>
        </div>
        {error ? (
          <p className="notice fail" role="alert">
            {error}
          </p>
        ) : null}
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <button className="btn btn-primary" type="submit" disabled={busy || !value.trim()}>
            {button}
          </button>
        </div>
      </form>
    </div>
  );
}
