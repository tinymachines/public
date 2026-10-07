import fs from "node:fs";
import path from "node:path";

/**
 * The Computer Tree's dataset, to take away: the four files bradley.io
 * publishes, copied in by scripts/sync-computer-tree.sh to web/data (not
 * web/public, which nothing writes outside the deploy). Static: the files
 * exist at build.
 */

export const dynamic = "force-static";

const DIR = path.join(process.cwd(), "data", "computer-tree");
const TYPES: Record<string, string> = {
  "computer_tree.json": "application/json",
  "nodes.csv": "text/csv; charset=utf-8",
  "edges.csv": "text/csv; charset=utf-8",
  "DATACARD.md": "text/markdown; charset=utf-8",
};

export function generateStaticParams() {
  return Object.keys(TYPES).map((file) => ({ file }));
}

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const type = TYPES[file];
  if (!type) return new Response("no such file\n", { status: 404 });
  return new Response(fs.readFileSync(path.join(DIR, file)), { headers: { "content-type": type } });
}
