"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setTouchPad } from "./playEngine";
import { press, release, rocker, type Rocker } from "@/lib/rocker";

/**
 * The controller, drawn as the original: a cross that is one piece
 * rocking on its fulcrum (lib/rocker.ts has the mechanism and its tests),
 * Select and Start as pills, B and A as the two red domes, on a
 * transparent layer over the game. Every part goes down when pressed: the
 * cross tilts towards the thumb, a dome sinks by its travel, a pill by
 * less; and where the phone can buzz and the reader has asked for it, a
 * contact closing is a short pulse under the thumb, which is the click a
 * dome makes going over its knee.
 *
 * Multitouch by pointer: each pointer is held with the bits it presses,
 * the cross by its geometry (the thumb's offset from the fulcrum, in the
 * key's units), a button by the element under the pointer, so a thumb
 * can slide off A onto B without lifting; the bits of every held pointer
 * are ORed and handed to the engine, which ORs the keyboard in.
 *
 * The grip is the bar above the pad: press it, slide, and let go, and the
 * whole pad has moved with the thumb (owner, 2026-09-23: press, slide,
 * release, not a mode to switch on and off). Where it was set down is
 * kept per orientation, so a phone held sideways keeps its own
 * placement. A double tap on the bar puts it back where the page had it.
 */

const BIT = { a: 1, b: 2, select: 4, start: 8 } as const;
const STORE = "tm.nes.pad";
const HAPTICS = "tm.nes.pad.haptics";

type Placement = { dx: number; dy: number };

function orientation(): "portrait" | "landscape" {
  return typeof window !== "undefined" && window.innerWidth > window.innerHeight ? "landscape" : "portrait";
}
function loadPlacement(): Placement {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, Placement>;
    return all[orientation()] ?? { dx: 0, dy: 0 };
  } catch {
    return { dx: 0, dy: 0 };
  }
}
function savePlacement(p: Placement) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, Placement>;
    all[orientation()] = p;
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* private mode: the placement lasts the page */
  }
}

/** The pad's geometry, in its own units: a face 300 wide by 140 tall. */
const W = 300;
const H = 140;
const CROSS = { cx: 62, cy: 70, arm: 14, len: 52 }; // arm half-width and the reach from the fulcrum to a tip (slimmed at the owner's word)
const PILL = { y: 102, w: 40, h: 14, gap: 10, cx: 150 }; // a touch lower than first drawn (owner, 2026-09-24)
const DOME = { r: 21, b: { cx: 214, cy: 82 }, a: { cx: 266, cy: 66 } };
const DOME_TRAVEL = 3;
const PILL_TRAVEL = 1.5;
const TILT_DEG = 12;
/** How far below the plate its pivot sits, in hundredths of the cross's width. */
const PIVOT = "14cqw";
/** The pulse under the thumb as a contact closes: long enough to feel on a phone's motor. */
const PULSE_MS = 30;
const TEST_MS = 120; // switching haptics on buzzes once, long enough to feel, so a silent phone is told apart from a quiet pulse

export function Gamepad({ onPad, labels }: { onPad?: (bits: number) => void; labels: { select: string; start: string } }) {
  const held = useRef<Map<number, number>>(new Map());
  const rock = useRef<Rocker>(rocker());
  const tiltRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);
  const litRef = useRef(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [place, setPlace] = useState<Placement>({ dx: 0, dy: 0 });
  const [haptics, setHaptics] = useState(false);
  const canBuzz = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  const drag = useRef<{ id: number; x: number; y: number; from: Placement } | null>(null);
  const lastTap = useRef(0);

  // The placement and the haptics come from the browser after a frame, as
  // the strip's sections do: the server rendered the pad where the page
  // has it, and a reader's own placement is a fact of this device.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPlace(loadPlacement());
      try { setHaptics(localStorage.getItem(HAPTICS) === "1"); } catch { /* private mode */ }
    });
    const onTurn = () => setPlace(loadPlacement());
    window.addEventListener("resize", onTurn);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", onTurn); setTouchPad(0); };
  }, []);

  const publish = useCallback(() => {
    let bits = 0;
    for (const b of held.current.values()) bits |= b;
    setTouchPad(bits);
    // A contact closing is the click: one pulse per rising edge, asked for
    // here in the pointer's own event, where the browser allows the motor.
    if (haptics && canBuzz && (bits & ~litRef.current) !== 0) navigator.vibrate(PULSE_MS);
    litRef.current = bits;
    setLit(bits);
    onPad?.(bits);
  }, [onPad, haptics, canBuzz]);

  /** The pointer's place in the face's units. */
  const local = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }, []);

  /** The cross's contacts for a thumb at the pointer, and the key's tilt towards it. */
  const crossBits = useCallback(
    (e: React.PointerEvent): number => {
      const p = local(e);
      const x = (p.x - CROSS.cx) / CROSS.len;
      const y = (p.y - CROSS.cy) / CROSS.len;
      const bits = press(rock.current, x, y);
      // The key tilts towards the thumb, as far as its rock allows.
      const m = Math.hypot(x, y);
      const k = m > 1 ? 1 / m : 1;
      tiltRef.current = bits ? { x: x * k, y: y * k } : { x: 0, y: 0 };
      setTilt(tiltRef.current);
      return bits;
    },
    [local],
  );

  const bitsAt = useCallback(
    (e: React.PointerEvent, onCross: boolean): number => {
      if (onCross) return crossBits(e);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const btn = el?.closest<Element>("[data-pad-btn]")?.getAttribute("data-pad-btn");
      // A thumb that slid from a button onto the cross: the cross takes it.
      if (btn === "cross") return crossBits(e);
      return btn ? (BIT[btn as keyof typeof BIT] ?? 0) : 0;
    },
    [crossBits],
  );

  const crossPointer = useRef<number | null>(null);

  const down = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const target = (e.target as Element).closest<Element>("[data-pad-btn], [data-pad-grip]");
      // Capture keeps a thumb that slides off the pad in hand. A pointer
      // that cannot be captured (a synthetic one) still presses.
      try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ }
      if (target?.hasAttribute("data-pad-grip")) {
        // Press the grip: the pad moves with this pointer until it lets go.
        // Two presses within a beat, with no move between, put it back.
        const now = performance.now();
        if (now - lastTap.current < 350) {
          setPlace({ dx: 0, dy: 0 });
          savePlacement({ dx: 0, dy: 0 });
          lastTap.current = 0;
          return;
        }
        lastTap.current = now;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: place };
        setDragging(true);
        return;
      }
      const onCross = target?.getAttribute("data-pad-btn") === "cross";
      if (onCross) crossPointer.current = e.pointerId;
      held.current.set(e.pointerId, bitsAt(e, onCross));
      publish();
    },
    [bitsAt, publish, place],
  );
  const move = useCallback(
    (e: React.PointerEvent) => {
      if (drag.current && drag.current.id === e.pointerId) {
        const next = { dx: drag.current.from.dx + (e.clientX - drag.current.x), dy: drag.current.from.dy + (e.clientY - drag.current.y) };
        // A slide is not a tap: a moved grip does not count towards a double tap.
        if (Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 6) lastTap.current = 0;
        setPlace(next);
        return;
      }
      if (!held.current.has(e.pointerId)) return;
      const b = bitsAt(e, crossPointer.current === e.pointerId);
      if (b !== held.current.get(e.pointerId)) {
        held.current.set(e.pointerId, b);
        publish();
      }
    },
    [bitsAt, publish],
  );
  const up = useCallback(
    (e: React.PointerEvent) => {
      if (drag.current && drag.current.id === e.pointerId) {
        const set = { dx: drag.current.from.dx + (e.clientX - drag.current.x), dy: drag.current.from.dy + (e.clientY - drag.current.y) };
        setPlace(set);
        savePlacement(set);
        drag.current = null;
        setDragging(false);
        return;
      }
      if (!held.current.has(e.pointerId)) return;
      held.current.delete(e.pointerId);
      if (crossPointer.current === e.pointerId) {
        crossPointer.current = null;
        release(rock.current);
        tiltRef.current = { x: 0, y: 0 };
        setTilt(tiltRef.current);
      }
      publish();
    },
    [publish],
  );

  const on = (bit: number) => (lit & bit) !== 0;
  const crossLit = lit & 0xf0;
  // The cross as a rocking piece: a tilt about the fulcrum, drawn as a
  // rotation about the axis at right angles to the thumb's offset.
  // CSS rotates about x with the top going away from the viewer and about
  // y with the right going away, so the axis is the tilt turned a quarter
  // the other way: the arm under the thumb sinks (the owner saw it rise,
  // 2026-09-23).
  // The tilt is applied to an HTML layer over the face rather than to the
  // SVG group: browsers flatten 3D transforms on SVG elements, so the
  // perspective was being dropped and the key merely squashed (the owner:
  // "perspective looks off", 2026-09-24). On the layer, the perspective
  // distance and the pivot below the plate are in container units, so the
  // key rocks the same at every size; see .pad-tilt in nes.css.
  // The pivot is a hemisphere under the plate, PIVOT below it: the plate
  // is carried down to the pivot, rocked there, and carried back before
  // the eye looks at it, so the pressed arm sinks and shortens, the
  // opposite arm rises and lengthens, and the plate shifts towards the
  // thumb without changing size. (A z offset on transform-origin would
  // do the rock but also push the whole plate towards the eye before the
  // perspective, so every press grew the key by a tenth.)
  const crossTransform = crossLit ? `perspective(130cqw) translateZ(-${PIVOT}) rotate3d(${-tilt.y}, ${tilt.x}, 0, ${TILT_DEG}deg) translateZ(${PIVOT})` : "none";
  const armPath = (() => {
    const a = CROSS.arm, l = CROSS.len, c = CROSS.cx, d = CROSS.cy;
    return `M${c - a} ${d - l} h${2 * a} v${l - a} h${l - a} v${2 * a} h${-(l - a)} v${l - a} h${-2 * a} v${-(l - a)} h${-(l - a)} v${-2 * a} h${l - a} z`;
  })();

  return (
    <div
      ref={padRef}
      className={"pad" + (dragging ? " dragging" : "")}
      data-play-pad={lit.toString(16).padStart(2, "0")}
      data-pad-dragging={dragging ? "1" : "0"}
      style={{ "--pad-dx": `${place.dx}px`, "--pad-dy": `${place.dy}px` } as React.CSSProperties}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
    >
      <div className="pad-grip" data-pad-grip role="button" aria-label="Move the pad" title="Press and slide to move the pad; double tap to put it back">
        <span /><span /><span />
        {canBuzz ? (
          <button
            type="button"
            className={"pad-buzz" + (haptics ? " on" : "")}
            aria-pressed={haptics}
            title="Haptics: a pulse under the thumb when a contact closes"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (!haptics) navigator.vibrate(TEST_MS); setHaptics((h) => { const n = !h; try { localStorage.setItem(HAPTICS, n ? "1" : "0"); } catch { /* private mode */ } return n; }); }}
            data-pad-haptics={haptics ? "1" : "0"}
          >
            ((•))
          </button>
        ) : null}
      </div>
      <div className="pad-stage">
      <svg ref={svgRef} className="pad-face" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="controller" data-pad-face>
        <defs>
          <radialGradient id="pad-dome" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="var(--pad-dome-hi)" />
            <stop offset="1" stopColor="var(--pad-dome)" />
          </radialGradient>
        </defs>
        {/* The cross's footprint takes the thumb; the key itself is drawn
            on the layer above, where it can rock in three dimensions. */}
        <path d={armPath} data-pad-btn="cross" className="pad-hit" />
        {/* Select and Start: the two pills, a shallow travel. */}
        {/* (the domes and pills follow; the cross layer closes the stage below) */}
        {(["select", "start"] as const).map((k, i) => {
          const x = PILL.cx - PILL.w - PILL.gap / 2 + i * (PILL.w + PILL.gap);
          const down = on(BIT[k]);
          return (
            <g key={k} data-pad-btn={k} className={"pad-pill" + (down ? " down" : "")} style={{ transform: down ? `translateY(${PILL_TRAVEL}px)` : "none" } as React.CSSProperties}>
              <rect x={x} y={PILL.y + 3} width={PILL.w} height={PILL.h} rx={PILL.h / 2} className="pad-pill-shadow" />
              <rect x={x} y={PILL.y} width={PILL.w} height={PILL.h} rx={PILL.h / 2} className="pad-pill-top" />
              <text x={x + PILL.w / 2} y={PILL.y + PILL.h + 12} textAnchor="middle" className="pad-label pad-bold">{labels[k].toUpperCase()}</text>
            </g>
          );
        })}
        {/* B and A: the domes, red, with their travel. */}
        {(["b", "a"] as const).map((k) => {
          const d = DOME[k];
          const down = on(BIT[k]);
          return (
            <g key={k} data-pad-btn={k} className={"pad-dome" + (down ? " down" : "")} style={{ transform: down ? `translateY(${DOME_TRAVEL}px)` : "none" } as React.CSSProperties}>
              <circle cx={d.cx} cy={d.cy + DOME_TRAVEL} r={DOME.r} className="pad-dome-shadow" />
              <circle cx={d.cx} cy={d.cy} r={DOME.r} className="pad-dome-top" fill="url(#pad-dome)" />
              <text x={d.cx} y={d.cy + DOME.r + 14} textAnchor="middle" className="pad-label">{k.toUpperCase()}</text>
            </g>
          );
        })}
      </svg>
      {/* The cross as one piece on its fulcrum: an HTML layer over its
          footprint, tilted towards the thumb with a pivot below the plate,
          so the pressed arm sinks and shortens, the opposite arm rises and
          lengthens, and the side arms shift with the plate. */}
      <div
        className="pad-cross-3d"
        data-pad-cross-3d
        style={{ left: `${((CROSS.cx - CROSS.len) / W) * 100}%`, top: `${((CROSS.cy - CROSS.len) / H) * 100}%`, width: `${((2 * CROSS.len) / W) * 100}%`, height: `${((2 * CROSS.len) / H) * 100}%` }}
      >
        <div className="pad-tilt" data-pad-tilt style={{ transform: crossTransform }}>
          <svg viewBox={`${CROSS.cx - CROSS.len} ${CROSS.cy - CROSS.len} ${2 * CROSS.len} ${2 * CROSS.len}`} aria-hidden="true">
            <g className={"pad-cross" + (crossLit ? " lit" : "")}>
              <path d={armPath} className="pad-key" />
              <circle cx={CROSS.cx} cy={CROSS.cy} r={CROSS.arm * 0.6} className="pad-dish" />
              {/* The four arrows, lit one at a time as their contact closes. */}
              <path d={`M${CROSS.cx} ${CROSS.cy - CROSS.len + 7} l5 8 h-10 z`} className={"pad-arrow" + (on(16) ? " on" : "")} />
              <path d={`M${CROSS.cx} ${CROSS.cy + CROSS.len - 7} l5 -8 h-10 z`} className={"pad-arrow" + (on(32) ? " on" : "")} />
              <path d={`M${CROSS.cx - CROSS.len + 7} ${CROSS.cy} l8 5 v-10 z`} className={"pad-arrow" + (on(64) ? " on" : "")} />
              <path d={`M${CROSS.cx + CROSS.len - 7} ${CROSS.cy} l-8 5 v-10 z`} className={"pad-arrow" + (on(128) ? " on" : "")} />
            </g>
          </svg>
        </div>
      </div>
      </div>
    </div>
  );
}
