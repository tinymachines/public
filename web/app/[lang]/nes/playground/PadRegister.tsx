"use client";

import { useEffect, useState } from "react";
import { BIT, BUTTONS } from "./Playground";

/**
 * The pad's shift register, acted out. On "read", the latch takes a
 * snapshot of the buttons; then each clock tick moves the next bit onto
 * the wire, in the order the register holds them, and the console
 * gathers them into a byte. The wire carries a pressed button as a low
 * level, which is why the console's byte is the wire's, flipped.
 */

type SetBits = React.Dispatch<React.SetStateAction<number>>;

const LABEL: Record<(typeof BUTTONS)[number], string> = {
  a: "A", b: "B", select: "Select", start: "Start", up: "Up", down: "Down", left: "Left", right: "Right",
};

export function PadRegister({ bits, onChange }: { bits: number; onChange: SetBits }) {
  // -1: idle; 0: latched; 1..n: that many bits clocked out.
  const [step, setStep] = useState(-1);
  const [snap, setSnap] = useState(0);

  useEffect(() => {
    if (step < 0 || step > BUTTONS.length) return;
    const t = setTimeout(() => setStep((s) => (s >= BUTTONS.length ? -1 : s + 1)), step === BUTTONS.length ? 2600 : 700);
    return () => clearTimeout(t);
  }, [step]);

  const read = () => {
    setSnap(bits);
    setStep(0);
  };
  const reading = step >= 0;
  const held = reading ? snap : bits;
  const out = reading ? Math.max(0, step) : 0;

  return (
    <div className="pg-pad">
      <div className="pg-pad-buttons" aria-label="The pad's buttons">
        {BUTTONS.map((name) => (
          <button
            key={name}
            className="pg-padkey"
            aria-pressed={(bits & BIT[name]) !== 0}
            onClick={() => onChange((was) => was ^ BIT[name])}
          >
            {LABEL[name]}
          </button>
        ))}
      </div>
      <p className="pg-note">Tap to hold a button down; tap again to let go.</p>

      <div className="pg-shift" aria-live="polite">
        <div className="pg-shift-chip">
          <p className="pg-shift-h">Inside the pad: the snapshot</p>
          <ol className="pg-cells">
            {BUTTONS.map((name, i) => {
              const pressed = (held & BIT[name]) !== 0;
              const gone = reading && i < out;
              return (
                <li key={name} className="pg-cell" data-pressed={pressed} data-gone={gone} data-next={reading && step > 0 && i === out}>
                  <span className="pg-cell-name">{LABEL[name]}</span>
                  <span className="pg-cell-bit">{reading ? (pressed ? "0" : "1") : pressed ? "held" : ""}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="pg-shift-wire" data-live={reading && step > 0} aria-hidden="true">
          <span />
        </div>
        <div className="pg-shift-chip">
          <p className="pg-shift-h">Inside the console: the byte</p>
          <ol className="pg-cells">
            {BUTTONS.map((name, i) => {
              const arrived = reading && i < out;
              const pressed = (held & BIT[name]) !== 0;
              return (
                <li key={name} className="pg-cell" data-pressed={arrived && pressed} data-empty={!arrived}>
                  <span className="pg-cell-name">{LABEL[name]}</span>
                  <span className="pg-cell-bit">{arrived ? (pressed ? "1" : "0") : ""}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="pg-row">
        <button className="pg-btn" onClick={read} disabled={reading}>
          Watch the console read the pad
        </button>
        <p className="pg-readout">
          {step < 0
            ? "Ready."
            : step === 0
              ? "The console pulses the latch: the pad freezes a snapshot of all its buttons."
              : step < BUTTONS.length
                ? `Tick ${step}: ${LABEL[BUTTONS[step - 1]]} goes down the wire, ${(snap & BIT[BUTTONS[step - 1]]) !== 0 ? "low, because it is pressed" : "high, because it is not"}.`
                : "Done: the whole byte, one bit per tick. A real game does this every frame, faster than you can blink."}
        </p>
      </div>
    </div>
  );
}
