"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hexBytes, type Art } from "@/lib/registry";
// The console's own decoder, imported rather than reimplemented.
//
// This is the rule about one copy of a fact, applied to the place it would
// have cost the most. An avatar and a cover are CHR: 8x8 tiles, two bits a
// pixel, sixteen bytes each, four colours off the die's own palette. Writing
// that out again here would be a second definition of the tile format, and
// two definitions of a format do not disagree loudly. They disagree by one
// bit plane, on somebody else's artwork, and look like bad art.
//
// It is the file already served at /6502/games/chr.js, byte for byte from the
// 6502 repository. Bundling it here and serving it there are two deliveries
// of one source, which is the arrangement the rule asks for.
import { buildSheet, decodeCHR, drawScreen, TILE } from "../../public/6502/games/chr.js";

/**
 * One registry image, drawn on a canvas.
 *
 * `art=inline` gives the bytes; `art=none` gives a URL and the dimensions.
 * Both are handled, because the deployed service answers the first and main
 * answers the second, and a component that only understood one would break on
 * the day the other is deployed.
 *
 * It refuses rather than guesses. A block whose length is not exactly
 * `w * h * 16` is not drawn at all: the alternative is a picture that is
 * silently the wrong shape, which is the failure mode this repository keeps
 * paying for. The box stays, at the right aspect, saying what it wanted.
 */
export function ChrArt({
  art,
  api,
  alt,
  scale = 4,
}: {
  art: Art;
  /** Where the 6502 API answers. Needed only for the `art=none` form. */
  api: string;
  alt: string;
  scale?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [chr, setChr] = useState<string | null>(art.chr ?? null);
  const [missing, setMissing] = useState<string | null>(null);

  // Whether the bytes match the picture they claim to be is a fact about the
  // props, not an event, so it is worked out while rendering. Doing it in the
  // drawing effect meant a setState inside an effect body: a second render,
  // and a frame in which a wrongly sized canvas had already been shown.
  const bytes = useMemo(() => (chr ? hexBytes(chr) : null), [chr]);
  const want = art.w * art.h * 16;
  const wrongSize =
    bytes && bytes.length !== want
      ? `${bytes.length} bytes for ${art.w}x${art.h} tiles, which needs ${want}`
      : null;
  const refused = wrongSize ?? missing;

  // The other half of art=none: the listing said where the picture is.
  useEffect(() => {
    if (art.chr || !art.url) return;
    let live = true;
    const stop = new AbortController();
    fetch(`${api}${art.url}`, { signal: stop.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: Art) => {
        if (live && body.chr) setChr(body.chr);
      })
      .catch(() => {
        if (live) setMissing("the art did not answer");
      });
    return () => {
      live = false;
      stop.abort();
    };
  }, [api, art.chr, art.url]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !bytes || wrongSize) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const sheet = buildSheet(decodeCHR(bytes), scale);
    // Tiles are row major and every one is used once, so the index list is
    // simply 0..n. drawScreen takes it from there, which keeps the blit path
    // identical to the console's.
    drawScreen(ctx, sheet, Array.from({ length: art.w * art.h }, (_, i) => i), art.w, art.h);
  }, [bytes, wrongSize, art.w, art.h, scale]);

  const w = art.w * TILE * scale;
  const h = art.h * TILE * scale;

  if (refused) {
    return (
      <div
        className="chr chr-refused"
        style={{ aspectRatio: `${art.w} / ${art.h}` }}
        title={refused}
        role="img"
        aria-label={`${alt}: not drawn, ${refused}`}
      />
    );
  }

  return (
    <canvas
      ref={canvas}
      className="chr"
      width={w}
      height={h}
      role="img"
      aria-label={alt}
      /* The canvas is sized in tiles and displayed at whatever width the
         layout gives it. Nearest-neighbour, because these are pixels that
         somebody placed and smoothing them is an opinion about their art. */
      style={{ aspectRatio: `${art.w} / ${art.h}` }}
    />
  );
}
