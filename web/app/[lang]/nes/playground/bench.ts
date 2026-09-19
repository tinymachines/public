import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "@/lib/docs";

/**
 * The bench as the engineers photographed it, read at build time from
 * their own documents: every photograph they show of the lab
 * (docs/nes/*.md's own image lines, which carry their captions), and the
 * rig's table of what each camera is for.
 *
 * Their caption is what a photograph is labelled with here; the parts
 * listed under it are that caption's own clauses, split where they wrote
 * commas, not a reading of the picture. Each photograph's size is read
 * from the file so the page keeps its place before it loads.
 */

export interface Photo {
  src: string;
  /** The engineers' caption, as written. */
  caption: string;
  /** What the caption names after its colon, in the order it names them. */
  parts: string[];
  doc: string;
  docName: string;
  width: number;
  height: number;
  /** True for the four photographs of the whole rig. */
  rig: boolean;
}
export interface Eye {
  name: string;
  job: string;
  mount: string;
}
export type Bench = { ok: true; photos: Photo[]; eyes: Eye[]; note: string } | { ok: false; reason: string };

/** A PNG's or JPEG's size, from the file itself. */
function size(file: string): { width: number; height: number } | null {
  const b = fs.readFileSync(file);
  if (b.toString("latin1", 1, 4) === "PNG") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let at = 2;
  while (at < b.length - 9) {
    if (b[at] !== 0xff) {
      at++;
      continue;
    }
    const marker = b[at + 1];
    const len = b.readUInt16BE(at + 2);
    // The frame headers carry the size; the arithmetic-coded ones too.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: b.readUInt16BE(at + 5), width: b.readUInt16BE(at + 7) };
    }
    at += 2 + len;
  }
  return null;
}

const RIG = ["rig-bench-front", "rig-bench-frame", "rig-bench-console-side", "rig-bench-birds-eye"];

export function bench(): Bench {
  const dir = path.join(DOCS_DIR, "nes");
  const pub = path.join(process.cwd(), "public");
  if (!fs.existsSync(dir)) return { ok: false, reason: "the notebook is not in this build" };
  const photos: Photo[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const md = fs.readFileSync(path.join(dir, file), "utf8");
    const docName = md.match(/^title:\s*"?([^"\n]+)"?$/m)?.[1]?.trim() ?? file;
    for (const m of md.matchAll(/!\[([^\]]+)\]\((\/nes\/lab\/[^)]+)\)/g)) {
      const src = m[2];
      if (photos.some((p) => p.src === src)) continue;
      const f = path.join(pub, src);
      const wh = fs.existsSync(f) ? size(f) : null;
      if (!wh) continue;
      const caption = m[1].trim();
      // A caption is usually "what this is: this, that and the other"; the
      // list is what follows the colon, so it does not repeat the caption.
      const after = caption.includes(": ") ? caption.slice(caption.indexOf(": ") + 2) : "";
      photos.push({
        src,
        caption,
        parts: after
          .split(/,\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
        doc: `/docs/nes/${file.replace(/\.md$/, "")}`,
        docName,
        ...wh,
        rig: RIG.some((r) => src.includes(r)),
      });
    }
  }
  if (photos.length < 4) return { ok: false, reason: `the notebook shows ${photos.length} photographs of the lab` };

  const rig = fs.existsSync(path.join(dir, "rig.md")) ? fs.readFileSync(path.join(dir, "rig.md"), "utf8") : "";
  const eyes: Eye[] = [];
  for (const line of rig.split("\n")) {
    const cells = line.startsWith("|") ? line.split("|").slice(1, -1).map((c) => c.trim()) : [];
    // camera | device | job | mount | frame | scale
    if (cells.length >= 4 && /^(Logitech|Roxio)/.test(cells[0])) {
      eyes.push({ name: cells[0], job: cells[2], mount: cells[3] });
    }
  }
  const note = rig.match(/Four phone photographs[\s\S]*?:\n/)?.[0]?.replace(/\s+/g, " ").trim() ?? "";
  photos.sort((a, b) => Number(b.rig) - Number(a.rig));
  return { ok: true, photos, eyes, note };
}
