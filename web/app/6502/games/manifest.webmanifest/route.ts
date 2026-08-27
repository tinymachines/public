import { consoleManifest } from "@/lib/manifest";

/**
 * The console's own manifest: display fullscreen, start at the console.
 * Linked from /6502/games alone (page.tsx), so what gets installed is what
 * the page being added was. lib/manifest.ts has the reasoning.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(JSON.stringify(consoleManifest()), {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
}
