"use client";

import { useState } from "react";
import type { Bench as Data, Photo } from "./bench";

/**
 * The bench, photographed: the engineers' own photographs of the lab,
 * one at a time, each labelled with their caption and with that
 * caption's clauses listed as what it names, in order.
 *
 * One photograph is fetched at a time, chosen from their captions: the
 * lab's pictures are large, and a wall of them would be megabytes before
 * a reader had looked at any. The page keeps each one's place from its
 * size, so choosing another moves nothing.
 */

export function Bench({ data }: { data: Data }) {
  const [at, setAt] = useState(0);
  if (!data.ok) {
    return <p className="pg-waiting">The photographs are the engineers&rsquo;, and this build could not read them: {data.reason}.</p>;
  }
  const { photos, eyes, note } = data;
  const shown: Photo = photos[Math.min(at, photos.length - 1)];
  const rig = photos.filter((p) => p.rig);
  const rest = photos.filter((p) => !p.rig);
  const item = (p: Photo) => (
    <li key={p.src}>
      <button className="pg-bench-pick" aria-pressed={p.src === shown.src} onClick={() => setAt(photos.indexOf(p))}>
        {p.caption}
      </button>
    </li>
  );

  return (
    <div className="pg-bench">
      <div className="pg-bench-hall">
        <div className="pg-bench-list">
          <p className="pg-record-h">The whole rig</p>
          <ol>{rig.map(item)}</ol>
          <p className="pg-record-h">Close up</p>
          <ol>{rest.map(item)}</ol>
        </div>

        <figure className="pg-bench-stage">
          <div className="pg-bench-frame" style={{ aspectRatio: `${shown.width} / ${shown.height}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown.src} alt={shown.caption} width={shown.width} height={shown.height} />
          </div>
          <figcaption>
            <p className="pg-bench-caption">{shown.caption}</p>
            {shown.parts.length ? <p className="pg-record-h">In this picture</p> : null}
            <ol className="pg-bench-parts">
              {shown.parts.map((part, i) => (
                <li key={i}>{part}</li>
              ))}
            </ol>
            <p className="pg-note">
              From <a href={shown.doc}>{shown.docName}</a>.
            </p>
          </figcaption>
        </figure>
      </div>

      <div className="pg-bench-eyes">
        <p className="pg-record-h">What is watching, and what it watches</p>
        <ul>
          {eyes.map((e) => (
            <li key={e.name}>
              <b>{e.name}</b>
              <span>{e.job}</span>
              <span className="pg-note">{e.mount}</span>
            </li>
          ))}
        </ul>
      </div>

      {note ? <p className="pg-note">{note.replace(/:$/, ".")}</p> : null}
    </div>
  );
}
