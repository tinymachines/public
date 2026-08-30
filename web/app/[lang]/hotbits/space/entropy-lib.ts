// Shared math for the entropy-space visualizations.
//
// The "wow" of a TRNG demo is geometric: true entropy, plotted in 3D,
// fills space as a structureless cloud, while a deterministic PRNG betrays
// its arithmetic as hidden planes/lattices. These helpers turn byte streams
// (and the famously broken RANDU generator) into point clouds.

const BIO_BLUE = { h: 196, s: 0.92 } // hue/sat anchor for the Bio Blue palette

/** Map a byte stream into `count` (x,y,z) points in the [-1,1] cube. */
export function bytesToPoints(bytes: Uint8Array, count: number): Float32Array {
  const n = Math.min(count, Math.floor(bytes.length / 3))
  const pts = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const o = i * 3
    pts[o] = (bytes[o] / 255) * 2 - 1
    pts[o + 1] = (bytes[o + 1] / 255) * 2 - 1
    pts[o + 2] = (bytes[o + 2] / 255) * 2 - 1
  }
  return pts
}

/**
 * RANDU — IBM's infamous LCG: x₊₁ = 65539·x mod 2³¹. Consecutive triples
 * satisfy z = 6y − 9x (mod 1), so the cloud collapses onto 15 parallel
 * planes in 3D. The product stays < 2⁴⁷ < 2⁵³, so doubles compute it exactly.
 */
export function randuPoints(count: number, seed = 1): Float32Array {
  const M = 2 ** 31
  let x = (seed % M) || 1
  if (x % 2 === 0) x += 1 // keep the seed odd
  const next = () => {
    x = (65539 * x) % M
    return x / M
  }
  const pts = new Float32Array(count * 3)
  for (let i = 0; i < count * 3; i++) pts[i] = next() * 2 - 1
  return pts
}

/**
 * Per-vertex colors tinted across the Bio Blue range by distance from the
 * cube center — near = bright cyan, far = deeper blue. Returns an RGB
 * Float32Array parallel to the positions.
 */
export function pointColors(points: Float32Array): Float32Array {
  const n = points.length / 3
  const colors = new Float32Array(points.length)
  for (let i = 0; i < n; i++) {
    const o = i * 3
    const r = Math.sqrt(points[o] ** 2 + points[o + 1] ** 2 + points[o + 2] ** 2)
    const t = Math.min(1, r / 1.732) // normalize by cube diagonal half
    // lightness rides from bright (center) to mid (edge)
    const [cr, cg, cb] = hslToRgb(BIO_BLUE.h - t * 18, BIO_BLUE.s, 0.72 - t * 0.22)
    colors[o] = cr
    colors[o + 1] = cg
    colors[o + 2] = cb
  }
  return colors
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0,
    g = 0,
    b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [r + m, g + m, b + m]
}
