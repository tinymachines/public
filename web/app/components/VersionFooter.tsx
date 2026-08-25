"use client";

import { useEffect, useState } from "react";

/**
 * What is actually running, and how long it has been running.
 *
 * The pattern is the 6502 site's `version-footer.js`, ported with its reason
 * intact: **the elapsed time has to stay true.** "3m ago" written into a page
 * at build time is wrong within the hour and quietly misleading after that,
 * and this site is served from prerendered, long-cached documents precisely so
 * pages are not regenerated. So only the fact is fetched; the arithmetic
 * happens on each load.
 *
 * What is different here is where the fact comes from. The 6502 site reads a
 * `build-info.json` the build wrote beside it, which is a file saying what the
 * build believed. This asks `/api/v1/meta`, which is the running process
 * reading its own `.git`. That is the registry's rule applied to the site's own
 * footer: the thing that publishes must not be the thing that claims.
 *
 * It fails silently and renders nothing, on purpose. The API being unreachable
 * is not a reason to put an error in the footer of every page on the site, and
 * a footer that says "unknown" is worse than a footer that says nothing: it
 * draws the eye to a fact nobody was looking for.
 */

interface Meta {
  version: string;
  commit: string | null;
  branch: string | null;
  started_at: string;
}

/** Compact relative time. Deliberately coarse: this answers "did it ship?". */
function since(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";           // includes clock skew, which reads fine
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export function VersionFooter() {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    // Aborted on unmount so a client-side navigation away from a slow response
    // does not set state on a component that is gone.
    const stop = new AbortController();
    fetch("/api/v1/meta", { signal: stop.signal, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Meta>) : null))
      .then((m) => {
        if (m) setMeta(m);
      })
      .catch(() => {
        /* see the component docstring: silence is the correct failure here */
      });
    return () => stop.abort();
  }, []);

  if (!meta?.commit) return null;

  const short = meta.commit.slice(0, 7);
  return (
    // One span, so the run is one flex item: it sits at the right on a wide
    // screen and drops whole to a second line on a phone, where it used to be
    // clipped mid-word behind the footer's overflow.
    <span className="foot-run">
      {/* Both, because they answer different questions. The version is what a
          person says out loud; the commit is what a bug report needs. */}
      <span>v{meta.version}</span>
      {" · "}
      <a
        href={`https://github.com/tinymachines/public/commit/${meta.commit}`}
        title={`${meta.branch ?? "detached"} at ${meta.commit}`}
      >
        {short}
      </a>{" "}
      <span className="quiet">up {since(meta.started_at)}</span>
    </span>
  );
}
