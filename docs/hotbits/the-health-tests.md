---
title: The health tests
description: Three layers on three timescales, and the one that refuses to serve.
order: 3
---

# The health tests

The symmetry argument in [the bits](/docs/hotbits/the-bits) holds while the
hardware behaves. The health tests exist for the days it does not: a stuck
transistor, a supply sagging, the source shifting, a comparator threshold
drifting a few millivolts. Three layers, on three timescales, each answering a
different question.

## Layer 1 refuses; the others report

The continuous tests are the two from NIST SP 800-90B section 4.4, run by the
extractor on every pass, and **they are the layer wired to the pool**: when
the most recent window fails, the API refuses to serve bytes until a window
passes again. Failing bits may already be in the stream file, because the
extractor does not roll back its output, but the pool will not hand them out.

- **The Repetition Count Test** fails a run of 21 identical bits. It is the
  stuck-source alarm: a jammed comparator or a dead tube produces one long
  run, and the cutoff is derived from the false-alarm rate (2 to the minus
  20th per bit) and one bit of min-entropy per sample.
- **The Adaptive Proportion Test** counts, in each non-overlapping 512-bit
  window, how many bits match the window's first bit, and fails past a cutoff
  of about 311. It is the bias alarm: a source can be unstuck and still lean.

One subtlety is worth writing down because the code had to get it right
deliberately. The RCT's failure flag is sticky: as specified it latches on
the first crossing and stays failed. Latched into the serving gate, that
would freeze the pool forever the first time randomness looked briefly
unlucky, so the gate reads the APT's per-window verdict instead, which resets
every window.

And randomness does look briefly unlucky, on schedule. A fair coin reaches a
run of 21 about once per two million bits. This stream has emitted about 27
million bits, and [/stats](https://hotbits.tinymachines.ai/stats) reports
`l1_rct_max_seen` of 21: the cutoff has been touched, roughly as often as
arithmetic says it should be. An instrument whose worst-ever run was far below
the cutoff would be the suspicious one.

## Layer 2 watches for drift

Every five minutes, over the trailing kilobyte: bytewise entropy, bit bias,
and lag-1 autocorrelation, appended to a time series the service publishes.
None of it gates anything; its job is to make a slow lean visible as a trend
line before it becomes a failed window. The bias-drift investigations in the
instrument's lab notes started from exactly this kind of plot.

## Layer 3 is the deep battery

Daily, over the trailing 64 KB (about a day of output at the measured rate):
`ent`, PractRand, and TestU01's Rabbit and Alphabit batteries, with the
verdicts appended to a history the service serves at `/battery/history`.
Weekly, the NIST SP 800-90B section 6 non-IID min-entropy estimation runs over
a million-sample window using NIST's reference estimator suite.

The layering is the point rather than an accident: the continuous tests catch
a broken instrument within seconds and refuse on its behalf, the rolling
statistics catch a drifting one in hours, and the batteries catch structure
too subtle for either, given a day of data. One test at one timescale would
miss two of the three failure shapes.

## Where to see them

[/hotbits](/hotbits) reads the current verdicts live. The service publishes
the raw series itself: `/health/continuous`, `/metrics`, `/battery/history`
and `/stats` on
[hotbits.tinymachines.ai](https://hotbits.tinymachines.ai/stats). What is
described here and not visible there is the machinery: the tests run in the
extractor's own tree, not in this repository, and this page is written from
that source rather than from the service's summaries.
