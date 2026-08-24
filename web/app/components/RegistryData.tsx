"use client";

import { useEffect, useState } from "react";

/**
 * Asking the 6502 service for something, and saying so when it does not
 * answer.
 *
 * Two pages need this and neither should carry its own copy of what a failed
 * fetch means. It is small on purpose: no cache, no retry, no library. The
 * registry is one document and the browser already caches.
 *
 * The three states are distinct and all three are said out loud. Waiting is
 * not the same as empty, and empty is not the same as unreachable: a page
 * that renders "no builders yet" because a request failed is the exact shape
 * of quiet wrong this repository keeps paying for.
 */
export function useRegistry<T>(url: string): {
  data: T | null;
  error: string | null;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clearing the previous answer when the URL changes, during render rather
  // than in the effect. React's own guidance and this repository's lint agree:
  // a setState in an effect body is a second render nobody asked for, and the
  // same rule has now been hit three times here. Adjusting state while
  // rendering is the documented way to say "this is a different subject", and
  // it means the stale builder never paints under the new heading.
  const [asked, setAsked] = useState(url);
  if (asked !== url) {
    setAsked(url);
    setData(null);
    setError(null);
  }

  useEffect(() => {
    let live = true;
    const stop = new AbortController();
    fetch(url, { signal: stop.signal })
      .then(async (r) => {
        if (r.ok) return r.json();
        // The service says why in `detail`, and the reason is more use than
        // the number. "no builder 'nobody'" is an answer; 404 is a code.
        const body = await r.json().catch(() => null);
        throw new Error(body?.detail ?? `HTTP ${r.status}`);
      })
      .then((body: T) => {
        if (live) setData(body);
      })
      .catch((e: unknown) => {
        if (!live || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
      stop.abort();
    };
  }, [url]);

  return { data, error };
}

/** Waiting, or a reason. Rendered in the same box either way. */
export function RegistryState({ error, what }: { error: string | null; what: string }) {
  if (error) {
    return (
      <p className="reg-state fail">
        <b>{what} could not be read.</b> The registry answered: {error}
      </p>
    );
  }
  return <p className="reg-state">Reading {what} from the registry.</p>;
}
