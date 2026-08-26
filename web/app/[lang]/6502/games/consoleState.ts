/**
 * What the console is doing, read off what game.js paints.
 *
 * game.js is upstream's byte for byte and exports nothing, so the one honest
 * way to know its state is the DOM contract it was written against: the
 * power button says "booting..." while it boots and "reset" once it has, the
 * pause button is enabled only while powered and reads "pause" or "resume",
 * the note says "game over." when the cartridge's status byte says so, and
 * the error line is unhidden when the engine stopped answering. Both the
 * floor strip's driver (ConsoleDriver.tsx) and the shell (shell/Shell.tsx)
 * read through this one function, so they cannot disagree about what a
 * pause looks like.
 */

export type Phase = "off" | "boot" | "live" | "paused" | "over" | "stopped";

export interface ConsoleRead {
  power: HTMLButtonElement;
  pause: HTMLButtonElement;
  phase: Phase;
  booting: boolean;
  powered: boolean;
  running: boolean;
}

const $ = (id: string) => document.getElementById(id);

/**
 * game.js's say() uses the error slot for notices too ("16 tiles. Power on
 * to run the cartridge.") and marks the difference by colour: a notice gets
 * an inline dim colour, a real error has the property removed. That colour
 * is the only signal, so it is the one read.
 */
function errIsBad(): boolean {
  const e = $("err") as HTMLElement | null;
  return !!e && !e.hidden && !e.style.color && (e.textContent ?? "").trim().length > 0;
}

export function readConsole(): ConsoleRead | null {
  const power = $("b-power") as HTMLButtonElement | null;
  const pause = $("b-pause") as HTMLButtonElement | null;
  if (!power || !pause) return null;
  const booting = power.disabled || /boot/i.test(power.textContent ?? "");
  const powered = !pause.disabled;
  const pauseWord = (pause.textContent ?? "").trim();
  const running = powered && /^pause$/i.test(pauseWord);
  let phase: Phase;
  if (booting) phase = "boot";
  else if (running) phase = "live";
  else if (powered) phase = "paused";
  else if (/^game over/i.test(($("note")?.textContent ?? "").trim())) phase = "over";
  else if (errIsBad()) phase = "stopped";
  else phase = "off";
  return { power, pause, phase, booting, powered, running };
}

/** Call `fn` whenever anything game.js paints its state into changes. */
export function watchConsole(fn: () => void): () => void {
  const targets = ["b-power", "b-pause", "note", "err", "k-cart"].map($).filter((n): n is HTMLElement => !!n);
  if (!targets.length) return () => {};
  const mo = new MutationObserver(fn);
  const opts = { attributes: true, attributeFilter: ["disabled", "hidden"], childList: true, characterData: true, subtree: true };
  for (const t of targets) mo.observe(t, opts);
  return () => mo.disconnect();
}
