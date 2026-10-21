/**
 * The keyboard as a controller: which key is which bit of the pad register
 * (A, B, Select, Start, Up, Down, Left, Right from bit 0). One copy, read by
 * the play page's engine (the console in the browser) and by the stream
 * monitor (a byte posted to the console on the box), so the same key does
 * the same thing on both.
 */

/** The pad as the register's byte: A, B, Select, Start, Up, Down, Left, Right from bit 0. */
export const KEYS: Record<string, number> = {
  KeyX: 1,
  KeyZ: 2,
  ShiftRight: 4,
  Enter: 8,
  ArrowUp: 16,
  ArrowDown: 32,
  ArrowLeft: 64,
  ArrowRight: 128,
};
/** Controller 2, on the left hand: W A S D for the cross, G is A, F is B, R Select, T Start. */
export const KEYS2: Record<string, number> = {
  KeyG: 1,
  KeyF: 2,
  KeyR: 4,
  KeyT: 8,
  KeyW: 16,
  KeyS: 32,
  KeyA: 64,
  KeyD: 128,
};
