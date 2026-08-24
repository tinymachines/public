"use client";

import { RegistryState, useRegistry } from "@/app/components/RegistryData";
import type { Lang } from "@/lib/lang";

/**
 * The reference, measured against the service that is actually running.
 *
 * A reference is the part of a site most likely to go quietly wrong: it is
 * written against what was true that afternoon, and nothing checks it
 * afterwards. This is the check, and it runs in the reader's browser rather
 * than at build time, so it is true when they read it rather than true when it
 * shipped.
 *
 * It found something the moment it was written. The document on disk is newer
 * than the process answering at that address: it describes routes that were
 * merged upstream and have not been deployed. That is not a defect in either
 * one, and the honest thing is to say which lines those are rather than to let
 * a reader copy a curl that returns 404 with no explanation.
 *
 * `openapi.json` is the right thing to ask, and it is the same object CLAUDE.md
 * insists the reference must not drift from: it is generated from the Pydantic
 * models that validate the requests. Asking the models what exists is not a
 * second schema, it is the first one.
 *
 * Both directions are counted, because only one of them is the interesting
 * failure. A route documented and absent is a curl that will not work; a route
 * present and undocumented is a page that is behind. Neither is visible from
 * inside this repository.
 */

interface OpenApi {
  paths: Record<string, Record<string, unknown>>;
  info?: { version?: string };
}

/* The page passes lang down because this is a client component: importing the
   server-side dictionary here would ship it wholesale, so each string lives in
   both languages right where it is used, the same shape as every other client
   piece on the site. */
const L = {
  en: {
    what: "the running service's own schema",
    documented: (n: number) => (
      <>
        <b>{n} routes</b> named in this document, counted from its own markup
      </>
    ),
    answering: (n: number) => (
      <>
        <b>{n} operations</b> in the service answering right now, read from its
        own openapi.json
      </>
    ),
    absentTag: (n: number) => `${n} documented, not answering`,
    allAnswer: "every documented route answers",
    undocTag: (n: number) => `${n} answering, not documented`,
    absentNote: (
      <>
        <b>These are described below and do not answer yet.</b> The reference is
        read from the 6502 repository at build time and the service is a running
        process, so the two move on different days. Nothing here is broken: the
        routes are merged and the process has not been restarted. This block
        goes empty on its own when it is.
      </>
    ),
    absent: "absent",
    undocNote: (
      <>
        <b>These answer and are not described below.</b> The service is ahead of
        its own reference.
      </>
    ),
  },
  ja: {
    what: "稼働中のサービス自身のスキーマ",
    documented: (n: number) => (
      <>
        この文書に記載の <b>ルート {n} 本。</b>文書自身のマークアップから集計
      </>
    ),
    answering: (n: number) => (
      <>
        いま応答中のサービスにある <b>オペレーション {n} 件。</b>サービス自身の
        openapi.json から読取
      </>
    ),
    absentTag: (n: number) => `記載済みで未応答: ${n} 本`,
    allAnswer: "記載のルートはすべて応答中",
    undocTag: (n: number) => `応答中で未記載: ${n} 件`,
    absentNote: (
      <>
        <b>以下は本文に記載があり、まだ応答しないルート。</b>
        リファレンスはビルド時に 6502 リポジトリから読み込まれ、サービスは稼働中のプロセスなので、二つは別の日に動く。壊れているものは何もない:
        ルートはマージ済みで、プロセスがまだ再起動されていないだけだ。再起動されれば、このブロックはひとりでに空になる。
      </>
    ),
    absent: "未応答",
    undocNote: (
      <>
        <b>以下は応答していて、本文に記載がないルート。</b>
        サービスが自身のリファレンスより先へ進んでいる。
      </>
    ),
  },
} as const;

export function Coverage({
  api,
  endpoints,
  lang = "en",
}: {
  api: string;
  endpoints: { method: string; path: string }[];
  lang?: Lang;
}) {
  const S = L[lang];
  const { data, error } = useRegistry<OpenApi>(`${api}/openapi.json`);

  if (!data) {
    return (
      <div className="apicov">
        <RegistryState error={error} what={S.what} lang={lang} />
      </div>
    );
  }

  const live = new Set<string>();
  for (const [route, methods] of Object.entries(data.paths ?? {})) {
    for (const verb of Object.keys(methods)) live.add(`${verb.toUpperCase()} ${route}`);
  }

  const documented = new Set(endpoints.map((e) => `${e.method} ${e.path}`));
  const absent = endpoints.filter((e) => !live.has(`${e.method} ${e.path}`));
  const undocumented = [...live].filter((k) => !documented.has(k)).sort();

  return (
    <div className="apicov">
      <div className="chips">
        <span className="measured">{S.documented(endpoints.length)}</span>
        <span className="measured">{S.answering(live.size)}</span>
        <span className={absent.length ? "tag warn" : "tag live"}>
          {absent.length ? S.absentTag(absent.length) : S.allAnswer}
        </span>
        {undocumented.length ? (
          <span className="tag warn">{S.undocTag(undocumented.length)}</span>
        ) : null}
      </div>

      {absent.length ? (
        <>
          <p className="notice">{S.absentNote}</p>
          <div className="rows">
            {absent.map((e) => (
              <div key={`${e.method} ${e.path}`} className="row absent">
                <span className="verb">{e.method}</span>
                <span className="route">{e.path}</span>
                <span className="tag warn">{S.absent}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {undocumented.length ? (
        <>
          <p className="notice">{S.undocNote}</p>
          <div className="rows">
            {undocumented.map((k) => (
              <div key={k} className="row">
                <span className="verb">{k.split(" ")[0]}</span>
                <span className="route">{k.split(" ").slice(1).join(" ")}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
