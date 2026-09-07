"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setTouchPad } from "./playEngine";

/**
 * An NES-shaped pad on the screen: the cross on the left, Select and
 * Start in the middle, B and A on the right, driven by pointer events so
 * a thumb can slide across the cross and two thumbs can hold A and Up at
 * once. Each pointer owns the bits it is over; the union goes to the
 * engine as the register's byte (A, B, Select, Start, Up, Down, Left,
 * Right from bit 0), ORed there with the keyboard's. The cross reads the
 * pointer's position from the pad's centre, so diagonals come from the
 * corners without a fifth button. touch-action is none on the whole pad
 * so a press never scrolls the page.
 */

const BIT = { a: 1, b: 2, select: 4, start: 8, up: 16, down: 32, left: 64, right: 128 } as const;

/** The cross's bits for a pointer at (dx, dy) from its centre, radius r. */
function crossBits(dx: number, dy: number, r: number): number {
  const d = Math.hypot(dx, dy);
  if (d < r * 0.18) return 0; // the dead centre
  const ang = Math.atan2(dy, dx); // -pi..pi, y down
  let bits = 0;
  // Eight sectors of 45 degrees: the cardinals in the middle 22.5 each side,
  // the diagonals between, as the real cross's rocker resolves them.
  const sector = Math.round((ang / Math.PI) * 4); // -4..4
  const s = ((sector % 8) + 8) % 8; // 0 right, 1 down-right, 2 down, 3 down-left, 4 left, 5 up-left, 6 up, 7 up-right
  if (s === 0 || s === 1 || s === 7) bits |= BIT.right;
  if (s === 4 || s === 3 || s === 5) bits |= BIT.left;
  if (s === 2 || s === 1 || s === 3) bits |= BIT.down;
  if (s === 6 || s === 5 || s === 7) bits |= BIT.up;
  return bits;
}

export function Gamepad({ onPad, labels }: { onPad?: (bits: number) => void; labels: { select: string; start: string } }) {
  const held = useRef<Map<number, number>>(new Map());
  const crossRef = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);

  const publish = useCallback(() => {
    let bits = 0;
    for (const b of held.current.values()) bits |= b;
    setTouchPad(bits);
    setLit(bits);
    onPad?.(bits);
  }, [onPad]);

  useEffect(() => () => setTouchPad(0), []);

  const bitsAt = useCallback((e: React.PointerEvent): number => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const btn = el?.closest<HTMLElement>("[data-pad-btn]")?.dataset.padBtn;
    if (btn && btn !== "cross") return BIT[btn as keyof typeof BIT] ?? 0;
    const c = crossRef.current;
    if (!c) return 0;
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    // Inside the cross's disc (a little past its edge, so a thumb that
    // rolls off the side keeps the direction it had).
    if (Math.hypot(dx, dy) > r.width * 0.75) return 0;
    return crossBits(dx, dy, r.width / 2);
  }, []);

  const down = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      held.current.set(e.pointerId, bitsAt(e));
      publish();
    },
    [bitsAt, publish],
  );
  const move = useCallback(
    (e: React.PointerEvent) => {
      if (!held.current.has(e.pointerId)) return;
      const b = bitsAt(e);
      if (b !== held.current.get(e.pointerId)) {
        held.current.set(e.pointerId, b);
        publish();
      }
    },
    [bitsAt, publish],
  );
  const up = useCallback(
    (e: React.PointerEvent) => {
      if (!held.current.has(e.pointerId)) return;
      held.current.delete(e.pointerId);
      publish();
    },
    [publish],
  );

  const on = (bit: number) => (lit & bit ? " lit" : "");
  return (
    <div className="pad" data-play-pad={lit.toString(16).padStart(2, "0")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
      <div className="pad-cross" ref={crossRef} data-pad-btn="cross" aria-label="direction">
        <span className={"pad-arm up" + on(BIT.up)} />
        <span className={"pad-arm down" + on(BIT.down)} />
        <span className={"pad-arm left" + on(BIT.left)} />
        <span className={"pad-arm right" + on(BIT.right)} />
        <span className="pad-hub" />
      </div>
      <div className="pad-middle">
        <span className={"pad-pill" + on(BIT.select)} data-pad-btn="select">
          {labels.select}
        </span>
        <span className={"pad-pill" + on(BIT.start)} data-pad-btn="start">
          {labels.start}
        </span>
      </div>
      <div className="pad-face">
        <span className={"pad-round" + on(BIT.b)} data-pad-btn="b">
          B
        </span>
        <span className={"pad-round" + on(BIT.a)} data-pad-btn="a">
          A
        </span>
      </div>
    </div>
  );
}
