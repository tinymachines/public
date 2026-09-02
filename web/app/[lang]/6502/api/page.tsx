import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { apidoc } from "@/lib/apidoc";
import { Shell } from "@/app/components/SiteFrame";
import { Untranslated } from "@/app/components/Untranslated";
import "./apidoc.css";

/**
 * /6502/api: the API reference, moved out of the 6502 service's own api.html.
 *
 * ## What this is, and what it is not
 *
 * It is the reference. It is not the API. The service still answers at its own
 * address and nothing here proxies it, which is a decision worth stating
 * rather than leaving to be inferred from the absence of a proxy.
 *
 * Proxying was the obvious move and it is wrong in a specific way. That
 * process is started with `--root-path /api`, so the `servers` block in its
 * own `openapi.json` says `/api`. Served under `/6502/api` here, a Swagger UI
 * reading that document would issue its requests against `/api/v1/...` on THIS
 * host, which is this site's own API and a different service entirely. The
 * requests would not fail. They would go somewhere else and answer, which is
 * the worst of the three outcomes.
 *
 * So `lands_at` stays a proposal in the manifest, as it was. What moves today
 * is the document, and the document is the part a reader wanted.
 *
 * ## The reference checks itself against the service
 *
 * The rule from the 6502 work is that prose is where a site goes quietly
 * wrong, because it is written once and nothing checks it afterwards. So this
 * page asks the running service for its `openapi.json` and compares the routes
 * it describes with the routes that exist, in both directions.
 *
 * It found something immediately: the document is newer than the process. Two
 * registry routes are described here, merged upstream, and not deployed. The
 * page says which, rather than leaving a reader to copy a curl that 404s.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502/api")
}

export default async function ApiPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const { style, body } = apidoc();

  return (
    <Shell lang={lang}
      die="API"
      title="The 6502 API"
      /* The document carries its own h1, which is its opening claim about the
         chip. The masthead must not be a second one. */
      titleIsHeading={false}
    >
      {/* Inline rather than a file, as the explorer's is: 4 KB, and a hashed
          asset for that is more machinery than it saves. The lab's is 35 KB
          and is written out for exactly that reason. */}
      <style dangerouslySetInnerHTML={{ __html: style }} />


      {/* The document itself, its :root replaced by apidoc.css and every
          selector scoped to .apidoc-shell. Not one of its own rules is edited
          and not a word of it is retyped. */}
      <Untranslated lang={lang} />
      <div className="apidoc-shell" lang="en" dangerouslySetInnerHTML={{ __html: body.replace(/<main\b/g, "<div").replace(/<\/main>/g, "</div>") }} />
    </Shell>
  );
}
