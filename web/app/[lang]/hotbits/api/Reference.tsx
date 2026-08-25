"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";
import { RegistryState, useRegistry } from "@/app/components/RegistryData";

/**
 * A reference drawn from the service's own schema, and then checked against
 * the service.
 *
 * ## Why generated here and hand-written for the 6502
 *
 * Because the two documents are different. The 6502 service ships a 58 KB
 * reference somebody wrote, with worked examples and the reasoning behind
 * every cap, and its `openapi.json` has no tags and summaries derived from
 * function names. Rendering the JSON there would have replaced a good document
 * with a worse one. Here there is no hand-written document at all, and the
 * schema carries real descriptions, so generating is not the lesser option: it
 * is the only one, and it happens to be the one CLAUDE.md prefers anyway,
 * because the reference cannot drift from the behaviour when it IS the models.
 *
 * ## Rendered as text, never as markup
 *
 * The descriptions contain markdown, including links. Nothing here is passed
 * to dangerouslySetInnerHTML and nothing here is parsed into HTML. This is a
 * document fetched from another origin at read time; turning it into markup on
 * this page would mean that whatever that service returns becomes part of this
 * one. Line breaks are preserved and the markdown stays visible as the few
 * characters it is, which is a smaller cost than the alternative.
 *
 * ## The check, and what it found
 *
 * Every documented route with no path parameter is asked whether it is there.
 * The answer was more interesting than expected: the retired endpoints could
 * not be read at all.
 *
 * This service sends `Access-Control-Allow-Origin: *` on a 200 and NOT on a
 * 410 or a 401. So a browser can read every success and none of the refusals,
 * which is backwards: the 410 body is the one carrying the instructions,
 * naming the key-gated route that replaced it. From a page, that endpoint does
 * not say "gone, go here". It says nothing, and the failure is
 * indistinguishable from the host being down.
 *
 * The inference is sound rather than a guess, and only because of the order of
 * events: the schema was fetched from that same origin a moment earlier, so
 * the host answers and it is this response that is unreadable. That is stated
 * as what it is, and no status is invented for it.
 *
 * ## Two schemas, because the host is two services
 *
 * The origin is a composite: the instrument's FastAPI behind a proxy, and the
 * entropy gateway that nginx grafts on at /v1/. Each documents its own routes,
 * which is the only arrangement where neither describes something it does not
 * serve: the instrument's schema at /openapi.json, the gateway's at
 * /v1/openapi.json, generated from the same table its router is built from.
 * This page reads both and says so. A missing gateway schema is rendered as
 * exactly that rather than folded into an error, because an instrument that
 * answers while the gateway is down is a state worth showing.
 *
 * One distinction the merge makes possible: the gateway's keyed routes refuse
 * CORS deliberately, so a browser cannot be asked to hold a key. Their
 * unreadable replies are labeled as the design working; the instrument's
 * unreadable refusals keep the complaint above, because those are the bug.
 */

interface Op {
  summary?: string;
  description?: string;
  parameters?: {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: { type?: string; default?: unknown };
  }[];
  responses?: Record<string, { description?: string }>;
  /** Present on the gateway's keyed routes. Its presence IS the fact used. */
  security?: unknown[];
}

interface Schema {
  info?: { title?: string; description?: string; version?: string };
  paths?: Record<string, Record<string, Op>>;
}

type Probe = Record<string, number>;

/** The first path segment, which is how this service already groups itself. */
function group(route: string): string {
  const seg = route.split("/").filter(Boolean)[0] ?? "";
  return seg || "/";
}

const L = {
  en: {
    schemaWhat: "the instrument's schema",
    ops: (n: number) => <><b>{n} operations</b> </>,
    twoSchemas: "across the instrument and the gateway",
    oneSchema: "from the instrument",
    groups: (n: number) => (
      <>
        <b>{n} groups</b>
      </>
    ),
    asked: (p: number, n: number) => (
      <>
        <b>
          {p} of {n}
        </b>{" "}
        documented routes answering
      </>
    ),
    retired: (n: number) => `${n} retired`,
    unreadable: (n: number) => `${n} unreadable from a browser`,
    noGate: (
      <>
        <b>The gateway&rsquo;s schema did not answer</b>, so its keyed routes
        appear below only as the 410 notices that point at them.
      </>
    ),
    goneNote: (list: string) => (
      <>
        <b>These are documented below and answer 410:</b> they now need a key.{" "}
        <code>{list}</code>.
      </>
    ),
    opaqueNote: (list: string) => (
      <>
        <b>These are documented below and this page cannot read their answers:</b>{" "}
        the service does not send <code>Access-Control-Allow-Origin</code> on them.{" "}
        <code>{list}</code>.
      </>
    ),
    tagRetired: "retired",
    tagKey: "needs a key",
    tagKeyed: "keyed; not for browsers",
    tagNoCors: "no CORS on its reply",
  },
  ja: {
    schemaWhat: "装置のスキーマ",
    ops: (n: number) => <><b>{n} 個の操作。</b></>,
    twoSchemas: "装置とゲートウェイの両方から",
    oneSchema: "装置から",
    groups: (n: number) => (
      <>
        <b>{n} グループ</b>
      </>
    ),
    asked: (p: number, n: number) => (
      <>
        <b>
          {n} 件中 {p} 件
        </b>
        の文書化済みルートが応答中
      </>
    ),
    retired: (n: number) => `引退 ${n} 件`,
    unreadable: (n: number) => `ブラウザから読めないもの ${n} 件`,
    noGate: (
      <>
        <b>ゲートウェイのスキーマが応答しなかった。</b>鍵付きルートは、下ではそれを指す 410 の告知としてだけ現れる。
      </>
    ),
    goneNote: (list: string) => (
      <>
        <b>以下は本文に記載があり、410 で応答する:</b> いまは鍵が要る。<code>{list}</code>。
      </>
    ),
    opaqueNote: (list: string) => (
      <>
        <b>以下は本文に記載があるが、このページはその応答を読めない:</b> サービスが{" "}
        <code>Access-Control-Allow-Origin</code> を付けないためだ。<code>{list}</code>。
      </>
    ),
    tagRetired: "引退",
    tagKey: "鍵が必要",
    tagKeyed: "鍵付き。ブラウザ用ではない",
    tagNoCors: "応答に CORS が無い",
  },
} as const;

export function Reference({ api, lang = "en" }: { api: string; lang?: Lang }) {
  const T = L[lang];
  const { data, error } = useRegistry<Schema>(`${api}/openapi.json`);
  // The same host publishes a second schema: the gateway's, at
  // /v1/openapi.json, generated from the same table its router is built from.
  // The /v1 routes are a different service that nginx grafts onto this origin,
  // so documenting them was that service's job, and now it does. Fetched
  // separately because it can be absent separately: an instrument that answers
  // while the gateway is down should render as exactly that.
  const gate = useRegistry<Schema>(`${api}/v1/openapi.json`);
  const [probe, setProbe] = useState<Probe>({});

  // Ask each documented route without a path parameter whether it is there.
  // GET rather than HEAD, because a service that has never been sent a HEAD
  // commonly answers 405 to one and that would read as a broken endpoint: the
  // 6502 service did exactly that until its own listings work fixed it.
  //
  // Only routes with no {parameter}: a probe would have to invent a value, and
  // inventing an id to see whether a route exists is how a check starts
  // reporting on data rather than on routes.
  useEffect(() => {
    // Derived inside the effect rather than beside it. Computed in the render
    // body it is a new array every time, so a dependency on it would re-probe
    // the whole service on every keystroke of state this component ever has.
    // `data` changes identity only when the schema is refetched, which is
    // exactly how often these should be asked.
    const routes = Object.entries({ ...(data?.paths ?? {}), ...(gate.data?.paths ?? {}) })
      .filter(([r, m]) => !r.includes("{") && "get" in m)
      .map(([r]) => r);
    if (!routes.length) return;
    let live = true;
    const stop = new AbortController();
    Promise.all(
      routes.map((r) =>
        fetch(`${api}${r}`, { signal: stop.signal, method: "GET" })
          .then((res) => [r, res.status] as const)
          .catch(() => [r, 0] as const),
      ),
    ).then((pairs) => {
      if (live) setProbe(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
      stop.abort();
    };
  }, [api, data, gate.data]);

  if (!data) return <RegistryState error={error} what={T.schemaWhat} lang={lang} />;

  const paths = data.paths ?? {};
  const gatePaths = gate.data?.paths ?? {};
  const ops: { route: string; verb: string; op: Op }[] = [];
  for (const [route, methods] of Object.entries({ ...paths, ...gatePaths })) {
    for (const [verb, op] of Object.entries(methods)) {
      if (verb === "head") continue; // The same route, said twice.
      ops.push({ route, verb: verb.toUpperCase(), op });
    }
  }

  // The gateway's keyed routes carry no CORS ON PURPOSE: a browser that could
  // call them would invite somebody to put a key in page JavaScript. Their
  // schema says which they are (security), so an unreadable reply from one of
  // those is the design working, not the bug the notice below describes.
  const keyed = new Set(
    Object.entries(gatePaths)
      .filter(([, m]) => m.get?.security?.length)
      .map(([r]) => r),
  );

  const answered = Object.entries(probe);
  const gone = answered.filter(([, code]) => code === 410).map(([r]) => r);
  // Rejected before a status could be read. The fetch failed while the schema
  // from the same origin succeeded, so the host is up and this particular
  // response is the one a browser is not allowed to see.
  const opaque = answered
    .filter(([r, code]) => code === 0 && !keyed.has(r))
    .map(([r]) => r);
  const present = answered.filter(([, code]) => code >= 200 && code < 300).length;
  const groups = [...new Set(ops.map((o) => group(o.route)))].sort();

  return (
    <>
      <div className="chips">
        <span className="measured">
          {T.ops(ops.length)}
          {gate.data ? T.twoSchemas : T.oneSchema}
        </span>
        <span className="measured">{T.groups(groups.length)}</span>
        {answered.length ? (
          <span className="measured">{T.asked(present, answered.length)}</span>
        ) : null}
        {gone.length ? <span className="tag warn">{T.retired(gone.length)}</span> : null}
        {opaque.length ? (
          <span className="tag warn">{T.unreadable(opaque.length)}</span>
        ) : null}
      </div>

      {!gate.data ? <p className="notice">{T.noGate}</p> : null}

      {gone.length ? <p className="notice">{T.goneNote(gone.join(", "))}</p> : null}

      {opaque.length ? (
        <p className="notice">{T.opaqueNote(opaque.join(", "))}</p>
      ) : null}

      {groups.map((g) => (
        <section key={g} className="ref-group">
          <h2>/{g}</h2>
          {ops
            .filter((o) => group(o.route) === g)
            .map(({ route, verb, op }) => {
              const code = probe[route];
              return (
                <article key={`${verb} ${route}`} className="ref-op">
                  <h3>
                    <span className={`verb v-${verb.toLowerCase()}`}>{verb}</span>
                    <span className="route">{route}</span>
                    {code === 410 ? <span className="tag warn">{T.tagRetired}</span> : null}
                    {code === 401 || code === 403 ? (
                      <span className="tag">{T.tagKey}</span>
                    ) : null}
                    {code === 0 && keyed.has(route) ? (
                      // Unreadable from here BY DESIGN: the keyed tier carries
                      // no CORS so nobody is tempted to put a key in a page.
                      <span className="tag">{T.tagKeyed}</span>
                    ) : null}
                    {code === 0 && !keyed.has(route) ? (
                      <span className="tag warn">{T.tagNoCors}</span>
                    ) : null}
                  </h3>
                  {op.summary ? <p className="ref-sum">{op.summary}</p> : null}
                  {op.description ? <p className="ref-desc">{op.description.trim()}</p> : null}
                  {op.parameters?.length ? (
                    <dl className="kv ref-params">
                      {op.parameters.map((prm) => (
                        <div key={`${prm.in}:${prm.name}`}>
                          <dt>
                            {prm.name}
                            {prm.required ? " *" : ""}
                          </dt>
                          <dd>
                            {prm.schema?.type ?? prm.in}
                            {prm.schema?.default !== undefined
                              ? `, default ${JSON.stringify(prm.schema.default)}`
                              : ""}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </article>
              );
            })}
        </section>
      ))}
    </>
  );
}
