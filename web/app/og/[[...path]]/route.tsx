import { NextResponse } from "next/server";
import { chrSvg, renderCard } from "@/lib/card";
import { pageForSlug } from "@/lib/docs";
import { explorer, explorerPages } from "@/lib/explorer";
import { t } from "@/lib/i18n";
import { delocalize, type Lang } from "@/lib/lang";
import { PAGES, dieFor, projectFor } from "@/lib/pages";
import { chipApi } from "@/lib/projects";
import type { Builder } from "@/lib/registry";
import { SITE_DESCRIPTION } from "@/lib/seo";

/**
 * /og/<path> is the card for the page at /<path>, in that page's language:
 * /og/6502/games draws Die Runner's, /og/ja/6502/games draws it in Japanese,
 * /og is the site's own.
 *
 * The words are the words the page declares to search engines, from the same
 * table (lib/pages.ts) or the same reader (the docs tree, the explorer's
 * pages), so a card cannot say something the page does not. A builder's
 * card asks the registry for their name and their latest cover, the one
 * place a live service is consulted, and falls back to the handle if it
 * does not answer.
 *
 * Cached an hour: a card is a rendering of words that change with a deploy,
 * and a builder's cover changes when they publish.
 */

export const revalidate = 3600;

function notFound() {
  return new NextResponse("no such page", { status: 404 });
}

async function builderCard(lang: Lang, handle: string) {
  let name = `@${handle}`;
  let description = t(lang, "Cartridges published by @HANDLE for the transistor-level 6502.").replace("@HANDLE", `@${handle}`);
  let cover: string | null = null;
  try {
    const r = await fetch(`${chipApi()}/v1/registry/b/${encodeURIComponent(handle)}`, { next: { revalidate: 3600 } });
    if (r.status === 404) return null;
    if (r.ok) {
      const b = (await r.json()) as Builder;
      if (b.name) name = b.name;
      if (b.bio) description = b.bio;
      const latest = [...b.roms].sort((a, z) => z.updated.localeCompare(a.updated)).find((x) => x.cover);
      if (latest?.cover) {
        let chr = latest.cover.chr ?? null;
        if (!chr && latest.cover.url) {
          const a = await fetch(latest.cover.url, { next: { revalidate: 3600 } });
          if (a.ok) chr = ((await a.json()) as { chr?: string }).chr ?? null;
        }
        if (chr) cover = chrSvg({ ...latest.cover, chr });
      }
    }
  } catch { /* the registry did not answer: the card still names the builder */ }
  return { title: name, description, cover };
}

export async function GET(_req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path: segs = [] } = await ctx.params;
  const { lang, path } = delocalize("/" + segs.join("/"));

  // The site itself.
  if (path === "/") {
    return renderCard({ lang, die: dieFor("/"), project: null, title: "tinymachines", description: t(lang, SITE_DESCRIPTION), path: "/" });
  }

  const common = { lang, die: dieFor(path), project: projectFor(path), path };

  const fixed = PAGES[path];
  if (fixed) {
    if (fixed.noindex) return notFound();
    return renderCard({ ...common, title: t(lang, fixed.title), description: t(lang, fixed.description) });
  }

  const doc = path.match(/^\/docs(?:\/(.+))?$/);
  if (doc) {
    const page = pageForSlug(doc[1] ? doc[1].split("/") : []);
    if (!page) return notFound();
    return renderCard({ ...common, title: t(lang, page.title), description: t(lang, page.description ?? "") });
  }

  const ex = path.match(/^\/6502\/([a-z0-9-]+)$/);
  if (ex) {
    const p = explorerPages().find((e) => e.slug === ex[1]);
    if (p) {
      const x = explorer(p.file);
      return renderCard({ ...common, title: t(lang, x.title), description: t(lang, x.description) });
    }
  }

  const b = path.match(/^\/6502\/builders\/([A-Za-z0-9_-]{1,32})$/);
  if (b) {
    const card = await builderCard(lang, b[1].toLowerCase());
    if (!card) return notFound();
    return renderCard({ ...common, ...card });
  }

  return notFound();
}
