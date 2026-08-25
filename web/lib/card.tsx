import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { token } from "./tokens";
import type { Lang } from "./lang";
import { decodeCHR, PALETTE, TILE } from "../public/6502/games/chr.js";
import { hexBytes, type Art } from "./registry";

/**
 * The card a link unfurls into.
 *
 * iMessage, X, Slack and the rest fetch `og:image` and show it beside the
 * title, and a link without one is a grey box with a URL in it. This draws
 * the page's own name and sentence on the house paper, with the die tile the
 * page carries in its bar, so the unfurl IS the page rather than a logo.
 *
 * Everything on it comes from where the page gets it: the words from the
 * same metadata call, the colours from style/tokens.css, the faces from
 * style/fonts (Archivo, IBM Plex Sans, IBM Plex Mono). Satori, which draws
 * these, reads TTF and WOFF and not woff2, so style/fonts/og holds the same
 * families in those containers; its README says how they were made.
 *
 * Japanese: the site's pages fall back to the reader's system font for
 * Japanese, which a server has none of. style/fonts/og carries a subset of
 * Noto Sans CJK JP (bold, the kana and every unified ideograph) and the
 * renderer falls through to it per glyph. data/check-og-font.py fails the
 * build on any Japanese character the subset cannot draw.
 */

export const CARD_W = 1200;
export const CARD_H = 630;

const FONT_DIR = path.join(process.cwd(), "..", "style", "fonts", "og");

interface Face {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
}

let faces: Face[] | null = null;

function loadFaces(): Face[] {
  if (faces) return faces;
  const read = (f: string) => {
    const b = fs.readFileSync(path.join(FONT_DIR, f));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  faces = [
    { name: "Archivo", data: read("Archivo-700-latin.ttf"), weight: 700, style: "normal" },
    { name: "Archivo", data: read("Archivo-700-latin-ext.ttf"), weight: 700, style: "normal" },
    { name: "IBM Plex Sans", data: read("IBMPlexSans-400-latin.ttf"), weight: 400, style: "normal" },
    { name: "IBM Plex Mono", data: read("IBMPlexMono-400-latin.ttf"), weight: 400, style: "normal" },
    { name: "Noto Sans JP", data: read("NotoSansJP-Bold.woff"), weight: 700, style: "normal" },
  ];
  return faces;
}

/**
 * The project's accent on paper, read from its silo the way the page reads
 * it: an uncommented `--color-accent-ink` in style/projects/<key>.css, else
 * the house value. Nothing is chosen here.
 */
function accentInk(project: string | null): string {
  if (project) {
    try {
      const css = fs.readFileSync(path.join(process.cwd(), "..", "style", "projects", `${project}.css`), "utf8");
      const live = css.replace(/\/\*[\s\S]*?\*\//g, "");
      const m = live.match(/--color-accent-ink\s*:\s*var\(--color-([a-z-]+)\)/);
      if (m) return token(`color-${m[1]}`);
    } catch { /* no silo: the house value */ }
  }
  return token("color-burnt-ink");
}

/** A CHR picture as an SVG the renderer can place, one rect per run of pixels. */
export function chrSvg(art: Art & { chr: string }): string | null {
  const bytes = hexBytes(art.chr);
  if (bytes.length !== art.w * art.h * 16) return null;
  const tiles = decodeCHR(bytes) as Uint8Array[];
  const W = art.w * TILE;
  const H = art.h * TILE;
  const rects: string[] = [];
  for (let ty = 0; ty < art.h; ty++) {
    for (let y = 0; y < TILE; y++) {
      let x0 = 0;
      let cur = -1;
      const flush = (xEnd: number) => {
        if (cur > 0) rects.push(`<rect x="${x0}" y="${ty * TILE + y}" width="${xEnd - x0}" height="1" fill="${PALETTE[cur]}"/>`);
      };
      for (let tx = 0; tx < art.w; tx++) {
        const px = tiles[ty * art.w + tx];
        for (let x = 0; x < TILE; x++) {
          const c = px[y * TILE + x];
          const gx = tx * TILE + x;
          if (c !== cur) { flush(gx); cur = c; x0 = gx; }
        }
      }
      flush(W);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges"><rect width="${W}" height="${H}" fill="${PALETTE[0]}"/>${rects.join("")}</svg>`;
}

export interface Card {
  lang: Lang;
  /** What the die tile in the page's bar says: 6502, hotbits, or the site. */
  die: string;
  project: string | null;
  title: string;
  description: string;
  /** The address, as the reader will see it under the title. */
  path: string;
  /** A cover picture, already an SVG string. */
  cover?: string | null;
}

/** Cut a line to fit the card, at a word where there is one. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,:;\s]+$/, "") + "…";
}

export function renderCard(c: Card): ImageResponse {
  const paper = token("color-paper");
  const ink = token("color-ink");
  const muted = token("color-ink-muted");
  const rule = token("color-rule");
  const mustard = token("color-mustard");
  const accent = accentInk(c.project);
  const ja = c.lang === "ja";
  const display = ja ? "Noto Sans JP" : "Archivo";
  const sans = ja ? "Noto Sans JP" : "IBM Plex Sans";
  const title = clip(c.title, ja ? 40 : 70);
  const description = clip(c.description, ja ? 90 : 150);
  const titleSize = title.length > (ja ? 22 : 40) ? 60 : 76;
  const address = `tinymachines.ai${c.path === "/" ? "" : c.path}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: CARD_W,
          height: CARD_H,
          display: "flex",
          background: paper,
          color: ink,
          fontFamily: sans,
          position: "relative",
        }}
      >
        {/* The project's colour, as a band down the edge: the same knob the
            page's die tile turns. */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 22, height: CARD_H, background: accent, display: "flex" }} />

        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 64px 52px 86px", minWidth: 0 }}>
          {/* The bar: die tile and wordmark, as on the page. */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: "IBM Plex Mono", fontSize: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 64,
                height: 64,
                padding: "0 14px",
                background: ink,
                color: mustard,
                fontSize: 26,
                letterSpacing: 1,
              }}
            >
              {c.die}
            </div>
            <div style={{ display: "flex", color: muted }}>tinymachines.ai</div>
          </div>

          {/* The name and the sentence. */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 22, paddingTop: 24, paddingBottom: 24 }}>
            <div
              style={{
                display: "flex",
                fontFamily: display,
                fontWeight: 700,
                fontSize: titleSize,
                lineHeight: 1.06,
                letterSpacing: ja ? 0 : -1.5,
                color: ink,
              }}
            >
              {title}
            </div>
            <div style={{ display: "flex", fontSize: ja ? 28 : 31, lineHeight: 1.35, color: muted, maxWidth: c.cover ? 620 : 1000 }}>
              {description}
            </div>
          </div>

          {/* The address, over a hairline: where this card leads. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", height: 2, background: rule, width: "100%" }} />
            <div style={{ display: "flex", fontFamily: "IBM Plex Mono", fontSize: 24, color: accent }}>{address}</div>
          </div>
        </div>

        {c.cover ? (
          <div style={{ display: "flex", alignItems: "center", paddingRight: 64 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              width={380}
              height={380}
              src={`data:image/svg+xml;base64,${Buffer.from(c.cover).toString("base64")}`}
              style={{ border: `2px solid ${ink}` }}
            />
          </div>
        ) : null}
      </div>
    ),
    {
      width: CARD_W,
      height: CARD_H,
      fonts: loadFaces(),
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    },
  );
}
