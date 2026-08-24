"use client";

import { useEffect, useState } from "react";
import { RegistryState, useRegistry } from "../../components/RegistryData";

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

export function Reference({ api }: { api: string }) {
  const { data, error } = useRegistry<Schema>(`${api}/openapi.json`);
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
    const routes = Object.entries(data?.paths ?? {})
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
  }, [api, data]);

  if (!data) return <RegistryState error={error} what="the instrument's schema" />;

  const paths = data.paths ?? {};
  const ops: { route: string; verb: string; op: Op }[] = [];
  for (const [route, methods] of Object.entries(paths)) {
    for (const [verb, op] of Object.entries(methods)) {
      if (verb === "head") continue; // The same route, said twice.
      ops.push({ route, verb: verb.toUpperCase(), op });
    }
  }

  const answered = Object.entries(probe);
  const gone = answered.filter(([, code]) => code === 410).map(([r]) => r);
  // Rejected before a status could be read. The fetch failed while the schema
  // from the same origin succeeded, so the host is up and this particular
  // response is the one a browser is not allowed to see.
  const opaque = answered.filter(([, code]) => code === 0).map(([r]) => r);
  const present = answered.filter(([, code]) => code >= 200 && code < 300).length;
  const groups = [...new Set(ops.map((o) => group(o.route)))].sort();

  return (
    <>
      <div className="chips">
        <span className="measured">
          <b>{ops.length} operations</b> read from the instrument&rsquo;s own
          openapi.json when this page loaded
        </span>
        <span className="measured">
          <b>{groups.length} groups</b> taken from the routes themselves, since
          the schema carries no tags
        </span>
        {answered.length ? (
          <span className="measured">
            <b>
              {present} of {answered.length}
            </b>{" "}
            documented routes asked just now and answering
          </span>
        ) : null}
        {gone.length ? <span className="tag warn">{gone.length} retired</span> : null}
        {opaque.length ? (
          <span className="tag warn">{opaque.length} unreadable from a browser</span>
        ) : null}
      </div>

      {gone.length ? (
        <p className="notice">
          <b>These are documented below and answer 410.</b> They were open, the
          pool refills at about seventy-five bytes a minute, and anyone could
          drain it, so they are behind a key now. The schema has not been told:
          each still appears as a callable endpoint. Asked just now, not
          remembered: <code>{gone.join(", ")}</code>.
        </p>
      ) : null}

      {opaque.length ? (
        <p className="notice">
          <b>These are documented below and this page cannot read what they
          say.</b>{" "}
          The schema came from the same host a moment ago, so the instrument is
          answering; these particular responses carry no{" "}
          <code>Access-Control-Allow-Origin</code>, and a browser therefore
          refuses to show a script what came back. This service sends that
          header on a success and not on a refusal, which is the wrong way
          round: a refusal is the answer that has somewhere to send you, and
          from a page it is indistinguishable from the host being down.{" "}
          <code>{opaque.join(", ")}</code>.
        </p>
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
                    {code === 410 ? <span className="tag warn">retired</span> : null}
                    {code === 401 || code === 403 ? (
                      <span className="tag">needs a key</span>
                    ) : null}
                    {code === 0 ? <span className="tag warn">no CORS on its reply</span> : null}
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
