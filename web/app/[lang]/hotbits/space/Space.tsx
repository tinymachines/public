"use client";

import dynamic from "next/dynamic";
import { useSharedEntropy } from "./use-entropy";

/**
 * The four entropy views, composed.
 *
 * ONE pull of archived decay bytes feeds the cube, the return map and the
 * raster. Each widget asking for its own would triple the request for three
 * pictures of the same thing; sharing the buffer also means the three views are
 * demonstrably of the SAME bytes, which is the point of showing them together.
 *
 * Every view is client-only and route-scoped, so three.js never enters the
 * server bundle or any other page on this site.
 */

const SHARED_BYTES = 6144;

function Loading({ label }: { label: string }) {
  return <p className="space-loading">bringing up {label}…</p>;
}

const EntropyCube = dynamic(() => import("./EntropyCube"), {
  ssr: false,
  loading: () => <Loading label="the 3D field" />,
});
const ReturnMap = dynamic(() => import("./ReturnMap"), {
  ssr: false,
  loading: () => <Loading label="the return map" />,
});
const BitRaster = dynamic(() => import("./BitRaster"), {
  ssr: false,
  loading: () => <Loading label="the bit raster" />,
});
const MetricsPhaseSpace = dynamic(() => import("./MetricsPhaseSpace"), {
  ssr: false,
  loading: () => <Loading label="phase space" />,
});

export interface SpaceLabels {
  cube: string;
  cubeWhy: string;
  ret: string;
  retWhy: string;
  raster: string;
  rasterWhy: string;
  phase: string;
  phaseWhy: string;
}

export function Space({ labels }: { labels: SpaceLabels }) {
  // `regenerate` swaps in a fresh slice of the archive. It is safe to call
  // freely: the archive is append-only and already-served, so a reader cannot
  // drain the fresh tip real consumers depend on.
  const { bytes, status, regenerate } = useSharedEntropy(SHARED_BYTES);

  const shared = { bytes, status, onRegenerate: regenerate };

  return (
    <>
      <section className="space-view">
        <h2>{labels.cube}</h2>
        <p>{labels.cubeWhy}</p>
        <EntropyCube {...shared} />
      </section>

      <section className="space-view">
        <h2>{labels.ret}</h2>
        <p>{labels.retWhy}</p>
        <ReturnMap {...shared} />
      </section>

      <section className="space-view">
        <h2>{labels.raster}</h2>
        <p>{labels.rasterWhy}</p>
        <BitRaster {...shared} />
      </section>

      <section className="space-view">
        <h2>{labels.phase}</h2>
        <p>{labels.phaseWhy}</p>
        {/* Reads /metrics itself: it plots the daemon's own bookkeeping rather
            than the shared byte buffer. */}
        <MetricsPhaseSpace />
      </section>
    </>
  );
}
