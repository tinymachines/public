"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { prefersStill, subscribeMotion } from "./Playground";
import type { Encyclopedia as Data, Entry } from "./encyclopedia";
import { encyclopediaWords, type EncyclopediaWords } from "./ui.encyclopedia";
import type { Lang } from "@/lib/lang";

/**
 * The encyclopedia as pictures: each code pattern the engineers found,
 * drawn as the mechanism their entry describes, moving. The pictures are
 * ours and schematic (no address, count or byte in them is the game's),
 * and so are their words, which are in ui.encyclopedia.ts, both
 * languages; the name and the "what it does" beside each are the entry's
 * own, read at build time, and the entry is one click away.
 *
 * Each picture loops on its own clock, runs only while it is on screen,
 * and starts still for a reader who prefers less motion. Its caption
 * line sits in one place, so a changing step never moves the card.
 */

const W = 320;
const H = 190;

type Words = EncyclopediaWords;
interface Picture {
  t: number;
  U: Words;
}

function useClock(el: React.RefObject<HTMLElement | null>, playing: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const node = el.current;
    if (!node || !playing) return;
    let seen = false;
    let raf = 0;
    let last = 0;
    const io = new IntersectionObserver((e) => {
      seen = e.some((x) => x.isIntersecting);
    });
    io.observe(node);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(100, now - last) : 0;
      last = now;
      if (seen) setT((v) => v + dt / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [el, playing]);
  return t;
}

const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, x: number) => a + (b - a) * ease(x);

function Label({ text }: { text: string }) {
  return (
    <text x={W / 2} y={H - 8} className="enc-step" textAnchor="middle">
      {text}
    </text>
  );
}

/* 1. The poll: eight buttons walk into a byte, one read at a time. */
function Poll({ t, U }: Picture) {
  const names = U.poll.names;
  const held = [true, false, false, false, false, false, false, true]; // say A and Right are held
  const step = 0.7;
  const cycle = t % (step * 11);
  const k = Math.min(8, Math.floor(cycle / step)); // reads done
  const within = (cycle % step) / step;
  const x0 = 24;
  const cw = 34;
  const read = k < 8 ? k : -1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={U.poll.alt}>
      <text x={x0} y={18} className="enc-cap">{U.poll.held}</text>
      {names.map((n, i) => (
        <g key={n}>
          <rect x={x0 + i * cw} y={24} width={cw - 4} height={28} rx={3} className={held[i] ? "enc-on" : "enc-box"} data-now={i === read} />
          <text x={x0 + i * cw + (cw - 4) / 2} y={42} className={held[i] ? "enc-text-on" : "enc-text"} textAnchor="middle">
            {n}
          </text>
        </g>
      ))}
      <text x={x0} y={104} className="enc-cap">{U.poll.byte}</text>
      {Array.from({ length: 8 }, (_, p) => {
        const filled = p < k;
        const src = k - 1 - p;
        const bit = filled ? held[src] : false;
        return (
          <g key={p}>
            <rect x={x0 + p * cw} y={110} width={cw - 4} height={28} rx={3} className={bit ? "enc-on" : "enc-box"} />
            <text x={x0 + p * cw + (cw - 4) / 2} y={129} className={bit ? "enc-text-on" : "enc-text"} textAnchor="middle">
              {filled ? (bit ? "1" : "0") : ""}
            </text>
            <text x={x0 + p * cw + (cw - 4) / 2} y={152} className="enc-dim" textAnchor="middle">
              {filled ? names[src] : ""}
            </text>
          </g>
        );
      })}
      {read >= 0 ? (
        <circle
          cx={lerp(x0 + read * cw + (cw - 4) / 2, x0 + (cw - 4) / 2, within)}
          cy={lerp(56, 106, within)}
          r={6}
          className={held[read] ? "enc-dot-on" : "enc-dot"}
        />
      ) : null}
      <Label text={k < 8 ? U.poll.read(k + 1, names.length, names[k]) : U.poll.whole} />
    </svg>
  );
}

/* 2. The bank switch: the written byte ANDed with the ROM byte under it. */
function Bank({ t, U }: Picture) {
  const period = 9;
  const p = (t % period) / period;
  const phase = p < 0.15 ? 0 : p < 0.3 ? 1 : p < 0.6 ? 2 : p < 0.8 ? 3 : 4;
  const steps = U.bank.steps;
  const windowY = phase >= 3 ? 116 : 40;
  const bits = (v: number) => [3, 2, 1, 0].map((b) => (v >> b) & 1);
  const written = 0;
  const rom = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={U.bank.alt}>
      <text x={16} y={18} className="enc-cap">{U.bank.cart}</text>
      <rect x={16} y={24} width={100} height={70} rx={4} className="enc-box" />
      <text x={66} y={62} className="enc-text" textAnchor="middle">{U.bank.menu}</text>
      <rect x={16} y={100} width={100} height={70} rx={4} className="enc-box" />
      <text x={66} y={138} className="enc-text" textAnchor="middle">{U.bank.firstGame}</text>
      <rect x={10} y={windowY - 16} width={112} height={82} rx={6} className="enc-window" style={{ transition: "y 400ms" }} />
      <text x={200} y={18} className="enc-cap" textAnchor="middle">{U.bank.switch}</text>
      {[
        [U.bank.written, bits(written)],
        [U.bank.romByte, bits(rom)],
        [U.bank.stores, bits(written & rom)],
      ].map(([label, bs], row) => (
        <g key={String(label)} opacity={phase >= 2 || row === 0 ? 1 : 0.25}>
          <text x={140} y={46 + row * 34} className="enc-dim">{String(label)}</text>
          {(bs as number[]).map((b, i) => (
            <rect key={i} x={230 + i * 20} y={32 + row * 34} width={16} height={20} rx={2} className={phase >= 2 && row === 2 ? "enc-on" : "enc-box"} />
          ))}
          {(bs as number[]).map((b, i) => (
            <text key={`t${i}`} x={238 + i * 20} y={46 + row * 34} className="enc-text" textAnchor="middle">
              {b}
            </text>
          ))}
        </g>
      ))}
      <text x={140} y={96} className="enc-op">{U.bank.and}</text>
      <line x1={228} y1={90} x2={312} y2={90} className="enc-wire" />
      <rect x={140} y={128} width={160} height={36} rx={4} className={phase === 1 || phase === 2 ? "enc-off" : phase >= 4 ? "enc-on" : "enc-box"} />
      <text x={220} y={151} className="enc-text" textAnchor="middle">
        {phase === 1 || phase === 2 || phase === 3 ? U.bank.pictureOff : U.bank.pictureOn}
      </text>
      <Label text={steps[phase]} />
    </svg>
  );
}

/* 3. The game loop inside the interrupt, on a frame's clock face. */
function Loop({ t, U }: Picture) {
  const per = 3.2;
  const rev = Math.floor(t / per) % 3;
  const a = (t % per) / per; // position in this frame
  const blank = 0.86;
  const inBlank = a >= blank;
  // The handler: runs from the blank into the top of the next frame; on the
  // second frame it runs long, past the next blank, and that frame is dropped.
  const handler = rev === 1 ? true : rev === 2 ? a < 0.45 || inBlank : inBlank || a < 0.35;
  const dropped = rev === 1 && inBlank;
  const cx = 90;
  const cy = 92;
  const r = 62;
  const arc = (from: number, to: number) => {
    const p = (x: number) => [cx + r * Math.sin(x * 2 * Math.PI), cy - r * Math.cos(x * 2 * Math.PI)];
    const [x1, y1] = p(from);
    const [x2, y2] = p(to);
    return `M${x1},${y1} A${r},${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2},${y2}`;
  };
  const [hx, hy] = [cx + r * Math.sin(a * 2 * Math.PI), cy - r * Math.cos(a * 2 * Math.PI)];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={U.loop.alt}>
      <circle cx={cx} cy={cy} r={r} className="enc-face" />
      <path d={arc(blank, 1)} className="enc-arc" />
      <text x={cx + 52} y={cy - 64} className="enc-dim">{U.loop.blank}</text>
      <line x1={cx} y1={cy} x2={hx} y2={hy} className="enc-hand" />
      <circle cx={cx} cy={cy} r={3} className="enc-dot" />
      <rect x={176} y={34} width={132} height={44} rx={4} className={handler ? "enc-box" : "enc-on"} />
      <text x={242} y={52} className={handler ? "enc-text" : "enc-text-on"} textAnchor="middle">{U.loop.main}</text>
      <text x={242} y={68} className={handler ? "enc-dim" : "enc-text-on"} textAnchor="middle">{U.loop.mainDoes}</text>
      <rect x={176} y={96} width={132} height={44} rx={4} className={handler ? "enc-on" : "enc-box"} />
      <text x={242} y={114} className={handler ? "enc-text-on" : "enc-text"} textAnchor="middle">{U.loop.handler}</text>
      <text x={242} y={130} className={handler ? "enc-text-on" : "enc-dim"} textAnchor="middle">{U.loop.handlerDoes}</text>
      {dropped ? (
        <text x={242} y={160} className="enc-warn" textAnchor="middle">{U.loop.dropped}</text>
      ) : null}
      <Label
        text={
          rev === 1
            ? inBlank
              ? U.loop.busy
              : U.loop.long
            : inBlank
              ? U.loop.wakes
              : handler
                ? U.loop.works
                : U.loop.spins
        }
      />
    </svg>
  );
}

/* 4. The sprite-0 split: the bar stays, the level scrolls under it. */
function Split({ t, U }: Picture) {
  const per = 2.4;
  const frame = Math.floor(t / per);
  const a = (t % per) / per;
  const sx = 40;
  const sy = 20;
  const sw = 190;
  const sh = 140;
  const bar = 30;
  const beamY = sy + a * sh;
  const hit = beamY >= sy + bar;
  const scroll = (frame * 9) % 60;
  const hills = Array.from({ length: 8 }, (_, i) => i * 60 - scroll);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={U.split.alt}>
      <defs>
        <clipPath id="enc-split-clip">
          <rect x={sx} y={sy + bar} width={sw} height={sh - bar} />
        </clipPath>
      </defs>
      <rect x={sx} y={sy} width={sw} height={sh} className="enc-screen" />
      <rect x={sx} y={sy} width={sw} height={bar} className="enc-bar" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={sx + 12 + i * 44} y={sy + 10} width={30} height={10} rx={2} className="enc-box" />
      ))}
      <g clipPath="url(#enc-split-clip)">
        {hills.map((x, i) => (
          <path key={i} d={`M${sx + x},${sy + sh} q30,-50 60,0`} className="enc-hill" />
        ))}
        {hills.map((x, i) => (
          <rect key={`b${i}`} x={sx + x + 20} y={sy + 70} width={14} height={14} className="enc-brick" />
        ))}
      </g>
      <circle cx={sx + 150} cy={sy + bar - 2} r={4} className={hit ? "enc-dot-on" : "enc-dot"} />
      <line x1={sx} y1={beamY} x2={sx + sw} y2={beamY} className="enc-beam" />
      <text x={sx + sw + 10} y={sy + 16} className="enc-dim">{U.split.stays}</text>
      <text x={sx + sw + 10} y={sy + 90} className="enc-dim">{U.split.scrolls}</text>
      <text x={sx + sw + 10} y={sy + bar + 4} className={hit ? "enc-hot" : "enc-dim"}>{U.split.marker}</text>
      <Label text={hit ? U.split.reached : U.split.waiting} />
    </svg>
  );
}

/* 5. The buffer drained in the blank. */
function Buffer({ t, U }: Picture) {
  const per = 5;
  const a = (t % per) / per;
  const blank = 0.75;
  const queued = a < blank ? Math.min(5, Math.floor((a / blank) * 6)) : Math.max(0, 5 - Math.floor(((a - blank) / (1 - blank)) * 6));
  const drained = a < blank ? 0 : 5 - queued;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={U.buffer.alt}>
      <rect x={16} y={24} width={80} height={60} className="enc-screen" />
      <line x1={16} y1={24 + Math.min(1, a / blank) * 60} x2={96} y2={24 + Math.min(1, a / blank) * 60} className="enc-beam" />
      <text x={56} y={100} className="enc-dim" textAnchor="middle">
        {a < blank ? U.buffer.drawing : U.buffer.blank}
      </text>
      <text x={150} y={18} className="enc-cap" textAnchor="middle">{U.buffer.list}</text>
      <rect x={112} y={24} width={76} height={120} rx={4} className="enc-box" />
      {Array.from({ length: queued }, (_, i) => (
        <rect key={i} x={120} y={130 - i * 20} width={60} height={14} rx={2} className="enc-on" />
      ))}
      <text x={262} y={18} className="enc-cap" textAnchor="middle">{U.buffer.chip}</text>
      <rect x={212} y={24} width={100} height={120} rx={4} className="enc-box" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x={222 + (i % 3) * 28} y={36 + Math.floor(i / 3) * 28} width={22} height={22} className={i < drained ? "enc-on" : "enc-cell"} />
      ))}
      <Label text={a < blank ? U.buffer.writing : U.buffer.pouring} />
    </svg>
  );
}

/* 6. The jump engine: the return address becomes a table pointer. */
function Engine({ t, U }: Picture) {
  const per = 8;
  const a = (t % per) / per;
  const phase = a < 0.2 ? 0 : a < 0.4 ? 1 : a < 0.6 ? 2 : a < 0.8 ? 3 : 4;
  const which = 2;
  const rows = [U.engine.call, ...[0, 1, 2, 3].map((n) => U.engine.routine(n))];
  const rowY = (i: number) => 30 + i * 26;
  const pointer = phase >= 3 ? rowY(1 + which) : rowY(1);
  const steps = U.engine.steps;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={U.engine.alt}>
      <text x={16} y={18} className="enc-cap">{U.engine.code}</text>
      {rows.map((r, i) => (
        <g key={r}>
          <rect x={16} y={rowY(i)} width={120} height={22} rx={3} className={i === 0 && phase === 0 ? "enc-on" : phase === 4 && i === 1 + which ? "enc-on" : "enc-box"} />
          <text x={76} y={rowY(i) + 15} className={(i === 0 && phase === 0) || (phase === 4 && i === 1 + which) ? "enc-text-on" : "enc-text"} textAnchor="middle">
            {i === 0 ? r : U.engine.addressOf(r)}
          </text>
        </g>
      ))}
      <text x={240} y={18} className="enc-cap" textAnchor="middle">{U.engine.note}</text>
      <rect x={196} y={30} width={88} height={30} rx={3} className={phase === 1 || phase === 2 ? "enc-on" : "enc-box"} />
      <text x={240} y={49} className={phase === 1 || phase === 2 ? "enc-text-on" : "enc-dim"} textAnchor="middle">
        {U.engine.comeBack}
      </text>
      <rect x={196} y={80} width={88} height={30} rx={3} className="enc-box" />
      <text x={240} y={99} className="enc-text" textAnchor="middle">
        {U.engine.number(which)}
      </text>
      {phase >= 2 ? <path d={`M146,${pointer + 11} L190,${pointer + 11}`} className="enc-wire" /> : null}
      {phase >= 2 ? <polygon points={`140,${pointer + 11} 148,${pointer + 6} 148,${pointer + 16}`} className="enc-arrow" /> : null}
      {phase === 4 ? <text x={200} y={150} className="enc-hot">{U.engine.jumpTo(which)}</text> : null}
      <Label text={steps[phase]} />
    </svg>
  );
}

/* 7. The state dispatch: the state picks the routine; a press changes it. */
function States({ t, U }: Picture) {
  const per = 0.6;
  const f = Math.floor(t / per) % 14;
  const pressAt = 4;
  const landAt = 11;
  const inAir = f > pressAt && f <= landAt;
  const pressed = f === pressAt;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={U.states.alt}>
      <circle cx={70} cy={70} r={42} className={inAir ? "enc-box" : "enc-on"} />
      <text x={70} y={74} className={inAir ? "enc-text" : "enc-text-on"} textAnchor="middle">{U.states.ground}</text>
      <circle cx={250} cy={70} r={42} className={inAir ? "enc-on" : "enc-box"} />
      <text x={250} y={74} className={inAir ? "enc-text-on" : "enc-text"} textAnchor="middle">{U.states.air}</text>
      <path d="M112,58 Q160,26 208,58" className="enc-wire" />
      <polygon points="208,58 198,52 200,62" className="enc-arrow" />
      <text x={160} y={32} className={pressed ? "enc-hot" : "enc-dim"} textAnchor="middle">{U.states.pressed}</text>
      <path d="M208,84 Q160,116 112,84" className="enc-wire" />
      <polygon points="112,84 122,90 120,80" className="enc-arrow" />
      <text x={160} y={122} className={f === landAt + 1 ? "enc-hot" : "enc-dim"} textAnchor="middle">{U.states.landed}</text>
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={40 + i * 17} y={140} width={13} height={12} rx={2} className={i === f ? "enc-on" : i > pressAt && i <= landAt ? "enc-cell-air" : "enc-cell"} />
      ))}
      <Label text={U.states.running(inAir, pressed)} />
    </svg>
  );
}

const PICTURES: Record<number, (p: Picture) => React.ReactElement> = {
  1: Poll,
  2: Bank,
  3: Loop,
  4: Split,
  5: Buffer,
  6: Engine,
  7: States,
};

function Card({ e, U }: { e: Entry; U: Words }) {
  const ref = useRef<HTMLElement>(null);
  const still = useSyncExternalStore(subscribeMotion, prefersStill, () => false);
  const [choice, setPlaying] = useState<boolean | null>(null);
  const playing = choice ?? !still;
  const t = useClock(ref, playing);
  const Picture = PICTURES[e.n];
  return (
    <article className="enc-card" ref={ref} data-entry={e.n}>
      <p className="pg-eyebrow">{U.entry(e.n)}</p>
      <h3>{e.name}</h3>
      {Picture ? (
        <div className="enc-picture">
          <Picture t={t} U={U} />
          <div className="enc-controls">
            <button className="pg-btn enc-play" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>
              {playing ? U.pause : U.play}
            </button>
          </div>
        </div>
      ) : null}
      {U.watch[e.n] ? <p className="enc-watch">{U.watch[e.n]}</p> : null}
      <p className="pg-now-record enc-does">
        <span className="enc-does-h">{U.doesH}</span>
        {e.does.replace(/`/g, "")}
      </p>
      <p>
        <a href={e.href}>{U.readFull(e.n)}</a>
      </p>
    </article>
  );
}

export function Encyclopedia({ lang, data }: { lang: Lang; data: Data }) {
  const U = encyclopediaWords(lang);
  if (!data.ok) return <p className="pg-waiting">{U.missing(data.reason)}</p>;
  return (
    <div className="enc-grid">
      {data.entries.map((e) => (
        <Card key={e.n} e={e} U={U} />
      ))}
    </div>
  );
}
