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
  /** N4 and N5, the nes repository: the glue's and the console's suite,
   *  the plumbing gate's line, and the N5 report's gate-2 table. */
  console: {
    repo: string;
    commit: string;
    tests_green: number;
    pin_6502: string;
    alignment: { cpu_phase: number; ppu_phase: number };
    /** Gate 1's replays: half-cycles the NMI-during-BRK replay compared
     *  and at how many offsets; reads the race replay checked each side. */
    gate1: { nmi_half_cycles: number; nmi_offsets: number; race_reads_set: number; race_reads_clear: number; alignments: number };
    plumbing: { frames: number; master_half_steps: number; cpu_half_cycles: number; nmis: number };
    /** Frames a second on one core, low and high, and the real-time multiples. */
    frames_per_s: [number, number];
    real_time_x: [string, string];
    /** N6, the picture: the picture gate (a console frame through
     *  ntsc-crt equal to the rung's own, the phase across the parity
     *  sequence) and the capture path's synthetic roundtrip on the bars
     *  cartridge, its figures as capture-score printed them, held or not. */
    picture: {
      ntsc_crt: string;
      parity: string;
      components_equal: number;
      displayed: [number, number];
      phase_frames: number;
      phase_short: number;
      phase: number;
      capture: {
        rom: string;
        regions: number;
        within_all: number;
        luma_within: number;
        hue_within: number; hue_regions: number;
        sat_within: number;
        worst_luma: string; worst_hue_deg: string; worst_sat: string; worst_chroma: string;
        tol_luma: string; tol_hue_deg: string; tol_sat_pct: number; tol_sat_abs: string;
        recovered_ppm: string; burst_residual: string;
        held: boolean;
      };
    };
    /** N7, the sound: the NES-001 stage's constants as the gate prints
     *  them, and blargg's four mixer ROMs through the console beside his
     *  real-hardware recordings, the worst 100 ms window of each test as
     *  a percentage of the beep. */
    sound: {
      stage: { tau_hp_ms: string; tau_lp_us: string; gain: string; step_ratio: string; tone_ratio: string; tone_expected: string };
      tolerance_pct: number;
      roms: Record<string, { beep_rms: string; rms_pct: string; tone_pct: string; rec_rms_pct: string; rec_tone_pct: string }>;
    };
    /** N8, the shell: the GPU picture against the CPU chain per world
     *  (worst and mean component over the three frames, the GPU frame
     *  time), the paced loop's counts on a synthetic clock, and the wasm
     *  target under node. */
    shell: {
      gpu: Record<string, { adapter: string; worst: number; mean: number; components: number; ms_per_frame: string }>;
      gpu_tolerance: { worst: string; mean: string };
      pacing: Record<string, { ticks: number; new: number; duplicated: number; dropped: number }>;
      wasm: { frames: number; seconds: string; frames_per_s: string; real_time_x: string; sound_per_frame: string; rom: string };
    };
    blargg: {
      cpu_timing_pass: number;
      instr_pass: number; instr_total: number;
      sprite_pass: number; sprite_total: number;
      vbl_nmi_pass: number; vbl_nmi_total: number;
      apu_pass: number; apu_total: number;
    };
  };
  family: {
    nes_bus: string;
    c2a03: string;
    c2c02: string;
    nes: string;
    sketch: string;
  };
}

const FILE = path.join(process.cwd(), "..", "data", "nes.json");

export function nes(): NesRecord {
  const record = JSON.parse(fs.readFileSync(FILE, "utf8")) as NesRecord;
  for (const k of [
    "boarded_on", "repo", "commit", "tests_green", "mutate_red",
    "a0", "c2c02", "first_sound", "n3", "console", "family",
  ] as const) {
    if (record[k] === undefined) {
      throw new Error(`data/nes.json has no ${k}; re-run scripts/board-nes.py --board`);
    }
  }
  if (record.console.shell === undefined) {
    throw new Error("data/nes.json's console has no shell (N8); re-run scripts/board-nes.py --board");
  }
  if (record.console.sound === undefined) {
    throw new Error("data/nes.json's console has no sound (N7); re-run scripts/board-nes.py --board");
  }
  if (record.console.picture === undefined) {
    throw new Error("data/nes.json's console has no picture (N6); re-run scripts/board-nes.py --board");
  }
  return record;
}
