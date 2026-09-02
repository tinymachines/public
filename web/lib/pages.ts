/**
 * Every fixed page, named once.
 *
 * A page's title and one-sentence description are read by three things: the
 * page's own metadata (lib/seo.ts), the card a link to it unfurls into
 * (app/og), and the overlay that translates both (data/ja.json, keyed by the
 * English). Three readers of one string is exactly the case for one table.
 * Pages that are rendered from something else (the docs tree, the explorer's
 * own pages, the registry) get their words from that something else.
 */

export interface FixedPage {
  title: string;
  description: string;
  /** Keep out of the index and draw no card (a working reference, an admin). */
  noindex?: boolean;
}

export const PAGES: Record<string, FixedPage> = {
  "/6502": {
    title: "6502",
    description:
      "A transistor-level MOS 6502, and everything built on it.",
  },
  "/6502/api": {
    title: "The 6502 API",
    description:
      "A transistor-level MOS 6502 over HTTP, one half-cycle at a time. The reference, checked against the running service.",
  },
  "/6502/archive": {
    title: "The visual6502 archive",
    description:
      "visual6502.org, recovered from the Internet Archive: the wiki rebuilt from its wikitext, and the die photography made browsable again.",
  },
  "/6502/builders": {
    title: "Builders",
    description:
      "Everyone publishing cartridges for the transistor-level 6502, and what they have published.",
  },
  "/6502/cart": {
    title: "Cart",
    description:
      "Mint a token, build a cartridge by hand or by AI, play it, publish it, and the chip measures it.",
  },
  "/6502/explorer": {
    title: "The explorer",
    description:
      "A transistor-level MOS 6502, drawn from the die and lit by what it is doing.",
  },
  "/6502/games": {
    title: "Die Runner",
    description:
      "A console on a transistor-level MOS 6502. Every frame is run on the real die.",
  },
  "/6502/lab": {
    title: "Halfwave Lab",
    description:
      "A 6502, half a clock phase at a time. Every value read off the running die.",
  },
  "/6502/learn": {
    title: "Learn",
    description:
      "The lesson: from a token to a published cart, then one instruction followed into the silicon.",
  },
  "/6502/manage": {
    title: "The editor",
    description:
      "Claim a handle, edit your page, publish a ROM. The cartridge is run on the chip before it is listed.",
  },
  "/6502/tools": {
    title: "Lab and tools",
    description:
      "The instruments: the die lit by what it is doing, the tracer, the schematic, the Halfwave Lab. One chip, many views.",
  },
  "/visitors": {
    title: "Visitors",
    description:
      "Who visited, from the server's own logs: reads per site and per day, the pages read, where readers came from. No address is kept.",
    noindex: true,
  },
  "/admin": {
    title: "Admin",
    description:
      "Dev keys, and the people they belong to.",
    noindex: true,
},
  "/hotbits": {
    title: "hotbits",
    description:
      "True random bytes from radioactive decay: a Geiger counter on a Pi, with bits taken from the timing between events.",
  },
  "/hotbits/space": {
    title: "The entropy, drawn",
    description:
      "Four views of the same radioactive decay: a 3D field, a return map, a bit raster, and the measurements in phase space. Read from the archive, never the fresh pool.",
  },
  "/hotbits/api": {
    title: "The hotbits API",
    description:
      "The Geiger TRNG's own schema, rendered and then checked against the running instrument.",
  },
  "/ntsc": {
    title: "ntsc-crt",
    description:
      "Signal-level NTSC: the composite waveform encoded, decoded and displayed through a CRT model, with an oracle at every stage and three spec claims that did not survive measurement.",
  },
  "/ntsc/bench": {
    title: "The ntsc bench",
    description:
      "The signal path live in the page: dot planes encoded to the composite waveform and decoded on the rung you choose, with the drift counters visible.",
  },
  "/style": {
    title: "Style guide",
    description:
      "Two grounds, a measured palette, and the kit that follows from them.",
  },
  "/style/zoo": {
    title: "Widget zoo",
    description:
      "Every component in the system, rendered on the real page ground with the exact markup that produced it.",
    noindex: true,
},
};

/** Which project a path belongs to, for the accent it wears. */
export function projectFor(path: string): string | null {
  // A document about a project is that project's: /docs/6502/... wears 6502.
  const m = path.match(/^\/(?:docs\/)?(6502|hotbits|ntsc)(\/|$)/);
  return m ? m[1] : null;
}

/** What the die tile says on that page's bar. */
export function dieFor(path: string): string {
  return projectFor(path) ?? "tm";
}
