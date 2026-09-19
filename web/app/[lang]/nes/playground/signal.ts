/**
 * Reading a line of composite video the way a television does, for the
 * playground's drawings. Nothing here is a number from a specification:
 * the sync is wherever the line dips lowest, the burst is the beat after
 * it, the beat's period is found by comparing the burst with itself, and
 * a colour's hue is its beat's timing against the burst's. The signal is
 * the model's own (the worker's encode of a real frame), so these readings
 * are of our encoder, the way a scope would take them.
 */

export interface Anatomy {
  /** The level the line rests at between everything else (volts). */
  blank: number;
  sync: [number, number];
  burst: [number, number] | null;
  /** Samples a colour beat takes, measured on the burst. */
  period: number | null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** The longest run of samples for which keep(i) holds. */
function longestRun(n: number, keep: (i: number) => boolean): [number, number] {
  let best: [number, number] = [0, 0];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && keep(i)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start > best[1] - best[0]) best = [start, i];
      start = -1;
    }
  }
  return best;
}

export function anatomy(s: ArrayLike<number>, pictureStart: number, pictureEnd: number): Anatomy {
  const n = s.length;
  let low = Infinity;
  for (let i = 0; i < n; i++) low = Math.min(low, s[i]);
  const outside: number[] = [];
  for (let i = pictureEnd; i < n; i++) outside.push(s[i]);
  const blank = median(outside);
  const sync = longestRun(n, (i) => s[i] < (low + blank) / 2);
  // The burst: from the first sample after the sync that leaves the blank
  // level to the last one before the line ends.
  const quiet = (blank - low) * 0.05;
  let b0 = -1;
  let b1 = -1;
  for (let i = sync[1]; i < n; i++) {
    if (Math.abs(s[i] - blank) > quiet) {
      if (b0 < 0) b0 = i;
      b1 = i + 1;
    }
  }
  const burst: [number, number] | null = b0 >= 0 && b1 - b0 > 8 ? [b0, b1] : null;
  let period: number | null = null;
  if (burst) {
    // The lag at which the burst best matches itself, past its first dip.
    let bestLag = 0;
    let bestScore = -Infinity;
    let fallen = false;
    let prev = Infinity;
    for (let lag = 2; lag < (burst[1] - burst[0]) / 2; lag++) {
      let acc = 0;
      for (let i = burst[0]; i + lag < burst[1]; i++) acc += (s[i] - blank) * (s[i + lag] - blank);
      acc /= burst[1] - burst[0] - lag;
      if (acc > prev) fallen = true;
      prev = acc;
      if (fallen && acc > bestScore) {
        bestScore = acc;
        bestLag = lag;
      }
      if (fallen && bestScore > 0 && acc < bestScore * 0.5) break;
    }
    period = bestLag || null;
  }
  return { blank, sync, burst, period };
}

/** Where a stretch of samples sits in the beat: its phase (radians), swing and middle. */
export function beat(s: ArrayLike<number>, from: number, to: number, period: number) {
  let c = 0;
  let q = 0;
  let mean = 0;
  const n = to - from;
  for (let i = from; i < to; i++) mean += s[i];
  mean /= n;
  for (let i = from; i < to; i++) {
    const a = (2 * Math.PI * i) / period;
    c += (s[i] - mean) * Math.cos(a);
    q += (s[i] - mean) * Math.sin(a);
  }
  return { phase: Math.atan2(q, c), swing: (2 * Math.hypot(c, q)) / n, mean };
}
