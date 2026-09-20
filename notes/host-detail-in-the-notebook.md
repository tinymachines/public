# A host's LAN address is published in the notebook and the build guide

For whoever owns `nes-bench`. Found 2026-09-20, while translating the
documents into Japanese. Nothing in this repository can fix it: both pages are
generated in `nes-bench` and pulled here at build time, so the fix belongs at
the source. Nothing here was edited to paper over it, and the address is not
repeated in this note.

## What is published

Two pages carry the bridge host's LAN address, an IPv4 address and a port, in
a line quoting a run:

- `/docs/nes/lab-notebook`, step 0.2, the "held" line of attempt 2, stamped
  2026-09-08 12:41:14.
- `/docs/nes/build-guide`, step 0.2, the "Last run" line quoting the same
  attempt.

Both are live, in English and in Japanese, and the Japanese was written from
those lines so it says the same thing. `grep -rn "socket://" docs/nes/` finds
them; the address is the one with digits where `<pi>` belongs.

The same build guide writes the redacted form one step earlier, in the command
a reader is told to run:

    python3 tools/bringup.py --session 1 --bridge socket://<pi>:6545

So the convention already exists on the page. It is the quoted run that
escapes it.

## Why it matters here

`CLAUDE.md`, "No host-specific detail in this repository": addresses and the
local runbook live in `deploy/HOSTING.local.md`, which is gitignored. The rule
is there because a public repository once documented an internal LAN address
and a weakness on the host. This is that, with a longer reach: the documents
are gitignored here, but the site is public and indexed, so the address is
published even though it is not committed.

Localhost ports are fine and are committed all over this tree. A LAN address
is not a port.

## Where it comes from

    tools/bringup.py          takes --bridge socket://<host>:<port>, attempts
                              the step, and appends the attempt to
                              docs/lab-log.jsonl with the bridge as given
    tools/lab-notebook.py     renders every attempt from that log
    tools/build-guide.py      renders the step table plus the last run of each
                              step from the same log
    web/scripts/pull-nesdocs.mjs   pulls both rendered pages into this repo's
                              docs/nes/ on every build (gitignored here, since
                              nes-bench is the one copy)

So the address enters at the log line and is reprinted by both renderers, in
both languages, on every build.

## The fix

Redact where the line is rendered, not only where it is written. The log
already holds the address in the entries recorded so far, so a change that
only affects new runs leaves the published pages exactly as they are today.

1. In `tools/lab-notebook.py` and `tools/build-guide.py`, put the bridge
   through a redaction on the way to the page: keep the scheme and the port,
   replace the host with `<pi>`, which is what the guide's own command line
   already says. That fixes the pages on the next pull, history included.
2. In `tools/bringup.py`, write the redacted form into `docs/lab-log.jsonl`
   as well, so the published artefact never carries the address again. Keep
   the real one where the runbook keeps such things, not in a file that is
   rendered into a page.
3. Consider the same for anything else the log quotes back: a serial device
   path is harmless, a hostname or an address is not.

## How to tell it is fixed

From this repository, after a build has pulled the pages:

    grep -rnE "://[0-9]{1,3}(\.[0-9]{1,3}){3}" docs/nes/ docs/cart/

That should print nothing. The two lines should read `socket://<pi>:6545`, and
after a deploy both `/docs/nes/lab-notebook` and `/ja/docs/nes/lab-notebook`
should show the redacted form.

The Japanese shadows are the part of this that IS committed here, in
`docs/ja/nes/lab-notebook.md` and `docs/ja/nes/build-guide.md`, so they were
written with the redacted form on 2026-09-20 rather than with the address. Two
pages therefore say `<pi>` in Japanese and print the address in English until
the fix above lands. That is deliberate and it is the safe direction, but it
is a disagreement between two languages about what a run printed, which is
worth closing soon.

## What this repository could do about it

The pull is the boundary, and `pull-nesdocs.mjs` already throws when a
document stops matching what it expects, so that a build cannot quietly ship a
broken page. It could refuse a document carrying a bare IPv4 address the same
way, which would turn this rule from a convention into a check. That is a
small change on this side, and it is not made yet: it would fail every build
until the two lines above are fixed, so it goes in after the fix, not before.
