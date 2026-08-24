---
title: The gateway
description: Why the open endpoints closed, what stayed open, and what a browser is allowed to see.
order: 4
---

# The gateway

The pool refills at a few dozen bytes a minute, and for a while anyone could
drain it. `/random/bytes`, `/random/raw`, `/random/hex` and
`/random/integers` answered without a key, which was fine right up until it
was a way for one caller to empty an instrument everyone shares. They now
answer **410 Gone**, and the reply says why in its own words:

```json
{
  "error": "this endpoint now requires a key",
  "use": "https://hotbits.tinymachines.ai/v1/bytes with Authorization: Bearer <key>",
  "why": "the pool refills at ~75 bytes/min and was open to anyone",
  "public": "/v1/seeds needs no key and cannot drain the pool"
}
```

(That 75 is the notice's figure from when it was written; measured on
2026-08-24 the pool grew at about 36 bytes a minute. The rate belongs to the
tube, not the notice. See [the bits](/docs/hotbits/the-bits).)

## The line it draws

What closed and what stayed open follows one rule: **an endpoint that hands
out fresh pool bytes costs everyone; an endpoint that replays recorded ones
costs no one.**

- **`/v1/bytes`** spends the pool, so it takes a bearer key and a byte
  budget, with requests capped at 4 KB (`max_bytes_per_request` in
  [/stats](https://hotbits.tinymachines.ai/stats)). Without a key it answers
  401.
- **`/v1/seeds`** stays open. It hands out 48-bit seeds replayed from the
  append-only stream: real decay data, but not exclusive and not fresh, so it
  cannot drain anything. Its own reply says `"conditioning": "none"`, which
  is the honest label for "seed a simulation", and the wrong tool for a
  secret.
- **`/random/archive`** also stays open, for the same reason: it replays
  bytes already recorded.

## What is documented where, and the two known gaps

The service's `openapi.json` still describes the instrument's read-only
surface: stats, health, metrics, the battery history, the time series.
[/hotbits/api](/hotbits/api) renders that schema and probes every route in it,
live.

Two gaps are known, and both are the instrument's side to close rather than
this tree's to paper over:

- **`/v1/bytes` and `/v1/seeds` are not in the published schema.** They
  answer, and the schema does not mention them, so the reference page reports
  them as present but undocumented. Writing their request and response shapes
  into this page by hand would be a second copy of a fact that already has an
  owner; until the schema describes them, what is stated here is only what
  calling them shows.
- **The refusals are unreadable from a browser.** The 410 and 401 replies
  carry no CORS header, so a page on this site can see that the request
  failed but not the body explaining why, and the explanation is the useful
  part. Filed as `tinymachines/geiger#4`; until it lands, the reference page
  reports those routes as answering in a way no browser is allowed to read,
  because that is what is true.

## What this page cannot check

Key issuance and budget accounting run on the instrument, and their source is
not in the tree this site builds from. Everything above about the gateway is
measured by calling it: the status codes, the reply bodies and the schema gap
are all re-checkable from any terminal, and nothing further is claimed.
