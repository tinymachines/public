# Handoff prompt

Paste the block below into a fresh session in `~/projects/tinymachines/public`.
It is the kickoff message, not documentation: `START-HERE.md` is the brief the
prompt sends the agent to read.

Four constraints are repeated here that also live in `CLAUDE.md`, and the
duplication is deliberate. Each one fails **silently or expensively**: a
stylesheet the owner has to redo, an edit to a read-only repo, a live site
taken down, or a local server that was quietly production. Those are worth
saying twice; everything else is left to the files.

Keep this in step with the decisions in `START-HERE.md`. If the stack, the
ports or the ownership of the style guide change, this file is stale and will
brief an agent wrongly.

---

```
You're picking up tinymachines.ai. Work in ~/projects/tinymachines/public
(github.com/tinymachines/public). Nothing is built yet: the repo is a survey,
a plan, and the house rules.

Read these four first, in this order, before proposing anything:

  CLAUDE.md           how to work here, and eight traps already paid for
  START-HERE.md       the brief, the decided stack, the order of work
  notes/inventory.md  what already exists on this machine, surveyed not recalled
  NOTICE.md           licensing. The die data is CC BY-NC-SA and it travels

Then start on step 2 of START-HERE.md: /docs.

THE STACK IS DECIDED. Next 16 + React 19 + MDX + Tailwind 4 (bun) on
127.0.0.1:6511 serving / and /docs; FastAPI + uvicorn + Pydantic on
127.0.0.1:6510 serving /api; nginx in front. Bootstrap commands are in
web/README.md. Do not relitigate this; the reasoning is in START-HERE.md.

STEP 2, CONCRETELY:
  1. Bootstrap the Next app in web/
  2. Build the /docs renderer. Content lives in docs/ as .md and .mdx.
     Navigation is derived from the directory tree, never from a list.
  3. Move the existing reference content in (the list is in docs/README.md).
     Move it, don't rewrite it. Where it states a number, that number was
     measured: keep it, and keep the sentence saying where it came from.

HARD CONSTRAINTS:

- The style guide, palette, fonts and type scale are the OWNER'S and are in
  progress. The @theme block in app/globals.css is the seam: leave it minimal
  and commented as theirs. No hardcoded colours in components. A literal
  text-[#0B1120] is a token their stylesheet can never reach.

- Do NOT edit ~/projects/tinymachines/6502. It's the source for the docs
  content and it is read-only from here. If something there needs changing,
  say so and why.

- 6502.tinymachines.ai, games.tinymachines.ai and halfwave.tinymachines.ai are
  live and must keep working. Their nginx, units and ports are a proposal,
  not an action.

- Subdomains stay for now and move under the apex later. So assume
  cross-origin, and keep public paths stable: they become a redirect map.

- 127.0.0.1:6502 is the LIVE API. A server started there fails to bind
  silently and every request then goes to production while looking local.
  Run `ss -ltn` before believing a local server is yours.

- /usr/bin/node on this host is v12 and can't parse `??`. systemd's PATH has
  no nvm in it. Any unit you write must set PATH explicitly.

Start by reading those four files, then tell me: what you found, what you'd do
first, and anything in the plan you think is wrong. Don't write code until
we've agreed the first move.
```
