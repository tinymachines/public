import fs from "node:fs";
import path from "node:path";

/**
 * The stream monitor's measured note, read from data/stream-monitor.json.
 *
 * The page states how far its "picture at frame" can be off and what a
 * viewer should expect to see after a press; those are measurements the
 * console session made through the tool, and the house rule is that a
 * figure in a page is a slot filled from a published file, never typed.
 * This reads the file on the server and hands the page the numbers.
 */

export interface StreamMonitorRecord {
  measured: string;
  tool: string;
  clock: { console_frames: number; output_frames: number; seconds: number; ahead_frames_max: number; ahead_ms_max: number; why: string };
  start_press: { cart: string; landed_frame: number; seen_frame: number; frames: number; ms: number; why: string };
  reset: { cart: string; landed_frame: number; seen_frame: number; frames: number; ms: number; hold_frames: number; why: string };
  /** The HLS lag on this box, in seconds, once it has been measured through the player; null until then. */
  hls_lag: number | null;
}

const FILE = path.join(process.cwd(), "..", "data", "stream-monitor.json");

export function streamMonitorRecord(): StreamMonitorRecord {
  const r = JSON.parse(fs.readFileSync(FILE, "utf8")) as StreamMonitorRecord;
  for (const k of ["measured", "tool", "clock", "start_press", "reset"] as const) {
    if (r[k] === undefined) throw new Error(`data/stream-monitor.json has no ${k}`);
  }
  if (r.start_press.seen_frame - r.start_press.landed_frame !== r.start_press.frames) throw new Error("data/stream-monitor.json: the start press does not add up");
  if (r.reset.seen_frame - r.reset.landed_frame !== r.reset.frames) throw new Error("data/stream-monitor.json: the reset does not add up");
  return r;
}
