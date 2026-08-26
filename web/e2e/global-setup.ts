import fs from "node:fs";
import path from "node:path";
import { BASE, OUT } from "./lib";

/** The page list comes from the site, not from a file somebody maintains. */
export default async function globalSetup() {
  const r = await fetch(`${BASE}/sitemap.xml`);
  if (!r.ok) throw new Error(`${BASE}/sitemap.xml: HTTP ${r.status}`);
  const xml = await r.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const paths = locs.map((u) => new URL(u).pathname.replace(/\/$/, "") || "/");
  if (paths.length < 100) throw new Error(`sitemap lists ${paths.length} pages; expected 100 or more`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "pages.json"), JSON.stringify([...new Set(paths)], null, 1));
}
