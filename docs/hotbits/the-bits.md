---
title: The bits
description: One bit per pair of gaps, with the bias cancelled by symmetry rather than by correction.
order: 2
---

# The bits

Every bit is the answer to one question: **was the gap before this event
longer than the gap after it?**

Radioactive decay is a Poisson process. Each nucleus has an independent,
constant probability per unit time of decaying, so the intervals between
detected events are exponentially distributed and independent of each other.
Take two intervals, Δt₁ and Δt₂:

- Δt₁ > Δt₂ emits a `1`
- Δt₁ < Δt₂ emits a `0`
- Δt₁ = Δt₂ drops the pair (at nanosecond precision, ties are negligible)

## Why the bias cancels by symmetry

For two independent draws from the same distribution, P(Δt₁ > Δt₂) and
P(Δt₁ < Δt₂) are the same number by exchangeability, so each is exactly one
half. That holds **regardless of the activity of the source, regardless of
detector dead time when it is constant, and regardless of slow drift in
either**, because anything that reshapes the distribution reshapes it for both
intervals identically. It is the inter-arrival variant of von Neumann's
classical debiasing trick.

This is a different kind of claim from "the output passed the tests". A
whitener applied after the fact corrects bias; this construction never has
any, provided the intervals are exchangeable. The health tests exist to catch
the ways the hardware can break that provision, not to fix the distribution.

## Two decisions the code makes, and why

**Pairs are disjoint, not sliding.** The extractor pairs interval 1 with
interval 2, then interval 3 with interval 4. A sliding scheme would reuse each
interval in two bits and double the rate, but two bits sharing an interval are
correlated, and a correlated pair is exactly what the symmetry argument does
not cover. Half the rate, and the independence claim survives.

**Short gaps are rejected before pairing.** Any interval under 5000 µs is
dropped. The symmetry argument tolerates dead time when it is one constant,
but this bench measured its dead time as a distribution rather than a value,
so the contaminated region is cut out instead of argued about. The cut costs
roughly a tenth of the intervals at this source's rate. The running service
publishes the threshold as `reject_us` in [/stats](https://hotbits.tinymachines.ai/stats).

## What it costs

A bit consumes two fresh intervals, so the byte rate is set by the tube and
the source geometry and by nothing downstream. We measured it on 2026-08-24
by watching `/stats` for six minutes: the pool grew 216 bytes in 362 seconds,
which is **about 36 bytes a minute, about 4.8 bits a second**. The service's
own retirement notice cites about 75 bytes a minute, a figure from when it was
written; the rate moves when the source or the tube moves, which is why the
number on [/hotbits](/hotbits) is read from the instrument at load time rather
than printed here and trusted.

If the pool is empty, the right answer is to wait. There is no faster way to
get more bits than the tube is producing, and nothing in the service pretends
otherwise.
