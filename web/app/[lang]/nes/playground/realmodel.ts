import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "@/lib/docs";
import { passage } from "./exhibits";

/**
 * Real or model: the engineers' three-way picture of one title screen
 * (web/public/nes/lab/eyes-threeway-title.png, the 2026-09-13 rerun, the
 * model with its CPU and sprite DMA corrected), and what they measured
 * on it, read at build time from docs/nes/eyes-vs-scope.md.
 *
 * The panels' order is taken from the figure's own caption in the
 * report, not assumed: the caption must name the model, the decoder and
 * the grabber in that order, or the station refuses. The page finds the
 * panels' edges in the picture itself.
 */

const FIGURE = "/nes/lab/eyes-threeway-title.png";

export type RealModel =
  | {
      ok: true;
      src: string;
      width: number;
      height: number;
      caption: string;
      /** The model-against rows of the report's table, cells as written. */
      rows: string[][];
      passages: string[];
    }
  | { ok: false; reason: string };

export function realModel(): RealModel {
  const file = path.join(DOCS_DIR, "nes", "eyes-vs-scope.md");
  const png = path.join(process.cwd(), "public", FIGURE);
  if (!fs.existsSync(file)) return { ok: false, reason: "eyes-vs-scope.md is not in this build" };
  if (!fs.existsSync(png)) return { ok: false, reason: "the three-way picture is not in this build" };
  const md = fs.readFileSync(file, "utf8");
  const img = md.match(new RegExp(`!\\[([^\\]]+)\\]\\(${FIGURE.replace(/[.]/g, "\\.")}\\)`));
  if (!img) return { ok: false, reason: "the report no longer shows the three-way picture" };
  const caption = img[1];
  if (!/model, the decoder and the grabber/i.test(caption)) {
    return { ok: false, reason: `the picture's caption no longer names its panels in order: "${caption}"` };
  }
  const b = fs.readFileSync(png);
  const [width, height] = [b.readUInt32BE(16), b.readUInt32BE(20)];
  // The table's model rows, from the three-way section on.
  const at = md.indexOf(`](${FIGURE})`);
  const rows = md
    .slice(at)
    .split("\n")
    .filter((l) => /^\|\s*model against/.test(l))
    .slice(0, 2)
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  if (rows.length < 2) return { ok: false, reason: "the report's model-against rows have moved" };
  const found = ["The logo's brown is", "The part's output under load."].map((a) => passage(md, a));
  if (found.some((p) => !p)) return { ok: false, reason: "the report's passages on the hue have moved" };
  return { ok: true, src: FIGURE, width, height, caption, rows, passages: found as string[] };
}
