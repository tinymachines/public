import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { serviceOrigin } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
import { Reference } from "./Reference";
import "../hotbits.css";

/**
 * /hotbits/api: the reference, generated from the instrument's own schema.
 *
 * The opposite decision from /6502/api, and for a measured reason rather than
 * a preference. That service ships a written reference with worked examples,
 * and its schema has no tags and summaries derived from function names, so
 * generating there would have been a downgrade. This service ships no
 * document at all and a schema with real descriptions, so generating is the
 * only honest option and also the one CLAUDE.md asks for: a reference cannot
 * drift from the behaviour when it is the models that validate the requests.
 *
 * Generated in the reader's browser rather than at build time, so it is what
 * the service says about itself now. And then checked: every documented route
 * without a path parameter is asked whether it is still there, which is how
 * this page can say that the open endpoints have been retired behind a key
 * while the schema still lists them.
 */

export const metadata: Metadata = {
  title: "The hotbits API",
  description:
    "The Geiger TRNG's own schema, rendered and then checked against the running instrument.",
};

const PROSE = {
  en: {
    p1: (api: string) => (
      <>
        Everything below is read from{" "}
        <a data-address href={`${api}/openapi.json`}>
          the instrument&rsquo;s schema
        </a>{" "}
        when this page loads.
      </>
    ),
    p2: (
      <>
        Each documented route is also called, and what it returned is shown
        beside it.
      </>
    ),
  },
  ja: {
    p1: (api: string) => (
      <>
        以下はすべて、このページを開いたときに{" "}
        <a data-address href={`${api}/openapi.json`}>
          装置のスキーマ
        </a>{" "}
        から読まれる。
      </>
    ),
    p2: (
      <>
        文書化されたルートはそれぞれ実際に呼び出され、返ってきたものがその横に表示される。
      </>
    ),
  },
} as const;

export default async function HotbitsApiPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const api = serviceOrigin("hotbits", "trng");

  return (
    <Shell lang={lang} die="TRNG" title="The hotbits API">
      <main className="prose">
        <p>{S.p1(api)}</p>
        <p>{S.p2}</p>

        <Reference api={api} lang={lang} />
      </main>
    </Shell>
  );
}
