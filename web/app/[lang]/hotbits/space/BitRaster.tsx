"use client"

import { useEffect, useRef } from "react"
import type { EntropyStatus } from "./use-entropy"

const W = 160 // bits per row
const H = 120 // rows
const BAND = 4 // rows added per tick
const TICK_MS = 1500

// A scrolling field of raw decay bits — on = Bio Blue, off = ink. It streams
// through the page's shared entropy buffer (no extra pulls on the scarce pool),
// scrolling up so the texture feels alive. Each "pour fresh entropy" swaps in a
// new block of true randomness.
//
// Auto-regenerate: bitAt() wraps the read position modulo the buffer, so once
// `head` exceeds bytes.length*8 the SAME bits scroll past again. That's
// silently periodic — on a 6 KB buffer at BAND*W=640 bits per 1500 ms tick,
// the field repeats every ~115 s. Calling onRegenerate() when we've consumed
// most of the buffer hands us a fresh block before any visible loop, while
// the shared `useSharedEntropy` hook handles abort/backoff if the pool is low.
export default function BitRaster({
  bytes,
  status,
  onRegenerate,
}: {
  bytes: Uint8Array | null
  status: EntropyStatus
  onRegenerate?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const regenRequestedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Fresh buffer arrived — re-arm the one-shot regenerate trigger.
    regenRequestedRef.current = false

    ctx.fillStyle = "#0a0f15"
    ctx.fillRect(0, 0, W, H)
    if (!bytes || bytes.length === 0) return

    const totalBits = bytes.length * 8
    const regenAt = Math.floor(totalBits * 0.8)
    const bitAt = (pos: number) => {
      const p = ((pos % totalBits) + totalBits) % totalBits
      return (bytes[p >> 3] >> (7 - (p & 7))) & 1
    }
    const drawRows = (startBit: number, rows: number, atY: number) => {
      const band = ctx.createImageData(W, rows)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < W; c++) {
          const on = bitAt(startBit + r * W + c)
          const o = (r * W + c) * 4
          band.data[o] = on ? 38 : 10
          band.data[o + 1] = on ? 178 : 16
          band.data[o + 2] = on ? 240 : 24
          band.data[o + 3] = 255
        }
      }
      ctx.putImageData(band, 0, atY)
    }

    // initial full field
    drawRows(0, H, 0)
    let head = H * W // next bit offset to reveal at the bottom

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const id = reduced
      ? null
      : window.setInterval(() => {
          if (document.visibilityState === "hidden") return
          ctx.globalCompositeOperation = "copy"
          ctx.drawImage(ctx.canvas, 0, -BAND)
          ctx.globalCompositeOperation = "source-over"
          drawRows(head, BAND, H - BAND)
          head += BAND * W
          if (head >= regenAt && !regenRequestedRef.current && onRegenerate) {
            regenRequestedRef.current = true
            onRegenerate()
          }
        }, TICK_MS)

    return () => {
      if (id) clearInterval(id)
    }
  }, [bytes, onRegenerate])

  const overlay = !bytes ? (status === "pool-low" ? "archive unavailable" : "sampling…") : null

  return (
    <div className="space-viz">
      <div className="space-raster">
        {overlay ? <div className="space-fallback">{overlay}</div> : null}
        <canvas ref={canvasRef} width={W} height={H} className="space-raster__canvas" />
      </div>
      <p className="space-caption">
        <strong>Raw bits.</strong> Each pixel is one bit straight off the
        conditioned pool (blue for 1, ink for 0) scrolling up through a block
        of live decay. No pattern forms because there is none to form. Pour
        fresh entropy to stream a new block.
      </p>
    </div>
  )
}
