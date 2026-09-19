"use client";

import { useState } from "react";
import type { Lane, Stop, Timeline as Data } from "./timeline";

/**
 * How it was built: every document the notebook shelves, in the
 * engineers' own groups, on one rail of days. A stop's place is the
 * first date its own text carries, which the page says plainly; the
 * documents whose text carries no date are listed apart rather than
 * placed at a guessed spot.
 *
 * The panel below the rail is one fixed box: choosing another stop
 * fills it in place and moves nothing.
 */

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;

function short(d: string) {
  const [, m, day] = d.split("-");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(day)} ${months[Number(m) - 1]}`;
}

export function Timeline({ data }: { data: Data }) {
  const [chosen, setChosen] = useState<{ lane: string; date: string } | null>(null);
  if (!data.ok) {
    return <p className="pg-waiting">The timeline is drawn from the notebook&rsquo;s own shelves, and this build could not: {data.reason}.</p>;
  }
  const { lanes, undated, first, last, days } = data;
  const dates = Array.from({ length: days }, (_, i) => new Date((at(first) + i) * DAY).toISOString().slice(0, 10));
  const lane = lanes.find((l) => l.key === chosen?.lane);
  const picked: Stop[] = lane ? lane.stops.filter((s) => s.date === chosen!.date) : [];
  const busiest = Math.max(...lanes.flatMap((l) => dates.map((d) => l.stops.filter((s) => s.date === d).length)));

  return (
    <div className="pg-time">
      <div className="pg-time-axis" aria-hidden="true">
        {/* Every third day is named: naming the last as well would sit it on
            its neighbour. */}
        {dates.map((d, i) => (
          <span key={d} data-show={i % 3 === 0}>
            {short(d)}
          </span>
        ))}
      </div>

      <ol className="pg-time-lanes">
        {lanes.map((l: Lane, i) => (
          <li key={l.key} className="pg-time-lane" data-lane={i % 4}>
            <p className="pg-time-name">{l.heading}</p>
            <div className="pg-time-rail">
              {dates.map((d) => {
                const here = l.stops.filter((s) => s.date === d);
                const on = chosen?.lane === l.key && chosen.date === d;
                return (
                  <button
                    key={d}
                    className="pg-time-day"
                    data-count={Math.min(3, here.length)}
                    aria-pressed={on}
                    disabled={!here.length}
                    style={{ opacity: here.length ? 0.35 + (0.65 * Math.min(here.length, busiest)) / busiest : undefined }}
                    aria-label={here.length ? `${l.heading}, ${short(d)}: ${here.map((s) => s.code ?? s.title).join(", ")}` : `${l.heading}, ${short(d)}: nothing`}
                    onClick={() => setChosen({ lane: l.key, date: d })}
                  />
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      <div className="pg-time-panel">
        {lane && picked.length ? (
          <>
            <p className="pg-eyebrow">
              {lane.heading} · {short(chosen!.date)}
            </p>
            <ul className="pg-time-list">
              {picked.map((s) => (
                <li key={s.route}>
                  <a href={s.route}>{s.title}</a>
                  {s.code ? <span className="pg-time-code">{s.code}</span> : null}
                  <span className="pg-time-what">{s.description}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="pg-eyebrow">The whole arc</p>
            <h3>
              {short(first)} to {short(last)}
            </h3>
            <p className="pg-time-what">
              Every plan and report the engineers wrote, in their own groups, day by day. A darker day is a day with more
              of them. Pick one to see what was written.
            </p>
          </>
        )}
      </div>

      <p className="pg-note">
        A document sits on the first date its own text mentions, which is usually the day the work was done. The{" "}
        {undated.length === 1 ? "one document that carries" : `${undated.length} documents that carry`} no date in their
        text are listed here instead:{" "}
        {undated.map((u, i) => (
          <span key={u.route}>
            {i ? ", " : ""}
            <a href={u.route}>{u.code ?? u.title}</a>
          </span>
        ))}
        .
      </p>
    </div>
  );
}
