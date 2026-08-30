"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getArchiveEntropyBytes } from "./client"

// `unavailable` covers the archive being missing / server unreachable. We keep
// the original "pool-low" label as an alias so downstream viz code that already
// branches on status stays valid; the lexical literal is misleading now (the
// pool is never touched) and should be renamed in a follow-up.
export type EntropyStatus = "loading" | "ready" | "pool-low"

/**
 * One shared archive read of decay bytes, fed to every visualization on the
 * page. Reads from /random/archive — a NON-CRYPTOGRAPHIC seek-and-read of the
 * append-only conditioned bit stream — so the viz never touches the scarce
 * fresh tip that real consumers depend on, and never 503s on a low pool. Bytes
 * are still real radioactive-decay output; they may just have been served
 * before. `regenerate()` swaps in a fresh slice (the "pour entropy" buttons +
 * BitRaster auto-regen).
 */
export function useSharedEntropy(targetBytes: number) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [failed, setFailed] = useState(false)
  const ctrlRef = useRef<AbortController | null>(null)

  /**
   * STATUS IS DERIVED, not stored, and that is what keeps this hook legal
   * inside an effect.
   *
   * It used to be its own useState that `regenerate` set to "loading" before
   * awaiting. Called from the mount effect that is a synchronous setState
   * inside an effect: React renders once with the wrong value and again with
   * the right one, which is what react-hooks/set-state-in-effect objects to.
   *
   * Every setState below now happens AFTER the await, so the effect body sets
   * nothing. The state we actually have is "some bytes" and "the last attempt
   * failed"; loading is simply the absence of both, so it is computed rather
   * than tracked, and it cannot drift out of step with them.
   */
  const status: EntropyStatus = failed ? "pool-low" : bytes ? "ready" : "loading"

  const regenerate = useCallback(async () => {
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    try {
      const b = await getArchiveEntropyBytes(targetBytes, ctrl.signal)
      if (ctrl.signal.aborted) return
      // The existing bytes stay on screen until the new ones land, so a
      // re-pull never blanks a view that already has something in it.
      setBytes(b)
      setFailed(false)
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFailed(true)
    }
  }, [targetBytes])

  // The initial pull.
  //
  // The disable is a false positive, and it is worth being precise about why
  // rather than silencing it. `regenerate` is async: everything before its
  // first `await` is an AbortController swap, and every setState in it happens
  // after that await. So this effect body sets no state synchronously. The rule
  // is syntactic and cannot see past the async boundary, so it flags the call
  // itself. The alternative is inlining the fetch here and keeping a second
  // copy of it for the retry path, which trades a real duplication for a
  // cosmetic warning.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void regenerate()
    return () => ctrlRef.current?.abort()
  }, [regenerate])

  // Archive failures should be vanishingly rare: the file is present and
  // append-only. If one slips through, retry quietly on a long backoff rather
  // than hammering an instrument that is evidently having a bad time.
  useEffect(() => {
    if (status !== "pool-low") return
    const id = window.setTimeout(() => void regenerate(), 25_000)
    return () => clearTimeout(id)
  }, [status, regenerate])

  return { bytes, status, regenerate }
}
