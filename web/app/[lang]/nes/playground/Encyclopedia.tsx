"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { prefersStill, subscribeMotion } from "./Playground";
import type { Encyclopedia as Data, Entry } from "./encyclopedia";

/**
 * The encyclopedia as pictures: each code pattern the engineers found,
 * drawn as the mechanism their entry describes, moving. The pictures are
 * ours and schematic (no address, count or byte in them is the game's);
 * the name and the "what it does" beside each are the entry's own,
 * read at build time, and the entry is one click away.
 *
 * Each picture loops on its own clock, runs only while it is on screen,
 * and starts still for a reader who prefers less motion. Its caption
 * line sits in one place, so a changing step never moves the card.
 */

const W = 320;
const H = 190;

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
function Poll({ t }: { t: number }) {
  const names = ["A", "B", "Sel", "Sta", "Up", "Dn", "Lt", "Rt"];
  const held = [true, false, false, false, false, false, false, true]; // say A and Right are held
  const step = 0.7;
  const cycle = t % (step * 11);
  const k = Math.min(8, Math.floor(cycle / step)); // reads done
  const within = (cycle % step) / step;
  const x0 = 24;
  const cw = 34;
  const read = k < 8 ? k : -1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The controller's eight buttons read one at a time into a byte of memory">
      <text x={x0} y={18} className="enc-cap">in the pad: A and Right held</text>
      {names.map((n, i) => (
        <g key={n}>
          <rect x={x0 + i * cw} y={24} width={cw - 4} height={28} rx={3} className={held[i] ? "enc-on" : "enc-box"} data-now={i === read} />
          <text x={x0 + i * cw + (cw - 4) / 2} y={42} className={held[i] ? "enc-text-on" : "enc-text"} textAnchor="middle">
            {n}
          </text>
        </g>
      ))}
      <text x={x0} y={104} className="enc-cap">a byte of memory, filling from the left</text>
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
      <Label text={k < 8 ? `read ${k + 1} of 8: ${names[k]}` : "the whole pad, one byte"} />
    </svg>
  );
}

/* 2. The bank switch: the written byte ANDed with the ROM byte under it. */
function Bank({ t }: { t: number }) {
  const period = 9;
  const p = (t % period) / period;
  const phase = p < 0.15 ? 0 : p < 0.3 ? 1 : p < 0.6 ? 2 : p < 0.8 ? 3 : 4;
  const steps = ["Start is pressed on the menu", "the picture goes off first", "the write meets the ROM byte already there", "the window swaps to the first game", "the game starts from its own beginning"];
  const windowY = phase >= 3 ? 116 : 40;
  const bits = (v: number) => [3, 2, 1, 0].map((b) => (v >> b) & 1);
  const written = 0;
  const rom = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A menu switching banks: the written byte is ANDed with the ROM byte under it, so it writes where the ROM already holds the value">
      <text x={16} y={18} className="enc-cap">the cartridge</text>
      <rect x={16} y={24} width={100} height={70} rx={4} className="enc-box" />
      <text x={66} y={62} className="enc-text" textAnchor="middle">the menu</text>
      <rect x={16} y={100} width={100} height={70} rx={4} className="enc-box" />
      <text x={66} y={138} className="enc-text" textAnchor="middle">the first game</text>
      <rect x={10} y={windowY - 16} width={112} height={82} rx={6} className="enc-window" style={{ transition: "y 400ms" }} />
      <text x={200} y={18} className="enc-cap" textAnchor="middle">the switch</text>
      {[
        ["written", bits(written)],
        ["ROM byte here", bits(rom)],
        ["so it stores", bits(written & rom)],
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
      <text x={140} y={96} className="enc-op">and</text>
      <line x1={228} y1={90} x2={312} y2={90} className="enc-wire" />
      <rect x={140} y={128} width={160} height={36} rx={4} className={phase === 1 || phase === 2 ? "enc-off" : phase >= 4 ? "enc-on" : "enc-box"} />
      <text x={220} y={151} className="enc-text" textAnchor="middle">
        {phase === 1 || phase === 2 || phase === 3 ? "picture off" : "picture on"}
      </text>
      <Label text={steps[phase]} />
    </svg>
  );
}

/* 3. The game loop inside the interrupt, on a frame's clock face. */
function Loop({ t }: { t: number }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A frame as a clock face: the main program spins while the interrupt handler, woken at the blank, runs the whole game">
      <circle cx={cx} cy={cy} r={r} className="enc-face" />
      <path d={arc(blank, 1)} className="enc-arc" />
      <text x={cx + 52} y={cy - 64} className="enc-dim">the blank</text>
      <line x1={cx} y1={cy} x2={hx} y2={hy} className="enc-hand" />
      <circle cx={cx} cy={cy} r={3} className="enc-dot" />
      <rect x={176} y={34} width={132} height={44} rx={4} className={handler ? "enc-box" : "enc-on"} />
      <text x={242} y={52} className={handler ? "enc-text" : "enc-text-on"} textAnchor="middle">main program</text>
      <text x={242} y={68} className={handler ? "enc-dim" : "enc-text-on"} textAnchor="middle">jumps to itself, forever</text>
      <rect x={176} y={96} width={132} height={44} rx={4} className={handler ? "enc-on" : "enc-box"} />
      <text x={242} y={114} className={handler ? "enc-text-on" : "enc-text"} textAnchor="middle">the interrupt handler</text>
      <text x={242} y={130} className={handler ? "enc-text-on" : "enc-dim"} textAnchor="middle">the whole game</text>
      {dropped ? (
        <text x={242} y={160} className="enc-warn" textAnchor="middle">tap ignored: frame dropped</text>
      ) : null}
      <Label
        text={
          rev === 1
            ? inBlank
              ? "busy: the alarm is off, this tap is skipped"
              : "a long frame: the handler is still running"
            : inBlank
              ? "the blank taps the processor: the game wakes"
              : handler
                ? "the handler works, then goes back to sleep"
                : "nothing to do: the main program spins"
        }
      />
    </svg>
  );
}

/* 4. The sprite-0 split: the bar stays, the level scrolls under it. */
function Split({ t }: { t: number }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A status bar that stays still while the level scrolls under it, the change made when the beam reaches a marker sprite at the bar's bottom">
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
      <text x={sx + sw + 10} y={sy + 16} className="enc-dim">stays</text>
      <text x={sx + sw + 10} y={sy + 90} className="enc-dim">scrolls</text>
      <text x={sx + sw + 10} y={sy + bar + 4} className={hit ? "enc-hot" : "enc-dim"}>marker</text>
      <Label text={hit ? "the marker is reached: the scroll is set now" : "the game waits, watching for the marker sprite"} />
    </svg>
  );
}

/* 5. The buffer drained in the blank. */
function Buffer({ t }: { t: number }) {
  const per = 5;
  const a = (t % per) / per;
  const blank = 0.75;
  const queued = a < blank ? Math.min(5, Math.floor((a / blank) * 6)) : Math.max(0, 5 - Math.floor(((a - blank) / (1 - blank)) * 6));
  const drained = a < blank ? 0 : 5 - queued;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="During the picture the game queues its changes in a list in memory; in the blank the list is poured into the picture chip">
      <rect x={16} y={24} width={80} height={60} className="enc-screen" />
      <line x1={16} y1={24 + Math.min(1, a / blank) * 60} x2={96} y2={24 + Math.min(1, a / blank) * 60} className="enc-beam" />
      <text x={56} y={100} className="enc-dim" textAnchor="middle">
        {a < blank ? "drawing" : "the blank"}
      </text>
      <text x={150} y={18} className="enc-cap" textAnchor="middle">a list in memory</text>
      <rect x={112} y={24} width={76} height={120} rx={4} className="enc-box" />
      {Array.from({ length: queued }, (_, i) => (
        <rect key={i} x={120} y={130 - i * 20} width={60} height={14} rx={2} className="enc-on" />
      ))}
      <text x={262} y={18} className="enc-cap" textAnchor="middle">the picture chip</text>
      <rect x={212} y={24} width={100} height={120} rx={4} className="enc-box" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x={222 + (i % 3) * 28} y={36 + Math.floor(i / 3) * 28} width={22} height={22} className={i < drained ? "enc-on" : "enc-cell"} />
      ))}
      <Label text={a < blank ? "drawing: the game writes its changes down" : "the blank: the list pours into the chip"} />
    </svg>
  );
}

/* 6. The jump engine: the return address becomes a table pointer. */
function Engine({ t }: { t: number }) {
  const per = 8;
  const a = (t % per) / per;
  const phase = a < 0.2 ? 0 : a < 0.4 ? 1 : a < 0.6 ? 2 : a < 0.8 ? 3 : 4;
  const which = 2;
  const rows = ["call the engine", "routine 0", "routine 1", "routine 2", "routine 3"];
  const rowY = (i: number) => 30 + i * 26;
  const pointer = phase >= 3 ? rowY(1 + which) : rowY(1);
  const steps = [
    "the call is made; the table follows it",
    "the call leaves a note of where to come back to",
    "the engine takes the note: it points at the table",
    "it steps down the table by the number given",
    "and jumps to the routine written there",
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A jump engine: the return address the call leaves becomes a pointer into the table of routines that follows the call">
      <text x={16} y={18} className="enc-cap">the game&rsquo;s code</text>
      {rows.map((r, i) => (
        <g key={r}>
          <rect x={16} y={rowY(i)} width={120} height={22} rx={3} className={i === 0 && phase === 0 ? "enc-on" : phase === 4 && i === 1 + which ? "enc-on" : "enc-box"} />
          <text x={76} y={rowY(i) + 15} className={(i === 0 && phase === 0) || (phase === 4 && i === 1 + which) ? "enc-text-on" : "enc-text"} textAnchor="middle">
            {i === 0 ? r : `address of ${r}`}
          </text>
        </g>
      ))}
      <text x={240} y={18} className="enc-cap" textAnchor="middle">the note</text>
      <rect x={196} y={30} width={88} height={30} rx={3} className={phase === 1 || phase === 2 ? "enc-on" : "enc-box"} />
      <text x={240} y={49} className={phase === 1 || phase === 2 ? "enc-text-on" : "enc-dim"} textAnchor="middle">
        come back here
      </text>
      <rect x={196} y={80} width={88} height={30} rx={3} className="enc-box" />
      <text x={240} y={99} className="enc-text" textAnchor="middle">
        number: {which}
      </text>
      {phase >= 2 ? <path d={`M146,${pointer + 11} L190,${pointer + 11}`} className="enc-wire" /> : null}
      {phase >= 2 ? <polygon points={`140,${pointer + 11} 148,${pointer + 6} 148,${pointer + 16}`} className="enc-arrow" /> : null}
      {phase === 4 ? <text x={200} y={150} className="enc-hot">jump to routine {which}</text> : null}
      <Label text={steps[phase]} />
    </svg>
  );
}

/* 7. The state dispatch: the state picks the routine; a press changes it. */
function States({ t }: { t: number }) {
  const per = 0.6;
  const f = Math.floor(t / per) % 14;
  const pressAt = 4;
  const landAt = 11;
  const inAir = f > pressAt && f <= landAt;
  const pressed = f === pressAt;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The player's state picks which routine runs each frame; pressing A on the ground changes the state, and the next frame runs a different routine">
      <circle cx={70} cy={70} r={42} className={inAir ? "enc-box" : "enc-on"} />
      <text x={70} y={74} className={inAir ? "enc-text" : "enc-text-on"} textAnchor="middle">on the ground</text>
      <circle cx={250} cy={70} r={42} className={inAir ? "enc-on" : "enc-box"} />
      <text x={250} y={74} className={inAir ? "enc-text-on" : "enc-text"} textAnchor="middle">in the air</text>
      <path d="M112,58 Q160,26 208,58" className="enc-wire" />
      <polygon points="208,58 198,52 200,62" className="enc-arrow" />
      <text x={160} y={32} className={pressed ? "enc-hot" : "enc-dim"} textAnchor="middle">A pressed</text>
      <path d="M208,84 Q160,116 112,84" className="enc-wire" />
      <polygon points="112,84 122,90 120,80" className="enc-arrow" />
      <text x={160} y={122} className={f === landAt + 1 ? "enc-hot" : "enc-dim"} textAnchor="middle">landed</text>
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={40 + i * 17} y={140} width={13} height={12} rx={2} className={i === f ? "enc-on" : i > pressAt && i <= landAt ? "enc-cell-air" : "enc-cell"} />
      ))}
      <Label text={`${inAir ? "the in-the-air" : "the on-the-ground"} routine runs${pressed ? ", and sees A" : ""}`} />
    </svg>
  );
}

const PICTURES: Record<number, (p: { t: number }) => React.ReactElement> = {
  1: Poll,
  2: Bank,
  3: Loop,
  4: Split,
  5: Buffer,
  6: Engine,
  7: States,
};

/** Our plain sentence for each picture: what to watch. No figures. */
const WATCH: Record<number, string> = {
  1: "Watch the buttons leave the pad one at a time and walk into a byte of memory, the newest on the left, until the whole pad fits in one number.",
  2: "Watch the order: the picture goes off, then the write. On this kind of cartridge a write is combined with the byte already stored at that spot, so the menu writes somewhere that byte already matches.",
  3: "Watch the main program do nothing, and the whole game happen when the blank taps the processor on the shoulder. On the second frame the game runs long, so the next tap is simply skipped.",
  4: "Watch the top stay put while the level slides under it. The game can only tell when the beam has passed the bar because a sprite is parked there as a marker.",
  5: "Watch the changes pile up while the picture is drawn, and pour into the picture chip only in the blank, the one time it is free to take them.",
  6: "The processor has no instruction for pick one of these and go there, so the game borrows the note a call leaves about where to come back to, and uses it to find the table.",
  7: "Watch the frames tick by. The state decides which routine each frame runs; one press on the ground changes the state, and from the next frame the game is doing something else.",
};

function Card({ e }: { e: Entry }) {
  const ref = useRef<HTMLElement>(null);
  const still = useSyncExternalStore(subscribeMotion, prefersStill, () => false);
  const [choice, setPlaying] = useState<boolean | null>(null);
  const playing = choice ?? !still;
  const t = useClock(ref, playing);
  const Picture = PICTURES[e.n];
  return (
    <article className="enc-card" ref={ref} data-entry={e.n}>
      <p className="pg-eyebrow">Entry {e.n}</p>
      <h3>{e.name}</h3>
      {Picture ? (
        <div className="enc-picture">
          <Picture t={t} />
          <div className="enc-controls">
            <button className="pg-btn enc-play" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>
              {playing ? "Pause" : "Play"}
            </button>
          </div>
        </div>
      ) : null}
      {WATCH[e.n] ? <p className="enc-watch">{WATCH[e.n]}</p> : null}
      <p className="pg-now-record enc-does">
        <span className="enc-does-h">What it does, in the entry&rsquo;s words: </span>
        {e.does.replace(/`/g, "")}
      </p>
      <p>
        <a href={e.href}>Read entry {e.n} in full</a>
      </p>
    </article>
  );
}

export function Encyclopedia({ data }: { data: Data }) {
  if (!data.ok) return <p className="pg-waiting">The pictures are drawn beside the engineers&rsquo; encyclopedia, and this build could not read it: {data.reason}.</p>;
  return (
    <div className="enc-grid">
      {data.entries.map((e) => (
        <Card key={e.n} e={e} />
      ))}
    </div>
  );
}
