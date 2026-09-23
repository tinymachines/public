/**
 * The newest value, published a few times a second: the buffer between a
 * console that answers every tick and panels that redraw whenever they
 * are told (the owner, on a phone: "lots of blinking").
 *
 * `push` keeps the value and publishes it once the interval has passed
 * since the last publish; values pushed in between are dropped in favour
 * of the newest, which is the only one a panel could show anyway. `now`
 * publishes at once and cancels anything pending: a step, a reset, a load,
 * where the reader wants the panels to follow the hand.
 */
export function latest<T>(everyMs: number, publish: (v: T) => void) {
  let pending: { v: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let published = 0;
  return {
    push(v: T) {
      pending = { v };
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (pending) {
          publish(pending.v);
          published++;
        }
        pending = null;
      }, everyMs);
    },
    now(v: T) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
      publish(v);
      published++;
    },
    /** How many times it has published, for a test. */
    count: () => published,
  };
}
