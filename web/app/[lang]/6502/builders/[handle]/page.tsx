import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { localize } from "@/lib/i18n";
import { chipApi } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
import { Builder } from "./Builder";
import "../registry.css";

/**
 * /6502/builders/<handle>: one builder, and everything they publish.
 *
 * ## Why this is not /6502/b/<handle>
 *
 * It is both. The service's own `play_url` and every link ever handed out use
 * `/b/<handle>`, so next.config.ts 308s /6502/b/<handle> here. CLAUDE.md's
 * rule is that public paths become a redirect map at the move, and the
 * cheapest time to write that map is while moving.
 *
 * The reason the page itself sits under /6502/builders is the breadcrumb. The
 * trail is derived from the path, so /6502/b/x reads "tinymachines / 6502 / b
 * / x" with the middle crumb linking to /6502/b, a collection page that would
 * exist only to give a crumb somewhere to point. Under /6502/builders the
 * middle crumb is the builders index, which is where somebody clicking it
 * wants to go.
 *
 * ## Not prerendered, and not generateStaticParams
 *
 * Handles are claimed by other people between our deploys. A build-time list
 * would be a page that 404s for anybody who joined since, which is the failure
 * mode a registry must not have.
 */

export async function generateMetadata(
  { params }: PageProps<"/[lang]/6502/builders/[handle]">,
): Promise<Metadata> {
  const { handle } = await params;
  return {
    // The registry is not asked here. A title is chrome and the page is about
    // to fetch the real name anyway; a fetch in generateMetadata would put
    // another service in the critical path of rendering this one, which is the
    // arrangement the whole page is written to avoid.
    title: `@${handle}`,
    description: `Cartridges published by @${handle} for the transistor-level 6502.`,
  };
}

export default async function BuilderPage({ params }: PageProps<"/[lang]/6502/builders/[handle]">) {
  const { lang, handle } = await params;

  return (
    <Shell lang={lang as Lang} die="REG" title={`@${handle}`}>
      <main className="prose">
        <p className="crumb">
          <Link href={localize(lang as Lang, "/6502/builders")}>
            {lang === "ja" ? "ビルダー一覧" : "All builders"}
          </Link>
        </p>
        <Builder handle={handle.toLowerCase()} api={chipApi()} lang={lang as Lang} />
      </main>
    </Shell>
  );
}
