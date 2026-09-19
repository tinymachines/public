import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "@/lib/docs";

/**
 * Super Mario Bros.' frame, read at build time out of the dissection's own
 * table (docs/nes/mario-dissection.md, "The handler in scanline order").
 * The engineers' document is the one copy: every line, dot and address
 * the playground draws is a cell of that table, and the plain sentence
 * beside each row is a translation of the row's words (which register,
 * which bit), never a new figure. When the table is not there, or its
 * shape has changed, the station says so rather than drawing a guess.
 */

export type Kind = "wait" | "logic" | "idle" | "copy" | "busy";

export interface Row {
  line: number;
  /** The row's last line, where the row names a stretch ("31 to 89"). */
  lineTo: number | null;
  dot: number | null;
  what: string;
  where: string;
  kind: Kind;
  plain: string;
}

export type MarioFrame = { ok: true; rows: Row[]; frame: string } | { ok: false; reason: string };

const FILE = path.join(DOCS_DIR, "nes", "mario-dissection.md");
const ANCHOR = "The handler in scanline order";

function classify(what: string): Kind {
  if (/\bspun\b|\bdelay\b/.test(what)) return "wait";
  if (/\bspin\b/.test(what)) return "idle";
  if (/\blogic\b/.test(what)) return "logic";
  if (/\bDMA's\b|writes of `\$2004`/.test(what)) return "copy";
  return "busy";
}

const hex = (s: string) => parseInt(s, 16);

/** The row's words in the reader's language, read off the row itself. */
function translate(what: string): string {
  const say: string[] = [];
  if (/sprite-0 flag seen clear/.test(what)) say.push("The game peeks at the picture chip to see whether the beam has reached the bottom of the status bar yet. Not yet.");
  if (/spun \d/.test(what)) say.push("The processor does nothing but ask the picture chip the same question over and over, waiting for the beam to reach the bottom of the status bar.");
  if (/the hit/.test(what)) say.push("There it is: the beam reached the marker sprite the game parked there. The game waits a few moments more so its next change lands just off screen.");
  const scroll = what.match(/`\$2005 <- ([0-9a-f]{2}), ([0-9a-f]{2})`/i);
  if (scroll) {
    const [x, y] = [hex(scroll[1]), hex(scroll[2])];
    say.push(
      x === 0 && y === 0
        ? "The scroll is set back to the top left corner, so the status bar is drawn standing still."
        : `The scroll changes mid-picture: from here down, the world is drawn shifted ${x} dots sideways. This is the split that lets the level move while the score stays put.`,
    );
  }
  const ctrl = what.match(/`\$2000 <- ([0-9a-f]{2})`/i);
  if (ctrl) {
    const v = hex(ctrl[1]);
    say.push(
      v & 0x80
        ? "The game sets the picture chip's main switch with its wake-up call on: tap me again at the next blank."
        : "The game sets the picture chip's main switch (which background map to draw from) with its wake-up call off, so a long frame is skipped rather than interrupted.",
    );
  }
  const mask = what.match(/`\$2001 <- ([0-9a-f]{2})`/i);
  if (mask) {
    say.push(
      hex(mask[1]) & 0x18
        ? "Drawing is switched back on, in time for the next picture."
        : "Drawing is switched off, so the game may rewrite the picture chip's memory safely.",
    );
  }
  if (/operation-mode tree/.test(what)) say.push("The game itself: reading the pad, moving Mario and the enemies, keeping score. All of it fits inside this stretch of the picture.");
  if (/`RTI`/.test(what)) say.push("The game has finished this frame's work and goes back to sleep, spinning on one instruction until the beam reaches the bottom.");
  if (/NMI vector taken/.test(what)) say.push("The beam has left the picture. The picture chip taps the processor on the shoulder: this is the interrupt that starts every frame's work.");
  if (/status cleared/.test(what)) say.push("The game reads the picture chip's status, which also resets its latches.");
  if (/sprite DMA/.test(what)) say.push("The game orders a bulk copy: the table of every sprite on screen goes from main memory into the picture chip.");
  if (/DMA's/.test(what)) say.push("The copy itself. The processor is frozen while the sprite table streams across.");
  if (/VRAM buffer drained/.test(what)) say.push("The game checks its list of background changes to send to the picture chip. Nothing this frame.");
  if (/pad polled/.test(what)) say.push("The controllers are read, one button at a time.");
  return say.join(" ");
}

function parse(md: string): MarioFrame {
  const at = md.indexOf(ANCHOR);
  if (at < 0) return { ok: false, reason: `the dissection has no paragraph beginning "${ANCHOR}"` };
  const after = md.slice(at);
  const frame = after.match(/frame (\d+)/)?.[1] ?? "";
  const lines = after.split("\n");
  const start = lines.findIndex((l) => /^\|\s*line\s*\|\s*dot\s*\|/.test(l));
  if (start < 0) return { ok: false, reason: "the table after it no longer starts with line and dot" };
  const rows: Row[] = [];
  for (const l of lines.slice(start + 2)) {
    if (!l.startsWith("|")) break;
    const cells = l.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) return { ok: false, reason: `a row has ${cells.length} cells: ${l}` };
    const [lineCell, dotCell, what, where] = cells;
    const m = lineCell.match(/^(\d+)(?: to (\d+))?$/);
    if (!m) return { ok: false, reason: `a line cell reads "${lineCell}"` };
    rows.push({
      line: Number(m[1]),
      lineTo: m[2] ? Number(m[2]) : null,
      dot: dotCell ? Number(dotCell) : null,
      what,
      where,
      kind: classify(what),
      plain: translate(what),
    });
  }
  if (rows.length < 4) return { ok: false, reason: "the table has too few rows to draw" };
  return { ok: true, rows, frame };
}

export function marioFrame(): MarioFrame {
  if (!fs.existsSync(FILE)) return { ok: false, reason: "the dissection is not in this build" };
  return parse(fs.readFileSync(FILE, "utf8"));
}
