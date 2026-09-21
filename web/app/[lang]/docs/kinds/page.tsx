import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { byKind } from "@/lib/nes-shelves";
import "./kinds.css";

/**
 * /docs/kinds: the notebook by what each document IS.
 *
 * The notebook is grouped by part of the console, which answers "where does
 * this belong". A reader who has read none of it is asking something else:
 * which of these fifty-two should I open first. The kinds answer that. A
 * plan was written before the work and says what would be checked; a report
 * was written after and every figure in it is a measurement; a procedure is
 * a thing to follow at the bench; a reference is a thing to look up; a
 * record is what happened, failures included.
 *
 * Both axes are the same list seen twice, from docs/nes/shelves.json, which
 * scripts/pull-nesdocs.mjs writes from the one table that names each
 * document. A document with no kind stops the build there rather than
 * landing in a bucket here.
 *
 * A static segment, so it wins over the docs catch-all beside it. It is not
 * a document and does not pretend to be one: it has no shadow in docs/ja,
 * and its own words go through the overlay like any other page's.
 *
 * No Shell here: app/[lang]/docs/layout.tsx already wraps this route in one,
 * with the tree beside it, and a second would be a second <main> on the page.
 * check-build caught exactly that on the first build of this file.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/docs/kinds", {
    title: "The notebook by kind",
    description:
      "The same documents, sorted by what each one is: plans written before the work, reports written after, procedures, references and records.",
  });
}

export default async function KindsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const kinds = byKind();
  const total = kinds.reduce((n, k) => n + k.docs.length, 0);

  return (
    <>
      <h1>{t(lang, "The notebook by kind")}</h1>
      <div className="prose">
        <p className="lede">
          {t(
            lang,
            "The notebook is grouped by the part of the console each document is about. This is the other question: what is this document, and should I open it first. Every one of them appears here exactly once.",
          )}
        </p>
        <p className="measured">
          <b>{total}</b> {t(lang, "documents, each carrying the kind its own entry declares")}
        </p>
      </div>

      {kinds.map(({ kind, docs }) => (
        <section className="kind" key={kind.key}>
          <h2>
            {t(lang, kind.name)} <span className="kind-n">{docs.length}</span>
          </h2>
          <p className="kind-what">{t(lang, kind.what)}</p>
          <ul className="kind-list">
            {docs.map((d) => (
              <li key={d.route}>
                <Link href={localize(lang, d.route)}>{t(lang, d.title)}</Link>
                {d.code ? <span className="kind-code">{d.code}</span> : null}
                <span className="kind-desc">{t(lang, d.description)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="prose">
        <p className="kind-note">
          {t(lang, "The same documents by the part they are about:")}{" "}
          <Link href={localize(lang, "/docs/nes")}>{t(lang, "The console arc's notebook")}</Link>.
        </p>
      </div>
    </>
  );
}
