import fs from "node:fs";
import { chipApi } from "./projects";
import path from "node:path";

/**
 * The brief: everything an agent needs to build, run and publish a cartridge,
 * in one read. Served two ways from one text:
 *
 *   /6502/cart/brief.md   the document, for a person or a pasted prompt
 *   /6502/cart/skill.md   the same with a skill's frontmatter on top, so it
 *                         drops into ~/.claude/skills/tm6502-cart/SKILL.md
 *                         (or wherever a platform keeps its skills) as is
 *
 * The body is the docs themselves, concatenated: the walkthrough first, then
 * the three references it cites and the MCP page. Nothing is restated here.
 *
 * The token is never in what this serves. A URL that carried one would put
 * it in browser history, proxy logs and the referrer of the next click. The
 * editor composes the version with the key IN THE BROWSER, where the token
 * already is, and hands it over as a file: see Brief.tsx. The line below that
 * says so is the one it replaces.
 */

const DOCS = path.join(process.cwd(), "..", "docs", "6502");
const PARTS = [
  "build-your-first-cart.md",
  "the-console-contract.md",
  "cartridges.md",
  "the-registry.md",
  "mcp.md",
];

import { SKILL_NAME, TOKEN_PLACEHOLDER } from "./brief-token";

function body(file: string): string {
  const raw = fs.readFileSync(path.join(DOCS, file), "utf8");
  return raw.replace(/^---[\s\S]*?---\s*/, "");
}

export function clean(v: string | null | undefined): string {
  return (v ?? "").replace(/[^A-Za-z0-9_-]/g, "").toLowerCase().slice(0, 32);
}

export function briefText(opts: { slug?: string | null; handle?: string | null; skill?: boolean }): string {
  const slug = clean(opts.slug);
  const handle = clean(opts.handle) || slug;
  const front = opts.skill
    ? [
        "---",
        `name: ${SKILL_NAME}`,
        "description: Build, run and publish a cartridge (a game or ROM) for the transistor-level MOS 6502 at tinymachines.ai. Use when the user wants to write a 6502 cart, assemble 6502 code against the console contract, run it on the chip, or publish it to their builder page.",
        "---",
        "",
      ]
    : [];
  const head = [
    ...front,
    "# 6502 as a service: the brief",
    "",
    "Everything needed to build, run and publish a cartridge for a transistor-level MOS 6502, in one read.",
    "",
    `- Chip API (assemble, run, mint cartridges, the registry): \`${chipApi()}/\` (reference at that URL; OpenAPI at \`${chipApi()}/openapi.json\`)`,
    "- Token mint (free, rate-limited): `POST https://tinymachines.ai/api/v1/tokens`; with an account, `POST https://tinymachines.ai/api/v1/me/tokens`",
    `- The console contract as data: \`GET ${chipApi()}/v1/console\``,
    "- Play a cartridge: `https://tinymachines.ai/6502/games?cart=<url>`",
    "- MCP, for a model with tool use: `https://tinymachines.ai/api/mcp`",
    ...(slug
      ? [
          "",
          "## Your setup",
          "",
          `- Your cart code: \`${slug}\`. Publish your first cartridge under this name.`,
          `- Your handle: \`${handle}\`. Your page: https://tinymachines.ai/6502/builders/${handle}`,
          TOKEN_PLACEHOLDER,
          `- Publish: \`PUT ${chipApi()}/v1/registry/b/${handle}/roms/${slug}\` with \`Authorization: Bearer <token>\` and \`{"cart": "<base64 of the .cart.gz>", "frames": 3}\``,
          `- After publishing, play it: https://tinymachines.ai/6502/games?cart=${chipApi()}/v1/registry/b/${handle}/roms/${slug}/cart`,
          "- The token is a secret: whoever holds it publishes to this page. Keep it out of anything shared or committed.",
        ]
      : []),
    "",
    "## How to work",
    "",
    "1. Read the walkthrough below, then the three references it cites. Start at step 1 of the walkthrough.",
    "2. Prove the chain before writing a game: `GET /v1/console`, assemble a few lines with `POST /v1/assemble`, run them with `POST /v1/run`. If any of these fails, stop and say so.",
    "3. Build in small steps and run each on the chip. The chip measures; it does not believe.",
    "4. Show the person the play link once a frame completes, and publish only when they say so.",
    "",
    "---",
    "",
  ].join("\n");
  return head + PARTS.map(body).join("\n\n---\n\n");
}

export function serve(text: string): Response {
  return new Response(text, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
