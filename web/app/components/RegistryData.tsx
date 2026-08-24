"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";

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

/**
 * Waiting, or a reason. Rendered in the same box either way.
 *
 * It says "the service" rather than naming one. This started as the registry's
 * own and is now used by four pages against three different hosts, and it read
 * as "the registry answered" on a page about a Geiger counter.
 *
 * "Failed to fetch" is what a browser gives a script for a request that never
 * completed, and it is deliberately the same message whether the host is down,
 * the response carried no CORS header, or this page's own policy refused to
 * make the request. A script is not allowed to tell those apart, so this does
 * not guess between them: it prints what it was told and says that the message
 * covers all three.
 */
export function RegistryState({
  error,
  what,
  lang = "en",
}: {
  error: string | null;
  what: string;
  lang?: Lang;
}) {
  const ja = lang === "ja";
  if (error) {
    return (
      <p className="reg-state fail">
        <b>{ja ? `${what}を読めなかった。` : `${what} could not be read.`}</b>{" "}
        {ja ? "サービスの答え" : "The service answered"}: {error}
        {/^(Failed to fetch|Load failed|NetworkError)/.test(error) ? (
          ja ? (
            <>
              {" "}
              ブラウザは、ホストに届かない場合も、応答に CORS
              ヘッダが無かった場合も、このページ自身のポリシーが要求を拒んだ場合も、同じこの文言をスクリプトに報告する。三つを見分けることはスクリプトには許されていない。
            </>
          ) : (
            <>
              {" "}
              A browser reports that same message whether the host is unreachable,
              its reply carried no CORS header, or this page&rsquo;s own content
              policy declined to make the request, and a script is not permitted
              to tell the three apart.
            </>
          )
        ) : null}
      </p>
    );
  }
  return <p className="reg-state">{ja ? `${what}を読んでいる。` : `Reading ${what}.`}</p>;
}
