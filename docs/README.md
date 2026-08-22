# `docs/`: the content tree

Markdown and MDX. The Next app in `../web/` renders it at `/docs`; the content
lives here rather than inside the app because it is the thing somebody who is
not a developer should be able to edit.

Empty for now. See [`../START-HERE.md`](../START-HERE.md) step 2, which is
where work starts.

## The conventions, and why each one

```
docs/
  index.md                     ->  /docs
  6502/
    index.md                   ->  /docs/6502
    the-console-contract.md    ->  /docs/6502/the-console-contract
    cartridges.mdx             ->  /docs/6502/cartridges
```

- **Navigation is derived from the tree, never from a list.** Ten hand-copied
  nav lists in the 6502 repo had drifted three ways before anybody noticed,
  because a nav missing one link still looks exactly like a nav. A page that
  exists must appear; a page deleted must vanish. If you are writing `nav.ts`,
  stop.
- **Frontmatter carries only what the tree cannot say**: `title`, a one-line
  `description`, and `order` for sibling sorting (absent sorts last,
  alphabetically). Not the URL, which is the path. Not the parent, which is the
  directory.
- **A page with no title is a build failure**, not a page called "Untitled". A
  silent omission reads as a design choice.
- **Every code block that states an output has been run.** If it says the
  answer is `$42`, somebody ran it.

## Where the first content comes from

Good, measured reference material already exists and is reachable only by
cloning a repo:

1. the 6502 repo's `README.md`: what the simulator is, and the verification
2. `service/README.md`: the API, the chip atlas, cartridges, MCP
3. `games/README.md`: the console contract, the cartridge format, builder pages
4. the cartridge and console reference currently inside `service/api.html`

**Move it, do not rewrite it.** Where it states a number, that number was
measured; keep it, and keep the sentence saying where it came from.
