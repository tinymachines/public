"use client"
/* No lucide here on purpose: this site's kit ships no icon set, and pulling one
   in to decorate a refresh button would import a design decision the kit made
   the other way. The control says what it does in words instead. */

import { useEffect, useRef } from "react"
import type { EntropyStatus } from "./use-entropy"

// Top 5 bits per byte → 32×32 = 1024 cells. With the shared 6 KB buffer that's
// ~6 pairs/cell on average — enough that Poisson grain (σ = √λ ≈ 2.4) reads as
// a textured haze rather than the salt-and-pepper speckle you get from a 64×64
// grid (mean ≈ 1.5/cell, ~22% of cells empty by pure chance). The caption's
// "even haze" claim has to hold under the buffer we actually have.
const N = 32

// Plot each consecutive pair (byteₙ, byteₙ₊₁) as a cell. True randomness fills
// the square as an even haze; a weak PRNG leaves a visible lattice or diagonal.
// Color is normalized to the mean count, so a uniform field renders as a flat
// blue mist with only Poisson grain.
export default function ReturnMap({
  bytes,
  status,
  onRegenerate,
}: {
  bytes: Uint8Array | null
  status: EntropyStatus
  onRegenerate: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!bytes) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const counts = new Uint32Array(N * N)
    let pairs = 0
    for (let i = 0; i < bytes.length - 1; i++) {
      counts[(bytes[i] >> 3) * N + (bytes[i + 1] >> 3)]++
      pairs++
    }
    const denom = Math.max(1e-6, (pairs / (N * N)) * 2.4)
    const img = ctx.createImageData(N, N)
    for (let i = 0; i < counts.length; i++) {
      const t = Math.pow(Math.min(1, counts[i] / denom), 0.85)
      const o = i * 4
      img.data[o] = Math.round(10 + t * 72)
      img.data[o + 1] = Math.round(24 + t * 176)
      img.data[o + 2] = Math.round(36 + t * 210)
      img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [bytes])

  const overlay = !bytes ? (status === "pool-low" ? "archive unavailable" : "sampling…") : null

  return (
    <div className="space-viz">
      <div className="space-viz__controls space-viz__controls--end">
        <button type="button" className="space-btn" onClick={onRegenerate} disabled={status === "loading"}>Resample
        </button>
      </div>
      <div className="space-square">
        {overlay ? <div className="space-fallback">{overlay}</div> : null}
        <canvas ref={canvasRef} width={N} height={N} className="space-square__canvas" />
      </div>
      <p className="space-caption">
        <strong>The return map.</strong> Each cell is a consecutive byte pair
        (value <em>n</em> across, value <em>n+1</em> up). Real entropy paints an
        even haze: every pairing equally likely. A flawed generator would etch
        diagonal lines or a grid here; this stays featureless.
      </p>
    </div>
  )
}
