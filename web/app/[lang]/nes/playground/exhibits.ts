import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "@/lib/docs";

/**
 * The bug museum's exhibits. The plain account on each plaque is ours,
 * written for a reader who has never seen a scope, and it carries no
 * figure. The evidence is the engineers': the passage where they wrote
 * the bug up, found at build time in their document by the words it
 * starts with or contains, and shown as they wrote it, figures and all.
 * A passage that has moved or been rewritten leaves its exhibit saying
 * so, rather than showing an account nobody is keeping.
 */

export type Cause = "the model" | "the bench" | "the tools" | "the measuring";

interface Spec {
  key: string;
  title: string;
  cause: Cause;
  /** What a person would have seen. */
  seen: string;
  /** Why it happened. */
  why: string;
  /** How it was caught, and what fixed it. */
  caught: string;
  doc: string;
  /** Words each passage of evidence contains, one passage per entry. */
  anchors: string[];
  images?: { src: string; alt: string }[];
}

const SPECS: Spec[] = [
  {
    key: "gwme",
    title: "The title that read GWME",
    cause: "the model",
    seen: "Super Mario Bros.' title screen, perfect except for one letter: the menu offered a 1 PLAYER GWME.",
    why: "Right after counting up, the fast copy of the processor looked at its counter's old value, which was still on its way, so one read went to the wrong address and fetched a W instead of an A. None of the existing tests happened to put those two instructions together.",
    caught: "The engineers traced the wrong letter back to the exact read that fetched it and rebuilt the mistake in a few instructions against the transistor-level chip, which got it right. The first fix broke the menu a new way and was caught the same way; the second came with a set of new tests held to the slow chip.",
    doc: "cartridge",
    anchors: ["`1 PLAYER GWME`"],
    images: [
      { src: "/nes/lab/cart-trace-gwme.png", alt: "The model's title screen with one wrong tile" },
      { src: "/nes/lab/cart-trace-game.png", alt: "The title screen after the fix" },
    ],
  },
  {
    key: "sprites",
    title: "The sprites that never left",
    cause: "the model",
    seen: "A game froze on its menu, waiting for something that never happened, and a small stray sprite sat on the title screen that no real console showed.",
    why: "When the console copied the sprite table into the picture chip, the model answered from a memo of an earlier read instead of reading memory again, so the first frame's sprites were copied for ever.",
    caught: "The transistor-level chip agreed with the stuck record to the last half-cycle, which cleared the processor. Comparing the memory with what the copy carried named the fault, and a test of two copies in a row now guards it.",
    doc: "cartridge",
    anchors: ["never reads its sprite buffer"],
  },
  {
    key: "wrong-way",
    title: "Mario ran the wrong way",
    cause: "the bench",
    seen: "A recorded game of Mario, replayed on the real console, went off in the wrong direction, and every automatic check stayed quiet.",
    why: "The replay's instructions were sent to the little board faster than it could take them in. Its inbox overflowed and some instructions arrived with digits missing, so buttons were pressed at the wrong moments.",
    caught: "Watching the replay was what caught it. The sender now waits for each line to be read back before sending the next, and a later change made the loading fast again.",
    doc: "bench-v1b",
    anchors: ["Mario ran the wrong way"],
  },
  {
    key: "floating",
    title: "The counter that counted nothing",
    cause: "the bench",
    seen: "Nothing at all. With no console connected, the bench reported that the controller had already been read hundreds of times.",
    why: "The pin that counts the console's controller reads was connected to nothing, so it picked up electrical noise from the room and counted that.",
    caught: "Someone read a status line instead of trusting it. One word in the firmware ties the pin to a steady level when nothing drives it, and the count stays at zero until a console is there.",
    doc: "bench-report",
    anchors: ["It also produced the first finding", "The fix is one word twice"],
  },
  {
    key: "comment",
    title: "The transistors in a comment",
    cause: "the tools",
    seen: "The first count of the picture chip's transistors was too high.",
    why: "The quick count searched the chip's data file for transistor entries, and also counted some the file's author had left inside a comment. A second quick count missed one.",
    caught: "Two real parsers, one of them the reference simulator itself, agreed on the true number, and a test now pins it. The engineers' moral: instruments lie before the code does.",
    doc: "p0-report",
    anchors: ["Counts, agreed by both real parsers"],
  },
  {
    key: "roll",
    title: "The rainbow that rolled",
    cause: "the measuring",
    seen: "Recordings of a real console decoded with the colours slowly rolling from top to bottom of the picture, invisible on a grey menu and unmissable on World 1-1.",
    why: "The decoder assumed the NES sends an ordinary broadcast TV signal. It does not: its lines are a tiny bit shorter, so the colour timing shifts by a different amount on every line.",
    caught: "A colourful picture made it obvious. The decoder now has a profile for the NES's own timing, and the same recordings decode steady.",
    doc: "m4-report",
    anchors: ["The recovery decoded every capture as broadcast NTSC"],
    images: [{ src: "/ntsc/broadcast-vs-nes.png", alt: "A capture decoded as broadcast television beside the same capture decoded with the NES's own timing" }],
  },
  {
    key: "start",
    title: "Start that was never ignored",
    cause: "the tools",
    seen: "A real console seemed to ignore the Start button after being switched on cold, while taking Select, and a theory about cold boots was written down.",
    why: "The bench's own software kept an old count across a reset, so it pressed Start before the game was ready to look, and the camera caught the menu before the press.",
    caught: "The engineers found the tool at fault, cleared the count on reset, and withdrew the finding in writing, keeping the wrong theory on the page beside the right one.",
    doc: "mario-dissection",
    anchors: ["A finding on the way there, withdrawn."],
  },
  {
    key: "or",
    title: "The colour that picked up the address",
    cause: "the model",
    seen: "Nothing, in any picture yet. Colours written to the picture chip slowly, one at a time, landed slightly wrong in the transistor model and right in the reference.",
    why: "When nothing was driving a group of wires, the model decided its level one way and the reference simulator another, so the address still lingering on the wires mixed into the colour.",
    caught: "A probe written specially to write colours at different paces found it, because none of the recorded reference runs ever did that. The model now decides those wires the reference's way, and a test fails if it goes back.",
    doc: "p3-report",
    anchors: ["That was an engine divergence"],
  },
];

export interface Exhibit {
  key: string;
  title: string;
  cause: Cause;
  seen: string;
  why: string;
  caught: string;
  href: string;
  /** The engineers' passages as written, or why they could not be shown. */
  evidence: { ok: true; passages: string[] } | { ok: false; reason: string };
  /** Each with its size, read from the file, so the page reserves its space. */
  images: { src: string; alt: string; width: number; height: number }[];
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
      title: s.title,
      cause: s.cause,
      seen: s.seen,
      why: s.why,
      caught: s.caught,
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
