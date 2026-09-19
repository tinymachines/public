"use client";

import { useState } from "react";
import type { Cause, Exhibit } from "./museum";

/**
 * The bug museum: a wall of exhibits, and one case that shows the chosen
 * one. Every exhibit is laid out in the same grid cell and only the
 * chosen one is visible, so the case is as tall as its tallest exhibit
 * and choosing another never moves the page.
 */

const CAUSES: Cause[] = ["the model", "the bench", "the tools", "the measuring"];

/** The engineers' words: their code spans as code, their bold as bold. */
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 ? (
          <code key={i}>{part}</code>
        ) : (
          <span key={i}>
            {part.split("**").map((bit, j) => (j % 2 ? <b key={j}>{bit}</b> : <span key={j}>{bit}</span>))}
          </span>
        ),
      )}
    </>
  );
}

export function Museum({ exhibits }: { exhibits: Exhibit[] }) {
  const [chosen, setChosen] = useState(exhibits[0]?.key ?? "");
  const [cause, setCause] = useState<Cause | null>(null);

  return (
    <div className="pg-museum">
      <div className="pg-museum-causes" role="group" aria-label="Where the bugs lived">
        <span className="pg-label">Where the bug lived</span>
        {CAUSES.map((c) => {
          const n = exhibits.filter((e) => e.cause === c).length;
          return (
            <button key={c} className="pg-cause" data-cause={c} aria-pressed={cause === c} onClick={() => setCause(cause === c ? null : c)}>
              {c} <b>{n}</b>
            </button>
          );
        })}
      </div>

      <div className="pg-museum-hall">
        <ol className="pg-wall" aria-label="The exhibits">
          {exhibits.map((e) => (
            <li key={e.key}>
              <button
                className="pg-plaque"
                data-cause={e.cause}
                data-dim={cause != null && cause !== e.cause}
                aria-pressed={chosen === e.key}
                onClick={() => setChosen(e.key)}
              >
                <span className="pg-plaque-cause">{e.cause}</span>
                <span className="pg-plaque-title">{e.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="pg-case">
          {exhibits.map((e) => (
            <article key={e.key} className="pg-exhibit" data-shown={chosen === e.key} aria-hidden={chosen !== e.key}>
              <p className="pg-eyebrow" data-cause={e.cause}>
                A bug in {e.cause}
              </p>
              <h3>{e.title}</h3>
              {e.images.length ? (
                <div className="pg-exhibit-images" data-count={e.images.length}>
                  {e.images.map((i) => (
                    <figure key={i.src}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.src} alt={i.alt} width={i.width} height={i.height} loading="lazy" />
                      <figcaption>{i.alt}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
              <dl className="pg-exhibit-story">
                <div>
                  <dt>What you would have seen</dt>
                  <dd>{e.seen}</dd>
                </div>
                <div>
                  <dt>Why</dt>
                  <dd>{e.why}</dd>
                </div>
                <div>
                  <dt>How it was caught</dt>
                  <dd>{e.caught}</dd>
                </div>
              </dl>
              <div className="pg-exhibit-words">
                <p className="pg-record-h">In the engineers&rsquo; words</p>
                {e.evidence.ok ? (
                  e.evidence.passages.map((p, n) => (
                    <p key={n} className="pg-now-record">
                      <Words text={p} />
                    </p>
                  ))
                ) : (
                  <p className="pg-now-record">This exhibit&rsquo;s passage could not be shown: {e.evidence.reason}.</p>
                )}
                <p>
                  <a href={e.href}>Read the whole account</a>
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
