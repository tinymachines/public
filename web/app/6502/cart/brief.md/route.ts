import fs from "node:fs";
import path from "node:path";

/**
 * The one URL an AI needs: plain markdown, everything top to bottom.
 *
 * The owner handed a model the API reference and one sentence and it wrote,
 * debugged and published a working game. This is that path made smooth: the
 * walkthrough, then the three references it points at, concatenated from the
 * same files the docs render, so the brief cannot say something the docs do
 * not. Nothing here is written twice; the header is the only prose of its
 * own and it names where everything else answers.
 *
 * `?slug=` is accepted and echoed for the next stage, where minting hands out
 * a cart code and this brief is precharged with it. Today it is a label.
 *
 * Outside [lang] on purpose: models read English, and the localized tree
 * would give this document a Japanese twin that no model asks for. The
 * `.md` in the path is what a model, a curl and a person all expect to see.
 */

const DOCS = path.join(process.cwd(), "..", "docs", "6502");
const PARTS = [
  "build-your-first-cart.md",
  "the-console-contract.md",
  "cartridges.md",
  "the-registry.md",
  "mcp.md",
];

function body(file: string): string {
  const raw = fs.readFileSync(path.join(DOCS, file), "utf8");
  // Frontmatter off; the title stays as the document's own h1.
  return raw.replace(/^---[\s\S]*?---\s*/, "");
}

export function GET(request: Request): Response {
  const slug = new URL(request.url).searchParams.get("slug");
  const head = [
    "# 6502 as a service: the brief",
    "",
    "Everything needed to build, run and publish a cartridge for a transistor-level MOS 6502, in one read.",
    "",
    "- Chip API (assemble, run, mint cartridges, the registry): `https://6502.tinymachines.ai/api/` (reference at that URL; OpenAPI at `/api/openapi.json`)",
    "- Token mint (free, rate-limited): `POST https://tinymachines.ai/api/v1/tokens`",
    "- The console contract as data: `GET https://6502.tinymachines.ai/api/v1/console`",
    "- Play a cartridge: `https://tinymachines.ai/6502/games?cart=<url>`",
    "- MCP, for a model with tool use: `https://tinymachines.ai/api/mcp`",
    slug ? `- Your cart code: \`${slug.replace(/[^A-Za-z0-9_-]/g, "")}\`` : "",
    "",
    "The walkthrough comes first; the three references it cites follow in full. Read all of it, then start at step 1.",
    "",
    "---",
    "",
  ].filter((l) => l !== null).join("\n");
  const text = head + PARTS.map(body).join("\n\n---\n\n");
  return new Response(text, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
