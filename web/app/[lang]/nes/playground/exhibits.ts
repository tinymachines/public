import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "@/lib/docs";
import type { AltKey, ExhibitKey } from "./ui";

/**
 * The bug museum's exhibits: which bug, where its account is, and where
 * in that account the evidence sits. The plain words on each plaque are
 * ours and are in ui.ts, both languages, keyed by the same key as here.
 * The evidence is the engineers': the passage where they wrote
 * the bug up, found at build time in their document by the words it
 * starts with or contains, and shown as they wrote it, figures and all.
 * A passage that has moved or been rewritten leaves its exhibit saying
 * so, rather than showing an account nobody is keeping.
 */

export type Cause = "the model" | "the bench" | "the tools" | "the measuring";

interface Spec {
  key: ExhibitKey;
  cause: Cause;
  doc: string;
  /** Words each passage of evidence contains, one passage per entry. */
  anchors: string[];
  /** Each picture's file, and the dictionary key its words are under. */
  images?: { src: string; alt: AltKey }[];
}

const SPECS: Spec[] = [
  {
    key: "gwme",
    cause: "the model",
    doc: "cartridge",
    anchors: ["`1 PLAYER GWME`"],
    images: [
      { src: "/nes/lab/cart-trace-gwme.png", alt: "gwmeWrong" },
      { src: "/nes/lab/cart-trace-game.png", alt: "gwmeRight" },
    ],
  },
  {
    key: "sprites",
    cause: "the model",
    doc: "cartridge",
    anchors: ["never reads its sprite buffer"],
  },
  {
    key: "wrong-way",
    cause: "the bench",
    doc: "bench-v1b",
    anchors: ["Mario ran the wrong way"],
  },
  {
    key: "floating",
    cause: "the bench",
    doc: "bench-report",
    anchors: ["It also produced the first finding", "The fix is one word twice"],
  },
  {
    key: "comment",
    cause: "the tools",
    doc: "p0-report",
    anchors: ["Counts, agreed by both real parsers"],
  },
  {
    key: "roll",
    cause: "the measuring",
    doc: "m4-report",
    anchors: ["The recovery decoded every capture as broadcast NTSC"],
    images: [{ src: "/ntsc/broadcast-vs-nes.png", alt: "roll" }],
  },
  {
    key: "start",
    cause: "the tools",
    doc: "mario-dissection",
    anchors: ["A finding on the way there, withdrawn."],
  },
  {
    key: "or",
    cause: "the model",
    doc: "p3-report",
    anchors: ["That was an engine divergence"],
  },
];

export interface Exhibit {
  key: ExhibitKey;
  cause: Cause;
  href: string;
  /** The engineers' passages as written, or why they could not be shown. */
  evidence: { ok: true; passages: string[] } | { ok: false; reason: string };
  /** Each with its size, read from the file, so the page reserves its space. */
  images: { src: string; alt: AltKey; width: number; height: number }[];
}

/** A PNG's size from its header; null for anything that is not a PNG. */
function pngSize(file: string): { width: number; height: number } | null {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.toString("latin1", 1, 4) !== "PNG") return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** The paragraph or list item that contains `anchor`, as one line. */
export function passage(md: string, anchor: string): string | null {
  // The words as written, wherever the source wraps its lines.
  const words = anchor.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const m = new RegExp(words.join("\\s+")).exec(md);
  if (!m) return null;
  const at = m.index;
  const before = md.slice(0, at);
  const start = Math.max(before.lastIndexOf("\n\n"), before.lastIndexOf("\n- "));
  const rest = md.slice(at);
  const ends = [rest.indexOf("\n\n"), rest.indexOf("\n- ")].filter((i) => i >= 0);
  const end = ends.length ? at + Math.min(...ends) : md.length;
  return md
    .slice(start < 0 ? 0 : start, end)
    .replace(/^\s*-\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function exhibits(): Exhibit[] {
  const pub = path.join(process.cwd(), "public");
  return SPECS.map((s) => {
    const file = path.join(DOCS_DIR, "nes", `${s.doc}.md`);
    let evidence: Exhibit["evidence"];
    if (!fs.existsSync(file)) {
      evidence = { ok: false, reason: `${s.doc}.md is not in this build` };
    } else {
      const md = fs.readFileSync(file, "utf8");
      const found = s.anchors.map((a) => passage(md, a));
      const missing = s.anchors.filter((_, i) => !found[i]);
      evidence = missing.length
        ? { ok: false, reason: `${s.doc}.md no longer has the passage with "${missing[0]}"` }
        : { ok: true, passages: found as string[] };
    }
    return {
      key: s.key,
      cause: s.cause,
      href: `/docs/nes/${s.doc}`,
      evidence,
      images: (s.images ?? []).flatMap((i) => {
        const file = path.join(pub, i.src);
        const size = fs.existsSync(file) ? pngSize(file) : null;
        return size ? [{ ...i, ...size }] : [];
      }),
    };
  });
}
