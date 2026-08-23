"use client";

import { useEffect, useState } from "react";

/**
 * Live reachability, asked of our own API after the page has rendered.
 *
 * Progressive on purpose. The six pieces are prerendered and readable with no
 * JavaScript at all; this only adds what the server measured about them. If
 * the fetch fails, or is blocked, or the API is down, the cards stay exactly
 * as they were and no state is claimed. A front page that renders nothing
 * because a status endpoint is unreachable would be a worse page than one that
 * simply does not mention status.
 *
 * Same origin, so it needs nothing from connect-src beyond 'self'.
 *
 * STYLE.md section 1 governs what this may look like: a measurement is not
 * marketing, so it renders as the kit's .tag with a state colour rather than
 * as anything decorative, and `unknown` is a state that shows nothing at all.
 */

type Reach = "up" | "down" | "unreachable" | "not_probed";

interface Row {
  key: string;
  reachability: Reach;
  http_status: number | null;
  latency_ms: number | null;
  detail: string | null;
}

const LABEL: Record<Reach, string> = {
  up: "up",
  down: "down",
  unreachable: "unreachable",
  not_probed: "not hosted",
};

// .tag.live / .warn / .fail are the kit's three states. `down` is warn rather
// than fail on purpose: the host answered, so something is running and the
// application is the part that is wrong. Nothing arriving at all is fail.
const CLASS: Record<Reach, string> = {
  up: "tag live",
  down: "tag warn",
  unreachable: "tag fail",
  not_probed: "tag",
};

export function PieceStatus({ pieceKey }: { pieceKey: string }) {
  const [row, setRow] = useState<Row | null>(null);

  useEffect(() => {
    let live = true;
    const stop = new AbortController();
    fetch("/api/v1/status", { signal: stop.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { pieces: Row[] }) => {
        if (!live) return;
        setRow(body.pieces.find((p) => p.key === pieceKey) ?? null);
      })
      .catch(() => {
        // Deliberately silent, and deliberately leaves the tag absent. An
        // error state here would be reporting on this page's own fetch, not
        // on the piece, and the reader cannot act on either.
      });
    return () => {
      live = false;
      stop.abort();
    };
  }, [pieceKey]);

  if (!row) return null;

  const detail =
    row.reachability === "up" && row.latency_ms !== null
      ? `${row.http_status} in ${row.latency_ms}ms`
      : row.detail ?? (row.http_status !== null ? String(row.http_status) : "");

  return (
    <span className={CLASS[row.reachability]} title={detail || undefined}>
      {LABEL[row.reachability]}
    </span>
  );
}
