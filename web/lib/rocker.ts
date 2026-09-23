/**
 * The cross, as a mechanism.
 *
 * The original pad's cross is one piece, rocking on a hemispherical
 * support at its centre (Nintendo's multi-directional switch, US patent
 * 4,687,200): pressing an arm tilts the whole key about that fulcrum, the
 * conductive rubber under the pressed arm meets its electrode, and the arm
 * opposite lifts away, which is why up and down, or left and right, can
 * never be pressed together. The patent sized the parts so that two
 * neighbouring contacts would not close either; the pads that shipped do
 * close two when the thumb sits in the corner between two arms, and every
 * game that moves diagonally relies on it. This models the pad in the
 * hand, not the ideal in the patent.
 *
 * So the thumb is a point on the key top, measured from the fulcrum in the
 * key's own units (1 is the tip of an arm); the tilt is that offset; a
 * contact closes when the tilt towards it passes a threshold, and opens
 * again only when it falls below a lower one, because a rubber dome that
 * has gone over its knee does not spring back at the same force (the
 * hysteresis that keeps a thumb on the boundary from chattering). The
 * corner window is narrower than half the arm: the second contact of a
 * diagonal needs a firmer tilt than the first, which is what makes the
 * cardinals easy to hold and the diagonals deliberate. The dead centre is
 * the fulcrum: a thumb resting there tilts nothing.
 *
 * Bits are the register's: Up 16, Down 32, Left 64, Right 128.
 */

export const UP = 16;
export const DOWN = 32;
export const LEFT = 64;
export const RIGHT = 128;

/** The tilt at which the first contact closes, and the lower one it opens at. */
export const CLOSE = 0.3;
export const OPEN = 0.22;
/** The tilt the second contact of a diagonal needs, and where it lets go. */
export const CLOSE_2 = 0.45;
export const OPEN_2 = 0.35;
/** Past this radius the thumb has left the key; the pad releases. */
export const OFF = 1.5;

export interface Rocker {
  bits: number;
}

export function rocker(): Rocker {
  return { bits: 0 };
}

/**
 * The thumb at (x, y) in the key's units, y downward as on a screen: the
 * contacts as the rocker now stands, given where it stood.
 */
export function press(r: Rocker, x: number, y: number): number {
  if (Math.hypot(x, y) > OFF) {
    r.bits = 0;
    return 0;
  }
  // Each axis on its own: the tilt along it, and the contact that would
  // close, with the opposite one open by the fulcrum's geometry.
  const axes: [number, number, number][] = [
    [-y, UP, DOWN],
    [y, DOWN, UP],
    [-x, LEFT, RIGHT],
    [x, RIGHT, LEFT],
  ];
  // The dominant axis is the first contact; the other, if it closes, is
  // the second, and needs the firmer tilt.
  const along = axes.map(([t]) => t);
  const strongest = along.indexOf(Math.max(...along));
  let bits = 0;
  axes.forEach(([t, bit, opposite], i) => {
    const wasClosed = (r.bits & bit) !== 0;
    const second = i !== strongest;
    const close = second ? CLOSE_2 : CLOSE;
    const open = second ? OPEN_2 : OPEN;
    const closed = wasClosed ? t > open : t > close;
    if (closed && (bits & opposite) === 0) bits |= bit;
  });
  r.bits = bits;
  return bits;
}

/** The thumb lifted: every contact opens. */
export function release(r: Rocker): number {
  r.bits = 0;
  return 0;
}

/** The eight positions of a thumb rolled round the key, clockwise from the top, as the contacts read them. */
export const ROLL = [UP, UP | RIGHT, RIGHT, RIGHT | DOWN, DOWN, DOWN | LEFT, LEFT, LEFT | UP] as const;
