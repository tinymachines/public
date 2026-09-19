import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "@/lib/docs";

/**
 * The engineers' x-ray of one tap, read at build time out of the
 * encyclopedia (docs/nes/encyclopedia.md, entry 1, the poll routine:
 * the report block after "The x-ray." and the listing after "The
 * code."), and the dissection's two taps on Super Mario Bros.
 * (docs/nes/mario-dissection.md, the paragraphs "A tap in the air." and
 * "A jump."). The documents are the one copy: every address, count and
 * value the station shows is a line of theirs, and a line this reader
 * does not recognise is shown as the engineers wrote it rather than
 * dropped. When a section has moved, the station says which and draws
 * nothing in its place.
 */

export interface Step {
  /** Kept as written: "h 531570..531571". */
  when: string;
  instruction: string;
  at: string;
  effects: string;
  echo: boolean;
}

export type Xray =
  | {
      ok: true;
      diverge: string;
      instruction: string;
      steps: Step[];
      /** Lines the report abridged, as written. */
      elided: string[];
      rejoin: string;
      signature: string;
      code: string[];
    }
  | { ok: false; reason: string };

export type Taps = { ok: true; air: string; jump: string } | { ok: false; reason: string };

function section(md: string, heading: string): string | null {
  const at = md.indexOf(`\n${heading}\n`);
  if (at < 0) return null;
  const rest = md.slice(at + heading.length + 2);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

function blockAfter(text: string, marker: string): string[] | null {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const m = text.slice(at).match(/```[a-z]*\n([\s\S]*?)\n```/);
  return m ? m[1].split("\n") : null;
}

const STEP = /^\s*(\(echo\) )?(h \d+(?:\.\.\d+)?)\s+(.+?) at (\$[0-9A-F]{4}): (.+)$/;

export function xray(): Xray {
  const file = path.join(DOCS_DIR, "nes", "encyclopedia.md");
  if (!fs.existsSync(file)) return { ok: false, reason: "the encyclopedia is not in this build" };
  const md = fs.readFileSync(file, "utf8");
  const entry = section(md, "## 1. The poll routine");
  if (!entry) return { ok: false, reason: 'the encyclopedia has no entry "1. The poll routine"' };
  const report = blockAfter(entry, "**The x-ray.**");
  if (!report) return { ok: false, reason: "entry 1 has no report block after \"The x-ray.\"" };
  const code = blockAfter(entry, "**The code.**") ?? [];
  const diverge = report.find((l) => l.startsWith("diverge "));
  const instruction = report.find((l) => l.trim().startsWith("the instruction:"));
  const rejoin = report.find((l) => l.startsWith("rejoin:"));
  const signature = report.find((l) => l.startsWith("signature:"));
  if (!diverge || !instruction || !rejoin) return { ok: false, reason: "the report block lost its diverge, instruction or rejoin line" };
  const steps: Step[] = [];
  const elided: string[] = [];
  for (const l of report) {
    const m = l.match(STEP);
    if (m) steps.push({ echo: !!m[1], when: m[2], instruction: m[3], at: m[4], effects: m[5] });
    else if (/^\s*\.\.\./.test(l)) elided.push(l.trim());
  }
  if (steps.length < 3) return { ok: false, reason: `the report block has ${steps.length} path lines` };
  return {
    ok: true,
    diverge,
    instruction: instruction.trim(),
    steps,
    elided,
    rejoin,
    signature: signature ?? "",
    code,
  };
}

function paragraph(md: string, lead: string): string | null {
  const at = md.indexOf(lead);
  if (at < 0) return null;
  const end = md.indexOf("\n\n", at);
  return md
    .slice(at + lead.length, end < 0 ? undefined : end)
    .replace(/\s+/g, " ")
    .trim();
}

export function marioTaps(): Taps {
  const file = path.join(DOCS_DIR, "nes", "mario-dissection.md");
  if (!fs.existsSync(file)) return { ok: false, reason: "the dissection is not in this build" };
  const md = fs.readFileSync(file, "utf8");
  const air = paragraph(md, "**A tap in the air.**");
  const jump = paragraph(md, "**A jump.**");
  if (!air || !jump) return { ok: false, reason: 'the dissection lost "A tap in the air." or "A jump."' };
  return { ok: true, air, jump };
}
