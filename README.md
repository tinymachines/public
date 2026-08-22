# tinymachines.ai

The front door for the 6502 work: a transistor-level MOS 6502 that simulates
**3510 real switches** traced from die photographs, everything built on it, and
eventually the rest of the shop.

**Nothing is built yet.** This repository is a scaffold, a survey and a plan.

| | |
|---|---|
| [`START-HERE.md`](START-HERE.md) | the brief, the proposed shape, and the order of work |
| [`notes/inventory.md`](notes/inventory.md) | what already exists and where, surveyed rather than recalled |
| [`CLAUDE.md`](CLAUDE.md) | how to work in here, and the traps already paid for |
| [`NOTICE.md`](NOTICE.md) | licensing. Read before anything ships |

## What it will be

```
tinymachines.ai          the site. 6502 work front and centre
tinymachines.ai/api      one API, spoken as REST and as MCP
tinymachines.ai/docs     a markdown hierarchy, rendered server side
```

## What already runs

| | |
|---|---|
| [6502.tinymachines.ai](https://6502.tinymachines.ai) | the explorer: the die, the atlas, the schematic, the measured tables |
| [6502.tinymachines.ai/api](https://6502.tinymachines.ai/api/) | the chip over HTTP, one half-cycle at a time. Stateless: the whole machine travels in every request |
| [games.tinymachines.ai](https://games.tinymachines.ai) | Die Runner: a 6502 ROM, a page of its memory as the screen, and the browser drawing it |
| [halfwave.tinymachines.ai](https://halfwave.tinymachines.ai) | a lab on the same engine |
| [github.com/tinymachines/halfphi](https://github.com/tinymachines/halfphi) | the switch-level engine, MIT, embedding no die data |
| [github.com/tinymachines/6502](https://github.com/tinymachines/6502) | the simulator, the site, the service and the games |

## Licensing, in one line

Our code is ours; the die data is **CC BY-NC-SA 3.0** (Greg James /
visual6502.org) and NonCommercial and ShareAlike travel with everything derived
from it. See [`NOTICE.md`](NOTICE.md).
