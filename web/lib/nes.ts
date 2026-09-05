import fs from "node:fs";
import path from "node:path";

/**
 * The boarded NES console arc record, read from data/nes.json at build
 * time. Written only by scripts/board-nes.py --board, which runs the
 * 2a03 repository's full suite (netlist and goldens required) and its
 * MUTATE=1 run at a pinned commit, then extracts each figure from the
 * repository's own reports by anchored regex, or recomputes it exactly
 * and holds it to them. Same contract as ntsc.ts and engine.ts: one
 * copy of each fact, slots, nothing typed.
 */

export interface NesRecord {
  boarded_on: string;
  repo: string;
  commit: string;
  tests_green: number;
  mutate_red: number;
  halfphi: string;
  a0: {
    transistors: string;
    defined_nodes: string;
    supply_gated: number;
    contested_groups: number;
    golden_states: number;
    quiescent_half_steps_per_s: string;
  };
  /** The PPU (2c02), boarded from its own gates' output. */
  c2c02: {
    repo: string;
    commit: string;
    halfphi: string;
    tests_green: number;
    mutate_red: number;
    p0_states: number;
    p1_states: number;
    p2: { sprite_states: number; hit_vpos: number; hit_hpos: number; race_bits: string };
    p3: {
      visible_dots: number;
      frame_period_ms: string;
      frames_timed: number;
      mean_ms: string;
      mean_inside_x: string;
      worst_ms: string;
      worst_inside_x: string;
      sprite_dots: number;
      hit_line: number;
      hit_pixel: number;
      chip_hit_hpos: number;
      scroll_dots: number;
      write_delay_plateau: string;
    };
    area_vote_lows: number;
  };
  first_sound: {
    golden_states: string;
    timer_byte: number;
    plateau_half_steps: number;
    plateaus_measured: string;
    ad1_high: string;
    stamp: string;
  };
  /** N3, the 2A03 ladder: the gates' own measurement lines and the report. */
  n3: {
    /** The cross-chip pin lockstep against the 6502's recorded golden. */
    traces_compared: number;
    traces_refused: number;
    traces_exact: number;
    stack_offset_hex: string;
    decimal_stores: number;
    /** The core rung against rung 0 over the same programs. */
    core_programs: number;
    core_half_cycles: number;
    core_exact: number;
    /** The APU gate: worlds, half-steps per world. */
    apu_worlds: number;
    apu_half_steps: number;
    /** The stall gate: frames per program, RDY-low counts. */
    dma_frames: number;
    dma_rdy_low_even: number;
    dma_rdy_low_odd: number;
    dmc_frames: number;
    dmc_rdy_low: number;
    /** Throughput with the APU attached, and the real-time multiple. */
    half_cycles_per_s: string;
    real_time_x: string;
    /** The noise period ROM's disagreement, index 12: die against published. */
    noise_index12_die: number;
    noise_index12_published: number;
    /** The 6502 golden as it stands: traces recorded there. */
    golden_traces: number;
  };
  family: {
    nes_bus: string;
    c2a03: string;
    c2c02: string;
    sketch: string;
  };
}

const FILE = path.join(process.cwd(), "..", "data", "nes.json");

export function nes(): NesRecord {
  const record = JSON.parse(fs.readFileSync(FILE, "utf8")) as NesRecord;
  for (const k of [
    "boarded_on", "repo", "commit", "tests_green", "mutate_red",
    "a0", "c2c02", "first_sound", "n3", "family",
  ] as const) {
    if (record[k] === undefined) {
      throw new Error(`data/nes.json has no ${k}; re-run scripts/board-nes.py --board`);
    }
  }
  return record;
}
