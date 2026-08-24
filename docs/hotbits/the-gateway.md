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

## Two services, two schemas, on one host

The origin is a composite, and its documentation now says so. The
instrument's `openapi.json` describes its read-only surface: stats, health,
metrics, the battery history, the time series. The gateway publishes its own
document at `/v1/openapi.json`, describing the five `/v1` routes, and it is
generated **from the same table its router is built from**: a route added to
one and not the other stops the gateway's own tests, so the schema cannot
describe a route that does not answer. Each service documents what it serves
and neither describes the other's routes, which is the only arrangement where
nothing is claimed second-hand.

[/hotbits/api](/hotbits/api) reads both documents and probes every route in
them, live. One distinction that took both schemas to make: the gateway's
keyed routes refuse CORS **deliberately**, so nobody is tempted to put a key
in page JavaScript, and the reference labels their unreadable replies as the
design working rather than as a defect.

## The one known gap left

**The instrument's refusals are unreadable from a browser.** The 410 replies
carry no CORS header, so a page on this site can see that the request failed
but not the body explaining why, and the explanation is the useful part.
Filed as `tinymachines/geiger#4`; until it lands, the reference page reports
those routes as answering in a way no browser is allowed to read, because
that is what is true.

## What this page cannot check

The gateway is its own service standing in front of the instrument, not part
of this site's build. Its schema is now one of this page's sources, and the
schema is trustworthy for the reason above: it is built from the gateway's
own route table, not written about it. What stays out of reach here is the
part deliberately not on HTTP at all: keys are minted and revoked by a
command line on the machine that runs the gateway, because an endpoint that
can create credentials is a permanent attack surface in exchange for saving
a login. Everything else stated above is measured by calling the service,
re-checkable from any terminal.
